// lib/meeting/live-subtitles.ts
// Server side of live meeting subtitles (client: hooks/useAudioCapture.ts).
//
// Each speaker streams 16 kHz mono Int16 PCM over socket.io ("audio-chunk").
// We cut it into short windows at natural pauses, skip silence, transcribe with
// language auto-detection (Deepgram → OpenAI Whisper fallback), then translate
// once per language present in the room and send every listener the line in
// THEIR preferred language ("transcription" event).
import type { Server, Socket } from 'socket.io';
import { translationService, baseLanguage } from '@/lib/translation';

const SAMPLE_RATE = 16000;
const MIN_WINDOW_S = 2.5;     // don't send tiny fragments
const MAX_WINDOW_S = 7;       // force a cut during long monologues
const SILENCE_RMS = 0.012;    // below this a 250 ms frame counts as silence
const PAUSE_FRAMES = 2;       // ≈500 ms of silence ends a phrase

interface Session {
  meetingId: string;
  chunks: Int16Array[];
  samples: number;
  voicedFrames: number;
  quietRun: number;
  busy: Promise<void>;
}

const roomOf = (meetingId: string) => `meeting:${meetingId}`;

function rms(pcm: Int16Array) {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, pcm.length));
}

function wav(pcm: Int16Array): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function transcribe(pcm: Int16Array): Promise<{ text: string; language: string } | null> {
  const audio = wav(pcm);
  const errors: string[] = [];

  if (process.env.DEEPGRAM_API_KEY) {
    try {
      const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&detect_language=true&smart_format=true&punctuate=true', {
        method: 'POST',
        headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'audio/wav' },
        body: audio,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: any = await r.json();
      const ch = d?.results?.channels?.[0];
      const text = (ch?.alternatives?.[0]?.transcript ?? '').trim();
      return text ? { text, language: ch?.detected_language || 'en' } : null;
    } catch (e: any) {
      errors.push(`deepgram: ${e.message}`);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'chunk.wav');
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: any = await r.json();
      const text = String(d?.text ?? '').trim();
      return text ? { text, language: whisperLang(d?.language) } : null;
    } catch (e: any) {
      errors.push(`openai: ${e.message}`);
    }
  }

  throw new Error(errors.length ? errors.join('; ') : 'No speech-to-text provider configured (DEEPGRAM_API_KEY or OPENAI_API_KEY)');
}

// Whisper reports language names ("english"); map the common ones to codes.
const WHISPER: Record<string, string> = {
  english: 'en', hindi: 'hi', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt',
  japanese: 'ja', korean: 'ko', chinese: 'zh', arabic: 'ar', russian: 'ru', bengali: 'bn', tamil: 'ta',
  telugu: 'te', marathi: 'mr', gujarati: 'gu', punjabi: 'pa', urdu: 'ur', dutch: 'nl', turkish: 'tr',
};
const whisperLang = (l?: string) => (l ? WHISPER[l.toLowerCase()] ?? l.slice(0, 2).toLowerCase() : 'en');

async function deliver(io: Server, speaker: Socket, s: Session, pcm: Int16Array) {
  let result: { text: string; language: string } | null;
  try {
    result = await transcribe(pcm);
  } catch (e: any) {
    speaker.emit('transcription-error', { message: e.message });
    return;
  }
  if (!result) return;

  const room = io.sockets.adapter.rooms.get(roomOf(s.meetingId));
  if (!room) return;
  const listeners = Array.from(room).map((id) => io.sockets.sockets.get(id)).filter(Boolean) as Socket[];
  const byLang = new Map<string, Socket[]>();
  for (const l of listeners) {
    const lang = (l.data.lang as string) || 'en';
    byLang.set(lang, [...(byLang.get(lang) ?? []), l]);
  }

  const src = baseLanguage(result.language) ?? result.language;
  const base = {
    speaker: speaker.data.name || 'Speaker',
    speakerId: speaker.data.userId,
    original: result.text,
    originalLanguage: src,
    isFinal: true,
    at: Date.now(),
  };

  await Promise.all(
    Array.from(byLang.entries()).map(async ([lang, sockets]) => {
      let translated = result!.text;
      if ((baseLanguage(lang) ?? lang) !== src) {
        try {
          translated = await translationService.translate(result!.text, lang);
        } catch (e: any) {
          console.warn('[subtitles] translate failed:', e.message);
        }
      }
      sockets.forEach((l) => l.emit('transcription', { ...base, translated, targetLanguage: lang }));
    })
  );
}

/** Wire the live-subtitle events onto a socket.io connection. */
export function attachLiveSubtitles(io: Server, socket: Socket) {
  let session: Session | null = null;

  socket.on('join-meeting-room', (d: { roomName: string; userId?: string; name?: string; preferredLanguage?: string }) => {
    if (!d?.roomName) return;
    if (socket.data.meetingRoom && socket.data.meetingRoom !== d.roomName) socket.leave(roomOf(socket.data.meetingRoom));
    socket.join(roomOf(d.roomName));
    socket.data.meetingRoom = d.roomName;
    socket.data.userId = d.userId;
    socket.data.name = d.name;
    socket.data.lang = (d.preferredLanguage || 'en').slice(0, 10);
  });

  socket.on('set-language', (lang: string) => {
    if (typeof lang === 'string') socket.data.lang = lang.slice(0, 10);
  });

  socket.on('start-transcription', (d: { meetingId: string }) => {
    const meetingId = d?.meetingId || socket.data.meetingRoom;
    if (!meetingId) return;
    session = { meetingId, chunks: [], samples: 0, voicedFrames: 0, quietRun: 0, busy: Promise.resolve() };
  });

  socket.on('stop-transcription', () => {
    if (session && session.samples / SAMPLE_RATE >= 1 && session.voicedFrames > 0) flush();
    session = null;
  });

  const flush = () => {
    if (!session || !session.samples) return;
    const s = session;
    const pcm = new Int16Array(s.samples);
    let o = 0;
    for (const c of s.chunks) { pcm.set(c, o); o += c.length; }
    const voiced = s.voicedFrames;
    s.chunks = []; s.samples = 0; s.voicedFrames = 0; s.quietRun = 0;
    if (!voiced) return; // silence only
    // Keep lines in order per speaker.
    s.busy = s.busy.then(() => deliver(io, socket, s, pcm)).catch(() => {});
  };

  socket.on('audio-chunk', (buf: ArrayBuffer | Buffer) => {
    if (!session) return;
    const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);
    if (bytes.length < 2) return;
    const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length - (bytes.length % 2)));
    session.chunks.push(pcm);
    session.samples += pcm.length;
    if (rms(pcm) >= SILENCE_RMS) { session.voicedFrames++; session.quietRun = 0; } else session.quietRun++;

    const secs = session.samples / SAMPLE_RATE;
    if ((secs >= MIN_WINDOW_S && session.quietRun >= PAUSE_FRAMES) || secs >= MAX_WINDOW_S) flush();
    // Drop long stretches of pure silence so memory stays flat.
    if (!session.voicedFrames && secs >= MIN_WINDOW_S) { session.chunks = []; session.samples = 0; }
  });

  socket.on('disconnect', () => { session = null; });
}
