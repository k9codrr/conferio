import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, Role } from '@prisma/client';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export class CrmError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CrmError';
    this.status = status;
  }
}

export const badRequest = (message: string) => new CrmError(400, message);
export const notFound = (message: string) => new CrmError(404, message);
export const conflict = (message: string) => new CrmError(409, message);
export const forbidden = (message: string) => new CrmError(403, message);

// Clients are outside the sales team, so they never see the CRM.
const CRM_ROLES: Role[] = [Role.OWNER, Role.ADMIN, Role.MANAGER, Role.MEMBER, Role.INTERN];
const MANAGER_ROLES: Role[] = [Role.OWNER, Role.ADMIN, Role.MANAGER];

export type CrmContext = {
  teamId: string;
  teamSlug: string;
  teamName: string;
  userId: string;
  userName: string;
  role: Role;
  canManage: boolean;
};

export async function getCrmContext(req: NextApiRequest, res: NextApiResponse): Promise<CrmContext> {
  const session = await getSession(req, res);
  if (!session?.user?.id) throw new CrmError(401, 'Unauthorized');

  const slug = req.query.slug;
  if (typeof slug !== 'string' || !slug) throw badRequest('Missing team slug.');

  const member = await prisma.teamMember.findFirst({
    where: { userId: session.user.id, team: { slug } },
    select: {
      role: true,
      team: { select: { id: true, slug: true, name: true } },
      user: { select: { name: true } },
    },
  });

  if (!member) throw forbidden('You do not have access to this team.');
  if (CRM_ROLES.indexOf(member.role) === -1) {
    throw forbidden('Your role in this team does not include the CRM.');
  }

  return {
    teamId: member.team.id,
    teamSlug: member.team.slug,
    teamName: member.team.name,
    userId: session.user.id,
    userName: member.user.name,
    role: member.role,
    canManage: MANAGER_ROLES.indexOf(member.role) !== -1,
  };
}

export function requireManager(ctx: CrmContext) {
  if (!ctx.canManage) {
    throw forbidden('Only owners, admins and managers can change CRM settings.');
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Handler = (req: NextApiRequest, ctx: CrmContext, res: NextApiResponse) => Promise<unknown>;

export function crmRoute(handlers: Partial<Record<Method, Handler>>) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    const method = (req.method ?? 'GET').toUpperCase() as Method;
    const run = handlers[method];

    if (!run) {
      res.setHeader('Allow', Object.keys(handlers).join(', '));
      return res.status(405).json({ error: { message: `Method ${method} not allowed` } });
    }

    try {
      const ctx = await getCrmContext(req, res);
      const data = await run(req, ctx, res);
      if (res.headersSent) return;
      return res.status(method === 'POST' ? 201 : 200).json({ data });
    } catch (error) {
      const { status, message } = translateError(error);
      if (status >= 500) console.error('[crm]', req.method, req.url, error);
      return res.status(status).json({ error: { message } });
    }
  };
}

function translateError(error: unknown): { status: number; message: string } {
  if (error instanceof CrmError) return { status: error.status, message: error.message };

  if (error instanceof ZodError) {
    const first = error.issues[0];
    return { status: 400, message: first?.message ?? 'That request is not valid.' };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return { status: 409, message: 'That already exists.' };
    if (error.code === 'P2025') return { status: 404, message: 'That record no longer exists.' };
    if (error.code === 'P2003') {
      return { status: 400, message: 'Something it points at no longer exists.' };
    }
  }

  return { status: 500, message: 'Something went wrong.' };
}

export function queryString(req: NextApiRequest, key: string, fallback = ''): string {
  const value = req.query[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export function routeId(req: NextApiRequest, key = 'id'): string {
  const value = queryString(req, key);
  if (!value) throw badRequest(`Missing ${key}.`);
  return value;
}

export async function requireTeamUser(teamId: string, userId: string | null | undefined) {
  if (!userId) return;
  const member = await prisma.teamMember.findFirst({
    where: { teamId, userId, role: { in: CRM_ROLES } },
    select: { id: true },
  });
  if (!member) throw badRequest('That person is not a member of this team.');
}
