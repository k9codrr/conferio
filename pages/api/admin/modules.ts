// GET /api/admin/modules — module catalogue, platform switches, adoption and usage
// PUT /api/admin/modules { modules: { crm: false, … } } — platform-wide on/off
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminHandler, audit } from '@/lib/platform/admin';
import { getGlobalModules, setGlobalModules } from '@/lib/platform/workspace';
import { moduleAdoption, moduleUsage7d } from '@/lib/platform/admin-queries';
import { MODULE_KEYS, MODULES, type ModuleKey } from '@/lib/platform/modules';
import { parse } from '@/lib/platform/http';

export default adminHandler({
  GET: async (_req, res) => {
    const [global, adoption, usage, plans] = await Promise.all([
      getGlobalModules(),
      moduleAdoption(),
      moduleUsage7d(),
      prisma.platformPlan.findMany({ orderBy: { sortOrder: 'asc' }, select: { key: true, name: true, modules: true } }),
    ]);
    res.status(200).json({
      data: {
        modules: MODULES.map((m) => ({
          key: m.key,
          label: m.label,
          description: m.description,
          pages: m.pages,
          apis: m.apis,
          enabled: global[m.key] !== false,
          workspaces: adoption[m.key],
          views7d: usage[m.key],
          plans: plans.filter((p) => p.modules.includes(m.key)).map((p) => p.name),
        })),
      },
    });
  },

  PUT: async (req, res, actor) => {
    const { modules } = parse(z.object({ modules: z.record(z.enum(MODULE_KEYS), z.boolean()) }), req.body);
    const before = await getGlobalModules();
    const value = await setGlobalModules({ ...before, ...modules });
    const changed = Object.entries(modules).filter(([k, v]) => (before[k as ModuleKey] !== false) !== v);
    if (changed.length) {
      await audit(actor.id, 'modules.global_changed', { type: 'platform', id: 'modules' }, Object.fromEntries(changed));
    }
    res.status(200).json({ data: value });
  },
});
