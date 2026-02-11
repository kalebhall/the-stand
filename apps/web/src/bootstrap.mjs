import crypto from 'node:crypto';

let bootstrapDone = false;
let supportAdmin = null;

export async function ensureSupportAdminBootstrap() {
  if (bootstrapDone) return;

  const email = process.env.SUPPORT_ADMIN_EMAIL;
  if (!email) {
    throw new Error('SUPPORT_ADMIN_EMAIL is required');
  }

  const password = crypto.randomBytes(24).toString('base64url');

  supportAdmin = {
    id: crypto.randomUUID(),
    email,
    displayName: 'Support Admin',
    mustChangePassword: true,
    activeWardId: null,
    roles: ['SUPPORT_ADMIN']
  };

  bootstrapDone = true;
  console.log(`Support Admin bootstrap password (shown once): ${password}`);
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
