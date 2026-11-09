import {
	axisLength,
	type Direction,
	directionOf,
	expand,
	type Origin,
	type PatternState,
	type Segment,
	type Swatch,
} from "./model";

/** On-screen size in whole pixels. */
export type PixelSize = {
	width: number;
	height: number;
};

/** Portion of the preview pane the fitted swatch fills at most. */
const PREVIEW_FRACTION = 0.85;

/**
 * Pixels per unit that fits the swatch into a pane of the given size at
 * `PREVIEW_FRACTION`, preserving the unit aspect ratio. A zero-sized
 * pane yields zero.
 */
export function previewScale(swatch: Swatch, pane: PixelSize): number {
	const fit = Math.min(pane.width / swatch.width, pane.height / swatch.height);
	return PREVIEW_FRACTION * fit;
}

/**
 * On-screen size of the swatch in whole pixels at the given scale,
 * clamped to at least one pixel per side.
 */
export function swatchPixelSize(swatch: Swatch, scale: number): PixelSize {
	return {
		width: Math.max(1, Math.round(swatch.width * scale)),
		height: Math.max(1, Math.round(swatch.height * scale)),
	};
}

/**
 * Draw the pattern into a 2D context sized to `swatchPixelSize` at the
 * given scale.
 *
 * The swatch is filled with the first palette color (white when the palette
 * is empty), then expanded segments draw as hard-edged bands. Horizontal and
 * vertical bands draw directly, starting flush with the origin edge;
 * diagonal bands draw in a rotated frame anchored at the origin corner.
 */
export function renderPattern(
	ctx: CanvasRenderingContext2D,
	state: PatternState,
	scale: number,
): void {
	const { width, height } = swatchPixelSize(state.swatch, scale);
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, width, height);
	ctx.clip();
	ctx.fillStyle = state.palette[0]?.hex ?? "#ffffff";
	ctx.fillRect(0, 0, width, height);

	const direction = directionOf(state.origin);
	const length = axisLength(direction, state.angle, state.swatch);
	for (const segment of expand(state.stripes, state.repeat, length)) {
		const hex = paletteHex(state, segment.colorId);
		if (hex === null) {
			continue;
		}
		ctx.fillStyle = hex;
		drawSegment(ctx, state, direction, segment, width, height, scale);
	}
	ctx.restore();
}

function paletteHex(state: PatternState, colorId: string): string | null {
	return state.palette.find((color) => color.id === colorId)?.hex ?? null;
}

function drawSegment(
	ctx: CanvasRenderingContext2D,
	state: PatternState,
	direction: Direction,
	segment: Segment,
	width: number,
	height: number,
	scale: number,
): void {
	const low = segment.offset * scale;
	const high = (segment.offset + segment.thickness) * scale;
	if (direction === "vertical") {
		// A right start mirrors the axis so the first stripe hugs the
		// right edge.
		const x = state.origin === "right" ? width - high : low;
		ctx.fillRect(x, 0, high - low, height);
		return;
	}
	if (direction === "diagonal") {
		const [x, y, rotation] = diagonalFrame(
			state.origin,
			state.angle,
			width,
			height,
		);
		const span = width + height;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(rotation);
		ctx.fillRect(-span, low, span * 2, high - low);
		ctx.restore();
		return;
	}
	// A bottom start mirrors the axis so the first stripe hugs the bottom
	// edge.
	const y = state.origin === "bottom" ? height - high : low;
	ctx.fillRect(0, y, width, high - low);
}

/**
 * Rotated frame anchoring the stripe axis at the start corner: the
 * frame's local y axis runs from that corner into the swatch, and the
 * angle sets the steepness within the slant the corner pair picks.
 * Throws when `origin` is an edge, which never reaches a diagonal band.
 */
function diagonalFrame(
	origin: Origin,
	angle: number,
	width: number,
	height: number,
): [number, number, number] {
	const radians = (angle * Math.PI) / 180;
	switch (origin) {
		case "top-left":
			return [0, 0, -radians];
		case "top-right":
			return [width, 0, radians];
		case "bottom-left":
			return [0, height, Math.PI + radians];
		case "bottom-right":
			return [width, height, Math.PI - radians];
	}
	throw new Error(`diagonal frame requires a corner, got ${origin}`);
}
