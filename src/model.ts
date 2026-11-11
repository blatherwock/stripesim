export type RepeatMode = "cycle" | "ping-pong";

export type Direction = "horizontal" | "vertical" | "diagonal";

/**
 * One swatch edge: where axis-aligned stripes start.
 */
export type Edge = "top" | "right" | "bottom" | "left";

/**
 * One swatch corner: where diagonal stripes start.
 */
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Where knitting starts: one swatch edge or corner. Edges run horizontal
 * or vertical stripes from that edge; corners run diagonal stripes whose
 * phase begins at that corner, with the corner pair picking the slant.
 */
export type Origin = Edge | Corner;

/**
 * App color scheme, applied to the page chrome through `data-theme` on
 * the body: plain light, warm beige, dark gruvbox browns, or dark grey.
 */
export type Theme = "light" | "beige" | "gruvbox" | "dark";

/** A palette color: a stable id plus its hex value. */
export type Color = {
	id: string;
	hex: string;
};

/** One stripe in the sequence: a palette color and a thickness in units. */
export type Stripe = {
	colorId: string;
	thickness: number;
};

/** Swatch dimensions in units. */
export type Swatch = {
	width: number;
	height: number;
};

/** The full editor state behind the live preview. */
export type PatternState = {
	palette: Color[];
	stripes: Stripe[];
	repeat: RepeatMode;
	origin: Origin;
	angle: number;
	swatch: Swatch;
	theme: Theme;
};

/**
 * The pattern fields of the state, without the theme: what a saved
 * card captures and what the renderer needs to draw a pattern.
 */
export type PatternParams = Pick<
	PatternState,
	"palette" | "stripes" | "repeat" | "origin" | "angle" | "swatch"
>;

/**
 * Every origin value in a fixed order: the origin index used by the
 * share format and the saved-list validator picks from here.
 */
export const ORIGINS: readonly Origin[] = [
	"top",
	"right",
	"bottom",
	"left",
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
];

/** A positioned band on the stripe axis, clipped to the axis. */
export type Segment = {
	colorId: string;
	offset: number;
	thickness: number;
};

/**
 * Default demo state shown on load: an off-white and blue 1-1 stripe
 * pattern on a tall swatch. The two colors carry generated ids like
 * every other color: ids are opaque handles, never color names, so
 * they cannot go stale when the hexes are edited.
 */
export function defaultState(): PatternState {
	const offwhite = crypto.randomUUID();
	const blue = crypto.randomUUID();
	return {
		palette: [
			{ id: offwhite, hex: "#f5f5f4" },
			{ id: blue, hex: "#2563eb" },
		],
		stripes: [
			{ colorId: offwhite, thickness: 2 },
			{ colorId: blue, thickness: 2 },
		],
		repeat: "cycle",
		origin: "bottom",
		angle: 45,
		swatch: { width: 10, height: 100 },
		theme: "light",
	};
}

/*
 * State transitions, all pure: each returns a new state and never
 * mutates its input. The UI dispatches these; `main` owns the state
 * variable and re-assigns it from the returned value.
 */

/** Scalar control fields replaced by `patchControls`. */
export type ControlPatch = Partial<
	Pick<PatternState, "repeat" | "origin" | "angle" | "theme">
>;

/** Stripe orientation implied by the origin: edges are axis-aligned, corners diagonal. */
export function directionOf(origin: Origin): Direction {
	if (origin === "top" || origin === "bottom") {
		return "horizontal";
	}
	if (origin === "left" || origin === "right") {
		return "vertical";
	}
	return "diagonal";
}

/** Return a state with the scalar control fields replaced by `patch`. */
export function patchControls(
	state: PatternState,
	patch: ControlPatch,
): PatternState {
	return { ...state, ...patch };
}

/** Return the pattern parameters of `state`, without the theme. */
export function paramsOf(state: PatternState): PatternParams {
	return {
		palette: state.palette,
		stripes: state.stripes,
		repeat: state.repeat,
		origin: state.origin,
		angle: state.angle,
		swatch: state.swatch,
	};
}

/**
 * Return a state with the pattern parameters replaced by `params`,
 * keeping the current theme.
 */
export function withParams(
	state: PatternState,
	params: PatternParams,
): PatternState {
	return { ...state, ...params };
}

/** Return a state with the given swatch dimensions replaced. */
export function setSwatchSize(
	state: PatternState,
	size: Partial<Swatch>,
): PatternState {
	return { ...state, swatch: { ...state.swatch, ...size } };
}

/** Return a state with `color` appended to the palette. */
export function addColor(state: PatternState, color: Color): PatternState {
	return { ...state, palette: [...state.palette, color] };
}

/** Return a state with the hex of the color `colorId` replaced. */
export function setColorHex(
	state: PatternState,
	colorId: string,
	hex: string,
): PatternState {
	return {
		...state,
		palette: state.palette.map((color) =>
			color.id === colorId ? { ...color, hex } : color,
		),
	};
}

/**
 * Return a state with the color at `from` moved to `target`, both
 * indices into the current palette. A `from` outside the list returns
 * the input unchanged.
 */
export function moveColor(
	state: PatternState,
	from: number,
	target: number,
): PatternState {
	if (state.palette[from] === undefined) {
		return state;
	}
	return { ...state, palette: moveItem(state.palette, from, target) };
}

/** Return a state with the color removed and its stripes dropped. */
export function removeColor(
	state: PatternState,
	colorId: string,
): PatternState {
	return {
		...state,
		palette: state.palette.filter((color) => color.id !== colorId),
		stripes: state.stripes.filter((stripe) => stripe.colorId !== colorId),
	};
}

/** Return a state with a unit-thickness stripe in `colorId` appended. */
export function addStripe(state: PatternState, colorId: string): PatternState {
	return {
		...state,
		stripes: [...state.stripes, { colorId, thickness: 1 }],
	};
}

/** Return a state with the stripe at `index` removed. */
export function removeStripe(state: PatternState, index: number): PatternState {
	return {
		...state,
		stripes: state.stripes.filter((_, i) => i !== index),
	};
}

/** Return a state with the stripe at `index` recolored. */
export function setStripeColor(
	state: PatternState,
	index: number,
	colorId: string,
): PatternState {
	return {
		...state,
		stripes: state.stripes.map((stripe, i) =>
			i === index ? { ...stripe, colorId } : stripe,
		),
	};
}

/** Return a state with the stripe at `index` rethickened. */
export function setStripeThickness(
	state: PatternState,
	index: number,
	thickness: number,
): PatternState {
	return {
		...state,
		stripes: state.stripes.map((stripe, i) =>
			i === index ? { ...stripe, thickness } : stripe,
		),
	};
}

/**
 * Return a new array with the element at `from` moved to `target`. A
 * `from` outside the list returns a copy in the original order; a
 * `target` outside the list pins the element at the matching end.
 */
export function moveItem<T>(
	items: readonly T[],
	from: number,
	target: number,
): T[] {
	const moved = [...items];
	const [item] = moved.splice(from, 1);
	if (item === undefined) {
		return moved;
	}
	moved.splice(target, 0, item);
	return moved;
}

/**
 * Return a state with the stripe at `from` moved to `target`, both
 * indices into the current stripe list. A `from` outside the list
 * returns the input unchanged.
 */
export function moveStripe(
	state: PatternState,
	from: number,
	target: number,
): PatternState {
	if (state.stripes[from] === undefined) {
		return state;
	}
	return { ...state, stripes: moveItem(state.stripes, from, target) };
}

/**
 * Length, in units, of the axis the stripe sequence stacks along: the
 * height for horizontal stripes, the width for vertical stripes, and the
 * swatch's full projection onto the stripe normal for diagonal stripes.
 */
export function axisLength(
	direction: Direction,
	angle: number,
	swatch: Swatch,
): number {
	if (direction === "horizontal") {
		return swatch.height;
	}
	if (direction === "vertical") {
		return swatch.width;
	}
	const radians = (angle * Math.PI) / 180;
	return (
		Math.abs(swatch.width * Math.sin(radians)) +
		Math.abs(swatch.height * Math.cos(radians))
	);
}

/**
 * Expand a stripe sequence into positioned segments covering the axis.
 *
 * The sequence tiles the whole axis from the origin: the first stripe
 * leads at offset 0, which the renderer places at the start edge or
 * corner. With `ping-pong`, each forward tile is followed by a
 * reversed-interior tile so the stream reads back and forth without
 * duplicating boundary stripes. Tiling runs forward from offset 0, so
 * segments come out ordered by offset and only need clipping at the
 * axis end.
 */
export function expand(
	stripes: Stripe[],
	repeat: RepeatMode,
	length: number,
): Segment[] {
	if (stripes.length === 0 || length <= 0) {
		return [];
	}
	const forward = stripes.reduce((sum, stripe) => sum + stripe.thickness, 0);
	if (forward <= 0) {
		return [];
	}
	const interior = repeat === "ping-pong" ? stripes.slice(1, -1).reverse() : [];
	const interiorTotal = interior.reduce(
		(sum, stripe) => sum + stripe.thickness,
		0,
	);
	const period = forward + interiorTotal;
	const segments: Segment[] = [];
	// Tile forward from the origin until the axis is covered.
	for (let base = 0; base < length; base += period) {
		emitTile(segments, stripes, base, length);
		emitTile(segments, interior, base + forward, length);
	}
	return segments;
}

function emitTile(
	segments: Segment[],
	tile: Stripe[],
	start: number,
	length: number,
): void {
	let cursor = start;
	for (const stripe of tile) {
		pushSegment(segments, stripe, cursor, length);
		cursor += stripe.thickness;
	}
}

// Clip one stripe's band at the axis end; bands never start below 0
// because tiling runs forward from the origin.
function pushSegment(
	segments: Segment[],
	stripe: Stripe,
	start: number,
	length: number,
): void {
	if (stripe.thickness <= 0) {
		return;
	}
	const high = Math.min(start + stripe.thickness, length);
	if (high <= start) {
		return;
	}
	segments.push({
		colorId: stripe.colorId,
		offset: start,
		thickness: high - start,
	});
}
