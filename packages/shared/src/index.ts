import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.literal('connected'),
  version: z.string().min(1)
});

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().nullable()
  }),
  activeWardId: z.string().uuid().nullable(),
  roles: z.array(z.string())
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
