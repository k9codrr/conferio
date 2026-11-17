// GET /api/nav/preview?key=scrumboard — live data shown when hovering a sidebar item
// (ClickUp-style). Small, fast payloads: { title, items: [{ id, label, sub?, href, badge? }], cta? }
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loadWidgets } from '@/lib/dashboard/widgets';
import { MODULE_COOKIE } from '@/lib/platform/modules';

interface Item { id: string; label: string; sub?: string; href?: string; badge?: string; color?: string }
interface Preview { title: string; items: Item[]; empty?: string; cta?: { label: string; href: string } }

const ago = (d: Date) => {
  const s = Math.round((Date.now() - +d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const fmtWhen = (d: Date) =>
  d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const key = String(req.query.key || '');
  const slugParam = (req.query.teamSlug as string) || req.cookies[MODULE_COOKIE] || null;
  const teamSlug = slugParam ? decodeURIComponent(slugParam) : null;
  const member =
    (teamSlug ? await prisma.teamMember.findFirst({ where: { userId, team: { slug: teamSlug } }, select: { id: true, teamId: true, role: true, team: { select: { slug: true } } } }) : null) ??
    (await prisma.teamMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { id: true, teamId: true, role: true, team: { select: { slug: true } } } }));
  const slug = member?.team.slug;

  const widget = async (t: any) => (await loadWidgets(userId, [t], slug)).data[t] as any;
  let p: Preview;

  switch (key) {
    case 'scrumboard': {
      const boards = await prisma.board.findMany({
        where: { isArchived: false, OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
        orderBy: { updatedAt: 'desc' }, take: 8,
        select: { id: true, title: true, updatedAt: true, _count: { select: { columns: true } } },
      });
      const mine = await prisma.taskAssignee.count({ where: { userId, task: { status: { not: 'DONE' }, isArchived: false } } });
      p = {
        title: `Boards · ${mine} open task${mine === 1 ? '' : 's'} assigned to you`,
        items: boards.map((b) => ({ id: b.id, label: b.title, sub: `updated ${ago(b.updatedAt)}`, href: `/board/${b.id}` })),
        empty: 'No boards yet', cta: { label: 'All boards', href: '/scrumboard' },
      };
      break;
    }
    case 'docs': {
      const d = await widget('docs');
      p = { title: 'Recent docs', items: (d ?? []).slice(0, 8).map((x: any) => ({ id: x.id, label: `${x.emoji ?? '📄'} ${x.title}`, sub: ago(new Date(x.updatedAt)), href: x.href })), empty: 'No docs yet', cta: { label: 'Open docs', href: slug ? `/team/${slug}/docs` : '/docs' } };
      break;
    }
    case 'notes': {
      const d = await widget('notes');
      p = { title: 'Notes', items: (d ?? []).slice(0, 8).map((x: any) => ({ id: x.id, label: `${x.emoji ?? (x.isPinned ? '📌' : '📝')} ${x.title}`, sub: ago(new Date(x.updatedAt)), href: x.href })), empty: 'No notes yet', cta: { label: 'All notes', href: '/notes' } };
      break;
    }
    case 'meetings':
    case 'scheduled':
    case 'calendar': {
      const d = await widget('agenda');
      const items = (d ?? [])
        .filter((x: any) => key === 'calendar' || ['meeting', 'video', 'notetaker'].includes(x.source))
        .slice(0, 8)
        .map((x: any) => ({ id: x.id, label: x.title, sub: x.allDay ? new Date(x.start).toDateString() : fmtWhen(new Date(x.start)), href: x.href ?? '/calendar/page' }));
      p = { title: key === 'calendar' ? 'Next 7 days' : 'Upcoming meetings', items, empty: 'Nothing scheduled', cta: { label: key === 'calendar' ? 'Open calendar' : 'All meetings', href: key === 'calendar' ? '/calendar/page' : '/scheduled/page' } };
      break;
    }
    case 'chat': {
      if (!member) { p = { title: 'Channels', items: [], empty: 'Join a team to chat' }; break; }
      let channels = await prisma.channel.findMany({
        where: { teamId: member.teamId, members: { some: { teamMemberId: member.id } } },
        orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, name: true, updatedAt: true },
      });
      if (!channels.length) {
        channels = await prisma.channel.findMany({ where: { teamId: member.teamId }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, name: true, updatedAt: true } });
      }
      p = { title: 'Channels', items: channels.map((c) => ({ id: c.id, label: `# ${c.name}`, sub: ago(c.updatedAt), href: `/team/${slug}/channels/${c.id}` })), empty: 'No channels yet', cta: { label: 'Open chat', href: `/team/${slug}/chat` } };
      break;
    }
    case 'crm': {
      if (!member || member.role === 'CLIENT') { p = { title: 'CRM', items: [], empty: 'Not available' }; break; }
      const deals = await prisma.crmDeal.findMany({
        where: { teamId: member.teamId }, orderBy: { updatedAt: 'desc' }, take: 8,
        select: { id: true, name: true, stage: true, amount: true, currency: true },
      });
      p = { title: 'Recent deals', items: deals.map((d) => ({ id: d.id, label: d.name, sub: d.stage.replace(/_/g, ' ').toLowerCase(), badge: d.amount ? `${d.currency} ${Number(d.amount).toLocaleString()}` : undefined, href: '/crm/deals' })), empty: 'No deals yet', cta: { label: 'Open CRM', href: '/crm' } };
      break;
    }
    case 'drive': {
      const d = await widget('files');
      p = { title: 'Recent files', items: (d ?? []).slice(0, 8).map((f: any) => ({ id: f.id, label: f.originalName, sub: ago(new Date(f.createdAt)), href: '/drive/all' })), empty: 'No files yet', cta: { label: 'Open drive', href: '/drive/page' } };
      break;
    }
    case 'clips': {
      const [clips, ai] = await Promise.all([widget('clips'), widget('notetaker')]);
      p = {
        title: 'Clips & notetaker',
        items: [
          ...(clips ?? []).slice(0, 4).map((c: any) => ({ id: c.id, label: `🎞 ${c.title}`, sub: ago(new Date(c.createdAt)), href: '/clips' })),
          ...(ai ?? []).slice(0, 4).map((m: any) => ({ id: m.id, label: `🎙 ${m.meetingName || m.platform || 'Meeting'}`, sub: m.status, href: `/meetings/${m.id}` })),
        ],
        empty: 'No recordings yet', cta: { label: 'Open clips', href: '/clips' },
      };
      break;
    }
    case 'whiteboard': {
      if (!member) { p = { title: 'Whiteboards', items: [] }; break; }
      const rooms = await prisma.room.findMany({ where: { teamId: member.teamId, isArchived: false }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, name: true, slug: true, updatedAt: true } });
      p = { title: 'Whiteboards', items: rooms.map((r) => ({ id: r.id, label: r.name, sub: ago(r.updatedAt), href: `/team/${slug}/whiteboard/${r.slug}` })), empty: 'No whiteboards yet', cta: { label: 'All whiteboards', href: `/team/${slug}/whiteboard` } };
      break;
    }
    case 'timesheet': {
      const t = await widget('time');
      const running = await prisma.timeEntry.findFirst({ where: { userId, isRunning: true }, select: { startTime: true, task: { select: { title: true } }, description: true } });
      p = {
        title: `Tracked ${t?.total ?? 0}h in the last 7 days`,
        items: [
          ...(running ? [{ id: 'running', label: `⏱ Running: ${running.task?.title || running.description || 'timer'}`, sub: `since ${running.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, href: '/time-tracking', color: '#22c55e' }] : []),
          ...(t?.days ?? []).slice().reverse().map((d: any) => ({ id: d.day, label: new Date(d.day).toDateString(), badge: `${d.hours}h` })),
        ],
        cta: { label: 'Open timesheet', href: '/time-tracking' },
      };
      break;
    }
    case 'workload': {
      const w = await widget('workload');
      p = { title: 'Open tasks per member', items: (w ?? []).slice(0, 8).map((m: any) => ({ id: m.userId, label: m.name ?? 'Member', badge: String(m.open) })), cta: { label: 'Open workload', href: slug ? `/teams/${slug}/workload` : '/workload' } };
      break;
    }
    case 'events': {
      const ev = await prisma.event.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, title: true, duration: true, _count: { select: { meetings: true } } } });
      p = { title: 'Your event types', items: ev.map((e) => ({ id: e.id, label: e.title, sub: `${e.duration} min`, badge: `${e._count.meetings} booked`, href: '/events/page' })), empty: 'No event types yet', cta: { label: 'Manage events', href: '/events/page' } };
      break;
    }
    case 'members': {
      if (!member) { p = { title: 'Members', items: [] }; break; }
      const ms = await prisma.teamMember.findMany({ where: { teamId: member.teamId }, take: 10, select: { role: true, user: { select: { id: true, name: true, email: true } } } });
      p = { title: 'Team members', items: ms.map((m) => ({ id: m.user.id, label: m.user.name || m.user.email, sub: m.role.toLowerCase() })), cta: { label: 'All members', href: `/members/${slug}` } };
      break;
    }
    case 'dashboard': {
      const s = await widget('stats');
      p = {
        title: 'At a glance',
        items: s ? [
          { id: 'open', label: 'Open tasks', badge: String(s.openTasks), href: '/scrumboard' },
          { id: 'overdue', label: 'Overdue', badge: String(s.overdue), color: s.overdue ? '#ef4444' : undefined, href: '/scrumboard' },
          { id: 'meet', label: 'Meetings today', badge: String(s.meetingsToday), href: '/calendar/page' },
          { id: 'rem', label: 'Reminders', badge: String(s.reminders), href: '/calendar/page' },
          { id: 'unread', label: 'Unread notifications', badge: String(s.unread) },
        ] : [],
      };
      break;
    }
    default:
      return res.status(200).json({ preview: null });
  }

  res.setHeader('Cache-Control', 'private, max-age=15');
  res.status(200).json({ preview: p });
}
