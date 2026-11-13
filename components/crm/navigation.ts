import { useCallback } from 'react';
import { useRouter } from 'next/router';
import type { RecordKind } from '@/lib/crm/constants';

export type OpenRecord = { kind: RecordKind; id: string };

const KINDS: RecordKind[] = ['company', 'contact', 'deal'];

export function parseOpen(value: string | string[] | undefined): OpenRecord | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const [kind, id] = raw.split(':');
  if (!id || KINDS.indexOf(kind as RecordKind) === -1) return null;
  return { kind: kind as RecordKind, id };
}

// Records open in a sheet over whichever CRM page you are on; the URL keeps it shareable and back-button friendly.
export function useOpenRecord() {
  const router = useRouter();

  return useCallback(
    (record: OpenRecord | null) => {
      const query = { ...router.query };
      delete query.team;
      if (record) query.open = `${record.kind}:${record.id}`;
      else delete query.open;
      void router.push({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
    },
    [router]
  );
}

export function useCurrentRecord(): OpenRecord | null {
  const router = useRouter();
  return parseOpen(router.query.open);
}
