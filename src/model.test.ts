import { describe, expect, test } from "vitest";
import {
	addColor,
	addStripe,
	axisLength,
	type Direction,
	defaultState,
	directionOf,
	expand,
	moveStripe,
	type Origin,
	type PatternState,
	patchControls,
	type RepeatMode,
	removeColor,
	type Stripe,
} from "./model";

function stripes(...specs: [string, number][]): Stripe[] {
	return specs.map(([colorId, thickness]) => ({ colorId, thickness }));
}

function run(pattern: Stripe[], repeat: RepeatMode, length: number) {
	return expand(pattern, repeat, length);
}

describe("expand, cycle repeat", () => {
	test("repeats the sequence to fill the axis and clips the final stripe", () => {
		const segments = run(stripes(["a", 1], ["b", 2]), "cycle", 7);
		expect(segments).toEqual([
			{ colorId: "a", offset: 0, thickness: 1 },
			{ colorId: "b", offset: 1, thickness: 2 },
			{ colorId: "a", offset: 3, thickness: 1 },
			{ colorId: "b", offset: 4, thickness: 2 },
			{ colorId: "a", offset: 6, thickness: 1 },
		]);
	});

	test("clips an overlong sequence instead of shrinking it", () => {
		const segments = run(stripes(["a", 10]), "cycle", 4);
		expect(segments).toEqual([{ colorId: "a", offset: 0, thickness: 4 }]);
	});

	test("allows fractional thicknesses", () => {
		const segments = run(stripes(["a", 0.5], ["b", 0.5]), "cycle", 1.5);
		expect(segments).toEqual([
			{ colorId: "a", offset: 0, thickness: 0.5 },
			{ colorId: "b", offset: 0.5, thickness: 0.5 },
			{ colorId: "a", offset: 1, thickness: 0.5 },
		]);
	});
});

describe("expand, ping-pong repeat", () => {
	test("reverses interior stripes on alternate tiles", () => {
		const segments = run(stripes(["a", 1], ["b", 1], ["c", 1]), "ping-pong", 6);
		expect(segments.map((s) => s.colorId)).toEqual([
			"a",
			"b",
			"c",
			"b",
			"a",
			"b",
		]);
	});

	test("sequences without interior stripes ping-pong as plain cycles", () => {
		const two = run(stripes(["a", 1], ["b", 1]), "ping-pong", 4);
		expect(two.map((s) => s.colorId)).toEqual(["a", "b", "a", "b"]);
		const one = run(stripes(["a", 1]), "ping-pong", 3);
		expect(one.map((s) => s.colorId)).toEqual(["a", "a", "a"]);
	});
});

describe("expand, edge cases", () => {
	test("an empty sequence expands to nothing", () => {
		expect(run([], "cycle", 5)).toEqual([]);
	});

	test("a non-positive length expands to nothing", () => {
		expect(run(stripes(["a", 1]), "cycle", 0)).toEqual([]);
	});

	test("zero-thickness stripes render nothing but consume no space", () => {
		const segments = run(stripes(["a", 0], ["b", 1]), "cycle", 2);
		expect(segments).toEqual([
			{ colorId: "b", offset: 0, thickness: 1 },
			{ colorId: "b", offset: 1, thickness: 1 },
		]);
	});

	test("an all-zero sequence expands to nothing", () => {
		expect(run(stripes(["a", 0]), "cycle", 5)).toEqual([]);
	});
});

describe("axisLength", () => {
	const swatch = { width: 10, height: 20 };

	test("horizontal stripes stack along the height", () => {
		expect(axisLength("horizontal", 45, swatch)).toBe(20);
	});

	test("vertical stripes stack along the width", () => {
		expect(axisLength("vertical", 45, swatch)).toBe(10);
	});

	test("diagonal lengths project the swatch at the angle from horizontal", () => {
		const cases: [number, number][] = [
			[0, 20],
			[90, 10],
			[45, 10 * Math.SQRT1_2 + 20 * Math.SQRT1_2],
		];
		for (const [angle, expected] of cases) {
			expect(axisLength("diagonal", angle, swatch)).toBeCloseTo(expected);
		}
	});
});

describe("state transitions", () => {
	const base = (): PatternState => ({
		...defaultState(),
		palette: [
			{ id: "a", hex: "#111111" },
			{ id: "b", hex: "#eeeeee" },
		],
		stripes: [
			{ colorId: "a", thickness: 2 },
			{ colorId: "b", thickness: 3 },
			{ colorId: "a", thickness: 1 },
		],
	});

	test("transitions never mutate their input", () => {
		const state = base();
		const before = JSON.stringify(state);
		removeColor(state, "a");
		addStripe(state, "b");
		moveStripe(state, 0, 2);
		addColor(state, { id: "c", hex: "#cccccc" });
		patchControls(state, {
			repeat: "ping-pong",
			origin: "top-left",
			theme: "dark",
		});
		expect(JSON.stringify(state)).toBe(before);
	});

	test("removing a color drops its stripes", () => {
		const next = removeColor(base(), "a");
		expect(next.palette).toHaveLength(1);
		expect(
			next.stripes.map(({ colorId, thickness }) => ({ colorId, thickness })),
		).toEqual([{ colorId: "b", thickness: 3 }]);
	});

	test("moving a stripe removes it from its origin", () => {
		const next = moveStripe(base(), 0, 2);
		expect(
			next.stripes.map(({ colorId, thickness }) => ({ colorId, thickness })),
		).toEqual([
			{ colorId: "b", thickness: 3 },
			{ colorId: "a", thickness: 1 },
			{ colorId: "a", thickness: 2 },
		]);
	});

	test("moving a stripe from outside the list changes nothing", () => {
		const state = base();
		expect(moveStripe(state, 7, 0)).toBe(state);
	});

	test("patchControls replaces only the patched fields", () => {
		const state = base();
		const next = patchControls(state, { origin: "top-left" });
		expect(next.origin).toBe("top-left");
		expect(next.repeat).toBe("cycle");
		// Untouched fields carry over by reference, not a copy.
		expect(next.stripes).toBe(state.stripes);
	});
});

describe("directionOf", () => {
	test("edges map to horizontal or vertical, corners to diagonal", () => {
		const cases: [Origin, Direction][] = [
			["top", "horizontal"],
			["bottom", "horizontal"],
			["left", "vertical"],
			["right", "vertical"],
			["top-left", "diagonal"],
			["top-right", "diagonal"],
			["bottom-left", "diagonal"],
			["bottom-right", "diagonal"],
		];
		for (const [origin, expected] of cases) {
			expect(directionOf(origin)).toBe(expected);
		}
	});
});
