import type { Miembro } from './lib/types';
import { fetchMembers } from './features/miembros/repo';

export interface AppState {
  members: Miembro[];
}

export type RefreshListener = () => void;

/**
 * Shell-level shared state. `handleAddMember` in the original monolith called
 * `initializeApoyosModule()` and `initializePagosModule()` directly after
 * adding a member (index.html:581-583). That cross-feature call becomes:
 * each feature registers a listener via `onRefresh`, and any feature that
 * changes the member list calls `refresh()` once — no feature imports another.
 */
export interface App {
  readonly state: AppState;
  refresh(): Promise<void>;
  onRefresh(listener: RefreshListener): void;
}

export function createApp(): App {
  const state: AppState = { members: [] };
  const listeners: RefreshListener[] = [];

  async function refresh(): Promise<void> {
    state.members = await fetchMembers();
    for (const listener of listeners) listener();
  }

  function onRefresh(listener: RefreshListener): void {
    listeners.push(listener);
  }

  return { state, refresh, onRefresh };
}
