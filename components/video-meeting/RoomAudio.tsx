'use client';

// Plays every remote participant's microphone (and screen-share audio) once,
// independent of which layout is showing them — so people in overflow, in the
// campfire ring or off-screen are always heard. `deafened` mutes all output.
import { useEffect, useRef } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';

export default function RoomAudio({ room, deafened, volume = 1 }: { room: Room | null; deafened?: boolean; volume?: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLMediaElement>());

  useEffect(() => {
    if (!room) return;
    const els = elements.current;

    const attach = (track: RemoteTrack, sid: string) => {
      if (track.kind !== Track.Kind.Audio || els.has(sid)) return;
      const el = track.attach();
      el.muted = !!deafened;
      (el as HTMLMediaElement).volume = volume;
      holder.current?.appendChild(el);
      els.set(sid, el);
    };
    const detach = (track: RemoteTrack, sid: string) => {
      const el = els.get(sid);
      if (el) {
        track.detach(el);
        el.remove();
        els.delete(sid);
      }
    };

    room.remoteParticipants.forEach((p) =>
      p.trackPublications.forEach((pub) => {
        if (pub.track && pub.kind === Track.Kind.Audio) attach(pub.track as RemoteTrack, pub.trackSid);
      })
    );
    const onSub = (track: RemoteTrack, pub: any) => attach(track, pub.trackSid);
    const onUnsub = (track: RemoteTrack, pub: any) => detach(track, pub.trackSid);
    room.on(RoomEvent.TrackSubscribed, onSub);
    room.on(RoomEvent.TrackUnsubscribed, onUnsub);
    // Browsers may block autoplay until a gesture; LiveKit tells us when to retry.
    const onPlayback = () => { if (room.canPlaybackAudio === false) room.startAudio().catch(() => {}); };
    room.on(RoomEvent.AudioPlaybackStatusChanged, onPlayback);
    const resume = () => room.startAudio().catch(() => {});
    window.addEventListener('pointerdown', resume, { once: true });

    return () => {
      room.off(RoomEvent.TrackSubscribed, onSub);
      room.off(RoomEvent.TrackUnsubscribed, onUnsub);
      room.off(RoomEvent.AudioPlaybackStatusChanged, onPlayback);
      window.removeEventListener('pointerdown', resume);
      els.forEach((el) => el.remove());
      els.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => {
    elements.current.forEach((el) => {
      el.muted = !!deafened;
      el.volume = volume;
    });
  }, [deafened, volume]);

  return <div ref={holder} className="hidden" aria-hidden />;
}
