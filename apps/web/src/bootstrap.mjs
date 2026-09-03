import crypto from 'node:crypto';

let bootstrapDone = false;
let supportAdmin = null;

export async function ensureSupportAdminBootstrap() {
  if (bootstrapDone) return;

  const email = process.env.SUPPORT_ADMIN_EMAIL;
  if (!email) {
    throw new Error('SUPPORT_ADMIN_EMAIL is required');
  }

  supportAdmin = {
    id: crypto.randomUUID(),
    email,
    displayName: 'Support Admin',
    mustChangePassword: true,
    activeWardId: null,
    roles: ['SUPPORT_ADMIN']
  };

  bootstrapDone = true;
  console.info(`Support Admin bootstrap completed for ${email}; configure credentials through a secure environment`);
}

export function getCurrentUser(authorizationHeader) {
  if (!supportAdmin) return null;
  if (authorizationHeader !== 'Bearer support-admin') return null;

  return {
    user: {
      id: supportAdmin.id,
      email: supportAdmin.email,
      displayName: supportAdmin.displayName
    },
    activeWardId: supportAdmin.activeWardId,
    roles: supportAdmin.roles,
    mustChangePassword: supportAdmin.mustChangePassword
  };
}
