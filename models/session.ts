import { prisma } from '@/lib/prisma';
import { caches } from '@/lib/request-cache';

// Sessions are cached in-process (lib/request-cache.ts); deletions are rare, so drop the whole cache.

export const deleteManySessions = async ({ where }) => {
  const result = await prisma.session.deleteMany({
    where,
  });
  caches.sessions.clear();
  return result;
};

export const findFirstSessionOrThrown = async ({ where }) => {
  return await prisma.session.findFirstOrThrow({
    where,
  });
};

export const findManySessions = async ({ where }) => {
  return await prisma.session.findMany({
    where,
  });
};

export const deleteSession = async ({ where }) => {
  const result = await prisma.session.delete({
    where,
  });
  caches.sessions.clear();
  return result;
};
