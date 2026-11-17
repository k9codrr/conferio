'use client';

// Records the meeting tab (video + everyone's audio, mixed with your own mic)
// in the browser, then uploads it to Clips when you stop.
import { useCallback, useRef, useState } from 'react';

export function useMeetingRecorder(opts: { title: string; getMicStream: () => MediaStream | null }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const cleanupRef = useRef<() => void>(() => {});

  const upload = useCallback(async (blob: Blob, seconds: number) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', new File([blob], `meeting-${Date.now()}.webm`, { type: 'video/webm' }));
      form.append('title', `${opts.title} — ${new Date().toLocaleString()}`);
      form.append('description', 'Meeting recording');
      form.append('clipType', 'both');
      form.append('duration', String(seconds));
      const r = await fetch('/api/clips/upload', { method: 'POST', body: form });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Upload failed');
    } catch (e: any) {
      setError(e.message);
      // Keep the recording: offer it as a download instead.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `meeting-${Date.now()}.webm`;
      a.click();
    } finally {
      setUploading(false);
    }
  }, [opts.title]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: true,
        // Chrome: suggest this tab so participants' audio is captured.
        ...( { preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'include' } as any),
      });

      // Mix tab audio + local mic.
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      if (display.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
      const mic = opts.getMicStream();
      if (mic?.getAudioTracks().length) ctx.createMediaStreamSource(mic).connect(dest);

      const stream = new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 600_000, audioBitsPerSecond: 96_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const seconds = Math.round((Date.now() - startedAt.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        cleanupRef.current();
        setRecording(false);
        if (blob.size) upload(blob, seconds);
      };
      cleanupRef.current = () => {
        display.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };
      // User pressed the browser's "Stop sharing" bar.
      display.getVideoTracks()[0]?.addEventListener('ended', () => rec.state !== 'inactive' && rec.stop());
      rec.start(1000);
      recorderRef.current = rec;
      startedAt.current = Date.now();
      setRecording(true);
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') setError(e?.message || 'Could not start recording');
    }
  }, [opts, upload]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
  }, []);

  return { recording, uploading, error, start, stop, toggle: recording ? stop : start };
}
