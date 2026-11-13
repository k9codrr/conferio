// lib/translation.ts
// Meeting translation engine.
//
// Order of providers:
//   1. Google Cloud Translation v2 (REST) — only if GOOGLE_TRANSLATE_API_KEY is set and valid
//   2. Gemini (GEMINI_API_KEY)            — batched JSON translation, keeps segment boundaries
//   3. Ollama (OLLAMA_URL)                — local fallback
// If every provider fails we THROW instead of silently returning the original text,
// so an untranslated transcript is never saved as a "translation".

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ollama } from './ollama';

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  de: 'German',
  pt: 'Portuguese',
  es: 'Spanish',
  fr: 'French',
  ja: 'Japanese',
  zh: 'Chinese (Simplified)',
};

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_NAMES);

/** Normalise codes like "en_us" / "en-US" / "EN" → "en". */
export function baseLanguage(code?: string | null): string | null {
  if (!code) return null;
  return code.toLowerCase().split(/[-_]/)[0] || null;
}

const GOOGLE_BATCH = 100; // v2 accepts up to 128 q values per request
const GEMINI_BATCH_ITEMS = 60;
const GEMINI_BATCH_CHARS = 12_000;

let googleDisabled = false; // flips to true after an auth failure so we stop retrying a bad key

export class TranslationService {
  private gemini = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
        model: process.env.GEMINI_TRANSLATION_MODEL || 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      })
    : null;

  /** Translate a single string. */
  async translate(text: string, targetLang: string): Promise<string> {
    if (!text || !text.trim()) return text ?? '';
    const [out] = await this.translateMany([text], targetLang);
    return out;
  }

  /** Translate many strings, preserving order and count. Empty strings pass through. */
  async translateMany(texts: string[], targetLang: string): Promise<string[]> {
    const indexes: number[] = [];
    const work: string[] = [];
    texts.forEach((t, i) => {
      if (t && t.trim()) {
        indexes.push(i);
        work.push(t);
      }
    });
    if (!work.length) return texts.slice();

    const translated = await this.translateWithProviders(work, targetLang);
    const out = texts.slice();
    indexes.forEach((idx, j) => (out[idx] = translated[j]));
    return out;
  }

  private async translateWithProviders(texts: string[], targetLang: string): Promise<string[]> {
    const errors: string[] = [];

    if (process.env.GOOGLE_TRANSLATE_API_KEY && !googleDisabled) {
      try {
        return await this.translateWithGoogle(texts, targetLang);
      } catch (e) {
        errors.push(`google: ${(e as Error).message}`);
      }
    }

    if (this.gemini) {
      try {
        return await this.translateWithGemini(texts, targetLang);
      } catch (e) {
        errors.push(`gemini: ${(e as Error).message}`);
      }
    }

    try {
      if (await ollama.checkConnection()) {
        const out: string[] = [];
        for (const t of texts) out.push(await this.translateWithOllama(t, targetLang));
        return out;
      }
      errors.push('ollama: not reachable');
    } catch (e) {
      errors.push(`ollama: ${(e as Error).message}`);
    }

    throw new Error(`Translation failed (${errors.join('; ') || 'no provider configured'})`);
  }

  // ── Google Cloud Translation v2 (REST, no SDK needed) ──────────────────────
  private async translateWithGoogle(texts: string[], targetLang: string): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < texts.length; i += GOOGLE_BATCH) {
      const batch = texts.slice(i, i + GOOGLE_BATCH);
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(process.env.GOOGLE_TRANSLATE_API_KEY!)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: batch, target: targetLang, format: 'text' }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 400 || res.status === 401 || res.status === 403) googleDisabled = true;
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }
      const items: Array<{ translatedText: string }> = data?.data?.translations ?? [];
      if (items.length !== batch.length) throw new Error('unexpected response size');
      out.push(...items.map((t) => t.translatedText));
    }
    return out;
  }

  // ── Gemini (batched, JSON in / JSON out so segment boundaries survive) ─────
  private async translateWithGemini(texts: string[], targetLang: string): Promise<string[]> {
    const out: string[] = [];
    let batch: string[] = [];
    let chars = 0;
    const flush = async () => {
      if (!batch.length) return;
      out.push(...(await this.geminiBatch(batch, targetLang)));
      batch = [];
      chars = 0;
    };
    for (const t of texts) {
      if (batch.length >= GEMINI_BATCH_ITEMS || chars + t.length > GEMINI_BATCH_CHARS) await flush();
      batch.push(t);
      chars += t.length;
    }
    await flush();
    return out;
  }

  private async geminiBatch(batch: string[], targetLang: string, attempt = 0): Promise<string[]> {
    const language = LANGUAGE_NAMES[targetLang] || targetLang;
    const prompt = `Translate every string in the JSON array below into ${language}.
Rules:
- Return ONLY a JSON array of strings, same length (${batch.length}) and same order as the input.
- Keep names, emails, URLs, numbers and code unchanged.
- If a string is already in ${language}, return it unchanged.

Input:
${JSON.stringify(batch)}`;
    const result = await this.gemini!.generateContent(prompt);
    const text = result.response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (Array.isArray(parsed) && parsed.length === batch.length && parsed.every((s) => typeof s === 'string')) {
      return parsed as string[];
    }
    if (attempt === 0 && batch.length > 1) {
      // Model broke the array shape — split the batch in half and retry each part.
      const mid = Math.ceil(batch.length / 2);
      const [a, b] = await Promise.all([
        this.geminiBatch(batch.slice(0, mid), targetLang, 1),
        this.geminiBatch(batch.slice(mid), targetLang, 1),
      ]);
      return [...a, ...b];
    }
    throw new Error('Gemini returned an invalid translation array');
  }

  // ── Ollama (local) ─────────────────────────────────────────────────────────
  private async translateWithOllama(text: string, targetLang: string): Promise<string> {
    const prompt = `Translate the following text to ${LANGUAGE_NAMES[targetLang] || targetLang}.
Only output the translation, nothing else:

"${text}"`;
    const res = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.2', prompt, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    return String(data.response ?? '').trim().replace(/^["']|["']$/g, '');
  }

  // ── Meeting helpers ────────────────────────────────────────────────────────
  async translateSegments<T extends { text: string }>(
    segments: T[],
    targetLang: string,
  ): Promise<Array<T & { translatedText: string }>> {
    const translated = await this.translateMany(
      segments.map((s) => s.text || ''),
      targetLang,
    );
    return segments.map((seg, i) => ({ ...seg, translatedText: translated[i] ?? seg.text }));
  }

  /**
   * Translate transcript, summary, action items and key points in as few provider calls as possible.
   * Transcript segments keep their speaker/timestamps; `text` becomes the translated text and the
   * original is kept in `originalText`.
   */
  async translateMeeting(
    originalTranscript: any[],
    summary: string | null,
    actionItems: any[],
    keyPoints: string[],
    targetLang: string,
  ): Promise<{ transcript: any[]; summary: string | null; actionItems: any[]; keyPoints: string[] }> {
    const segments = (originalTranscript || []).map((u: any) => ({
      speaker: u.speaker || u.speaker_label || 'Unknown',
      text: u.text || '',
      startTime: u.startTime ?? u.start ?? 0,
      endTime: u.endTime ?? u.end ?? 0,
    }));
    const itemText = (item: any) =>
      typeof item === 'string' ? item : item?.text || item?.description || item?.task || JSON.stringify(item);

    // One combined pass: [...segments, summary, ...actionItems, ...keyPoints]
    const inputs = [
      ...segments.map((s) => s.text),
      summary || '',
      ...(actionItems || []).map(itemText),
      ...(keyPoints || []).map((k) => (typeof k === 'string' ? k : String(k))),
    ];
    const out = await this.translateMany(inputs, targetLang);

    let i = 0;
    const transcript = segments.map((s) => ({ ...s, originalText: s.text, text: out[i++] }));
    const translatedSummary = summary ? out[i] : null;
    i++;
    const translatedActions = (actionItems || []).map((item) => {
      const t = out[i++];
      return typeof item === 'string' ? t : { ...item, text: t };
    });
    const translatedKeyPoints = (keyPoints || []).map(() => out[i++]);

    return {
      transcript,
      summary: translatedSummary,
      actionItems: translatedActions,
      keyPoints: translatedKeyPoints,
    };
  }
}

export const translationService = new TranslationService();
