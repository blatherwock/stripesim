import { describe, expect, test } from "vitest";
import type { PatternState } from "./model";
import { previewScale, renderPattern, swatchPixelSize } from "./render";

type FillCall = {
	x: number;
	y: number;
	width: number;
	height: number;
	style: string;
};

function fakeContext() {
	const calls: FillCall[] = [];
	const ops: string[] = [];
	const ctx = {
		fillStyle: "#000000",
		save: () => {
			ops.push("save");
		},
		restore: () => {
			ops.push("restore");
		},
		beginPath: () => {
			ops.push("beginPath");
		},
		rect: (x: number, y: number, width: number, height: number) => {
			ops.push(`rect ${x} ${y} ${width} ${height}`);
		},
		clip: () => {
			ops.push("clip");
		},
		translate: (x: number, y: number) => {
			ops.push(`translate ${x} ${y}`);
		},
		rotate: (angle: number) => {
			ops.push(`rotate ${angle}`);
		},
		fillRect(x: number, y: number, width: number, height: number) {
			ops.push("fillRect");
			calls.push({ x, y, width, height, style: this.fillStyle });
		},
	};
	return { ctx, calls, ops };
}

// Scale used for hand-computed pixel math in the band expectations.
const SCALE = 4;

function bands(state: PatternState): FillCall[] {
	const { ctx, calls } = fakeContext();
	renderPattern(ctx as unknown as CanvasRenderingContext2D, state, SCALE);
	return calls;
}

// Fixture chosen here rather than imported: render expectations are
// hand-computed pixel math and must not move when the default demo state
// changes.
function testState(overrides: Partial<PatternState> = {}): PatternState {
	return {
		palette: [
			{ id: "a", hex: "#111111" },
			{ id: "b", hex: "#eeeeee" },
		],
		stripes: [
			{ colorId: "a", thickness: 2 },
			{ colorId: "b", thickness: 3 },
		],
		repeat: "cycle",
		origin: "top",
		angle: 45,
		swatch: { width: 10, height: 40 },
		theme: "light",
		...overrides,
	};
}

describe("previewScale", () => {
	test("fits the swatch into the pane at 85 percent", () => {
		// Height-limited: 160 / 40 = 4 units fit; 85% of that is 3.4.
		expect(
			previewScale({ width: 10, height: 40 }, { width: 200, height: 160 }),
		).toBeCloseTo(3.4);
	});

	test("uses the limiting dimension", () => {
		// Width-limited: 50 / 10 = 5 units fit; 85% of that is 4.25.
		expect(
			previewScale({ width: 10, height: 40 }, { width: 50, height: 400 }),
		).toBeCloseTo(4.25);
	});

	test("a swatch larger than the pane shrinks it below one", () => {
		// Both axes overflow: the smaller ratio (100 / 40 = 2.5) limits, so
		// the scale falls below one pixel per unit.
		expect(
			previewScale({ width: 10, height: 40 }, { width: 50, height: 100 }),
		).toBeCloseTo(2.125);
	});
});

describe("swatchPixelSize", () => {
	test("multiplies unit size by scale", () => {
		expect(swatchPixelSize({ width: 10, height: 40 }, SCALE)).toEqual({
			width: 40,
			height: 160,
		});
	});

	test("never collapses below one pixel", () => {
		expect(swatchPixelSize({ width: 10, height: 40 }, 0)).toEqual({
			width: 1,
			height: 1,
		});
	});
});

describe("renderPattern", () => {
	test("fills the swatch with the first palette color, then stripes", () => {
		const calls = bands(testState());
		expect(calls[0]).toEqual({
			x: 0,
			y: 0,
			width: 40,
			height: 160,
			style: "#111111",
		});
		// Stripe a repaints the background at offsets 0..2 units; stripe b
		// follows at offsets 2..5 units: 2 units * scale 4 = 8px down, 3
		// units thick = 12px.
		expect(calls[2]).toEqual({
			x: 0,
			y: 8,
			width: 40,
			height: 12,
			style: "#eeeeee",
		});
	});

	test("renders vertical bands across the height", () => {
		const state = testState({
			origin: "left",
			stripes: [{ colorId: "b", thickness: 3 }],
		});
		expect(bands(state)[1]).toEqual({
			x: 0,
			y: 0,
			width: 12,
			height: 160,
			style: "#eeeeee",
		});
	});

	test("a bottom start hugs the bottom edge", () => {
		// Stripe b at offsets 2..5 units mirrors: its far edge sits at
		// 160 - 5*4 = 140 with thickness 12.
		const state = testState({ origin: "bottom" });
		expect(bands(state)[2]).toEqual({
			x: 0,
			y: 140,
			width: 40,
			height: 12,
			style: "#eeeeee",
		});
	});

	test("a right start hugs the right edge", () => {
		// Vertical stripes from the right: the first band spans offsets
		// 0..3 units, so its far edge sits at 40 - 12 = 28 with thickness 12.
		const state = testState({
			origin: "right",
			stripes: [{ colorId: "b", thickness: 3 }],
		});
		expect(bands(state)[1]).toEqual({
			x: 28,
			y: 0,
			width: 12,
			height: 160,
			style: "#eeeeee",
		});
	});

	test("renders diagonal bands in a rotated frame per corner", () => {
		// The band runs from low 0 to high 3 units * scale 4 = 12px,
		// widened by span = width + height = 200px on each side.
		const band = {
			x: -200,
			y: 0,
			width: 400,
			height: 12,
			style: "#eeeeee",
		};
		const quarters = Math.PI / 4;
		const cases: [PatternState["origin"], string, string][] = [
			["top-left", "translate 0 0", `rotate ${-quarters}`],
			["top-right", "translate 40 0", `rotate ${quarters}`],
			["bottom-left", "translate 0 160", `rotate ${Math.PI + quarters}`],
			["bottom-right", "translate 40 160", `rotate ${Math.PI - quarters}`],
		];
		for (const [origin, translateOp, rotateOp] of cases) {
			const { ctx, calls, ops } = fakeContext();
			renderPattern(
				ctx as unknown as CanvasRenderingContext2D,
				testState({
					origin,
					angle: 45,
					stripes: [{ colorId: "b", thickness: 3 }],
				}),
				4,
			);
			expect(calls[1]).toEqual(band);
			expect(ops).toContain(translateOp);
			expect(ops).toContain(rotateOp);
		}
	});

	test("an empty palette falls back to white", () => {
		const state = testState({ palette: [], stripes: [] });
		expect(bands(state)[0]).toEqual({
			x: 0,
			y: 0,
			width: 40,
			height: 160,
			style: "#ffffff",
		});
	});

	test("segments with an unknown color are skipped", () => {
		const state = testState({
			stripes: [{ colorId: "missing", thickness: 1 }],
		});
		expect(bands(state)).toHaveLength(1);
	});

	test("clips to the swatch so bands never bleed outside it", () => {
		const { ctx, ops } = fakeContext();
		renderPattern(ctx as unknown as CanvasRenderingContext2D, testState(), 4);
		// The clip rectangle matches the swatch pixel size and is applied
		// before the first fill.
		expect(ops).toContain("rect 0 0 40 160");
		expect(ops.indexOf("clip")).toBeLessThan(ops.indexOf("fillRect"));
	});
});
