import { describe, expect, test } from "vitest";
import { defaultState, type PatternParams, paramsOf } from "./model";
import {
	decodePattern,
	encodePattern,
	hashForPattern,
	patternFromHash,
} from "./share";

// Unwrap an ok share result, throwing on failure so a test fails at
// the decode site rather than at an assertion far below.
function unwrap(result: ReturnType<typeof decodePattern>): PatternParams {
	if (!result.ok) {
		throw new Error(`decode failed: ${result.reason}`);
	}
	return result.params;
}

// A pattern exercising every field: two colors, a corner start, both
// stripes reference both colors.
function fullPattern(): PatternParams {
	return {
		...paramsOf(defaultState()),
		repeat: "ping-pong",
		origin: "top-left",
		angle: 75,
		swatch: { width: 40, height: 260 },
	};
}

// Round-trip compare by content: the codec never restores palette
// ids (it mints fresh ones), so compare hexes and stripe positions.
function expectSameContent(
	received: PatternParams | null,
	expected: PatternParams,
) {
	expect(received).not.toBeNull();
	const hexes = (p: PatternParams) => p.palette.map((c) => c.hex);
	expect(hexes(received as PatternParams)).toEqual(hexes(expected));
	const positions = (p: PatternParams) =>
		p.stripes.map((s) => ({
			hex: hexes(p)[p.palette.findIndex((c) => c.id === s.colorId)],
			thickness: s.thickness,
		}));
	expect(positions(received as PatternParams)).toEqual(positions(expected));
	expect(received?.repeat).toBe(expected.repeat);
	expect(received?.origin).toBe(expected.origin);
	expect(received?.angle).toBe(expected.angle);
	expect(received?.swatch).toEqual(expected.swatch);
}

describe("share codec", () => {
	test("the default pattern round-trips by content and stays at its floor", () => {
		const pattern = paramsOf(defaultState());
		const text = encodePattern(pattern);
		// 16 bytes -> 22 unpadded base64 characters.
		expect(text.length).toBeLessThanOrEqual(22);
		expectSameContent(unwrap(decodePattern(text)), pattern);
	});

	test("a full pattern round-trips field for field", () => {
		const pattern = fullPattern();
		expectSameContent(unwrap(decodePattern(encodePattern(pattern))), pattern);
	});

	test("the value uses only URL-unreserved characters", () => {
		const text = encodePattern(fullPattern());
		expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	test("encoding is deterministic for identical content", () => {
		const pattern = fullPattern();
		// Colors are referenced by position, so fresh ids do not matter.
		// Content equality ignores ids: renaming ids and the stripes
		// that reference them encodes identically.
		const refilled = {
			...pattern,
			palette: pattern.palette.map((color, i) => ({
				...color,
				id: `x${i}`,
			})),
			stripes: pattern.stripes.map((stripe) => ({
				...stripe,
				colorId: `x${pattern.palette.findIndex(
					(c) => c.id === stripe.colorId,
				)}`,
			})),
		};
		expect(encodePattern(refilled)).toBe(encodePattern(pattern));
	});

	test("an empty palette round-trips and its stripes drop", () => {
		const decoded = unwrap(
			decodePattern(
				encodePattern({
					palette: [],
					stripes: [{ colorId: "a", thickness: 3 }],
					repeat: "cycle",
					origin: "bottom",
					angle: 45,
					swatch: { width: 10, height: 100 },
				}),
			),
		);
		expect(decoded.palette).toEqual([]);
		expect(decoded.stripes).toEqual([]);
	});

	test("a huge swatch survives the varints", () => {
		const decoded = unwrap(
			decodePattern(
				encodePattern({
					...paramsOf(defaultState()),
					swatch: { width: 300, height: 5000 },
				}),
			),
		);
		expect(decoded.swatch).toEqual({ width: 300, height: 5000 });
	});

	test("foreign versions and non-base64 text reject", () => {
		const text = encodePattern(paramsOf(defaultState()));
		// The version nibble lives in the first character's high bits;
		// swapping in one with version 2 rejects the whole value.
		expect(decodePattern(`I${text.slice(1)}`).ok).toBe(false);
		expect(decodePattern("").ok).toBe(false);
		// '=' padding is outside the URL-safe alphabet.
		expect(decodePattern("AAAA====").ok).toBe(false);
	});

	test("the fragment helpers round-trip", () => {
		const pattern = fullPattern();
		const hash = hashForPattern(pattern);
		expect(hash.startsWith("#p=")).toBe(true);
		expectSameContent(patternFromHash(hash), pattern);
		expect(patternFromHash("#other=1")).toBeNull();
		expect(patternFromHash("#p=!!!")).toBeNull();
	});
});
