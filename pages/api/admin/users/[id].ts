// GET   /api/admin/users/:id — profile, memberships, workspaces, recent activity
// PATCH /api/admin/users/:id { isPlatformAdmin?, suspended?, suspendedReason?, signOut? }
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import env from '@/lib/env';
import { ApiError } from '@/lib/errors';
import { adminHandler, audit } from '@/lib/platform/admin';
import { parse, q } from '@/lib/platform/http';
import { invalidateUser } from '@/lib/request-cache';

export default adminHandler({
  GET: async (req, res) => {
    const id = q(req.query.id);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        imageUrl: true,
        createdAt: true,
        emailVerified: true,
        isPlatformAdmin: true,
        suspendedAt: true,
        suspendedReason: true,
        _count: { select: { sessions: true } },
        teamMembers: {
          select: {
            role: true,
            createdAt: true,
            team: { select: { id: true, name: true, slug: true, workspace: { select: { id: true, name: true } } } },
          },
        },
        ownedWorkspaces: { select: { id: true, name: true, slug: true, status: true } },
        routeViewSessions: {
          orderBy: { startedAt: 'desc' },
          take: 25,
          select: { route: true, routeLabel: true, startedAt: true, duration: true, team: { select: { name: true } } },
        },
      },
    });
    if (!user) throw new ApiError(404, 'User not found');
    const auditLog = await prisma.platformAuditLog.findMany({
      where: { OR: [{ targetType: 'user', targetId: id }, { actorId: id }] },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { actor: { select: { name: true, email: true } } },
    });
    const { _count, imageUrl, ...rest } = user;
    res.status(200).json({
      data: {
        ...rest,
        image: imageUrl || rest.image,
        sessions: _count.sessions,
        envAdmin: env.platformAdminEmails.includes(user.email.toLowerCase()),
        auditLog,
      },
    });
  },

  PATCH: async (req, res, actor) => {
    const id = q(req.query.id);
    const body = parse(
      z.object({
        isPlatformAdmin: z.boolean().optional(),
        suspended: z.boolean().optional(),
        suspendedReason: z.string().trim().max(500).nullable().optional(),
        signOut: z.boolean().optional(),
      }),
      req.body
    );
    if (id === actor.id && (body.isPlatformAdmin === false || body.suspended === true)) {
      throw new ApiError(400, 'You cannot remove your own admin access or suspend yourself');
    }
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) throw new ApiError(404, 'User not found');

    if (body.isPlatformAdmin !== undefined) {
      await prisma.user.update({ where: { id }, data: { isPlatformAdmin: body.isPlatformAdmin } });
      await audit(actor.id, body.isPlatformAdmin ? 'user.admin_granted' : 'user.admin_revoked', { type: 'user', id }, { email: user.email });
    }
    if (body.suspended !== undefined) {
      await prisma.user.update({
        where: { id },
        data: body.suspended
          ? { suspendedAt: new Date(), suspendedReason: body.suspendedReason ?? null }
          : { suspendedAt: null, suspendedReason: null },
      });
      if (body.suspended) await prisma.session.deleteMany({ where: { userId: id } });
      await audit(actor.id, body.suspended ? 'user.suspended' : 'user.reactivated', { type: 'user', id }, {
        email: user.email,
        reason: body.suspendedReason ?? null,
      });
    }
    if (body.signOut) {
      const { count } = await prisma.session.deleteMany({ where: { userId: id } });
      await audit(actor.id, 'user.signed_out', { type: 'user', id }, { sessions: count });
    }
    // Sessions are cached in-process; drop them so suspension / sign-out / admin changes apply now.
    invalidateUser(id);
    res.status(200).json({ data: { ok: true } });
  },
});
