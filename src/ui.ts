import { attachReorder } from "./drag";
import {
	addColor,
	addStripe,
	type Color,
	defaultState,
	directionOf,
	moveColor,
	moveStripe,
	type Origin,
	type PatternState,
	paramsOf,
	patchControls,
	removeColor,
	removeStripe,
	type Stripe,
	setColorHex,
	setStripeColor,
	setStripeThickness,
	setSwatchSize,
	withParams,
} from "./model";

/**
 * Kind of change dispatched with a new state: `canvas` changes only need
 * the swatch redrawn, `structure` changes also require rebuilding the
 * panel (list contents, option lists, or conditional rows changed).
 */
export type ChangeKind = "canvas" | "structure";

/** Read the current state; handlers call this at event time, never cache. */
type GetState = () => PatternState;

/** Deliver the next state to the owner, tagged with its change kind. */
type Dispatch = (next: PatternState, kind: ChangeKind) => void;

// Icon glyphs from the vendored nerd symbols font, resolved through the
// official glyph registry: bars, plus, xmark, repeat, exchange, the eight
// start-grid arrows, sun, scroll, mountain, moon. Every escape uses the
// braced form: several glyphs live past four hex digits, where the bare
// form silently truncates onto a wrong codepoint.
const ICON_BARS = "\u{F0C9}";
const ICON_PLUS = "\u{F067}";
const ICON_XMARK = "\u{F00D}";
const ICON_REPEAT = "\u{F01E}";
const ICON_EXCHANGE = "\u{F0EC}";
const ICON_ARROW_UP = "\u{F062}";
const ICON_ARROW_DOWN = "\u{F063}";
const ICON_ARROW_LEFT = "\u{F060}";
const ICON_ARROW_RIGHT = "\u{F061}";
const ICON_ARROW_UP_LEFT = "\u{F005B}";
const ICON_ARROW_UP_RIGHT = "\u{F005C}";
const ICON_ARROW_DOWN_LEFT = "\u{F0042}";
const ICON_ARROW_DOWN_RIGHT = "\u{F0043}";
const ICON_SUN = "\u{F185}";
const ICON_SCROLL = "\u{EF0D}";
const ICON_MOUNTAIN = "\u{EF08}";
const ICON_MOON = "\u{F186}";
const ICON_ROTATE_LEFT = "\u{F0E2}";
const ICON_CHEVRON_LEFT = "\u{F053}";
const ICON_CHEVRON_RIGHT = "\u{F054}";

// Drag state shared by all reorderable rows of one panel build.
type DragState = {
	from: number | null;
};

/**
 * Build the full control panel into `host`, replacing its contents.
 * Reads state through `getState` and, on user input, derives the next
 * state with pure model transitions and hands it to `dispatch`.
 */
/**
 * What the panel needs to render and drive the session history: the
 * button states and the move handler the owner implements.
 */
export type HistoryDeps = {
	canBack: () => boolean;
	canForward: () => boolean;
	onMove: (direction: "back" | "forward") => void;
};

export function buildPanel(
	host: HTMLElement,
	getState: GetState,
	dispatch: Dispatch,
	historyDeps: HistoryDeps,
): void {
	host.replaceChildren();
	const state = getState();
	const drag: DragState = { from: null };
	// The four editing sections scroll; the theme controls anchor to the
	// panel's bottom left corner and stay put.
	const scroll = document.createElement("div");
	scroll.className = "panel-scroll";
	scroll.append(
		paletteSection(host, getState, dispatch, drag),
		stripesSection(host, getState, dispatch, drag),
		patternSection(state, getState, dispatch),
		swatchSection(state, getState, dispatch),
	);
	host.append(
		historyRow(getState, dispatch, historyDeps),
		scroll,
		themeSection(state, getState, dispatch),
	);
}

/**
 * The panel header row: reset, then back and forward through the
 * session history. The buttons split the row's width evenly, and the
 * history buttons disable at the ends of the list, so their disabled
 * state reads like a position.
 */
function historyRow(
	getState: GetState,
	dispatch: Dispatch,
	historyDeps: HistoryDeps,
): HTMLElement {
	const back = iconButton(ICON_CHEVRON_LEFT, "Back one change", () => {
		historyDeps.onMove("back");
	});
	back.disabled = !historyDeps.canBack();
	const forward = iconButton(ICON_CHEVRON_RIGHT, "Forward one change", () => {
		historyDeps.onMove("forward");
	});
	forward.disabled = !historyDeps.canForward();
	const reset = iconButton(ICON_ROTATE_LEFT, "Reset to default pattern", () => {
		dispatch(withParams(getState(), paramsOf(defaultState())), "structure");
	});
	reset.title = "Restore the default pattern";
	const row = document.createElement("div");
	row.className = "panel-history";
	row.append(reset, back, forward);
	return row;
}

function paletteSection(
	host: HTMLElement,
	getState: GetState,
	dispatch: Dispatch,
	drag: DragState,
): HTMLElement {
	const rows = getState().palette.map((color, index) =>
		paletteRow(getState, dispatch, color, index, drag, host),
	);
	const add = iconButton(ICON_PLUS, "Add color", () => {
		const color = { id: crypto.randomUUID(), hex: "#cccccc" };
		dispatch(addColor(getState(), color), "structure");
	});
	const box = section("Palette", rows, add);
	attachReorder(box, ".palette-row", drag, (from, target) =>
		dispatch(moveColor(getState(), from, target), "structure"),
	);
	return box;
}

function paletteRow(
	getState: GetState,
	dispatch: Dispatch,
	color: Color,
	index: number,
	drag: DragState,
	host: HTMLElement,
): HTMLElement {
	const picker = document.createElement("input");
	picker.type = "color";
	picker.value = color.hex;
	picker.addEventListener("input", () => {
		const next = setColorHex(getState(), color.id, picker.value);
		// Color edits keep the picker alive: no panel rebuild, so the hex
		// field and stripe swatches follow the new palette in place.
		hexInput.value = picker.value;
		syncSwatchColors(host, next.palette);
		dispatch(next, "canvas");
	});

	const hexInput = document.createElement("input");
	hexInput.type = "text";
	hexInput.className = "hex";
	hexInput.value = color.hex;
	hexInput.addEventListener("change", () => {
		const value = hexInput.value.trim();
		if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
			hexInput.value =
				getState().palette.find((c) => c.id === color.id)?.hex ?? color.hex;
			return;
		}
		const next = setColorHex(getState(), color.id, value.toLowerCase());
		picker.value = value.toLowerCase();
		syncSwatchColors(host, next.palette);
		dispatch(next, "canvas");
	});

	const remove = iconButton(ICON_XMARK, "Remove color", () => {
		dispatch(removeColor(getState(), color.id), "structure");
	});

	const box = row("palette-row", picker, hexInput, remove);
	box.prepend(dragHandle(index, box, host, drag));
	return box;
}

// Repaint every stripe-row swatch that references a palette color, in
// place; color edits do not rebuild the panel, so the swatch buttons
// must follow the new hex values themselves.
function syncSwatchColors(host: HTMLElement, palette: Color[]): void {
	const hexById = new Map(palette.map((color) => [color.id, color.hex]));
	const swatches = host.querySelectorAll<HTMLButtonElement>(
		".swatch[data-color-id]",
	);
	for (const button of swatches) {
		const hex = hexById.get(button.dataset.colorId ?? "");
		if (hex !== undefined) {
			button.style.backgroundColor = hex;
		}
	}
}

function stripesSection(
	host: HTMLElement,
	getState: GetState,
	dispatch: Dispatch,
	drag: DragState,
): HTMLElement {
	const state = getState();
	const rows = state.stripes.map((_, index) =>
		stripeRow(index, host, getState, dispatch, drag),
	);
	const add = iconButton(ICON_PLUS, "Add stripe", () => {
		const first = getState().palette[0];
		if (!first) {
			return;
		}
		dispatch(addStripe(getState(), first.id), "structure");
	});
	add.disabled = state.palette.length === 0;
	const box = section("Stripes", rows, add);
	attachReorder(box, ".stripe-row", drag, (from, target) =>
		dispatch(moveStripe(getState(), from, target), "structure"),
	);
	return box;
}

function stripeRow(
	index: number,
	host: HTMLElement,
	getState: GetState,
	dispatch: Dispatch,
	drag: DragState,
): HTMLElement {
	const state = getState();
	const stripe = state.stripes[index];
	if (!stripe) {
		throw new Error(`no stripe at index ${index}`);
	}

	const box = document.createElement("div");
	box.className = "row stripe-row";
	box.append(
		dragHandle(index, box, host, drag),
		swatchGroup(state.palette, stripe, (colorId) => {
			dispatch(setStripeColor(getState(), index, colorId), "canvas");
		}),
		numberInput({
			value: stripe.thickness,
			current: () => getState().stripes[index]?.thickness ?? stripe.thickness,
			min: 0,
			ariaLabel: "stripe thickness",
			apply: (value) => {
				dispatch(setStripeThickness(getState(), index, value), "canvas");
			},
		}),
		iconButton(ICON_XMARK, "Remove stripe", () => {
			dispatch(removeStripe(getState(), index), "structure");
		}),
	);
	return box;
}

// The reorder handle; dragging it marks the source row, dragend clears
// the drop indicators.
function dragHandle(
	index: number,
	box: HTMLElement,
	host: HTMLElement,
	drag: DragState,
): HTMLElement {
	const handle = document.createElement("span");
	handle.className = "drag-handle nf";
	handle.textContent = ICON_BARS;
	handle.draggable = true;
	handle.title = "Drag to reorder";
	handle.addEventListener("dragstart", (event) => {
		event.dataTransfer?.setData("text/plain", String(index));
		drag.from = index;
		box.classList.add("dragging");
	});
	handle.addEventListener("dragend", () => {
		drag.from = null;
		box.classList.remove("dragging");
		clearDropIndicators(host);
	});
	return handle;
}

/** Remove every drop indicator under `host`. Shared by all reorder lists. */
export function clearDropIndicators(host: HTMLElement): void {
	for (const node of host.querySelectorAll(".drop-above, .drop-below")) {
		node.classList.remove("drop-above", "drop-below");
	}
}

/*
 * Show the drop indicator at the one gap the dragged row will land in:
 * on the top edge of the row that follows the insertion point, or on the
 * bottom edge of the last row when the item lands at the end. Drawing
 * the line from the target index — not from the hovered row — gives each
 * gap exactly one indicator, since hovering the bottom of row i and the
 * top of row i+1 resolve to the same target. A no-op drop shows nothing.
 * Shared by the stripe rows and the saved-pattern cards.
 */
export function showDropIndicator(
	host: HTMLElement,
	selector: string,
	from: number,
	target: number,
): void {
	if (target === from) {
		return;
	}
	const rows = [...host.querySelectorAll(selector)];
	// Post-removal target index t maps to the original row t when t < from
	// (rows before the removed one keep their indices) and t + 1 otherwise.
	const follower = target < from ? target : target + 1;
	const row = follower < rows.length ? rows[follower] : rows.at(-1);
	if (row) {
		row.classList.add(follower < rows.length ? "drop-above" : "drop-below");
	}
}

// Insertion index for dropping `from` above or below `row`, adjusted for
// the removal that the move itself performs. The result equals `from`
// when the drop reproduces the current order, making the move a no-op.
export function dropTargetIndex(
	from: number,
	row: number,
	below: boolean,
): number {
	const insert = below ? row + 1 : row;
	return from < insert ? insert - 1 : insert;
}

// One button per palette color; picking a swatch recolors the stripe.
// Native option popups cannot render colors, so the group is buttons.
function swatchGroup(
	palette: Color[],
	stripe: Stripe,
	onPick: (colorId: string) => void,
): HTMLElement {
	return selectGroup(
		"swatches",
		palette.map((color, index) => ({
			value: color,
			label: `use color ${index + 1}`,
			decorate: (button: HTMLButtonElement): void => {
				button.className = "swatch";
				button.dataset.colorId = color.id;
				button.style.backgroundColor = color.hex;
			},
		})),
		(color) => color.id === stripe.colorId,
		(color) => {
			onPick(color.id);
		},
	);
}

type SelectOption<T> = {
	value: T;
	label: string;
	decorate: (button: HTMLButtonElement) => void;
};

// A single-select group of buttons: the entry matching the current value
// is marked selected; picking an entry deselects the rest.
function selectGroup<T>(
	className: string,
	options: SelectOption<T>[],
	isSelected: (value: T) => boolean,
	onPick: (value: T) => void,
): HTMLElement {
	const group = document.createElement("div");
	group.className = className;
	const buttons: HTMLButtonElement[] = [];
	for (const option of options) {
		const toggle = document.createElement("button");
		toggle.type = "button";
		toggle.setAttribute("aria-label", option.label);
		option.decorate(toggle);
		if (isSelected(option.value)) {
			toggle.classList.add("selected");
			toggle.setAttribute("aria-pressed", "true");
		} else {
			toggle.setAttribute("aria-pressed", "false");
		}
		toggle.addEventListener("click", () => {
			for (const other of buttons) {
				other.classList.remove("selected");
				other.setAttribute("aria-pressed", "false");
			}
			toggle.classList.add("selected");
			toggle.setAttribute("aria-pressed", "true");
			onPick(option.value);
		});
		buttons.push(toggle);
		group.append(toggle);
	}
	return group;
}

// Toggle group over the preset options for a state field; picking an
// option dispatches through `onPick`.
function toggleGroup<T extends string | number>(
	options: [T, string, string][],
	value: T,
	onPick: (value: T) => void,
): HTMLElement {
	return selectGroup(
		"toggles",
		options.map(([optionValue, label, glyph]) => ({
			value: optionValue,
			label,
			decorate: (button: HTMLButtonElement): void => {
				button.className = "toggle nf";
				button.textContent = glyph;
				button.title = label;
			},
		})),
		(candidate) => candidate === value,
		onPick,
	);
}

function patternSection(
	state: PatternState,
	getState: GetState,
	dispatch: Dispatch,
): HTMLElement {
	const children = [
		fieldRow(
			"Repeat",
			toggleGroup(
				[
					["cycle", "cycle", ICON_REPEAT],
					["ping-pong", "ping-pong", ICON_EXCHANGE],
				],
				state.repeat,
				(value) => {
					dispatch(patchControls(getState(), { repeat: value }), "canvas");
				},
			),
		),
	];
	children.push(
		fieldRow(
			"Start",
			originGrid(state.origin, (value) => {
				const current = getState();
				// Flipping between edges and corners changes which rows the
				// panel shows; other picks only need the swatch redrawn.
				const kind =
					directionOf(current.origin) === directionOf(value)
						? "canvas"
						: "structure";
				dispatch(patchControls(current, { origin: value }), kind);
			}),
		),
	);
	if (directionOf(state.origin) === "diagonal") {
		children.push(angleRow(state, getState, dispatch));
	}
	return section("Pattern", children);
}

/**
 * Start grid: a 3x3 grid with the center omitted, one button per edge
 * and corner. Each arrow points toward the center, showing where
 * knitting starts; explicit grid coordinates place the buttons and
 * leave the center cell unoccupied.
 */
function originGrid(
	value: Origin,
	onPick: (value: Origin) => void,
): HTMLElement {
	// [origin, label, arrow glyph, "row / column"]
	const cells: [Origin, string, string, string][] = [
		["top-left", "start at top left", ICON_ARROW_DOWN_RIGHT, "1 / 1"],
		["top", "start at top", ICON_ARROW_DOWN, "1 / 2"],
		["top-right", "start at top right", ICON_ARROW_DOWN_LEFT, "1 / 3"],
		["left", "start at left", ICON_ARROW_RIGHT, "2 / 1"],
		["right", "start at right", ICON_ARROW_LEFT, "2 / 3"],
		["bottom-left", "start at bottom left", ICON_ARROW_UP_RIGHT, "3 / 1"],
		["bottom", "start at bottom", ICON_ARROW_UP, "3 / 2"],
		["bottom-right", "start at bottom right", ICON_ARROW_UP_LEFT, "3 / 3"],
	];
	return selectGroup(
		"origin-grid",
		cells.map(([origin, label, glyph, area]) => ({
			value: origin,
			label,
			decorate: (button: HTMLButtonElement): void => {
				button.className = "origin-toggle nf";
				button.textContent = glyph;
				button.title = label;
				button.style.gridArea = area;
			},
		})),
		(origin) => origin === value,
		onPick,
	);
}

// Preset angle buttons; only shown while the start is a corner.
function angleRow(
	state: PatternState,
	getState: GetState,
	dispatch: Dispatch,
): HTMLElement {
	return fieldRow(
		"Angle",
		toggleGroup(
			[
				[15, "15 degrees", "15\u{00b0}"],
				[30, "30 degrees", "30\u{00b0}"],
				[45, "45 degrees", "45\u{00b0}"],
				[60, "60 degrees", "60\u{00b0}"],
				[75, "75 degrees", "75\u{00b0}"],
			],
			state.angle,
			(value) => {
				dispatch(patchControls(getState(), { angle: value }), "canvas");
			},
		),
	);
}

function swatchSection(
	state: PatternState,
	getState: GetState,
	dispatch: Dispatch,
): HTMLElement {
	const widthInput = numberInput({
		value: state.swatch.width,
		current: () => getState().swatch.width,
		min: 1,
		ariaLabel: "Width (units)",
		apply: (value) => {
			dispatch(setSwatchSize(getState(), { width: value }), "canvas");
		},
	});
	const heightInput = numberInput({
		value: state.swatch.height,
		current: () => getState().swatch.height,
		min: 1,
		ariaLabel: "Height (units)",
		apply: (value) => {
			dispatch(setSwatchSize(getState(), { height: value }), "canvas");
		},
	});
	// One compact "width × height" row instead of two labeled fields.
	const times = document.createElement("span");
	times.className = "swatch-times";
	times.textContent = "\u{00d7}";
	const sizeRow = document.createElement("div");
	sizeRow.className = "row swatch-size";
	sizeRow.append(widthInput, times, heightInput);
	return section("Swatch", [sizeRow]);
}

// Theme picker anchored to the panel's bottom left corner; the choice
// dispatches the new theme, and the app owner applies it to the page
// chrome. The group renders as one multi-part pill with a single
// selected segment.
function themeSection(
	state: PatternState,
	getState: GetState,
	dispatch: Dispatch,
): HTMLElement {
	const box = document.createElement("section");
	box.className = "theme";
	box.append(
		toggleGroup(
			[
				["light", "light mode", ICON_SUN],
				["beige", "beige mode", ICON_SCROLL],
				["gruvbox", "gruvbox mode", ICON_MOUNTAIN],
				["dark", "dark mode", ICON_MOON],
			],
			state.theme,
			(value) => {
				dispatch(patchControls(getState(), { theme: value }), "canvas");
			},
		),
	);
	return box;
}

type NumberInputOptions = {
	value: number;
	current: () => number;
	min: number;
	ariaLabel: string;
	apply: (value: number) => void;
};

// Text input for a numeric state value; invalid input (empty,
// non-numeric, non-integer, below the minimum) falls back to the value
// `current` reads from state, instead of corrupting the pattern.
function numberInput(options: NumberInputOptions): HTMLInputElement {
	const input = document.createElement("input");
	input.type = "number";
	input.setAttribute("aria-label", options.ariaLabel);
	input.value = String(options.value);
	input.min = String(options.min);
	input.step = "1";
	input.addEventListener("change", () => {
		const parsed = Number(input.value);
		const valid =
			input.value !== "" && Number.isInteger(parsed) && parsed >= options.min;
		if (!valid) {
			input.value = String(options.current());
			return;
		}
		options.apply(parsed);
	});
	return input;
}

function fieldRow(labelText: string, control: HTMLElement): HTMLElement {
	const field = document.createElement("div");
	field.className = "field";
	const label = document.createElement("label");
	label.textContent = labelText;
	field.append(label, control);
	return field;
}

/*
 * One titled panel section. `controls` ride in the title row, right
 * of the heading, instead of trailing the content (the palette and
 * stripes add buttons): repeated clicks keep the button under the
 * cursor instead of shifting it as the list grows.
 */
function section(
	title: string,
	children: HTMLElement[],
	controls?: HTMLElement,
): HTMLElement {
	const heading = document.createElement("h2");
	heading.textContent = title;
	const box = document.createElement("section");
	if (controls) {
		const header = document.createElement("div");
		header.className = "section-header";
		header.append(heading, controls);
		box.append(header, ...children);
	} else {
		box.append(heading, ...children);
	}
	return box;
}

function row(className: string, ...children: HTMLElement[]): HTMLElement {
	const box = document.createElement("div");
	box.className = `row ${className}`;
	box.append(...children);
	return box;
}

// A button whose visible content is a nerd font glyph.
export function iconButton(
	glyph: string,
	label: string,
	onClick: () => void,
): HTMLButtonElement {
	const node = document.createElement("button");
	node.type = "button";
	node.className = "nf icon-button";
	node.textContent = glyph;
	node.setAttribute("aria-label", label);
	node.title = label;
	node.addEventListener("click", onClick);
	return node;
}
