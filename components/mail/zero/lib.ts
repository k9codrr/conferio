// Shared types + helpers for the Conferio mail (Zero-style) UI.
// Data comes from /api/integrations/google/gmail/messages (Gmail).

export interface MailAddress {
  name?: string;
  email: string;
}

export interface MailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: MailAddress;
  to: MailAddress[];
  snippet: string;
  body: string;
  bodyPlain: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labelIds: string[];
}

export type ThreadViewMode = 'sidebar' | 'popup' | 'fullscreen';

export type FolderId = 'INBOX' | 'IMPORTANT' | 'STARRED' | 'SENT' | 'DRAFT' | 'SPAM' | 'TRASH';

export const API = '/api/integrations/google/gmail/messages';

// Category tints used for the fetch progress bar + category pills (from the Zero design).
export const CATEGORY_COLORS: Record<string, string> = {
  primary: '#006FFE',
  social: '#39ae4a',
  updates: '#8B5CF6',
  forums: '#F59E0D',
  promotions: '#F43F5E',
};

export function formatMailDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const diff = now.getTime() - d.getTime();
  if (diff < 7 * 86_400_000) return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatFullDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Strip surrounding quotes / angle-bracket noise from a display name. */
export function cleanName(addr?: MailAddress) {
  if (!addr) return '';
  const raw = (addr.name || addr.email || '').trim();
  return raw.replace(/^["']+|["']+$/g, '').trim() || addr.email;
}

export function initials(addr?: MailAddress) {
  const name = cleanName(addr);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name[0] || '?').toUpperCase();
}

// Deterministic avatar tint so each sender keeps the same colour.
const AVATAR_TINTS = ['#006FFE', '#8B5CF6', '#39ae4a', '#F59E0D', '#F43F5E', '#0EA5E9', '#EC4899', '#14B8A6'];
export function avatarTint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}

export async function postAction(body: Record<string, unknown>) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
  return data;
}

export function toHtmlBody(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${escaped.replace(/\n/g, '<br>')}</div>`;
}

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
