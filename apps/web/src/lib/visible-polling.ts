export type VisiblePoll = () => void | Promise<unknown>;

/** Run a poll while visible, and coalesce a resume or reconnect poll behind in-flight work. */
export function startVisiblePolling(poll: VisiblePoll, intervalMs: number): () => void {
  let interval: number | null = null;
  let inFlight = false;
  let rerunRequested = false;
  let stopped = false;
  let wasVisible = document.visibilityState === 'visible';

  const finishPoll = () => {
    inFlight = false;
    if (stopped || !wasVisible || !rerunRequested) {
      rerunRequested = false;
      return;
    }
    rerunRequested = false;
    run();
  };

  const run = () => {
    if (stopped || !wasVisible) return;
    if (inFlight) {
      rerunRequested = true;
      return;
    }
    inFlight = true;
    try {
      const result = poll();
      if (result && typeof result.then === 'function') {
        void result.then(finishPoll, finishPoll);
      } else {
        finishPoll();
      }
    } catch {
      finishPoll();
    }
  };

  const clearPollingInterval = () => {
    if (interval === null) return;
    window.clearInterval(interval);
    interval = null;
  };

  const startPollingInterval = () => {
    if (stopped || !wasVisible || interval !== null) return;
    interval = window.setInterval(run, intervalMs);
  };

  const onVisibilityChange = () => {
    const isVisible = document.visibilityState === 'visible';
    if (isVisible === wasVisible) return;
    wasVisible = isVisible;
    if (!isVisible) {
      rerunRequested = false;
      clearPollingInterval();
      return;
    }
    startPollingInterval();
    run();
  };

  const onOnline = () => {
    if (document.visibilityState === 'visible') run();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);
  if (wasVisible) {
    startPollingInterval();
    run();
  }

  return () => {
    stopped = true;
    rerunRequested = false;
    clearPollingInterval();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', onOnline);
  };
}
