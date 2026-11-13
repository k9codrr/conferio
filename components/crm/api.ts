import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTeamSlug } from 'hooks/useTeamSlug';
import type { ActivityType, DealStage, FieldType, FieldValueJson, RecordKind } from '@/lib/crm/constants';

export class CrmApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(url: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CrmApiError(response.status, json?.error?.message ?? 'Something went wrong.');
  }
  return json?.data as T;
}

export function toQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function useCrmApi() {
  const slug = useTeamSlug();
  const base = slug ? `/api/teams/${encodeURIComponent(slug)}/crm` : null;

  const call = useCallback(
    <T,>(path: string, method: Method = 'GET', body?: unknown) => {
      if (!base) return Promise.reject(new CrmApiError(400, 'Pick a team first.'));
      return request<T>(`${base}${path}`, method, body);
    },
    [base]
  );

  return useMemo(() => ({ slug, ready: Boolean(base), call }), [slug, base, call]);
}

export function useCrmQuery<T>(key: unknown[], path: string | null, options: { poll?: number; keepPrevious?: boolean } = {}) {
  const { slug, ready, call } = useCrmApi();
  return useQuery<T, CrmApiError>({
    queryKey: ['crm', slug, ...key],
    queryFn: () => call<T>(path as string),
    enabled: ready && path !== null,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    refetchInterval: options.poll,
  });
}

// Every CRM write can change lists, sheets, the dashboard and timelines, so refresh the whole CRM cache.
export function useCrmMutation<TInput, TResult = unknown>(
  run: (call: ReturnType<typeof useCrmApi>['call'], input: TInput) => Promise<TResult>,
  options: { success?: string | ((result: TResult) => string); onSuccess?: (result: TResult) => void } = {}
) {
  const { slug, call } = useCrmApi();
  const client = useQueryClient();

  return useMutation<TResult, CrmApiError, TInput>({
    mutationFn: (input) => run(call, input),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['crm', slug] });
      const message = typeof options.success === 'function' ? options.success(result) : options.success;
      if (message) toast.success(message);
      options.onSuccess?.(result);
    },
    onError: (error) => {
      toast.error(error.message);
      void client.invalidateQueries({ queryKey: ['crm', slug] });
    },
  });
}

// Shapes returned by the API

export type Person = { id: string; name: string; email: string; image: string | null };
export type TeamMemberOption = Person & { role: string };

export type CrmMembers = {
  me: { id: string; role: string; canManage: boolean };
  team: { id: string; slug: string; name: string };
  members: TeamMemberOption[];
};

export type ColumnDef = { key: string; label: string; type: FieldType };

export type RecordField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  typeLabel: string;
  required: boolean;
  showOnSheet: boolean;
  showOnTable: boolean;
  position: number;
  archived: boolean;
  options: { id: string; label: string; position: number }[];
  value: FieldValueJson;
};

export type FieldDefinition = Omit<RecordField, 'value'> & { entity: 'COMPANY' | 'CONTACT' | 'DEAL' };

export type BulkResult = { requested: number; succeeded: number; failed: number; message: string | null };

export function bulkMessage(result: BulkResult): string {
  if (result.failed === 0) return `Done: ${result.succeeded} of ${result.requested}.`;
  return `${result.succeeded} of ${result.requested} done, ${result.failed} failed${result.message ? `: ${result.message}` : '.'}`;
}

export type ActivityEntry = {
  id: string;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  occurredAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
  createdBy: Person;
  assignee: Person | null;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string | null } | null;
  deal: { id: string; name: string } | null;
};

export type SearchHit = { kind: RecordKind; id: string; label: string; detail: string | null };

export type DealStageValue = DealStage;

export function useCrmMembers() {
  return useCrmQuery<CrmMembers>(['members'], '/members');
}
