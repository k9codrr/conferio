import { createNotification } from '@/lib/notifications/notification.service';
import type { RecordKind } from './constants';
import type { CrmContext } from './http';

const KIND_LABEL: Record<RecordKind, string> = {
  company: 'client',
  contact: 'contact',
  deal: 'deal',
};

const KIND_PAGE: Record<RecordKind, string> = {
  company: 'companies',
  contact: 'contacts',
  deal: 'deals',
};

export function recordHref(kind: RecordKind, id: string, teamSlug: string): string {
  return `/crm/${KIND_PAGE[kind]}?team=${encodeURIComponent(teamSlug)}&open=${kind}:${id}`;
}

// Notifications are a courtesy: a failure here must never fail the CRM write that triggered it.
async function safely(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    console.error('[crm] notification failed', error);
  }
}

export async function notifyOwnerAssigned(
  ctx: CrmContext,
  input: { ownerId: string | null | undefined; kind: RecordKind; id: string; name: string }
) {
  const { ownerId } = input;
  if (!ownerId || ownerId === ctx.userId) return;

  const label = KIND_LABEL[input.kind];
  const href = recordHref(input.kind, input.id, ctx.teamSlug);

  await safely(() =>
    createNotification({
      userId: ownerId,
      type: 'CRM_RECORD_ASSIGNED',
      title: `You now own a ${label}`,
      body: `${ctx.userName} made you the owner of ${input.name} in ${ctx.teamName}'s CRM`,
      data: { kind: input.kind, recordId: input.id, teamSlug: ctx.teamSlug },
      channels: ['in_app'],
      actions: [{ label: `Open ${label}`, action: 'navigate', endpoint: href, variant: 'primary' }],
    })
  );
}

export async function notifyClientAssigned(
  ctx: CrmContext,
  input: { userId: string; companyId: string; companyName: string; role?: string | null }
) {
  if (input.userId === ctx.userId) return;
  const href = recordHref('company', input.companyId, ctx.teamSlug);
  const role = input.role ? ` as ${input.role}` : '';

  await safely(() =>
    createNotification({
      userId: input.userId,
      type: 'CRM_CLIENT_ASSIGNED',
      title: 'You have been assigned to a client',
      body: `${ctx.userName} assigned you to ${input.companyName}${role}`,
      data: { kind: 'company', recordId: input.companyId, teamSlug: ctx.teamSlug },
      channels: ['in_app'],
      actions: [{ label: 'Open client', action: 'navigate', endpoint: href, variant: 'primary' }],
    })
  );
}

export async function notifyTaskAssigned(
  ctx: CrmContext,
  input: {
    assigneeId: string | null | undefined;
    subject: string;
    dueAt: Date | null;
    about: { kind: RecordKind; id: string; name: string } | null;
  }
) {
  const { assigneeId } = input;
  if (!assigneeId || assigneeId === ctx.userId) return;

  const due = input.dueAt ? `, due ${input.dueAt.toDateString()}` : '';
  const about = input.about ? ` on ${input.about.name}` : '';
  const href = input.about ? recordHref(input.about.kind, input.about.id, ctx.teamSlug) : '/crm';

  await safely(() =>
    createNotification({
      userId: assigneeId,
      type: 'CRM_TASK_ASSIGNED',
      title: 'New CRM task for you',
      body: `${ctx.userName} gave you "${input.subject}"${about}${due}`,
      data: { teamSlug: ctx.teamSlug },
      channels: ['in_app'],
      actions: [{ label: 'View task', action: 'navigate', endpoint: href, variant: 'primary' }],
    })
  );
}
