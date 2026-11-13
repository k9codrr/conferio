// lib/meeting-translation.ts
// Translates a recorded AI-notetaker meeting (transcript + summary + action items + key points)
// into a user's preferred language and stores it in MeetingTranscript.

import { prisma } from '@/lib/prisma';
import { baseLanguage, translationService } from '@/lib/translation';

type Utterance = { speaker?: string; text?: string; start?: number; end?: number };

export function extractUtterances(transcript: unknown): Utterance[] {
  if (!transcript) return [];
  let raw: any = transcript;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [{ speaker: 'Unknown', text: raw }];
    }
  }
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.utterances)) return raw.utterances;
  if (raw?.text) return [{ speaker: 'Unknown', text: raw.text }];
  return [];
}

/** Language the meeting was spoken in, as detected by AssemblyAI (e.g. "en", "hi"). */
export function sourceLanguage(transcript: unknown): string | null {
  let raw: any = transcript;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return baseLanguage(raw?.language_code);
}

export type TranslateResult =
  | { status: 'created' | 'updated' | 'already_exists'; id: string; language: string }
  | { status: 'same_as_source'; language: string }
  | { status: 'no_transcript'; language: string };

/**
 * Translate one meeting into `language` for `userId`.
 * `force` re-translates even if a stored translation exists (e.g. after the summary was regenerated).
 */
export async function translateMeetingForUser(
  meetingId: string,
  userId: string,
  language: string,
  { force = false }: { force?: boolean } = {},
): Promise<TranslateResult> {
  const lang = baseLanguage(language) || 'en';

  const meeting = await prisma.aiMeeting.findUnique({
    where: { id: meetingId },
    select: { id: true, transcript: true, summary: true, actionItems: true, keyPoints: true },
  });
  if (!meeting?.transcript) return { status: 'no_transcript', language: lang };

  const source = sourceLanguage(meeting.transcript);
  if (source && source === lang) return { status: 'same_as_source', language: lang };

  const existing = await prisma.meetingTranscript.findFirst({
    where: { meetingId, userId, language: lang },
    select: { id: true },
  });
  if (existing && !force) return { status: 'already_exists', id: existing.id, language: lang };

  const utterances = extractUtterances(meeting.transcript);
  const translated = await translationService.translateMeeting(
    utterances,
    meeting.summary,
    Array.isArray(meeting.actionItems) ? (meeting.actionItems as any[]) : [],
    Array.isArray(meeting.keyPoints) ? (meeting.keyPoints as string[]) : [],
    lang,
  );

  const data = {
    content: JSON.stringify(translated.transcript),
    originalContent: JSON.stringify(utterances),
    summary: translated.summary,
    actionItems: translated.actionItems,
    keyPoints: translated.keyPoints.filter((k): k is string => typeof k === 'string'),
  };

  const saved = await prisma.meetingTranscript.upsert({
    where: { meetingId_userId_language: { meetingId, userId, language: lang } },
    create: { meetingId, userId, language: lang, ...data },
    update: data,
    select: { id: true },
  });

  return { status: existing ? 'updated' : 'created', id: saved.id, language: lang };
}

/**
 * Called automatically once a meeting's transcript + summary are ready:
 * translates it into the meeting owner's preferred language.
 * Never throws — a translation failure must not fail the webhook.
 */
export async function autoTranslateMeeting(meetingId: string, { force = false } = {}) {
  try {
    const meeting = await prisma.aiMeeting.findUnique({
      where: { id: meetingId },
      select: { userId: true, user: { select: { preferredLanguage: true } } },
    });
    if (!meeting) return null;
    const preferred = baseLanguage(meeting.user?.preferredLanguage) || 'en';
    const result = await translateMeetingForUser(meetingId, meeting.userId, preferred, { force });
    console.log('🌐 Auto-translation:', meetingId, result);
    return result;
  } catch (error) {
    console.error('🌐 Auto-translation failed for meeting', meetingId, error);
    return null;
  }
}
