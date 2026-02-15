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

export const requestAccessInputSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(320)
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

export const MEETING_TYPES = ['SACRAMENT', 'FAST_TESTIMONY', 'WARD_CONFERENCE', 'STAKE_CONFERENCE', 'GENERAL_CONFERENCE'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const meetingTypeSchema = z.enum(MEETING_TYPES);

export const createMeetingSchema = z.object({
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meetingType: meetingTypeSchema,
  programItems: z.array(z.object({
    itemType: z.string().min(1),
    title: z.string().nullable(),
    notes: z.string().nullable(),
    hymnNumber: z.string().nullable(),
    hymnTitle: z.string().nullable(),
    sequence: z.number().int().min(0)
  })).optional()
});

export const ANNOUNCEMENT_PLACEMENTS = ['PROGRAM_TOP', 'PROGRAM_BOTTOM'] as const;
export type AnnouncementPlacement = (typeof ANNOUNCEMENT_PLACEMENTS)[number];

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().max(5000).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isPermanent: z.boolean().optional(),
  placement: z.enum(ANNOUNCEMENT_PLACEMENTS).optional()
});

export const CALLING_STATUSES = ['PROPOSED', 'EXTENDED', 'SUSTAINED', 'SET_APART'] as const;
export type CallingStatus = (typeof CALLING_STATUSES)[number];

export const callingStatusSchema = z.enum(CALLING_STATUSES);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(128)
});
