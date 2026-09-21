import 'next-auth';
import 'next-auth/jwt';

type StakeSessionAssignment = { stakeId: string; roleNames: string[] };

declare module 'next-auth' {
  interface User {
    roles?: string[];
    mustChangePassword?: boolean;
    activeWardId?: string | null;
    activeStakeId?: string | null;
    stakeAssignments?: StakeSessionAssignment[];
    hasPassword?: boolean;
  }

  interface Session {
    activeWardId: string | null;
    activeStakeId: string | null;
    stakeAssignments: StakeSessionAssignment[];
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      roles: string[];
      mustChangePassword: boolean;
      hasPassword: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    roles?: string[];
    mustChangePassword?: boolean;
    activeWardId?: string | null;
    activeStakeId?: string | null;
    stakeAssignments?: StakeSessionAssignment[];
    hasPassword?: boolean;
    authzRefreshedAt?: number;
  }
}
