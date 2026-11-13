import { prisma } from '@/lib/prisma';
import type { CrmContext } from './http';
import { normalizeCurrency } from './values';

export type CurrencySettings = {
  reportingCurrency: string;
  exchangeRates: Record<string, number>;
};

function readRates(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const rates: Record<string, number> = {};
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) rates[key.toUpperCase()] = value;
  }
  return rates;
}

// Until someone picks a reporting currency, report in whatever currency most of the team's deals use.
async function inferredCurrency(teamId: string): Promise<string> {
  const groups = await prisma.crmDeal.groupBy({
    by: ['currency'],
    where: { teamId },
    _count: { _all: true },
  });
  const top = groups.sort((a, b) => b._count._all - a._count._all)[0];
  return top?.currency ?? 'USD';
}

export async function currencySettings(teamId: string): Promise<CurrencySettings & { inferred: boolean }> {
  const settings = await prisma.crmSettings.findUnique({ where: { teamId } });
  if (!settings) {
    return { reportingCurrency: await inferredCurrency(teamId), exchangeRates: {}, inferred: true };
  }
  return {
    reportingCurrency: settings.reportingCurrency,
    exchangeRates: readRates(settings.exchangeRates),
    inferred: false,
  };
}

export async function updateCurrencySettings(
  ctx: CrmContext,
  input: { reportingCurrency?: string; exchangeRates?: Record<string, number> }
): Promise<CurrencySettings> {
  const data: { reportingCurrency?: string; exchangeRates?: Record<string, number> } = {};
  if (input.reportingCurrency !== undefined) data.reportingCurrency = normalizeCurrency(input.reportingCurrency);
  if (input.exchangeRates !== undefined) {
    const rates: Record<string, number> = {};
    for (const key of Object.keys(input.exchangeRates)) {
      rates[normalizeCurrency(key)] = input.exchangeRates[key];
    }
    data.exchangeRates = rates;
  }

  const saved = await prisma.crmSettings.upsert({
    where: { teamId: ctx.teamId },
    create: { teamId: ctx.teamId, ...data },
    update: data,
  });

  return { reportingCurrency: saved.reportingCurrency, exchangeRates: readRates(saved.exchangeRates) };
}

// A converter that never guesses: amounts in a currency with no rate come back null and get counted as unconverted.
export function converter(settings: CurrencySettings) {
  const base = settings.reportingCurrency;
  return (cents: number | null, currency: string): number | null => {
    if (cents === null) return null;
    const code = normalizeCurrency(currency, base);
    if (code === base) return cents;
    const rate = settings.exchangeRates[code];
    return rate ? Math.round(cents * rate) : null;
  };
}
