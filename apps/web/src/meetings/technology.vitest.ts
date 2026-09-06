import { describe, expect, it } from 'vitest';
import { canConfirmRecordingStop, isTechnologyReady } from './technology';

describe('technology checklist', () => {
  it('requires room, audio, stream, and accessibility checks', () => {
    expect(isTechnologyReady({ roomReady: true, audioReady: true, streamReady: true, accessibilityChecked: false })).toBe(false);
    expect(isTechnologyReady({ roomReady: true, audioReady: true, streamReady: true, accessibilityChecked: true })).toBe(true);
  });
  it('requires deletion reminder before stop confirmation', () => {
    expect(canConfirmRecordingStop(false)).toBe(false);
    expect(canConfirmRecordingStop(true)).toBe(true);
  });
});
