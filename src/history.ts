/**
 * Session history for the working pattern: a list of states with a
 * cursor pointing at the current one. Every pattern change pushes at
 * the cursor and prunes everything after it; back and forward move
 * the cursor. The list holds all states, including the current, so
 * the moves are pure cursor changes. Session-only: nothing here is
 * persisted; a reload starts with a single state.
 */

/** How many states the history keeps; older states drop first. */
export const HISTORY_LIMIT = 50;

/**
 * A history with at least one state: the state at the cursor is the
 * current one, so `states[cursor]` is always defined.
 */
export type History = {
	states: string[];
	cursor: number;
};

/**
 * Start a history with `state` as its only entry. Identical
 * consecutive states are skipped by `pushHistory`, so the encoding
 * is the identity of a state: two entries never carry the same text.
 */
export function newHistory(state: string): History {
	return { states: [state], cursor: 0 };
}

/**
 * Push `state` at the cursor: everything after it prunes, the new
 * state appends, and the cap drops the oldest entry. A state that
 * equals the current one is a no-op — back and forth moves are
 * never skipped, only identical consecutive states.
 */
export function pushHistory(history: History, state: string): History {
	const current = history.states[history.cursor] as string;
	if (current === state) {
		return history;
	}
	let states = history.states.slice(0, history.cursor + 1);
	states.push(state);
	if (states.length > HISTORY_LIMIT) {
		states = states.slice(states.length - HISTORY_LIMIT);
	}
	return {
		states,
		cursor: states.length - 1,
	};
}

/**
 * Move the cursor one step toward the oldest state. Returns the same
 * history when the cursor is already at the oldest entry.
 */
export function backHistory(history: History): History {
	const cursor = Math.max(history.cursor - 1, 0);
	if (cursor === history.cursor) {
		return history;
	}
	return { states: history.states, cursor };
}

/**
 * Move the cursor one step toward the newest state. Returns the same
 * history when the cursor is already at the newest entry.
 */
export function forwardHistory(history: History): History {
	const cursor = Math.min(history.cursor + 1, history.states.length - 1);
	if (cursor === history.cursor) {
		return history;
	}
	return { states: history.states, cursor };
}

/** The state at the cursor. */
export function currentState(history: History): string {
	return history.states[history.cursor] as string;
}

/** True when the cursor is at the oldest entry. */
export function atOldest(history: History): boolean {
	return history.cursor === 0;
}

/** True when the cursor is at the newest entry. */
export function atNewest(history: History): boolean {
	return history.cursor === history.states.length - 1;
}
