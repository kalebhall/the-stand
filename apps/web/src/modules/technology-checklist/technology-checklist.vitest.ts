import { describe, expect, it, vi } from 'vitest';

import { createModuleEnablement } from '@/src/modules/enablement';
import { DEFAULT_MODULE_REGISTRY } from '@/src/modules/registry';
import { dispatchCoreEvent } from '@/src/platform/events/dispatch';
import { buildConductView, buildPrepView, renderBasicProgram } from '@/src/conducting/core';
import { canonicalizeMeeting, createMeetingContext, type Meeting } from '@/src/conducting/model';
import { technologyChecklistModule } from './index';
import { isTechnologyReady } from './service';

const meeting: Meeting = canonicalizeMeeting({
  id: 'meeting-1', wardId: 'ward-1', meetingDate: '2026-10-04', meetingType: 'SACRAMENT', status: 'DRAFT', programItems: []
});

describe('Technology Checklist module', () => {
  it('owns its routes and permissions and subscribes to both Core meeting events', () => {
    expect(technologyChecklistModule.routes).toEqual(['/technology']);
    expect(technologyChecklistModule.permissions).toEqual(['technology-checklist.view', 'technology-checklist.manage']);
    expect(technologyChecklistModule.eventHandlers).toHaveLength(2);
  });

  it('does not affect Core when disabled', async () => {
    const enablement = createModuleEnablement({ 'ward-1': { 'technology-checklist': false } });
    const handler = vi.fn();
    const registry = { ...DEFAULT_MODULE_REGISTRY, modules: DEFAULT_MODULE_REGISTRY.modules.map((module) => module.id === technologyChecklistModule.id ? { ...module, eventHandlers: [handler] } : module) };
    await dispatchCoreEvent({ type: 'MeetingCreated', version: 1, wardId: 'ward-1', actorId: 'user-1', meetingId: meeting.id, occurredAt: '2026-09-23T00:00:00.000Z', meetingDate: meeting.meetingDate, meetingType: meeting.meetingType }, 'ward-1', registry, enablement.isEnabled);
    await dispatchCoreEvent({ type: 'MeetingCompleted', version: 1, wardId: 'ward-1', actorId: 'user-1', meetingId: meeting.id, occurredAt: '2026-09-23T00:00:00.000Z' }, 'ward-1', registry, enablement.isEnabled);
    expect(handler).not.toHaveBeenCalled();
    const context = createMeetingContext('user-1', 'ward-1', meeting);
    expect(buildPrepView(context).kind).toBe('prep');
    expect(buildConductView(context).kind).toBe('conduct');
    expect(renderBasicProgram(meeting)).toContain('data-core-render="basic"');
  });

  it('keeps checklist readiness module-owned', () => {
    expect(isTechnologyReady({ roomReady: true, audioReady: true, streamReady: true, accessibilityChecked: true })).toBe(true);
  });
});