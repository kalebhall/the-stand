import type { AdvancedDocumentLayout } from './advanced-schema';

export type HistoryState = { past: AdvancedDocumentLayout[]; present: AdvancedDocumentLayout; future: AdvancedDocumentLayout[]; dirty: boolean };

export function createHistory(initial: AdvancedDocumentLayout): HistoryState {
  return { past: [], present: structuredClone(initial), future: [], dirty: false };
}

export function commitHistory(state: HistoryState, next: AdvancedDocumentLayout, limit = 50): HistoryState {
  if (JSON.stringify(state.present) === JSON.stringify(next)) return state;
  return {
    past: [...state.past, state.present].slice(-limit),
    present: structuredClone(next),
    future: [],
    dirty: true
  };
}

export function undo(state: HistoryState): HistoryState {
  const previous = state.past.at(-1);
  if (!previous) return state;
  return { past: state.past.slice(0, -1), present: structuredClone(previous), future: [state.present, ...state.future], dirty: true };
}

export function redo(state: HistoryState): HistoryState {
  const next = state.future[0];
  if (!next) return state;
  return { past: [...state.past, state.present], present: structuredClone(next), future: state.future.slice(1), dirty: true };
}

export function markHistorySaved(state: HistoryState): HistoryState {
  return { ...state, dirty: false };
}
