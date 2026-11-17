import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';

// Streams the local microphone (16 kHz mono Int16 PCM) to the socket server for
// live subtitles (server: lib/meeting/live-subtitles.ts).
// `startCapture(stream?)` takes the stream at call time so it always uses the
// mic track that is live *now* (the track may not exist when the room connects).
export function useAudioCapture(stream: MediaStream | null, socket: Socket | null, meetingId: string) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isCapturingRef = useRef(false);

  const stopCapture = useCallback(() => {
    if (!isCapturingRef.current) return;
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      audioContextRef.current?.close();
    } catch {
      /* already closed */
    }
    processorRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
    socket?.emit('stop-transcription', { meetingId });
    isCapturingRef.current = false;
  }, [socket, meetingId]);

  const startCapture = useCallback((override?: MediaStream | null) => {
    const s = override ?? stream;
    if (!s || !socket || !meetingId || isCapturingRef.current) return false;
    if (!s.getAudioTracks().some((t) => t.readyState === 'live')) return false;

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContext({ sampleRate: 16000 });
    } catch {
      return false; // browser refused the sample rate
    }
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(s);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    sourceRef.current = source;
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      socket.emit('audio-chunk', float32ToInt16(input));
    };

    source.connect(processor);
    // ScriptProcessor only runs when connected; its output buffer stays silent.
    processor.connect(audioContext.destination);

    socket.emit('start-transcription', { meetingId });
    isCapturingRef.current = true;
    return true;
  }, [stream, socket, meetingId]);

  useEffect(() => () => stopCapture(), [stopCapture]);

  return { startCapture, stopCapture, isCapturing: () => isCapturingRef.current };
}

function float32ToInt16(float32Array: Float32Array): ArrayBuffer {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array.buffer;
}
