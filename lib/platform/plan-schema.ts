import { z } from 'zod';
import { MODULE_KEYS } from '@/lib/platform/modules';

export const planSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes only'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
  priceMonthly: z.number().int().min(0), // paise
  priceYearly: z.number().int().min(0),
  maxTeams: z.number().int().min(-1),
  maxMembers: z.number().int().min(-1),
  maxStorageGb: z.number().int().min(-1),
  modules: z.array(z.enum(MODULE_KEYS)).default([]),
  features: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const planPatchSchema = planSchema.partial();
