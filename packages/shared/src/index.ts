import { z } from 'zod';

export type HealthResponse = {
  status: 'ok';
};

export const healthResponseSchema = z.object({
  status: z.literal('ok')
});

export type RequestAccessInput = {
  fullName: string;
  email: string;
};

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().nullable()
  }),
  activeWardId: z.string().uuid().nullable(),
  roles: z.array(z.string())
});

export const zodValidatorsPlaceholder = {
  note: 'Replace with real zod validators in a later milestone.'
} as const;
