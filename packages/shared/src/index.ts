export type HealthResponse = {
  status: 'ok';
};

export type RequestAccessInput = {
  fullName: string;
  email: string;
};

export const zodValidatorsPlaceholder = {
  note: 'Replace with real zod validators in a later milestone.'
} as const;
