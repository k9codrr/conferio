import React from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { CheckCircle2, Copy, XCircle } from 'lucide-react';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { ago, Badge, Card, CardHeader, Empty, Spinner } from '@/components/platform/ui';

const EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.paused',
  'subscription.resumed',
  'payment.failed',
];

function Row({ ok, label, children }: { ok: boolean; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" /> : <XCircle className="mt-0.5 size-4 text-red-500" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {children ? <div className="mt-0.5 text-xs text-gray-500">{children}</div> : null}
      </div>
    </div>
  );
}

const SettingsPage: NextPageWithLayout = () => {
  const { data, error } = useSWR('/api/admin/settings', fetcher);
  const s = data?.data;

  return (
    <>
      <PageHeader title="Settings" description="Payment gateway and platform configuration." />
      {error ? (
        <Empty title="Couldn't load settings">{error.message}</Empty>
      ) : !s ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 p-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Razorpay"
              description="Workspace plan subscriptions"
              actions={s.razorpay.mode ? <Badge tone={s.razorpay.mode === 'live' ? 'green' : 'amber'}>{s.razorpay.mode} mode</Badge> : null}
            />
            <div className="divide-y dark:divide-[#1e1e1e]">
              <Row ok={s.razorpay.configured} label="API keys">
                {s.razorpay.configured ? (
                  <>Key ID {s.razorpay.keyId}</>
                ) : (
                  <>
                    Set <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in <code>.env</code> and restart the server.
                  </>
                )}
              </Row>
              <Row ok={s.razorpay.webhookSecretSet} label="Webhook secret">
                {s.razorpay.webhookSecretSet ? 'Set' : <>Set <code>RAZORPAY_WEBHOOK_SECRET</code> to the secret you enter in the Razorpay webhook form.</>}
              </Row>
              <Row ok={s.razorpay.webhookEvents > 0} label="Webhook deliveries">
                {s.razorpay.webhookEvents > 0
                  ? `${s.razorpay.webhookEvents} received · last ${s.razorpay.lastWebhookEvent} ${ago(s.razorpay.lastWebhookAt)}`
                  : 'None received yet'}
              </Row>
            </div>
            <div className="space-y-2 border-t px-5 py-4 text-xs dark:border-[#222]">
              <p className="font-medium text-gray-600 dark:text-neutral-400">Webhook URL (Razorpay Dashboard → Settings → Webhooks)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-gray-100 px-2 py-1.5 dark:bg-neutral-800">{s.razorpay.webhookUrl}</code>
                <button
                  type="button"
                  aria-label="Copy webhook URL"
                  onClick={() => {
                    void navigator.clipboard.writeText(s.razorpay.webhookUrl);
                    toast.success('Copied');
                  }}
                  className="rounded-md border p-1.5 hover:bg-gray-50 dark:border-[#2a2a2a] dark:hover:bg-[#1a1a1a]"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
              <p className="pt-1 font-medium text-gray-600 dark:text-neutral-400">Events to enable</p>
              <div className="flex flex-wrap gap-1">
                {EVENTS.map((e) => (
                  <Badge key={e}>{e}</Badge>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Access" />
            <div className="divide-y dark:divide-[#1e1e1e]">
              <Row ok label="Platform admins">
                {s.envAdminCount} bootstrap admin email{s.envAdminCount === 1 ? '' : 's'} in <code>PLATFORM_ADMIN_EMAILS</code>. Others are promoted from Users.
              </Row>
              <Row ok={s.stripeConfigured} label="Stripe (legacy team billing)">
                {s.stripeConfigured ? 'Configured — the per-team Stripe billing page still works alongside Razorpay.' : 'Not configured.'}
              </Row>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

SettingsPage.getLayout = adminLayout;
export default SettingsPage;
