import { Prisma } from '@prisma/client';
import { badRequest } from './http';

export function toCents(amount: Prisma.Decimal | null | undefined): number | null {
  return amount === null || amount === undefined ? null : Math.round(amount.times(100).toNumber());
}

export function decimalFromCents(cents: number | null | undefined): Prisma.Decimal | null {
  return cents === null || cents === undefined ? null : new Prisma.Decimal(cents).dividedBy(100);
}

export function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  return blankToNull(value)?.toLowerCase() ?? null;
}

export function normalizeCurrency(value: string | null | undefined, fallback = 'USD'): string {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`"${value}" is not a date.`);
  return date;
}

export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function unique(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export function normalizeDomain(input: string | null | undefined): string | null {
  const trimmed = input?.trim().toLowerCase();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return null;
  }

  const bare = host.replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null;
}

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'hotmail.com',
  'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'mail.com', 'yandex.ru',
  'qq.com', '163.com', 'rediffmail.com',
]);

export function domainFromEmail(email: string | null | undefined): string | null {
  const at = email?.trim().toLowerCase().lastIndexOf('@') ?? -1;
  if (at < 1) return null;
  const domain = normalizeDomain(email?.slice(at + 1));
  if (!domain) return null;
  return FREE_EMAIL_DOMAINS.has(domain) ? null : domain;
}

export type BulkResult = {
  requested: number;
  succeeded: number;
  failed: number;
  message: string | null;
};

export async function runBulk(ids: string[], act: (id: string) => Promise<unknown>): Promise<BulkResult> {
  const list = unique(ids);
  let succeeded = 0;
  let message: string | null = null;

  for (const id of list) {
    try {
      await act(id);
      succeeded += 1;
    } catch (error) {
      message = message ?? (error instanceof Error ? error.message : 'Something went wrong.');
    }
  }

  return { requested: list.length, succeeded, failed: list.length - succeeded, message };
}

export function countsByKey<T extends { _count: { _all: number } }>(
  groups: T[],
  key: keyof T,
  nullKey?: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const group of groups) {
    const raw = group[key] as unknown as string | null | undefined;
    const value = raw ?? nullKey;
    if (value === null || value === undefined) continue;
    counts[value] = (counts[value] ?? 0) + group._count._all;
  }
  return counts;
}

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
