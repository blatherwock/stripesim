import { describe, expect, test } from "vitest";
import {
	atNewest,
	atOldest,
	backHistory,
	currentState,
	forwardHistory,
	HISTORY_LIMIT,
	newHistory,
	pushHistory,
} from "./history";

describe("pushHistory", () => {
	test("pushing appends at the cursor and prunes ahead of it", () => {
		let history = newHistory("a");
		history = pushHistory(history, "b");
		history = pushHistory(history, "c");
		expect(history).toEqual({ states: ["a", "b", "c"], cursor: 2 });

		// Back to "b", then a new push prunes "c" and appends after it.
		history = backHistory(history);
		history = pushHistory(history, "d");
		expect(history).toEqual({ states: ["a", "b", "d"], cursor: 2 });
	});

	test("identical consecutive states are skipped", () => {
		let history = newHistory("a");
		history = pushHistory(history, "a");
		history = pushHistory(history, "a");
		expect(history).toEqual({ states: ["a"], cursor: 0 });
	});

	test("the cap drops the oldest state", () => {
		let history = newHistory("0");
		for (let i = 1; i <= HISTORY_LIMIT + 5; i++) {
			history = pushHistory(history, String(i));
		}
		expect(history.states).toHaveLength(HISTORY_LIMIT);
		expect(history.states[0]).toBe("6");
	});
});

describe("back and forward", () => {
	test("back walks toward the oldest, forward toward the newest", () => {
		let history = newHistory("a");
		history = pushHistory(history, "b");
		history = pushHistory(history, "c");

		history = backHistory(history);
		expect(currentState(history)).toBe("b");
		history = backHistory(history);
		expect(currentState(history)).toBe("a");
		// The oldest entry is the tip: back does not move past it.
		expect(atOldest(history)).toBe(true);
		expect(backHistory(history)).toEqual(history);

		history = forwardHistory(history);
		expect(currentState(history)).toBe("b");
		history = forwardHistory(history);
		expect(currentState(history)).toBe("c");
		expect(atNewest(history)).toBe(true);
	});
});
