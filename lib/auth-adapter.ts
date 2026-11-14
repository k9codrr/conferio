// Prisma auth adapter whose per-request session lookup is served from a short in-process
// cache (lib/request-cache.ts). Shared by both next-auth configs (lib/nextAuth.ts and
// lib/auth.ts) so every getServerSession call benefits.
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { caches } from '@/lib/request-cache';

const baseAdapter = PrismaAdapter(prisma);

type SessionAndUser = Awaited<ReturnType<NonNullable<typeof baseAdapter.getSessionAndUser>>>;

export const cachedPrismaAdapter: typeof baseAdapter = {
  ...baseAdapter,
  async getSessionAndUser(sessionToken) {
    return (await caches.sessions.getOrLoad(sessionToken, async () =>
      baseAdapter.getSessionAndUser!(sessionToken)
    )) as SessionAndUser;
  },
  async updateSession(session) {
    caches.sessions.delete(session.sessionToken);
    return baseAdapter.updateSession!(session);
  },
  async deleteSession(sessionToken) {
    caches.sessions.delete(sessionToken);
    await baseAdapter.deleteSession!(sessionToken);
  },
};
