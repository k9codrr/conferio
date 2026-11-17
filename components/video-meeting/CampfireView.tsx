'use client';

// Campfire meeting view: everyone sits in a ring of circles; empty seats are
// emoji faces and a "share link" seat invites more people. Double-click anyone
// to jump to the standard view focused on them. Chrome: view switcher +
// copy link (top), pill control bar (bottom), Attendees / Chat / Transcript
// side panel (right).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Participant, Room, Track } from 'livekit-client';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarPlus, Check, ChevronDown, Copy, Hand, Languages, LayoutGrid, Link2, Maximize2, MessageSquare, Mic, MicOff,
  Minimize2, Monitor, MonitorOff, MoreVertical, PhoneOff, Search, Send, Subtitles, UserPlus, Users, Video, VideoOff,
  Volume2, VolumeX, Wrench, X, Zap, Flame, PanelRight, Rows3, Presentation,
} from 'lucide-react';

export type MeetingView = 'grid' | 'spotlight' | 'filmstrip' | 'campfire';
export interface Entry { p: Participant; isLocal: boolean }

const EMPTY_FACES = ['😄', '😏', '😬', '😈', '😆', '😮', '🙂', '😴', '🤓', '😎', '🤠', '🥳', '😇', '🤔', '😜'];
const LANGS: [string, string][] = [
  ['en', 'English'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'],
  ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ar', 'Arabic'], ['ru', 'Russian'],
  ['bn', 'Bengali'], ['ta', 'Tamil'], ['te', 'Telugu'], ['mr', 'Marathi'], ['gu', 'Gujarati'], ['ur', 'Urdu'],
];

export const VIEW_LABEL: Record<MeetingView, string> = {
  campfire: 'Campfire View', grid: 'Grid View', spotlight: 'Speaker View', filmstrip: 'Filmstrip View',
};
const VIEW_ICON: Record<MeetingView, React.ComponentType<{ className?: string }>> = {
  campfire: Flame, grid: LayoutGrid, spotlight: Presentation, filmstrip: Rows3,
};

export function nameOf(p: Participant) {
  try {
    const meta = p.metadata ? JSON.parse(p.metadata) : {};
    return meta.name || p.name || p.identity || 'Guest';
  } catch {
    return p.name || p.identity || 'Guest';
  }
}
function imageOf(p: Participant): string {
  try {
    return (p.metadata ? JSON.parse(p.metadata) : {}).image || '';
  } catch {
    return '';
  }
}

/** Re-render when a participant's tracks change; returns current cam/mic state. */
function useTrackState(p: Participant) {
  const [, force] = useState(0);
  useEffect(() => {
    const bump = () => force((n) => n + 1);
    const ev = ['trackPublished', 'trackUnpublished', 'trackMuted', 'trackUnmuted', 'trackSubscribed', 'trackUnsubscribed', 'localTrackPublished', 'localTrackUnpublished'];
    ev.forEach((e) => p.on(e as any, bump));
    return () => ev.forEach((e) => p.off(e as any, bump));
  }, [p]);
  const cam = p.getTrackPublication(Track.Source.Camera);
  const mic = p.getTrackPublication(Track.Source.Microphone);
  return { camTrack: cam?.track && !cam.isMuted ? cam.track : null, micOn: !!mic?.track && !mic.isMuted };
}

// ── View switcher (used by every view) ───────────────────────────────────────

export function ViewMenu({ view, onChange, light }: { view: MeetingView; onChange: (v: MeetingView) => void; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const Icon = VIEW_ICON[view];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${light ? 'text-neutral-200 hover:bg-white/10' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'}`}>
        <Icon className="size-4" />{VIEW_LABEL[view]}<ChevronDown className="size-3.5 opacity-70" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-2xl">
              {(Object.keys(VIEW_LABEL) as MeetingView[]).map((v) => {
                const I = VIEW_ICON[v];
                return (
                  <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-200 hover:bg-white/10">
                    <I className="size-4 text-neutral-400" /><span className="flex-1">{VIEW_LABEL[v]}</span>
                    {view === v && <Check className="size-4 text-emerald-400" />}
                  </button>
                );
              })}
              <p className="px-2.5 pb-1.5 pt-1 text-[10px] text-neutral-500">Tip: double-click anyone to focus on them</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Seats ───────────────────────────────────────────────────────────────────

function ParticipantSeat({ entry, size, speaking, handRaised, onFocus }: {
  entry: Entry; size: number; speaking: boolean; handRaised: boolean; onFocus: () => void;
}) {
  const { p, isLocal } = entry;
  const { camTrack, micOn } = useTrackState(p);
  const videoRef = useRef<HTMLVideoElement>(null);
  const name = nameOf(p);
  const image = imageOf(p);

  useEffect(() => {
    const el = videoRef.current;
    if (!camTrack || !el) return;
    camTrack.attach(el);
    return () => { camTrack.detach(el); };
  }, [camTrack]);

  return (
    <motion.div layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 180 }}
      onDoubleClick={onFocus} title={`${name}${isLocal ? ' (You)' : ''} — double-click to focus`}
      className="group relative cursor-pointer select-none" style={{ width: size, height: size }}>
      <div className={`absolute -inset-1.5 rounded-full transition-all ${speaking ? 'ring-2 ring-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.35)]' : 'ring-1 ring-transparent'}`} />
      <div className="relative size-full overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-purple-700">
        {camTrack ? (
          <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" style={{ transform: isLocal ? 'scaleX(-1)' : undefined }} />
        ) : image ? (
          <img src={image} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <div className="flex size-[78%] items-center justify-center rounded-full bg-violet-400/40">
              <span className="max-w-[85%] truncate font-semibold uppercase tracking-wide text-white" style={{ fontSize: Math.max(11, size / 13) }}>{name}</span>
            </div>
          </div>
        )}
        {(camTrack || image) && (
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-center text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            {name}{isLocal ? ' (You)' : ''}
          </span>
        )}
      </div>
      {/* status badges */}
      <div className="absolute bottom-[10%] right-[2%] flex gap-1">
        {!micOn && <span className="flex size-7 items-center justify-center rounded-full bg-black text-red-400 ring-2 ring-neutral-900"><MicOff className="size-3.5" /></span>}
        {!camTrack && <span className="flex size-7 items-center justify-center rounded-full bg-black text-neutral-200 ring-2 ring-neutral-900"><VideoOff className="size-3.5" /></span>}
      </div>
      {handRaised && (
        <motion.span animate={{ rotate: [0, 15, -5, 15, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}
          className="absolute -top-1 left-[8%] text-2xl drop-shadow">✋</motion.span>
      )}
    </motion.div>
  );
}

function EmptySeat({ size, face }: { size: number; face: string }) {
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex items-center justify-center rounded-full bg-[#3a3a3a]" style={{ width: size, height: size }}>
      <span className="select-none grayscale" style={{ fontSize: size * 0.48, opacity: 0.35, filter: 'grayscale(1) brightness(0.45) contrast(1.4)' }}>{face}</span>
    </motion.div>
  );
}

function ShareSeat({ size, onCopy, copied, onSchedule }: { size: number; onCopy: () => void; copied: boolean; onSchedule: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-full bg-[#141414] text-center" style={{ width: size, height: size }}>
      <UserPlus className="mb-1 size-4 text-neutral-400" />
      <p className="text-[11px] leading-tight text-neutral-300">Share link<br />to start a meeting</p>
      <p className="mt-0.5 text-[10px] text-neutral-500">(up to 100 people)</p>
      <div className="mt-2 flex overflow-hidden rounded-md bg-white text-black">
        <button type="button" onClick={onCopy} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium hover:bg-neutral-200">
          {copied ? <Check className="size-3" /> : <Link2 className="size-3" />}{copied ? 'Copied' : 'Copy Link'}
        </button>
        <button type="button" onClick={onSchedule} title="Schedule" className="border-l border-neutral-300 px-1.5 hover:bg-neutral-200">
          <CalendarPlus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function CampfireStage({ entries, speakingId, raisedHands, onFocus, onCopy, copied, onSchedule, capacity = 100 }: {
  entries: Entry[]; speakingId?: string; raisedHands: Map<string, any>; onFocus: (identity: string) => void;
  onCopy: () => void; copied: boolean; onSchedule: () => void; capacity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const seats = Math.max(6, entries.length);
  const showShare = entries.length < capacity;
  const positions = seats + (showShare ? 1 : 0);
  const min = Math.min(box.w, box.h);
  const radius = min * (positions > 10 ? 0.4 : 0.34);
  const size = Math.max(64, Math.min(min * 0.26, ((2 * Math.PI * radius) / positions) * 0.82));
  const cx = box.w / 2, cy = box.h / 2;

  // Position 0 (bottom) is the share seat; others go clockwise. People fill
  // the seats nearest the top first, so the room grows from the "head" of the fire.
  const ring = useMemo(() => {
    const all = Array.from({ length: positions }, (_, i) => {
      const deg = 90 + (i * 360) / positions;
      const rad = (deg * Math.PI) / 180;
      return { i, deg, x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
    });
    const share = showShare ? all[0] : null;
    const people = (showShare ? all.slice(1) : all).sort((a, b) => Math.abs(((a.deg % 360) + 360) % 360 - 245) - Math.abs(((b.deg % 360) + 360) % 360 - 245));
    return { share, people };
  }, [positions, radius, cx, cy, showShare]);

  return (
    <div ref={ref} className="relative size-full">
      <AnimatePresence>
        {ring.people.map((pos, k) => {
          const e = entries[k];
          return (
            <div key={e ? e.p.identity : `empty-${pos.i}`} className="absolute" style={{ left: pos.x - size / 2, top: pos.y - size / 2 }}>
              {e ? (
                <ParticipantSeat entry={e} size={size} speaking={speakingId === e.p.identity}
                  handRaised={raisedHands.has(e.p.identity)} onFocus={() => onFocus(e.p.identity)} />
              ) : (
                <EmptySeat size={size} face={EMPTY_FACES[pos.i % EMPTY_FACES.length]} />
              )}
            </div>
          );
        })}
      </AnimatePresence>
      {ring.share && (
        <div className="absolute" style={{ left: ring.share.x - size / 2, top: ring.share.y - size / 2 }}>
          <ShareSeat size={size} onCopy={onCopy} copied={copied} onSchedule={onSchedule} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-1 flex justify-center">
        <span className="flex items-center gap-1.5 text-xs text-neutral-400"><Users className="size-3.5" />{entries.length} / {capacity}</span>
      </div>
    </div>
  );
}

// ── Side panel: Attendees / Chat / Transcript ────────────────────────────────

type Tab = 'attendees' | 'chat' | 'transcript';

function SidePanel({
  tab, setTab, onClose, entries, raisedHands, isHost, onMute, onKick, onFocus, messages, onSend,
  transcript, live, lang, onLang, subtitlesOn, onToggleSubtitles,
}: {
  tab: Tab; setTab: (t: Tab) => void; onClose: () => void; entries: Entry[]; raisedHands: Map<string, any>; isHost: boolean;
  onMute: (id: string) => void; onKick: (id: string) => void; onFocus: (id: string) => void;
  messages: any[]; onSend: (t: string) => void; transcript: any[]; live: any; lang: string; onLang: (l: string) => void;
  subtitlesOn: boolean; onToggleSubtitles: () => void;
}) {
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const needle = q.trim().toLowerCase();
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, transcript.length, tab]);

  const lines = transcript.filter((l) => !needle || `${l.speaker} ${l.translated} ${l.original}`.toLowerCase().includes(needle));
  const msgs = messages.filter((m) => !needle || `${m.name} ${m.text}`.toLowerCase().includes(needle));
  const people = entries.filter((e) => !needle || nameOf(e.p).toLowerCase().includes(needle));

  return (
    <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
      className="absolute bottom-24 right-4 top-16 z-30 flex w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1b1b1b] shadow-2xl">
      <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2.5">
        {([['attendees', `Attendees (${entries.length})`], ['chat', 'Chat'], ['transcript', 'Transcript']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-md px-2.5 py-1 text-sm ${tab === k ? 'bg-black font-medium text-white' : 'text-neutral-300 hover:text-white'}`}>{label}</button>
        ))}
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-neutral-400 hover:text-white"><X className="size-4" /></button>
      </div>
      <div className="relative border-b border-white/10">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..."
          className="h-11 w-full bg-transparent pl-11 pr-3 text-sm text-white outline-none placeholder:text-neutral-500" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'attendees' && (
          <div className="p-2">
            {people.map((e) => (
              <AttendeeRow key={e.p.identity} entry={e} hand={raisedHands.has(e.p.identity)} isHost={isHost}
                onMute={() => onMute(e.p.identity)} onKick={() => onKick(e.p.identity)} onFocus={() => onFocus(e.p.identity)} />
            ))}
          </div>
        )}
        {tab === 'chat' && (
          <div className="space-y-3 p-3">
            {!msgs.length && <p className="pt-10 text-center text-sm text-neutral-500">No messages yet</p>}
            {msgs.map((m: any) => (
              <div key={m.id} className="text-sm leading-relaxed text-neutral-200">
                <span className="font-semibold text-white">{m.name}{m.isSelf ? ' (You)' : ''}: </span>{m.text}
                <span className="ml-1 text-[10px] text-neutral-500">{m.time ? new Date(m.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
        {tab === 'transcript' && (
          <div className="space-y-2 p-3">
            <div className="flex items-center gap-2 rounded-lg bg-black/40 p-2 text-xs text-neutral-300">
              <Languages className="size-4 text-neutral-400" />
              <span>Show in</span>
              <select value={lang} onChange={(e) => onLang(e.target.value)} className="rounded bg-neutral-800 px-1.5 py-1 text-xs text-white outline-none">
                {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
              <button type="button" onClick={onToggleSubtitles}
                className={`ml-auto rounded-md px-2 py-1 font-medium ${subtitlesOn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white text-black'}`}>
                {subtitlesOn ? 'Live: on' : 'Start transcript'}
              </button>
            </div>
            {!lines.length && !live && (
              <p className="pt-8 text-center text-sm text-neutral-500">{subtitlesOn ? 'Listening… speak to see the transcript.' : 'Start the transcript to see live, translated captions.'}</p>
            )}
            {lines.map((l: any) => (
              <div key={l.id} className="border-l-2 border-emerald-400 pl-3 text-sm leading-relaxed text-neutral-200">
                <span className="font-semibold text-white">{l.speaker}: </span>{l.translated}
                {l.original !== l.translated && <p className="mt-0.5 text-xs italic text-neutral-500">{l.original}</p>}
              </div>
            ))}
            {live && !live.isFinal && (
              <div className="border-l-2 border-neutral-600 pl-3 text-sm text-neutral-400"><span className="font-semibold">{live.speaker}: </span>{live.translated}</div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {tab === 'chat' && (
        <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onSend(draft.trim()); setDraft(''); } }}
          className="flex items-center gap-2 border-t border-white/10 p-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message everyone…"
            className="h-9 flex-1 rounded-lg bg-black/40 px-3 text-sm text-white outline-none placeholder:text-neutral-500" />
          <button type="submit" className="flex size-9 items-center justify-center rounded-lg bg-white text-black"><Send className="size-4" /></button>
        </form>
      )}
    </motion.aside>
  );
}

function AttendeeRow({ entry, hand, isHost, onMute, onKick, onFocus }: { entry: Entry; hand: boolean; isHost: boolean; onMute: () => void; onKick: () => void; onFocus: () => void }) {
  const { camTrack, micOn } = useTrackState(entry.p);
  const name = nameOf(entry.p);
  const [menu, setMenu] = useState(false);
  return (
    <div className="group relative flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/5" onDoubleClick={onFocus}>
      <span className="flex size-8 items-center justify-center rounded-full bg-violet-500 text-[11px] font-bold text-white">
        {name.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-white">{name}{entry.isLocal ? ' (You)' : ''}</span>
      {hand && <span>✋</span>}
      {micOn ? <Mic className="size-4 text-neutral-400" /> : <MicOff className="size-4 text-red-400" />}
      {camTrack ? <Video className="size-4 text-neutral-400" /> : <VideoOff className="size-4 text-neutral-500" />}
      {isHost && !entry.isLocal && (
        <button type="button" onClick={() => setMenu((m) => !m)} className="rounded p-0.5 text-neutral-400 hover:text-white"><MoreVertical className="size-4" /></button>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-9 z-50 w-40 rounded-lg border border-white/10 bg-neutral-900 p-1 text-sm shadow-xl">
            <button type="button" onClick={() => { onFocus(); setMenu(false); }} className="block w-full rounded px-2 py-1.5 text-left text-neutral-200 hover:bg-white/10">Focus on them</button>
            <button type="button" onClick={() => { onMute(); setMenu(false); }} className="block w-full rounded px-2 py-1.5 text-left text-neutral-200 hover:bg-white/10">Mute</button>
            <button type="button" onClick={() => { onKick(); setMenu(false); }} className="block w-full rounded px-2 py-1.5 text-left text-red-400 hover:bg-white/10">Remove</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Bottom bar pieces ────────────────────────────────────────────────────────

function DeviceMenu({ room, kind, onClose }: { room: Room | null; kind: MediaDeviceKind; onClose: () => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [active, setActive] = useState<string | undefined>();
  useEffect(() => {
    Room.getLocalDevices(kind).then(setDevices).catch(() => setDevices([]));
    setActive(room?.getActiveDevice(kind));
  }, [room, kind]);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full left-0 z-50 mb-3 w-64 rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-2xl">
        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500">{kind === 'audioinput' ? 'Microphone' : kind === 'audiooutput' ? 'Speaker' : 'Camera'}</p>
        {devices.map((d) => (
          <button key={d.deviceId} type="button" onClick={async () => { await room?.switchActiveDevice(kind, d.deviceId).catch(() => {}); setActive(d.deviceId); onClose(); }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-200 hover:bg-white/10">
            <span className="min-w-0 flex-1 truncate">{d.label || 'Device'}</span>{active === d.deviceId && <Check className="size-3.5 text-emerald-400" />}
          </button>
        ))}
        {!devices.length && <p className="px-2 py-2 text-xs text-neutral-500">No devices found</p>}
      </div>
    </>
  );
}

const Seg = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative flex items-center border-r border-white/10 last:border-r-0 ${className}`}>{children}</div>
);

// ── Full campfire room ───────────────────────────────────────────────────────

export interface CampfireRoomProps {
  room: Room | null;
  title: string;
  entries: Entry[];
  speakingId?: string;
  raisedHands: Map<string, any>;
  isHost: boolean;
  view: MeetingView;
  onView: (v: MeetingView) => void;
  onFocus: (identity: string) => void;
  isMuted: boolean; onToggleMute: () => void;
  isVideoOn: boolean; onToggleVideo: () => void;
  isScreenSharing: boolean; onToggleShare: () => void;
  deafened: boolean; onToggleDeafen: () => void;
  isHandRaised: boolean; onRaiseHand: () => void;
  onReact: (emoji: string) => void; reactionCounts: Record<string, number>;
  messages: any[]; onSendChat: (t: string) => void; unreadChats: number; onChatSeen: () => void;
  transcript: any[]; liveSubtitle: any; lang: string; onLang: (l: string) => void;
  subtitlesOn: boolean; onToggleSubtitles: () => void;
  recording: boolean; uploadingRecording: boolean; onToggleRecording: () => void;
  onInvite: () => void; onCopyLink: () => void; copied: boolean; onLeave: () => void; leaving: boolean;
  onMute: (id: string) => void; onKick: (id: string) => void;
  waitingCount: number;
}

export default function CampfireRoom(props: CampfireRoomProps) {
  const [panel, setPanel] = useState<Tab | null>(null);
  const [menu, setMenu] = useState<null | 'mic' | 'speaker' | 'cam' | 'share' | 'tools'>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const f = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  useEffect(() => { if (panel === 'chat') props.onChatSeen(); }, [panel, props]);
  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  const schedule = () => window.open('/meetings/new', '_blank');

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#202020] text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleFs} className="flex size-8 items-center justify-center rounded-md bg-white/10 text-neutral-200 hover:bg-white/15" title={fullscreen ? 'Exit full screen' : 'Full screen'}>
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <ViewMenu view={props.view} onChange={props.onView} light />
          <span className="ml-2 hidden truncate text-sm text-neutral-400 md:block">{props.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {props.isHost && props.waitingCount > 0 && (
            <button type="button" onClick={() => setPanel('attendees')} className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-semibold text-yellow-300">
              {props.waitingCount} waiting
            </button>
          )}
          <button type="button" onClick={() => setPanel(panel ? null : 'attendees')} title="People, chat & transcript"
            className="flex size-8 items-center justify-center rounded-md text-neutral-300 hover:bg-white/10"><PanelRight className="size-4" /></button>
          <div className="flex overflow-hidden rounded-md bg-white text-black">
            <button type="button" onClick={props.onCopyLink} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200">
              {props.copied ? <Check className="size-4" /> : <Link2 className="size-4" />}{props.copied ? 'Copied' : 'Copy Link'}
            </button>
            <button type="button" onClick={schedule} title="Schedule a meeting" className="border-l border-neutral-300 px-2 hover:bg-neutral-200"><CalendarPlus className="size-4" /></button>
          </div>
          <button type="button" onClick={props.onInvite} title="Invite by email" className="flex size-8 items-center justify-center rounded-md text-neutral-300 hover:bg-white/10"><MoreVertical className="size-4" /></button>
        </div>
      </div>

      {/* Stage */}
      <div className={`absolute bottom-24 left-0 top-14 transition-all ${panel ? 'right-[410px] max-md:right-0' : 'right-0'}`}>
        <CampfireStage entries={props.entries} speakingId={props.speakingId} raisedHands={props.raisedHands}
          onFocus={props.onFocus} onCopy={props.onCopyLink} copied={props.copied} onSchedule={schedule} />
      </div>

      {/* Live caption line */}
      {props.liveSubtitle && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 px-4">
          <div className="rounded-xl bg-black/80 px-5 py-3 text-center backdrop-blur">
            <span className="mr-1 text-xs font-semibold text-emerald-300">{props.liveSubtitle.speaker}:</span>
            <span className="text-sm">{props.liveSubtitle.translated}</span>
          </div>
        </div>
      )}

      <AnimatePresence>
        {panel && (
          <SidePanel tab={panel} setTab={setPanel} onClose={() => setPanel(null)} entries={props.entries} raisedHands={props.raisedHands}
            isHost={props.isHost} onMute={props.onMute} onKick={props.onKick} onFocus={props.onFocus}
            messages={props.messages} onSend={props.onSendChat} transcript={props.transcript} live={props.liveSubtitle}
            lang={props.lang} onLang={props.onLang} subtitlesOn={props.subtitlesOn} onToggleSubtitles={props.onToggleSubtitles} />
        )}
      </AnimatePresence>

      {/* Bottom pill bar */}
      <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center px-2">
        <div className="flex h-11 max-w-full items-stretch overflow-x-auto rounded-xl border border-white/10 bg-[#141414] text-sm shadow-2xl">
          <Seg>
            <button type="button" onClick={props.onToggleMute} title={props.isMuted ? 'Unmute' : 'Mute'} className={`px-3 ${props.isMuted ? 'text-red-400' : 'text-emerald-400'}`}>
              {props.isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
            <button type="button" onClick={() => setMenu(menu === 'mic' ? null : 'mic')} className="pr-2 text-neutral-400 hover:text-white"><ChevronDown className="size-3.5" /></button>
            {menu === 'mic' && <DeviceMenu room={props.room} kind="audioinput" onClose={() => setMenu(null)} />}
          </Seg>
          <Seg>
            <button type="button" onClick={props.onToggleDeafen} title={props.deafened ? 'Turn sound on' : 'Mute everyone for me'} className={`px-3 ${props.deafened ? 'text-red-400' : 'text-neutral-200'}`}>
              {props.deafened ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <button type="button" onClick={() => setMenu(menu === 'speaker' ? null : 'speaker')} className="pr-2 text-neutral-400 hover:text-white"><ChevronDown className="size-3.5" /></button>
            {menu === 'speaker' && <DeviceMenu room={props.room} kind="audiooutput" onClose={() => setMenu(null)} />}
          </Seg>
          <Seg>
            <button type="button" onClick={props.onToggleVideo} className="flex items-center gap-1.5 px-3 text-neutral-200">
              {props.isVideoOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}<span className="whitespace-nowrap">{props.isVideoOn ? 'Stop Video' : 'Start Video'}</span>
            </button>
            <button type="button" onClick={() => setMenu(menu === 'cam' ? null : 'cam')} className="pr-2 text-neutral-400 hover:text-white"><ChevronDown className="size-3.5" /></button>
            {menu === 'cam' && <DeviceMenu room={props.room} kind="videoinput" onClose={() => setMenu(null)} />}
          </Seg>
          <Seg>
            <button type="button" onClick={props.onToggleShare} className={`flex items-center gap-1.5 px-3 ${props.isScreenSharing ? 'text-blue-400' : 'text-neutral-200'}`}>
              {props.isScreenSharing ? <MonitorOff className="size-4" /> : <Monitor className="size-4" />}<span>{props.isScreenSharing ? 'Stop' : 'Share'}</span>
            </button>
          </Seg>
          <Seg className="gap-1 px-2">
            <button type="button" onClick={() => setPanel('chat')} className="relative text-neutral-300 hover:text-white" title="Chat">
              <MessageSquare className="size-4" />
              {props.unreadChats > 0 && <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold">{props.unreadChats > 9 ? '9+' : props.unreadChats}</span>}
            </button>
            <form onSubmit={(e) => { e.preventDefault(); if (chatDraft.trim()) { props.onSendChat(chatDraft.trim()); setChatDraft(''); } }}>
              <input value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} placeholder="Type..."
                className="h-8 w-40 bg-transparent px-1 text-sm text-white outline-none placeholder:text-neutral-500 max-sm:w-20" />
            </form>
            {['👍', '🎉'].map((e) => (
              <button key={e} type="button" onClick={() => props.onReact(e)} className="relative px-1 text-base transition-transform hover:scale-125" title="React">
                {e}
                {!!props.reactionCounts[e] && <span className="absolute -bottom-1 -right-0.5 rounded bg-neutral-700 px-0.5 text-[9px] leading-tight">{props.reactionCounts[e]}</span>}
              </button>
            ))}
          </Seg>
          <Seg>
            <button type="button" onClick={props.onRaiseHand} title={props.isHandRaised ? 'Lower hand' : 'Raise hand'} className={`px-3 ${props.isHandRaised ? 'text-yellow-400' : 'text-neutral-300'}`}>
              <Hand className="size-4" />
            </button>
          </Seg>
          <Seg>
            <button type="button" onClick={() => setMenu(menu === 'tools' ? null : 'tools')} className="flex items-center gap-1.5 px-3 text-neutral-200">
              <Zap className="size-4" />Tools<ChevronDown className="size-3.5 opacity-70" />
            </button>
            {menu === 'tools' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="absolute bottom-full left-0 z-50 mb-3 w-60 rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-2xl">
                  {[
                    [Subtitles, props.subtitlesOn ? 'Turn off live captions' : 'Live captions & translation', props.onToggleSubtitles],
                    [Languages, 'Transcript', () => setPanel('transcript')],
                    [Users, 'Attendees', () => setPanel('attendees')],
                    [UserPlus, 'Invite by email', props.onInvite],
                    [Copy, 'Copy meeting link', props.onCopyLink],
                    [Wrench, 'Switch to standard view', () => props.onView('grid')],
                  ].map(([Icon, label, fn]: any) => (
                    <button key={label} type="button" onClick={() => { fn(); setMenu(null); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-200 hover:bg-white/10">
                      <Icon className="size-4 text-neutral-400" />{label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Seg>
          <Seg>
            <button type="button" onClick={props.onToggleRecording} disabled={props.uploadingRecording} className="flex items-center gap-1.5 whitespace-nowrap px-3 text-neutral-200 disabled:opacity-60">
              <span className={`size-2.5 rounded-full ${props.recording ? 'animate-pulse bg-red-500' : 'bg-red-500/70'}`} />
              {props.uploadingRecording ? 'Saving…' : props.recording ? 'Stop Recording' : 'Record'}
            </button>
          </Seg>
          <button type="button" onClick={props.onLeave} disabled={props.leaving} className="flex items-center gap-1.5 bg-red-500 px-4 font-medium text-white hover:bg-red-600 disabled:opacity-60">
            <PhoneOff className="size-4" />{props.leaving ? 'Leaving…' : 'Leave'}
          </button>
        </div>
      </div>
    </div>
  );
}
