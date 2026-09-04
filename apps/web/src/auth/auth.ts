import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';

import { chooseActiveWardId, type WardAccessAssignment } from '@/src/auth/support-access';
import { verifyPassword } from '@/src/auth/password';
import { ensureSupportAdminBootstrap } from '@/src/db/bootstrap-support-admin';
import { pool } from '@/src/db/client';
import { enforceRateLimit } from '@/src/lib/rate-limit';

type SessionUserDetails = {
  id: string;
  email: string;
  displayName: string | null;
  mustChangePassword: boolean;
  hasPassword: boolean;
  roles: string[];
  activeWardId: string | null;
};

type WardAssignmentRow = {
  ward_id: string;
  is_support_assignment: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

async function loadSessionUserByEmail(email: string): Promise<SessionUserDetails | null> {
  const userResult = await pool.query(
    'SELECT id, email, display_name, must_change_password, is_active, password_hash IS NOT NULL AS has_password FROM user_account WHERE email = $1 LIMIT 1',
    [email]
  );

  if (!userResult.rowCount) return null;

  const user = userResult.rows[0];
  if (!user.is_active) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', user.id]);

    const roleResult = await client.query(
      `SELECT r.name
         FROM role r
         INNER JOIN user_global_role ugr ON ugr.role_id = r.id
        WHERE ugr.user_id = $1
        UNION
       SELECT r.name
         FROM role r
         INNER JOIN ward_user_role wur ON wur.role_id = r.id
        WHERE wur.user_id = $1
          AND wur.revoked_at IS NULL
          AND (wur.expires_at IS NULL OR wur.expires_at > now())`,
      [user.id]
    );

    const wardResult = await client.query(
      `SELECT ward_id,
              is_support_assignment,
              expires_at,
              revoked_at,
              created_at
         FROM ward_user_role
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at ASC`,
      [user.id]
    );

    await client.query('COMMIT');

    const assignments: WardAccessAssignment[] = (wardResult.rows as WardAssignmentRow[]).map((row) => ({
      wardId: row.ward_id,
      isSupportAssignment: Boolean(row.is_support_assignment),
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at
    }));

    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      mustChangePassword: user.must_change_password,
      hasPassword: user.has_password,
      roles: roleResult.rows.map((row) => row.name as string),
      activeWardId: chooseActiveWardId({
        isSupportAdmin: roleResult.rows.some((row) => (row.name as string) === 'SUPPORT_ADMIN'),
        assignments
      })
    };
  } finally {
    client.release();
  }
}

async function loadSessionUserById(id: string): Promise<SessionUserDetails | null> {
  try {
    const userResult = await pool.query('SELECT email FROM user_account WHERE id = $1 LIMIT 1', [id]);
    if (!userResult.rowCount) return null;

    return loadSessionUserByEmail(userResult.rows[0].email as string);
  } catch {
    return null;
  }
}

async function ensureUserAccountForGoogleLogin(email: string, displayName: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO user_account (email, display_name)
     VALUES ($1, $2)
     ON CONFLICT (email)
     DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, user_account.display_name)`,
    [email, displayName]
  );
}

export const { auth, handlers } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login'
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? '',
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? ''
    }),
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      authorize: async (credentials, request) => {
        await ensureSupportAdminBootstrap();

        const email = String(credentials.email ?? '')
          .trim()
          .toLowerCase();
        const password = String(credentials.password ?? '');

        if (!email || !password) {
          return null;
        }

        const ip = request?.headers?.get('x-forwarded-for') ?? 'unknown-ip';
        if (!enforceRateLimit(`auth:credentials:${email}:${ip}`, 10)) {
          return null;
        }

        const result = await pool.query(
          'SELECT id, email, display_name, password_hash FROM user_account WHERE email = $1 AND is_active = true',
          [email]
        );

        if (!result.rowCount) return null;

        const user = result.rows[0];
        if (!user.password_hash) return null;

        const valid = await verifyPassword(user.password_hash, password);
        if (!valid) return null;

        const sessionUser = await loadSessionUserByEmail(email);
        if (!sessionUser) return null;

        return {
          id: sessionUser.id,
          email: sessionUser.email,
          name: sessionUser.displayName,
          roles: sessionUser.roles,
          mustChangePassword: sessionUser.mustChangePassword,
          hasPassword: sessionUser.hasPassword,
          activeWardId: sessionUser.activeWardId
        };
      }
    })
  ],
  callbacks: {
    signIn: async ({ account, profile, user: _user }) => {
      await ensureSupportAdminBootstrap();

      if (account?.provider === 'google') {
        const email = profile?.email;
        if (!email) return false;

        const displayName = typeof profile.name === 'string' ? profile.name : null;
        await ensureUserAccountForGoogleLogin(email.toLowerCase(), displayName);
      }

      return true;
    },
    jwt: async ({ token, user, account, trigger }) => {
      if (user) {
        if (account?.provider !== 'credentials') {
          const email = (user.email ?? '').toLowerCase().trim();
          if (email) {
            const sessionUser = await loadSessionUserByEmail(email);
            if (sessionUser) {
              token.sub = sessionUser.id;
              token.roles = sessionUser.roles;
              token.mustChangePassword = sessionUser.mustChangePassword;
              token.hasPassword = sessionUser.hasPassword;
              token.activeWardId = sessionUser.activeWardId;
              return token;
            }
          }
        }

        token.sub = user.id;
        token.roles = user.roles;
        token.mustChangePassword = user.mustChangePassword;
        token.hasPassword = user.hasPassword;
        token.activeWardId = user.activeWardId;
        return token;
      }

      if (trigger === 'update' && token.sub) {
        const sessionUser = await loadSessionUserById(token.sub);
        if (sessionUser) {
          token.roles = sessionUser.roles;
          token.mustChangePassword = sessionUser.mustChangePassword;
          token.hasPassword = sessionUser.hasPassword;
          token.activeWardId = sessionUser.activeWardId;
        }
      }

      // Token already has roles baked in — no DB re-query on every request.
      // Explicit client session updates refresh access after role changes.
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.roles = (token.roles as string[] | undefined) ?? [];
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.hasPassword = Boolean(token.hasPassword);
        session.activeWardId = (token.activeWardId as string | undefined) ?? null;
      }

      return session;
    }
  }
});
