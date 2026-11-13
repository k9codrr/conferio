import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ActivityTarget = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
};

export type StampTargets = {
  companyIds: string[];
  contactIds: string[];
  dealIds: string[];
};

function present(ids: (string | null)[]): string[] {
  return ids.filter((id): id is string => id !== null);
}

// Moves lastActivityAt forward on every record an activity is filed against.
export async function touch(target: ActivityTarget, at: Date): Promise<void> {
  const stale = { OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }] };

  await Promise.all([
    target.companyId
      ? prisma.crmCompany.updateMany({ where: { id: target.companyId, ...stale }, data: { lastActivityAt: at } })
      : null,
    target.contactId
      ? prisma.crmContact.updateMany({ where: { id: target.contactId, ...stale }, data: { lastActivityAt: at } })
      : null,
    target.dealId
      ? prisma.crmDeal.updateMany({ where: { id: target.dealId, ...stale }, data: { lastActivityAt: at } })
      : null,
  ]);
}

export async function targetsOf(
  where: Prisma.CrmActivityWhereInput,
  client: Prisma.TransactionClient = prisma
): Promise<StampTargets> {
  const [companies, contacts, deals] = await Promise.all([
    client.crmActivity.groupBy({ by: ['companyId'], where }),
    client.crmActivity.groupBy({ by: ['contactId'], where }),
    client.crmActivity.groupBy({ by: ['dealId'], where }),
  ]);

  return {
    companyIds: present(companies.map((row) => row.companyId)),
    contactIds: present(contacts.map((row) => row.contactId)),
    dealIds: present(deals.map((row) => row.dealId)),
  };
}

// After a delete removes activities, pull each surviving record's stamp back to its newest remaining activity.
export async function recomputeAfterDelete(targets: StampTargets): Promise<void> {
  try {
    await Promise.all([
      ...targets.companyIds.map(async (id) => {
        const { _max } = await prisma.crmActivity.aggregate({ where: { companyId: id }, _max: { createdAt: true } });
        await prisma.crmCompany.updateMany({ where: { id }, data: { lastActivityAt: _max.createdAt } });
      }),
      ...targets.contactIds.map(async (id) => {
        const { _max } = await prisma.crmActivity.aggregate({ where: { contactId: id }, _max: { createdAt: true } });
        await prisma.crmContact.updateMany({ where: { id }, data: { lastActivityAt: _max.createdAt } });
      }),
      ...targets.dealIds.map(async (id) => {
        const { _max } = await prisma.crmActivity.aggregate({ where: { dealId: id }, _max: { createdAt: true } });
        await prisma.crmDeal.updateMany({ where: { id }, data: { lastActivityAt: _max.createdAt } });
      }),
    ]);
  } catch (error) {
    console.error('[crm] activity stamps were not recomputed after a delete', error);
  }
}
