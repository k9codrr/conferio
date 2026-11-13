// Centralized team media index.
//
// Read-only: it collects every file/media item that was uploaded or shared
// anywhere inside a team (Drive, channel chat, thread replies, direct
// messages, kanban task + comment attachments, docs, notes) into one list
// for the /drive/all page. It never writes to the source tables, so the
// features that own those uploads are unaffected.

import { prisma } from '@/lib/prisma';
import { generateDownloadURL } from '@/lib/s3';

export type MediaSource =
  | 'DRIVE'
  | 'CHANNEL'
  | 'THREAD'
  | 'DM'
  | 'TASK'
  | 'TASK_COMMENT'
  | 'DOC'
  | 'NOTE';

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'other';

export interface MediaUser {
  id: string;
  name: string | null;
  email?: string | null;
  image: string | null;
}

export interface MediaAssignment {
  assignee: MediaUser | null;
  assigner: MediaUser | null;
  assignedAt: string | null;
}

export interface MediaItem {
  id: string;
  source: MediaSource;
  name: string;
  url: string;
  mimeType: string;
  kind: MediaKind;
  size: number | null;
  createdAt: string;
  uploadedBy: MediaUser | null;
  location: {
    label: string; // e.g. "#general", "Task: Fix login", "Doc: Roadmap"
    detail?: string; // e.g. "Board: Sprint 4", "Direct message with Alex"
    href?: string;
  };
  assignments: MediaAssignment[];
  alsoIn: { type: string; label: string; href?: string }[];
}

export interface CentralMediaQuery {
  teamId: string;
  userId: string;
  source?: string; // 'drive' | 'chat' | 'tasks' | 'docs' | 'notes' | 'all'
  type?: string; // MediaKind | 'all'
  keyword?: string;
  assigned?: string; // 'to-me' | 'by-me' | 'any'
  page?: number;
  pageSize?: number;
}

const PER_SOURCE_LIMIT = 500;
const CONTENT_SCAN_LIMIT = 300;

// ---------------------------------------------------------------------------
// helpers

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  heic: 'image/heic',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', m4v: 'video/mp4',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  aac: 'audio/aac', flac: 'audio/flac',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
};

function extOf(nameOrUrl: string): string {
  const clean = nameOrUrl.split('?')[0].split('#')[0];
  const last = clean.split('/').pop() || '';
  const dot = last.lastIndexOf('.');
  return dot >= 0 ? last.slice(dot + 1).toLowerCase() : '';
}

function mimeFrom(nameOrUrl: string, fallback?: string | null): string {
  if (fallback) return fallback;
  return EXT_MIME[extOf(nameOrUrl)] || 'application/octet-stream';
}

export function kindOf(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime.startsWith('text/') ||
    mime === 'application/pdf' ||
    mime.includes('word') ||
    mime.includes('sheet') ||
    mime.includes('excel') ||
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    mime === 'application/json'
  ) {
    return 'document';
  }
  return 'other';
}

function nameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const raw = decodeURIComponent(path.split('/').pop() || 'file');
    // strip common "<uuid>-" / "<nanoid>-" prefixes added on upload
    return raw.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '') || raw;
  } catch {
    return url.split('/').pop() || 'file';
  }
}

function looksLikeUrl(s: string | null | undefined) {
  return !!s && /^https?:\/\//i.test(s.trim());
}

async function safeSign(key: string | null | undefined, fallback: string | null | undefined) {
  if (key) {
    try {
      return await generateDownloadURL(key, 3600);
    } catch {
      /* fall through */
    }
  }
  return fallback || '';
}

const userSelect = { id: true, name: true, email: true, image: true } as const;

function toUser(u: any): MediaUser | null {
  if (!u) return null;
  return { id: u.id, name: u.name ?? null, email: u.email ?? null, image: u.image ?? null };
}

// Walk an EditorJS document (or any JSON) and pull out uploaded media.
interface ContentMedia {
  url: string;
  name: string;
  size: number | null;
  blockType: string;
}

function extractEditorMedia(content: unknown): ContentMedia[] {
  const found: ContentMedia[] = [];
  const seen = new Set<string>();
  const push = (url: unknown, name: unknown, size: unknown, blockType: string) => {
    if (typeof url !== 'string' || !looksLikeUrl(url) || seen.has(url)) return;
    seen.add(url);
    found.push({
      url,
      name: typeof name === 'string' && name.trim() ? name.trim() : nameFromUrl(url),
      size: typeof size === 'number' ? size : null,
      blockType,
    });
  };

  const walk = (node: any, depth: number) => {
    if (!node || depth > 12) return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;

    const type = typeof node.type === 'string' ? node.type : '';
    const data = node.data;
    if (data && typeof data === 'object') {
      if ((type === 'image' || type === 'attaches') && data.file?.url) {
        push(data.file.url, data.file.title || data.file.name || data.caption, data.file.size, type);
      } else if (type === 'simpleImage' && data.url) {
        push(data.url, data.caption, null, type);
      } else if (type === 'video' || type === 'audio') {
        push(data.file?.url || data.url, data.file?.title || data.caption, data.file?.size, type);
      }
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };

  // content may be stored as a JSON string
  let parsed = content;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch {
      return found;
    }
  }
  walk(parsed, 0);
  return found;
}

// ---------------------------------------------------------------------------
// collectors – each returns MediaItem[] the viewer is allowed to see

interface Ctx {
  teamId: string;
  teamSlug: string;
  userId: string;
  memberId: string;
  teamUserIds: string[];
  usersById: Map<string, MediaUser>;
}

async function collectDrive(ctx: Ctx): Promise<MediaItem[]> {
  const files = await prisma.file.findMany({
    where: {
      isDeleted: false,
      OR: [
        { teamId: ctx.teamId, visibility: { in: ['TEAM', 'PASSWORD_PROTECTED'] } },
        { teamId: ctx.teamId, userId: ctx.userId },
        { teamId: ctx.teamId, assignedTo: { some: { userId: ctx.userId } } },
      ],
    },
    include: {
      user: { select: userSelect },
      folder: { select: { id: true, name: true } },
      assignedTo: { include: { user: { select: userSelect } } },
      links: true,
    },
    orderBy: { createdAt: 'desc' },
    take: PER_SOURCE_LIMIT,
  });

  // resolve FileLink targets so we can say "also attached to ..."
  const linkIds = (t: string) =>
    files.flatMap((f) => f.links.filter((l) => l.type === t).map((l) => l.contextId));
  const [tasks, pages, notes, channels] = await Promise.all([
    prisma.task.findMany({ where: { id: { in: linkIds('TASK') } }, select: { id: true, title: true, boardId: true } }),
    prisma.page.findMany({ where: { id: { in: linkIds('PAGE') }, teamId: ctx.teamId }, select: { id: true, title: true } }),
    prisma.note.findMany({ where: { id: { in: linkIds('NOTE') }, authorId: ctx.userId }, select: { id: true, title: true } }),
    prisma.channel.findMany({ where: { id: { in: linkIds('CHANNEL') }, teamId: ctx.teamId }, select: { id: true, name: true } }),
  ]);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const pageMap = new Map(pages.map((p) => [p.id, p]));
  const noteMap = new Map(notes.map((n) => [n.id, n]));
  const chanMap = new Map(channels.map((c) => [c.id, c]));

  return Promise.all(
    files.map(async (f) => {
      const alsoIn: MediaItem['alsoIn'] = [];
      for (const l of f.links) {
        if (l.type === 'TASK' && taskMap.has(l.contextId)) {
          const t = taskMap.get(l.contextId)!;
          alsoIn.push({ type: 'Task', label: t.title, href: `/board/${t.boardId}` });
        } else if (l.type === 'PAGE' && pageMap.has(l.contextId)) {
          const p = pageMap.get(l.contextId)!;
          alsoIn.push({ type: 'Doc', label: p.title, href: `/team/${ctx.teamSlug}/docs/${p.id}` });
        } else if (l.type === 'NOTE' && noteMap.has(l.contextId)) {
          alsoIn.push({ type: 'Note', label: noteMap.get(l.contextId)!.title, href: '/notes' });
        } else if (l.type === 'CHANNEL' && chanMap.has(l.contextId)) {
          const c = chanMap.get(l.contextId)!;
          alsoIn.push({ type: 'Channel', label: `#${c.name}`, href: `/team/${ctx.teamSlug}/channels/${c.id}` });
        }
      }
      const isProtected = f.visibility === 'PASSWORD_PROTECTED' && f.userId !== ctx.userId;
      return {
        id: `drive:${f.id}`,
        source: 'DRIVE' as const,
        name: f.originalName,
        // password-protected files are opened through the Drive's own verify flow
        url: isProtected ? '' : await safeSign(f.storageKey, f.url),
        mimeType: f.mimeType,
        kind: kindOf(f.mimeType),
        size: f.size,
        createdAt: f.createdAt.toISOString(),
        uploadedBy: toUser(f.user),
        location: {
          label: f.folder ? `Drive / ${f.folder.name}` : 'Drive',
          detail:
            f.visibility === 'PERSONAL'
              ? 'Personal file'
              : f.visibility === 'PASSWORD_PROTECTED'
                ? 'Password protected'
                : 'Team file',
          href: '/drive/page',
        },
        assignments: f.assignedTo.map((a) => ({
          assignee: toUser(a.user),
          assigner: ctx.usersById.get(a.assignedBy) || null,
          assignedAt: a.createdAt.toISOString(),
        })),
        alsoIn,
      };
    })
  );
}

async function accessibleChannels(ctx: Ctx) {
  return prisma.channel.findMany({
    where: {
      teamId: ctx.teamId,
      OR: [{ visibility: 'TEAM' }, { members: { some: { teamMemberId: ctx.memberId } } }],
    },
    select: { id: true, name: true },
  });
}

async function collectChannels(ctx: Ctx): Promise<MediaItem[]> {
  const channels = await accessibleChannels(ctx);
  if (!channels.length) return [];
  const chanMap = new Map(channels.map((c) => [c.id, c]));
  const channelIds = channels.map((c) => c.id);

  const [messages, replies] = await Promise.all([
    prisma.message.findMany({
      where: { channelId: { in: channelIds }, deleted: false, fileUrl: { not: null } },
      select: {
        id: true, fileUrl: true, content: true, createdAt: true, channelId: true,
        sender: { select: { user: { select: userSelect } } },
      },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
    prisma.threadReply.findMany({
      where: {
        deleted: false,
        fileUrl: { not: null },
        thread: { message: { channelId: { in: channelIds } } },
      },
      select: {
        id: true, fileUrl: true, content: true, createdAt: true,
        sender: { select: { user: { select: userSelect } } },
        thread: { select: { message: { select: { channelId: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
  ]);

  const items: MediaItem[] = [];
  for (const m of messages) {
    if (!m.fileUrl) continue;
    const c = chanMap.get(m.channelId)!;
    const mime = mimeFrom(m.fileUrl);
    items.push({
      id: `channel:${m.id}`,
      source: 'CHANNEL',
      name: nameFromUrl(m.fileUrl),
      url: m.fileUrl,
      mimeType: mime,
      kind: kindOf(mime),
      size: null,
      createdAt: m.createdAt.toISOString(),
      uploadedBy: toUser(m.sender?.user),
      location: {
        label: `#${c.name}`,
        detail: 'Channel message',
        href: `/team/${ctx.teamSlug}/channels/${c.id}`,
      },
      assignments: [],
      alsoIn: [],
    });
  }
  for (const r of replies) {
    if (!r.fileUrl) continue;
    const c = chanMap.get(r.thread.message.channelId);
    const mime = mimeFrom(r.fileUrl);
    items.push({
      id: `thread:${r.id}`,
      source: 'THREAD',
      name: nameFromUrl(r.fileUrl),
      url: r.fileUrl,
      mimeType: mime,
      kind: kindOf(mime),
      size: null,
      createdAt: r.createdAt.toISOString(),
      uploadedBy: toUser(r.sender?.user),
      location: {
        label: c ? `#${c.name}` : 'Channel thread',
        detail: 'Thread reply',
        href: c ? `/team/${ctx.teamSlug}/channels/${c.id}` : undefined,
      },
      assignments: [],
      alsoIn: [],
    });
  }
  return items;
}

async function collectDirectMessages(ctx: Ctx): Promise<MediaItem[]> {
  // DMs are private: only conversations the viewer takes part in.
  const messages = await prisma.teamDirectMessage.findMany({
    where: {
      deleted: false,
      fileUrl: { not: null },
      conversation: {
        teamId: ctx.teamId,
        OR: [{ participantOneId: ctx.memberId }, { participantTwoId: ctx.memberId }],
      },
    },
    select: {
      id: true, fileUrl: true, createdAt: true,
      sender: { select: { user: { select: userSelect } } },
      conversation: {
        select: {
          participantOneId: true,
          participantTwoId: true,
          participantOne: { select: { id: true, user: { select: userSelect } } },
          participantTwo: { select: { id: true, user: { select: userSelect } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: PER_SOURCE_LIMIT,
  });

  return messages
    .filter((m) => m.fileUrl)
    .map((m) => {
      const conv = m.conversation;
      const other = conv.participantOneId === ctx.memberId ? conv.participantTwo : conv.participantOne;
      const mime = mimeFrom(m.fileUrl!);
      return {
        id: `dm:${m.id}`,
        source: 'DM' as const,
        name: nameFromUrl(m.fileUrl!),
        url: m.fileUrl!,
        mimeType: mime,
        kind: kindOf(mime),
        size: null,
        createdAt: m.createdAt.toISOString(),
        uploadedBy: toUser(m.sender?.user),
        location: {
          label: `DM with ${other?.user?.name || other?.user?.email || 'member'}`,
          detail: 'Direct message',
          href: other ? `/team/${ctx.teamSlug}/conversations/${other.id}` : undefined,
        },
        assignments: [],
        alsoIn: [],
      };
    });
}

async function collectTasks(ctx: Ctx): Promise<MediaItem[]> {
  // Boards aren't tied to a team, so we include boards the viewer can open
  // whose owner belongs to this team.
  const boards = await prisma.board.findMany({
    where: {
      ownerId: { in: ctx.teamUserIds },
      OR: [{ ownerId: ctx.userId }, { members: { some: { userId: ctx.userId } } }],
    },
    select: { id: true, title: true },
  });
  if (!boards.length) return [];
  const boardMap = new Map(boards.map((b) => [b.id, b]));
  const boardIds = boards.map((b) => b.id);

  const taskInclude = {
    select: {
      id: true,
      title: true,
      boardId: true,
      assignees: { select: { assignedAt: true, assignedBy: true, user: { select: userSelect } } },
    },
  } as const;

  const [attachments, commentAttachments] = await Promise.all([
    prisma.attachment.findMany({
      where: { task: { boardId: { in: boardIds } } },
      include: { uploadedBy: { select: userSelect }, task: taskInclude },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
    prisma.commentAttachment.findMany({
      where: { comment: { task: { boardId: { in: boardIds } } } },
      include: {
        comment: { select: { user: { select: userSelect }, task: taskInclude } },
      },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE_LIMIT,
    }),
  ]);

  const assignmentsOf = (task: any): MediaAssignment[] =>
    (task?.assignees || []).map((a: any) => ({
      assignee: toUser(a.user),
      assigner: a.assignedBy ? ctx.usersById.get(a.assignedBy) || null : null,
      assignedAt: a.assignedAt ? new Date(a.assignedAt).toISOString() : null,
    }));

  const items: MediaItem[] = await Promise.all(
    attachments.map(async (a) => {
      const board = boardMap.get(a.task.boardId);
      return {
        id: `task:${a.id}`,
        source: 'TASK' as const,
        name: a.filename,
        url: await safeSign(a.key, a.url),
        mimeType: a.mimeType,
        kind: kindOf(a.mimeType),
        size: a.size,
        createdAt: a.createdAt.toISOString(),
        uploadedBy: toUser(a.uploadedBy),
        location: {
          label: `Task: ${a.task.title}`,
          detail: board ? `Board: ${board.title}` : 'Kanban',
          href: `/board/${a.task.boardId}`,
        },
        assignments: assignmentsOf(a.task),
        alsoIn: [],
      };
    })
  );

  for (const c of commentAttachments) {
    const task = c.comment.task;
    const board = boardMap.get(task.boardId);
    const mime = mimeFrom(c.filename || c.url, c.mimeType);
    items.push({
      id: `comment:${c.id}`,
      source: 'TASK_COMMENT',
      name: c.filename || nameFromUrl(c.url),
      url: c.url,
      mimeType: mime,
      kind: kindOf(mime),
      size: c.size ?? null,
      createdAt: c.createdAt.toISOString(),
      uploadedBy: toUser(c.comment.user),
      location: {
        label: `Comment on: ${task.title}`,
        detail: board ? `Board: ${board.title}` : 'Kanban',
        href: `/board/${task.boardId}`,
      },
      assignments: assignmentsOf(task),
      alsoIn: [],
    });
  }
  return items;
}

async function collectDocs(ctx: Ctx): Promise<MediaItem[]> {
  const pages = await prisma.page.findMany({
    where: {
      teamId: ctx.teamId,
      isTemplate: false,
      OR: [{ visibility: 'TEAM' }, { authorId: ctx.userId }, { assignedToId: ctx.memberId }],
    },
    select: {
      id: true, title: true, content: true, coverImage: true, updatedAt: true, createdAt: true,
      author: { select: userSelect },
      assignedTo: { select: { user: { select: userSelect } } },
      assignedBy: { select: userSelect },
    },
    orderBy: { updatedAt: 'desc' },
    take: CONTENT_SCAN_LIMIT,
  });

  const items: MediaItem[] = [];
  for (const p of pages) {
    const assignments: MediaAssignment[] = p.assignedTo
      ? [{ assignee: toUser(p.assignedTo.user), assigner: toUser(p.assignedBy), assignedAt: null }]
      : [];
    const media = extractEditorMedia(p.content);
    if (looksLikeUrl(p.coverImage)) {
      media.unshift({ url: p.coverImage!, name: `${p.title} (cover)`, size: null, blockType: 'cover' });
    }
    media.forEach((m, i) => {
      const mime = mimeFrom(m.name.includes('.') ? m.name : m.url);
      items.push({
        id: `doc:${p.id}:${i}`,
        source: 'DOC',
        name: m.name,
        url: m.url,
        mimeType: mime,
        kind: m.blockType === 'image' || m.blockType === 'simpleImage' || m.blockType === 'cover'
          ? 'image'
          : kindOf(mime),
        size: m.size,
        // block-level timestamps aren't stored, so the doc's last edit is the best we have
        createdAt: p.updatedAt.toISOString(),
        uploadedBy: toUser(p.author),
        location: {
          label: `Doc: ${p.title || 'Untitled'}`,
          detail: m.blockType === 'cover' ? 'Cover image' : 'Embedded in document',
          href: `/team/${ctx.teamSlug}/docs/${p.id}`,
        },
        assignments,
        alsoIn: [],
      });
    });
  }
  return items;
}

async function collectNotes(ctx: Ctx): Promise<MediaItem[]> {
  // Notes are personal (no team), so only the viewer's own notes are shown.
  const notes = await prisma.note.findMany({
    where: { authorId: ctx.userId, isArchived: false },
    select: {
      id: true, title: true, content: true, coverImage: true, updatedAt: true,
      author: { select: userSelect },
      files: { include: { uploader: { select: userSelect } } },
    },
    orderBy: { updatedAt: 'desc' },
    take: CONTENT_SCAN_LIMIT,
  });

  const items: MediaItem[] = [];
  for (const n of notes) {
    const seen = new Set<string>();
    for (const f of n.files) {
      seen.add(f.url);
      items.push({
        id: `notefile:${f.id}`,
        source: 'NOTE',
        name: f.originalName || f.name,
        url: await safeSign(f.key, f.url),
        mimeType: f.mimeType,
        kind: kindOf(f.mimeType),
        size: f.size,
        createdAt: f.createdAt.toISOString(),
        uploadedBy: toUser(f.uploader),
        location: { label: `Note: ${n.title}`, detail: 'Private note', href: '/notes' },
        assignments: [],
        alsoIn: [],
      });
    }
    const media = extractEditorMedia(n.content);
    if (looksLikeUrl(n.coverImage)) {
      media.unshift({ url: n.coverImage!, name: `${n.title} (cover)`, size: null, blockType: 'cover' });
    }
    media.forEach((m, i) => {
      if (seen.has(m.url)) return;
      const mime = mimeFrom(m.name.includes('.') ? m.name : m.url);
      items.push({
        id: `note:${n.id}:${i}`,
        source: 'NOTE',
        name: m.name,
        url: m.url,
        mimeType: mime,
        kind: m.blockType === 'image' || m.blockType === 'simpleImage' || m.blockType === 'cover'
          ? 'image'
          : kindOf(mime),
        size: m.size,
        createdAt: n.updatedAt.toISOString(),
        uploadedBy: toUser(n.author),
        location: {
          label: `Note: ${n.title}`,
          detail: m.blockType === 'cover' ? 'Cover image · private note' : 'Private note',
          href: '/notes',
        },
        assignments: [],
        alsoIn: [],
      });
    });
  }
  return items;
}

// ---------------------------------------------------------------------------

const SOURCE_GROUPS: Record<string, MediaSource[]> = {
  drive: ['DRIVE'],
  chat: ['CHANNEL', 'THREAD', 'DM'],
  tasks: ['TASK', 'TASK_COMMENT'],
  docs: ['DOC'],
  notes: ['NOTE'],
};

export class CentralMediaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getCentralMedia(q: CentralMediaQuery) {
  const membership = await prisma.teamMember.findFirst({
    where: { teamId: q.teamId, userId: q.userId },
    include: { team: { select: { slug: true } } },
  });
  if (!membership) throw new CentralMediaError(403, 'Not a member of this team');

  const teamMembers = await prisma.teamMember.findMany({
    where: { teamId: q.teamId },
    select: { user: { select: userSelect } },
  });
  const usersById = new Map<string, MediaUser>();
  teamMembers.forEach((m) => m.user && usersById.set(m.user.id, toUser(m.user)!));

  const ctx: Ctx = {
    teamId: q.teamId,
    teamSlug: membership.team.slug,
    userId: q.userId,
    memberId: membership.id,
    teamUserIds: Array.from(usersById.keys()),
    usersById,
  };

  const group = (q.source || 'all').toLowerCase();

  // Always collect every source so the tab counts stay accurate;
  // the source filter is applied after counting.
  const settled = await Promise.allSettled([
    collectDrive(ctx),
    collectChannels(ctx),
    collectDirectMessages(ctx),
    collectTasks(ctx),
    collectDocs(ctx),
    collectNotes(ctx),
  ]);

  let all: MediaItem[] = [];
  settled.forEach((r) => {
    if (r.status === 'fulfilled') all = all.concat(r.value);
    else console.error('[central-media] source failed:', r.reason);
  });

  // counts per source group, before type/keyword/assignment filters
  const counts: Record<string, number> = { all: 0, drive: 0, chat: 0, tasks: 0, docs: 0, notes: 0 };

  if (q.type && q.type !== 'all') all = all.filter((i) => i.kind === q.type);
  if (q.keyword) {
    const k = q.keyword.toLowerCase();
    all = all.filter(
      (i) =>
        i.name.toLowerCase().includes(k) ||
        i.location.label.toLowerCase().includes(k) ||
        (i.uploadedBy?.name || '').toLowerCase().includes(k)
    );
  }
  if (q.assigned === 'to-me') {
    all = all.filter((i) => i.assignments.some((a) => a.assignee?.id === q.userId));
  } else if (q.assigned === 'by-me') {
    all = all.filter((i) => i.assignments.some((a) => a.assigner?.id === q.userId));
  } else if (q.assigned === 'any') {
    all = all.filter((i) => i.assignments.length > 0);
  }

  for (const i of all) {
    counts.all++;
    for (const [g, sources] of Object.entries(SOURCE_GROUPS)) {
      if (sources.includes(i.source)) counts[g]++;
    }
  }

  if (group !== 'all' && SOURCE_GROUPS[group]) {
    all = all.filter((i) => SOURCE_GROUPS[group].includes(i.source));
  }

  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const pageSize = Math.min(Math.max(q.pageSize || 60, 1), 200);
  const page = Math.max(q.page || 1, 1);
  const total = all.length;

  return {
    items: all.slice((page - 1) * pageSize, page * pageSize),
    counts,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    team: { id: q.teamId, slug: ctx.teamSlug },
  };
}
