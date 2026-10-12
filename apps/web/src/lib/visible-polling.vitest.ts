// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { startVisiblePolling } from './visible-polling';

describe('startVisiblePolling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pauses while hidden and polls once on resume', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const poll = vi.fn();
    const stop = startVisiblePolling(poll, 5_000);

    expect(poll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(poll).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60_000);
    expect(poll).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(poll).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(5_000);
    expect(poll).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it('supports event-driven checks with no interval', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const poll = vi.fn();
    const stop = startVisiblePolling(poll, null);

    expect(poll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    expect(poll).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(poll).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('online'));
    expect(poll).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60_000);
    expect(poll).toHaveBeenCalledTimes(3);
    stop();
  });

  it('queues one resume or reconnect poll behind in-flight work and cleans up on stop', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    let resolvePoll: () => void = () => undefined;
    const poll = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePoll = resolve;
        })
    );
    const stop = startVisiblePolling(poll, 5_000);
    expect(poll).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    expect(poll).toHaveBeenCalledTimes(1);

    resolvePoll();
    await Promise.resolve();
    expect(poll).toHaveBeenCalledTimes(2);
    const resolveSecondPoll = resolvePoll;
    stop();
    resolveSecondPoll();
    await Promise.resolve();
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(60_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });
});
