// lib/whiteboard/presence.ts
// Who is in a whiteboard room right now + the room's recent chat.
// In-process (globalThis) — presence is also broadcast on the realtime bus,
// so clients on other instances still see join/leave/heartbeat events.
export interface Participant {
  userId: string;
  clientId: string;
  name: string;
  image?: string | null;
  color: string;
  access: string;
  lastSeen: number;
}
export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  color: string;
  text: string;
  at: number;
}

const TTL = 45_000;
const MAX_CHAT = 100;

const g = globalThis as unknown as {
  __wbPresence?: Map<string, Map<string, Participant>>;
  __wbChat?: Map<string, ChatMessage[]>;
};
const presence = (g.__wbPresence ??= new Map());
const chat = (g.__wbChat ??= new Map());

export function touch(roomId: string, p: Omit<Participant, "lastSeen">) {
  let room = presence.get(roomId);
  if (!room) presence.set(roomId, (room = new Map()));
  room.set(p.clientId, { ...p, lastSeen: Date.now() });
}

export function leave(roomId: string, clientId: string) {
  presence.get(roomId)?.delete(clientId);
}

export function participants(roomId: string): Participant[] {
  const room = presence.get(roomId);
  if (!room) return [];
  const now = Date.now();
  room.forEach((p, id) => { if (now - p.lastSeen > TTL) room.delete(id); });
  return Array.from(room.values());
}

export function addChat(roomId: string, m: ChatMessage) {
  const list = chat.get(roomId) ?? [];
  list.push(m);
  if (list.length > MAX_CHAT) list.splice(0, list.length - MAX_CHAT);
  chat.set(roomId, list);
}

export function recentChat(roomId: string): ChatMessage[] {
  return chat.get(roomId) ?? [];
}

export function colorFor(userId: string): string {
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = ((h << 5) - h + userId.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}
