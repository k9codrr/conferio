import { PrismaClient } from '@prisma/client';
import { attachRealtimeHooks } from './realtime/prisma-hooks';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createClient() {
  const client = new PrismaClient({
    //log: ["error"],
  });
  // Opening a connection to the (remote) database takes a couple of seconds. Open a few in
  // the background at startup so the first page loads don't each pay for a new one.
  if (typeof window === 'undefined') {
    // Writes to dated models publish realtime `calendar:changed` events.
    attachRealtimeHooks(client);
    Promise.all(Array.from({ length: 4 }, () => client.$queryRaw`SELECT 1`)).catch(() => {});
  }
  return client;
}

export const prisma = global.prisma || createClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

