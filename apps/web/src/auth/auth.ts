import argon2 from 'argon2';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { pool } from '@/src/db/client';
import { ensureSupportAdminBootstrap } from '@/src/db/bootstrap-support-admin';

export const { auth, handlers } = NextAuth({
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      authorize: async (credentials) => {
        await ensureSupportAdminBootstrap();

        const email = credentials.email as string;
        const password = credentials.password as string;
        if (!email || !password) {
          return null;
        }

        const result = await pool.query(
          'SELECT id, email, display_name, password_hash, must_change_password FROM user_account WHERE email = $1 AND is_active = true',
          [email]
        );
        if (!result.rowCount) return null;

        const user = result.rows[0];
        if (!user.password_hash) return null;

        const valid = await argon2.verify(user.password_hash, password);
        if (!valid) return null;

        const roleResult = await pool.query(
          `SELECT r.name
           FROM role r
           INNER JOIN user_global_role ugr ON ugr.role_id = r.id
           WHERE ugr.user_id = $1
           UNION
           SELECT r.name
           FROM role r
           INNER JOIN ward_user_role wur ON wur.role_id = r.id
           WHERE wur.user_id = $1`,
          [user.id]
        );

        return {
          id: user.id,
          email: user.email,
          name: user.display_name,
          mustChangePassword: user.must_change_password,
          roles: roleResult.rows.map((row) => row.name as string)
        };
      }
    })
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.roles = user.roles;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.roles = (token.roles as string[] | undefined) ?? [];
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.activeWardId = null;
      }
      return session;
    }
  }
});
