import { describe, expect, test } from "vitest";
import type { PatternState } from "./model";
import { buildPanel, dropTargetIndex } from "./ui";

type Harness = {
	host: HTMLElement;
	getState(): PatternState;
	rebuild(): void;
};

// Fixture chosen here rather than imported: these tests assert panel
// behavior against a state they set up themselves, so they must stay
// green when the default demo state changes.
function testState(): PatternState {
	return {
		palette: [
			{ id: "a", hex: "#111111" },
			{ id: "b", hex: "#eeeeee" },
		],
		stripes: [
			{ colorId: "a", thickness: 3 },
			{ colorId: "b", thickness: 2 },
			{ colorId: "a", thickness: 1 },
		],
		repeat: "cycle",
		origin: "top",
		angle: 30,
		swatch: { width: 10, height: 20 },
		theme: "light",
	};
}

// Mirrors the app wiring: the panel dispatches next states and the
// harness owns the state variable, exactly as `mount` does.
function harness(): Harness {
	let state = testState();
	const host = document.createElement("div");
	const dispatch = (next: PatternState) => {
		state = next;
	};
	const build = () => {
		buildPanel(host, () => state, dispatch);
	};
	build();
	return {
		host,
		getState: () => state,
		rebuild: build,
	};
}

function buttons(host: HTMLElement, label: string): HTMLButtonElement[] {
	return [...host.querySelectorAll("button")].filter(
		(button) => button.getAttribute("aria-label") === label,
	);
}

function change(node: HTMLElement): void {
	node.dispatchEvent(new Event("change", { bubbles: true }));
}

function required<T>(value: T | null | undefined, message: string): T {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
}

function makeDragEvent(type: string, clientY: number): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "clientY", { value: clientY });
	return event;
}

// Rows stacked 24px apart, 20px tall: the target walk reads every row's
// rect, so all of them need a plausible geometry.
function stubRowRects(host: HTMLElement): void {
	for (const [index, row] of (
		[...host.querySelectorAll(".stripe-row")] as HTMLElement[]
	).entries()) {
		const top = index * 24;
		row.getBoundingClientRect = () =>
			({
				x: 0,
				y: top,
				top,
				left: 0,
				right: 0,
				bottom: top + 20,
				width: 250,
				height: 20,
				toJSON: () => ({}),
			}) as DOMRect;
	}
}

// The stripes section owns the drop wiring; row events bubble into it.
function stripesSection(host: HTMLElement): HTMLElement {
	const row = host.querySelector(".stripe-row");
	if (!row) {
		throw new Error("missing stripe row");
	}
	const box = row.closest("section");
	if (!box) {
		throw new Error("missing stripes section");
	}
	return box;
}

describe("dropTargetIndex", () => {
	test("dropping below a later row inserts after it", () => {
		expect(dropTargetIndex(0, 1, true)).toBe(1);
	});

	test("dropping above an earlier row inserts before it", () => {
		expect(dropTargetIndex(2, 0, false)).toBe(0);
	});

	test("drops that reproduce the current order are no-ops", () => {
		expect(dropTargetIndex(1, 0, true)).toBe(1);
		expect(dropTargetIndex(1, 2, false)).toBe(1);
	});
});

describe("buildPanel structure", () => {
	test("renders a palette row and a stripe row per entry", () => {
		const t = harness();
		expect(t.host.querySelectorAll(".palette-row")).toHaveLength(
			t.getState().palette.length,
		);
		expect(t.host.querySelectorAll(".stripe-row")).toHaveLength(
			t.getState().stripes.length,
		);
	});

	test("the theme section anchors after the scrolling content", () => {
		const t = harness();
		const scroll = required(t.host.querySelector(".panel-scroll"), "missing");
		expect(scroll.querySelectorAll("section")).toHaveLength(4);
		const footer = t.host.lastElementChild;
		expect(footer?.querySelector('button[aria-label="dark mode"]')).not.toBe(
			null,
		);
	});
});

describe("palette editing", () => {
	test("add color appends to the palette", () => {
		const t = harness();
		const before = t.getState().palette.length;
		buttons(t.host, "Add color")[0]?.click();
		expect(t.getState().palette).toHaveLength(before + 1);
	});

	test("removing a color also removes its stripes", () => {
		const t = harness();
		const color = t.getState().palette[0];
		expect(color).toBeDefined();
		const remove = t.host.querySelectorAll<HTMLButtonElement>(
			".palette-row button",
		)[0];
		expect(remove).toBeDefined();
		remove?.click();
		expect(t.getState().palette).toHaveLength(1);
		expect(
			t.getState().stripes.every((stripe) => stripe.colorId !== color?.id),
		).toBe(true);
		// Only the one stripe in the other color survives.
		expect(t.getState().stripes).toHaveLength(1);
	});

	test("an invalid hex falls back to the current color", () => {
		const t = harness();
		const hex = required(
			t.host.querySelectorAll<HTMLInputElement>(
				".palette-row input[type=text]",
			)[0],
			"missing hex input",
		);
		const before = t.getState().palette[0]?.hex;
		hex.value = "not-a-color";
		change(hex);
		expect(t.getState().palette[0]?.hex).toBe(before);
	});

	test("editing a palette color repaints the stripe swatches immediately", () => {
		const t = harness();
		const hex = required(
			t.host.querySelectorAll<HTMLInputElement>(
				".palette-row input[type=text]",
			)[0],
			"missing hex input",
		);
		const swatch = required(
			t.host.querySelector<HTMLElement>(
				'.stripe-row .swatch[data-color-id="a"]',
			),
			"missing stripe swatch",
		);
		expect(swatch.getAttribute("style") ?? "").toContain("#111111");

		hex.value = "#0a0a0a";
		change(hex);
		expect(t.getState().palette[0]?.hex).toBe("#0a0a0a");
		expect(swatch.getAttribute("style") ?? "").toContain("#0a0a0a");
	});
});

describe("stripe editing", () => {
	test("add stripe appends a unit stripe in the first color", () => {
		const t = harness();
		buttons(t.host, "Add stripe")[0]?.click();
		expect(t.getState().stripes).toHaveLength(4);
		expect(t.getState().stripes.at(-1)).toEqual({
			colorId: t.getState().palette[0]?.id,
			thickness: 1,
		});
	});

	test("dragging a stripe below the next row reorders the sequence", () => {
		const t = harness();
		const rows = () =>
			[...t.host.querySelectorAll(".stripe-row")] as HTMLElement[];
		const box = stripesSection(t.host);
		stubRowRects(t.host);
		const first = required(rows()[0], "missing row");
		const handle = required(
			first.querySelector(".drag-handle"),
			"missing drag handle",
		);
		handle.dispatchEvent(new Event("dragstart", { bubbles: true }));

		// Row 1 spans y 24..44 (midpoint 34); y=35 is its lower half, so
		// the drop lands between rows 1 and 2.
		box.dispatchEvent(makeDragEvent("dragover", 35));
		expect(
			required(rows()[2], "missing row").classList.contains("drop-above"),
		).toBe(true);

		box.dispatchEvent(makeDragEvent("drop", 35));
		expect(t.getState().stripes.map((stripe) => stripe.colorId)).toEqual([
			"b",
			"a",
			"a",
		]);
	});

	test("dragging a stripe above an earlier row reorders the sequence", () => {
		const t = harness();
		const rows = () =>
			[...t.host.querySelectorAll(".stripe-row")] as HTMLElement[];
		const box = stripesSection(t.host);
		stubRowRects(t.host);
		const third = required(rows()[2], "missing row");
		const handle = required(
			third.querySelector(".drag-handle"),
			"missing drag handle",
		);
		handle.dispatchEvent(new Event("dragstart", { bubbles: true }));

		// Above row 0's midpoint (10) inserts before row 0.
		box.dispatchEvent(makeDragEvent("dragover", 5));
		expect(
			required(rows()[0], "missing row").classList.contains("drop-above"),
		).toBe(true);

		box.dispatchEvent(makeDragEvent("drop", 5));
		expect(
			t.getState().stripes.map(({ colorId, thickness }) => ({
				colorId,
				thickness,
			})),
		).toEqual([
			{ colorId: "a", thickness: 1 },
			{ colorId: "a", thickness: 3 },
			{ colorId: "b", thickness: 2 },
		]);
	});

	test("dropping below the last row appends the stripe", () => {
		const t = harness();
		const rows = () =>
			[...t.host.querySelectorAll(".stripe-row")] as HTMLElement[];
		const box = stripesSection(t.host);
		stubRowRects(t.host);
		const first = required(rows()[0], "missing row");
		const handle = required(
			first.querySelector(".drag-handle"),
			"missing drag handle",
		);
		handle.dispatchEvent(new Event("dragstart", { bubbles: true }));

		// Past the last row's midpoint (58) targets the end: the line
		// lands on the last row's bottom edge.
		box.dispatchEvent(makeDragEvent("dragover", 100));
		expect(
			required(rows()[2], "missing row").classList.contains("drop-below"),
		).toBe(true);

		box.dispatchEvent(makeDragEvent("drop", 100));
		expect(
			t.getState().stripes.map(({ colorId, thickness }) => ({
				colorId,
				thickness,
			})),
		).toEqual([
			{ colorId: "b", thickness: 2 },
			{ colorId: "a", thickness: 1 },
			{ colorId: "a", thickness: 3 },
		]);
	});

	test("dropping above the first row moves the stripe to the front", () => {
		const t = harness();
		const box = stripesSection(t.host);
		stubRowRects(t.host);
		// The middle stripe drags to the very front.
		const rows = () =>
			[...t.host.querySelectorAll(".stripe-row")] as HTMLElement[];
		required(rows()[1], "missing row")
			.querySelector(".drag-handle")
			?.dispatchEvent(new Event("dragstart", { bubbles: true }));

		box.dispatchEvent(makeDragEvent("drop", -10));
		expect(
			t.getState().stripes.map(({ colorId, thickness }) => ({
				colorId,
				thickness,
			})),
		).toEqual([
			{ colorId: "b", thickness: 2 },
			{ colorId: "a", thickness: 3 },
			{ colorId: "a", thickness: 1 },
		]);
	});

	test("dropping a stripe on its own row is a no-op", () => {
		const t = harness();
		const box = stripesSection(t.host);
		stubRowRects(t.host);
		const handle = required(
			t.host.querySelector(".stripe-row .drag-handle"),
			"missing drag handle",
		);
		handle.dispatchEvent(new Event("dragstart", { bubbles: true }));

		// Within row 0 (y 0..20): the drop cancels out and nothing moves.
		box.dispatchEvent(makeDragEvent("dragover", 10));
		expect(t.host.querySelectorAll(".drop-above, .drop-below")).toHaveLength(0);
		box.dispatchEvent(makeDragEvent("drop", 10));
		expect(
			t.getState().stripes.map(({ colorId, thickness }) => ({
				colorId,
				thickness,
			})),
		).toEqual([
			{ colorId: "a", thickness: 3 },
			{ colorId: "b", thickness: 2 },
			{ colorId: "a", thickness: 1 },
		]);
	});

	test("an aborted drag clears the dragging and drop indicators", () => {
		const t = harness();
		const rows = () =>
			[...t.host.querySelectorAll(".stripe-row")] as HTMLElement[];
		const box = stripesSection(t.host);
		stubRowRects(t.host);
		const first = required(rows()[0], "missing row");
		const handle = required(
			first.querySelector(".drag-handle"),
			"missing drag handle",
		);
		handle.dispatchEvent(new Event("dragstart", { bubbles: true }));
		box.dispatchEvent(makeDragEvent("dragover", 35));
		expect(first.classList.contains("dragging")).toBe(true);
		expect(
			required(rows()[2], "missing row").classList.contains("drop-above"),
		).toBe(true);

		handle.dispatchEvent(new Event("dragend", { bubbles: true }));
		expect(first.classList.contains("dragging")).toBe(false);
		expect(t.host.querySelectorAll(".drop-above, .drop-below")).toHaveLength(0);
	});

	test("the remove button still deletes a stripe", () => {
		const t = harness();
		const rows = () =>
			[...t.host.querySelectorAll(".stripe-row")] as HTMLElement[];
		buttons(required(rows()[0], "missing row"), "Remove stripe")[0]?.click();
		expect(t.getState().stripes).toHaveLength(2);
		expect(t.getState().stripes[0]?.colorId).toBe("b");
	});

	test("color swatches render per palette color and clicking one selects it", () => {
		const t = harness();
		const firstRow = required(
			t.host.querySelector(".stripe-row"),
			"missing stripe row",
		);
		const swatches = [
			...firstRow.querySelectorAll<HTMLButtonElement>(".swatch"),
		];
		expect(swatches).toHaveLength(t.getState().palette.length);
		expect(swatches[0]?.getAttribute("style") ?? "").toContain("#111111");
		// The first stripe uses the first color, so its swatch is selected.
		expect(t.getState().stripes[0]?.colorId).toBe(t.getState().palette[0]?.id);
		expect(swatches[0]?.classList.contains("selected")).toBe(true);
		expect(swatches[1]?.classList.contains("selected")).toBe(false);

		swatches[1]?.click();
		expect(t.getState().stripes[0]?.colorId).toBe(t.getState().palette[1]?.id);
		expect(swatches[1]?.classList.contains("selected")).toBe(true);
		expect(swatches[0]?.classList.contains("selected")).toBe(false);
	});

	test("invalid thickness input falls back to the last valid value", () => {
		const t = harness();
		const thickness = required(
			t.host.querySelectorAll<HTMLInputElement>(
				'.stripe-row input[type=number][aria-label="stripe thickness"]',
			)[0],
			"missing thickness input",
		);
		// Invalid input before any edit falls back to the current value.
		for (const bad of ["-4", "2.5", ""]) {
			thickness.value = bad;
			change(thickness);
			expect(t.getState().stripes[0]?.thickness).toBe(3);
		}
		// After a valid edit, later invalid input (including empty)
		// falls back to that last valid value.
		thickness.value = "5";
		change(thickness);
		expect(t.getState().stripes[0]?.thickness).toBe(5);
		for (const bad of ["-1", ""]) {
			thickness.value = bad;
			change(thickness);
			expect(t.getState().stripes[0]?.thickness).toBe(5);
		}
	});

	test("add stripe is disabled when the palette is empty", () => {
		const state = { ...testState(), palette: [] };
		const host = document.createElement("div");
		buildPanel(
			host,
			() => state,
			() => {},
		);
		expect(buttons(host, "Add stripe")[0]?.disabled).toBe(true);
	});
});

describe("pattern controls", () => {
	test("the repeat group renders one selected toggle", () => {
		const t = harness();
		const cycle = required(buttons(t.host, "cycle")[0], "missing cycle");
		expect(cycle.classList.contains("selected")).toBe(true);
		expect(
			buttons(t.host, "ping-pong")[0]?.classList.contains("selected"),
		).toBe(false);
	});

	test("the start grid renders one selected button per origin", () => {
		const t = harness();
		const labels = [
			"start at top left",
			"start at top",
			"start at top right",
			"start at left",
			"start at right",
			"start at bottom left",
			"start at bottom",
			"start at bottom right",
		];
		// Exactly one arrow button per origin, all inside the grid.
		for (const label of labels) {
			expect(buttons(t.host, label)).toHaveLength(1);
		}
		// The fixture starts at the top edge; every other origin is
		// unselected.
		expect(
			buttons(t.host, "start at top")[0]?.classList.contains("selected"),
		).toBe(true);
		for (const label of labels.filter((label) => label !== "start at top")) {
			expect(buttons(t.host, label)[0]?.classList.contains("selected")).toBe(
				false,
			);
		}
	});

	test("switching the start updates state and the selection", () => {
		const t = harness();
		buttons(t.host, "start at bottom")[0]?.click();
		expect(t.getState().origin).toBe("bottom");
		expect(
			buttons(t.host, "start at bottom")[0]?.classList.contains("selected"),
		).toBe(true);
	});

	test("switching repeat to ping-pong updates state", () => {
		const t = harness();
		buttons(t.host, "ping-pong")[0]?.click();
		expect(t.getState().repeat).toBe("ping-pong");
	});

	test("switching to a corner reveals the preset angle buttons", () => {
		const t = harness();
		expect(buttons(t.host, "30 degrees")).toHaveLength(0);
		buttons(t.host, "start at top right")[0]?.click();
		expect(t.getState().origin).toBe("top-right");
		// Structure change: rebuild the panel explicitly.
		t.rebuild();
		expect(buttons(t.host, "30 degrees")).toHaveLength(1);
		expect(
			buttons(t.host, "30 degrees")[0]?.classList.contains("selected"),
		).toBe(true);
	});

	test("selecting an angle preset updates state", () => {
		const t = harness();
		buttons(t.host, "start at top right")[0]?.click();
		t.rebuild();
		buttons(t.host, "45 degrees")[0]?.click();
		expect(t.getState().angle).toBe(45);
		expect(
			buttons(t.host, "45 degrees")[0]?.classList.contains("selected"),
		).toBe(true);
		expect(
			buttons(t.host, "30 degrees")[0]?.classList.contains("selected"),
		).toBe(false);
	});
});

describe("theme controls", () => {
	test("the theme group renders four toggles with light selected", () => {
		const t = harness();
		expect(
			buttons(t.host, "light mode")[0]?.classList.contains("selected"),
		).toBe(true);
		expect(buttons(t.host, "beige mode")).toHaveLength(1);
		expect(
			buttons(t.host, "gruvbox mode")[0]?.classList.contains("selected"),
		).toBe(false);
		expect(buttons(t.host, "dark mode")).toHaveLength(1);
	});

	test("switching theme dispatches the new theme", () => {
		const t = harness();
		buttons(t.host, "gruvbox mode")[0]?.click();
		expect(t.getState().theme).toBe("gruvbox");
	});
});

describe("swatch controls", () => {
	test("resizing the swatch updates state", () => {
		const t = harness();
		const width = required(
			t.host.querySelector<HTMLInputElement>(
				'input[aria-label="Width (units)"]',
			),
			"missing width input",
		);
		width.value = "25";
		change(width);
		expect(t.getState().swatch.width).toBe(25);
	});
});
