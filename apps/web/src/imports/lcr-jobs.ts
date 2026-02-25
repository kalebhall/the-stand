import { randomUUID } from 'node:crypto';

export type LcrImportJobState = 'queued' | 'running' | 'succeeded' | 'failed';

export type LcrImportJobRecord<Result> = {
  id: string;
  wardId: string;
  userId: string;
  commit: boolean;
  state: LcrImportJobState;
  createdAt: number;
  updatedAt: number;
  result: Result | null;
  error: string | null;
};

const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map<string, LcrImportJobRecord<unknown>>();

function sweepExpiredJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

export function enqueueLcrImportJob<Result>(params: {
  wardId: string;
  userId: string;
  commit: boolean;
  runner: () => Promise<Result>;
}): LcrImportJobRecord<Result> {
  sweepExpiredJobs();

  const id = randomUUID();
  const initial: LcrImportJobRecord<Result> = {
    id,
    wardId: params.wardId,
    userId: params.userId,
    commit: params.commit,
    state: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: null,
    error: null
  };

  jobs.set(id, initial);

  void (async () => {
    const running = jobs.get(id) as LcrImportJobRecord<Result> | undefined;
    if (!running) {
      return;
    }

    running.state = 'running';
    running.updatedAt = Date.now();

    try {
      const result = await params.runner();
      const done = jobs.get(id) as LcrImportJobRecord<Result> | undefined;
      if (!done) return;
      done.state = 'succeeded';
      done.result = result;
      done.updatedAt = Date.now();
    } catch (error) {
      const failed = jobs.get(id) as LcrImportJobRecord<Result> | undefined;
      if (!failed) return;
      failed.state = 'failed';
      failed.error = error instanceof Error ? error.message : 'unknown error';
      failed.updatedAt = Date.now();
    }
  })();

  return initial;
}

export function getLcrImportJob<Result>(jobId: string): LcrImportJobRecord<Result> | null {
  sweepExpiredJobs();
  const job = jobs.get(jobId) as LcrImportJobRecord<Result> | undefined;
  return job ?? null;
}
