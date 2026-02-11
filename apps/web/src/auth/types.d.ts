import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    activeWardId: string | null;
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      roles: string[];
      mustChangePassword: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    roles?: string[];
    mustChangePassword?: boolean;
  }
}
