import type { GetServerSidePropsContext } from 'next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// Mail is client-only (Gmail data, shadow-DOM email rendering, keyboard shortcuts).
const ZeroMail = dynamic(() => import('@/components/mail/zero/ZeroMail'), { ssr: false });

interface MailPageProps {
  isAdmin: boolean;
}

// Standalone mail page — only team ADMINs / OWNERs can open it.
export default function MailPage({ isAdmin }: MailPageProps) {
  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#FAFAFA] px-6 dark:bg-[#080808]">
        <div className="w-full max-w-sm rounded-2xl border border-[#E7E7E7] bg-white p-8 text-center shadow-sm dark:border-[#27272A] dark:bg-[#101010]">
          <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl bg-[#FDE4E9] dark:bg-[#411D23]">
            <svg viewBox="0 0 24 24" className="size-5 stroke-[#F43F5E]" fill="none" strokeWidth="2">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-black dark:text-white">Mail is restricted</h1>
          <p className="mt-1 text-sm text-[#8C8C8C]">
            Only team admins can access Mail. Ask a team owner to change your role.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-8 items-center rounded-lg bg-[#006FFE] px-4 text-sm font-medium text-white transition-colors hover:bg-[#0056CC]"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <ZeroMail />;
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const session = await getSession(context.req, context.res);

  if (!session?.user?.id) {
    return { redirect: { destination: '/auth/login', permanent: false } };
  }

  // "Admin" = ADMIN or OWNER role in at least one team (owners have every admin permission).
  const adminMembership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id, role: { in: ['ADMIN', 'OWNER'] } },
    select: { id: true },
  });

  return { props: { isAdmin: !!adminMembership } };
}
