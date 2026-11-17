import { PrismaClient } from '@prisma/client';
import { attachRealtimeHooks } from '../lib/realtime/prisma-hooks';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma || new PrismaClient({ transactionOptions: { maxWait: 5000, timeout: 20000 } });

// Idempotent: the client may be shared with lib/prisma.ts in dev.
attachRealtimeHooks(prisma);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
