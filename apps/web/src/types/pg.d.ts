declare module 'pg' {
  export type QueryResultRow = Record<string, unknown>;
  export type PoolClient = {
    query: (...args: any[]) => Promise<{ rows: any[]; rowCount: number | null }>;
    release: () => void;
  };

  export class Pool {
    constructor(config?: any);
    connect: () => Promise<PoolClient>;
    query: (...args: any[]) => Promise<{ rows: any[]; rowCount: number | null }>;
    end: () => Promise<void>;
  }
}
