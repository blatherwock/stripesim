import { afterEach, expect, test, vi } from "vitest";
import { mount } from "./main";
import { defaultState, type PatternParams, paramsOf } from "./model";
import { serializeSaved } from "./saved";
import { hashForPattern, queryForPattern } from "./share";

// Happy-dom reports no layout, so the pane's size is stubbed explicitly
// and the fitted canvas size is asserted instead of observed.
function stubPaneSize(target: HTMLElement, width: number, height: number) {
	const pane = target.querySelector(".pane");
	if (!pane) {
		throw new Error("missing pane");
	}
	Object.defineProperty(pane, "clientWidth", { get: () => width });
	Object.defineProperty(pane, "clientHeight", { get: () => height });
	return pane;
}

function canvasOf(target: HTMLElement): HTMLCanvasElement {
	const canvas = target.querySelector("canvas");
	if (!canvas) {
		throw new Error("missing canvas");
	}
	return canvas;
}

test("mount builds the app layout inside the target", () => {
	const target = document.createElement("div");
	mount(target);

	const layout = target.querySelector(".app");
	expect(layout).not.toBeNull();
	expect(layout?.querySelector(".panel")).not.toBeNull();

	const pane = layout?.querySelector(".pane");
	expect(pane?.querySelector("canvas")).not.toBeNull();
});

test("mount starts in the dark theme when the browser prefers dark", () => {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query === "(prefers-color-scheme: dark)",
	}));
	const target = document.createElement("div");
	mount(target);
	expect(document.body.dataset.theme).toBe("dark");
});

test("mount starts in the light theme when the browser prefers light", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);
	expect(document.body.dataset.theme).toBe("light");
});

afterEach(() => {
	vi.unstubAllGlobals();
	// `mount` persists theme, saved cards, and the sidebar state in the
	// shared window storage, and the working pattern in the shared
	// URL; leave both clean for the next test.
	window.localStorage.clear();
	history.replaceState(null, "", location.pathname);
});

test("a control change re-renders the fitted canvas", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);
	stubPaneSize(target, 400, 300);

	// Default 10x100 swatch in a 400x300 pane: height limits, fit 3
	// units, 85% of that, so 10 units wide is ~26px.
	const width = target.querySelector<HTMLInputElement>(
		'input[aria-label="Width (units)"]',
	);
	if (!width) {
		throw new Error("missing width input");
	}
	width.value = "200";
	width.dispatchEvent(new Event("change", { bubbles: true }));

	// Width-limited now: 400/200 = 2 units fit, 85% of that, so 200
	// units wide is 340px and 100 units tall is 170px.
	const canvas = canvasOf(target);
	expect(canvas.width).toBe(340);
	expect(canvas.height).toBe(170);
});

test("a structural change rebuilds the panel", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);
	const before = target.querySelectorAll(".palette-row").length;

	const add = target.querySelector<HTMLButtonElement>(
		'button[aria-label="Add color"]',
	);
	if (!add) {
		throw new Error("missing add color button");
	}
	add.click();

	expect(target.querySelectorAll(".palette-row").length).toBe(before + 1);
});

// ResizeObserver the tests can trigger by hand; happy-dom ships one
// that never fires callbacks.
class FakeResizeObserver {
	static instances: FakeResizeObserver[] = [];
	observed: Element[] = [];
	disconnected = false;
	constructor(public callback: ResizeObserverCallback) {
		FakeResizeObserver.instances.push(this);
	}
	observe(element: Element): void {
		this.observed.push(element);
	}
	disconnect(): void {
		this.disconnected = true;
	}
}

function paneObserver(): FakeResizeObserver {
	const observer = FakeResizeObserver.instances.at(-1);
	if (!observer) {
		throw new Error("missing pane observer");
	}
	return observer;
}

test("a pane resize re-fits the canvas", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	vi.stubGlobal("ResizeObserver", FakeResizeObserver);
	const target = document.createElement("div");
	mount(target);
	const canvas = canvasOf(target);

	const pane = stubPaneSize(target, 400, 300);
	// The observer watches the pane itself, not the window.
	expect(paneObserver().observed).toContain(pane);

	paneObserver().callback([], paneObserver() as unknown as ResizeObserver);

	// 10x100 swatch, height-limited at 300px: fit 3, 85% -> 255px tall.
	expect(canvas.height).toBe(255);
});

test("a theme switch from the panel reaches the page chrome", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);

	const toggle = target.querySelector<HTMLButtonElement>(
		'button[aria-label="gruvbox mode"]',
	);
	if (!toggle) {
		throw new Error("missing theme toggle");
	}
	toggle.click();

	expect(document.body.dataset.theme).toBe("gruvbox");
});

test("dispose disconnects the pane observer", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	vi.stubGlobal("ResizeObserver", FakeResizeObserver);
	const target = document.createElement("div");
	const dispose = mount(target);
	expect(paneObserver().disconnected).toBe(false);
	dispose();
	expect(paneObserver().disconnected).toBe(true);
});

function sidebarButton(target: HTMLElement, label: string): HTMLButtonElement {
	const button = target.querySelector<HTMLButtonElement>(
		`button[aria-label="${label}"]`,
	);
	if (!button) {
		throw new Error(`missing ${label} button`);
	}
	return button;
}

test("the saved list starts empty and a save adds a card", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);
	expect(target.querySelectorAll(".card")).toHaveLength(0);

	sidebarButton(target, "Save pattern").click();
	expect(target.querySelectorAll(".card")).toHaveLength(1);
});

test("a saved card restores its pattern and keeps the theme", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);

	const width = target.querySelector<HTMLInputElement>(
		'input[aria-label="Width (units)"]',
	);
	if (!width) {
		throw new Error("missing width input");
	}
	width.value = "40";
	width.dispatchEvent(new Event("change", { bubbles: true }));
	sidebarButton(target, "Save pattern").click();

	width.value = "80";
	width.dispatchEvent(new Event("change", { bubbles: true }));
	sidebarButton(target, "gruvbox mode").click();

	const card = target.querySelector<HTMLElement>(".card");
	if (!card) {
		throw new Error("missing saved card");
	}
	card.click();

	const restored = target.querySelector<HTMLInputElement>(
		'input[aria-label="Width (units)"]',
	);
	expect(restored?.value).toBe("40");
	// Restoring a card never switches the page theme.
	expect(document.body.dataset.theme).toBe("gruvbox");
	// The restore leaves the card in the list.
	expect(target.querySelectorAll(".card")).toHaveLength(1);
});

test("saved cards survive a reload", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const first = document.createElement("div");
	mount(first);
	sidebarButton(first, "Save pattern").click();
	sidebarButton(first, "Save pattern").click();

	const reloaded = document.createElement("div");
	mount(reloaded);
	expect(reloaded.querySelectorAll(".card")).toHaveLength(2);
});

test("the theme survives a reload", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const first = document.createElement("div");
	mount(first);
	sidebarButton(first, "gruvbox mode").click();

	const reloaded = document.createElement("div");
	mount(reloaded);
	expect(document.body.dataset.theme).toBe("gruvbox");
});

test("the theme ignores an invalid stored value", () => {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query === "(prefers-color-scheme: dark)",
	}));
	window.localStorage.setItem("stripe-planner.theme", "solarized");
	const target = document.createElement("div");
	mount(target);
	expect(document.body.dataset.theme).toBe("dark");
});

test("the collapsed state persists and expands again", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const first = document.createElement("div");
	mount(first);
	sidebarButton(first, "Hide saved list").click();
	expect(first.querySelector(".sidebar")?.classList.contains("collapsed")).toBe(
		true,
	);

	const reloaded = document.createElement("div");
	mount(reloaded);
	expect(
		reloaded.querySelector(".sidebar")?.classList.contains("collapsed"),
	).toBe(true);

	sidebarButton(reloaded, "Show saved list").click();
	expect(
		reloaded.querySelector(".sidebar")?.classList.contains("collapsed"),
	).toBe(false);
});

test("a missing collapsed-state value starts the sidebar expanded", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);
	expect(
		target.querySelector(".sidebar")?.classList.contains("collapsed"),
	).toBe(false);
});

test("a failed save write adds no card and disables the save buttons", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	vi.stubGlobal("localStorage", {
		getItem: () => null,
		setItem: () => {
			throw new Error("quota exceeded");
		},
	});
	const target = document.createElement("div");
	mount(target);

	sidebarButton(target, "Save pattern").click();
	expect(target.querySelectorAll(".card")).toHaveLength(0);
	expect(sidebarButton(target, "Save pattern").disabled).toBe(true);
});

test("importing a file appends its patterns after the saved cards", async () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);
	sidebarButton(target, "Save pattern").click();
	expect(target.querySelectorAll(".card")).toHaveLength(1);

	// A 20x20 swatch pattern, distinct from the default 10x100 save.
	const imported: { params: PatternParams } = {
		params: {
			palette: [{ id: "red", hex: "#cc0000" }],
			stripes: [{ colorId: "red", thickness: 1 }],
			repeat: "cycle",
			origin: "top",
			angle: 45,
			swatch: { width: 20, height: 20 },
		},
	};
	const input = target.querySelector<HTMLInputElement>('input[type="file"]');
	if (!input) {
		throw new Error("missing file input");
	}
	Object.defineProperty(input, "files", {
		value: [
			new File(
				[serializeSaved([{ id: "imported", params: imported.params }])],
				"patterns.json",
				{ type: "application/json" },
			),
		],
		configurable: true,
	});
	input.dispatchEvent(new Event("change", { bubbles: true }));
	await vi.waitFor(() => {
		if (!target.querySelector(".modal")) {
			throw new Error("modal not open");
		}
	});
	sidebarButton(target, "Add saved patterns").click();

	const cards = [...target.querySelectorAll(".card")] as HTMLElement[];
	expect(cards).toHaveLength(2);
	// The imported card landed after the existing one: its thumbnail
	// fits a square swatch, the default save stays a tall thin strip.
	expect(cards[0]?.querySelector("canvas")).toHaveProperty("width", 8);
	expect(cards[1]?.querySelector("canvas")).toHaveProperty("width", 84);
	expect(cards[1]?.querySelector("canvas")).toHaveProperty("height", 84);
});

test("appending the same file twice keeps the copies distinct", async () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);

	const imported: { params: PatternParams } = {
		params: {
			palette: [{ id: "red", hex: "#cc0000" }],
			stripes: [{ colorId: "red", thickness: 1 }],
			repeat: "cycle",
			origin: "top",
			angle: 45,
			swatch: { width: 20, height: 20 },
		},
	};

	async function appendFile(): Promise<void> {
		const input = target.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) {
			throw new Error("missing file input");
		}
		Object.defineProperty(input, "files", {
			value: [
				new File(
					[
						serializeSaved([
							{ id: crypto.randomUUID(), params: imported.params },
						]),
					],
					"patterns.spp",
					{ type: "application/octet-stream" },
				),
			],
			configurable: true,
		});
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			if (!target.querySelector(".modal")) {
				throw new Error("modal not open");
			}
		});
		sidebarButton(target, "Add saved patterns").click();
	}

	await appendFile();
	await appendFile();
	expect(target.querySelectorAll(".card")).toHaveLength(2);

	// Deleting one copy leaves the other: each entry minted its own id
	// on entering the list, identical parameters notwithstanding.
	const first = target.querySelector(".card");
	if (!first) {
		throw new Error("missing card");
	}
	const remove = first.querySelector<HTMLButtonElement>(
		'button[aria-label="Delete saved pattern"]',
	);
	if (!remove) {
		throw new Error("missing delete button");
	}
	remove.click();
	expect(target.querySelectorAll(".card")).toHaveLength(1);
});

test("the working set survives a reload", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const first = document.createElement("div");
	mount(first);
	const width = first.querySelector<HTMLInputElement>(
		'input[aria-label="Width (units)"]',
	);
	if (!width) {
		throw new Error("missing width input");
	}
	width.value = "80";
	width.dispatchEvent(new Event("change", { bubbles: true }));

	const reloaded = document.createElement("div");
	mount(reloaded);
	const restored = reloaded.querySelector<HTMLInputElement>(
		'input[aria-label="Width (units)"]',
	);
	expect(restored?.value).toBe("80");
});

test("an invalid query pattern loads the default pattern", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	Object.defineProperty(location, "search", {
		value: "?p=nonsense",
		configurable: true,
	});
	try {
		const target = document.createElement("div");
		mount(target);
		const width = target.querySelector<HTMLInputElement>(
			'input[aria-label="Width (units)"]',
		);
		expect(width?.value).toBe("10");
	} finally {
		delete (location as { search?: string }).search;
	}
});

test("reset restores the default pattern, keeping the theme and saves", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);
	sidebarButton(target, "Save pattern").click();
	sidebarButton(target, "gruvbox mode").click();
	const width = target.querySelector<HTMLInputElement>(
		'input[aria-label="Width (units)"]',
	);
	if (!width) {
		throw new Error("missing width input");
	}
	width.value = "80";
	width.dispatchEvent(new Event("change", { bubbles: true }));

	sidebarButton(target, "Reset to default pattern").click();

	const restored = target.querySelector<HTMLInputElement>(
		'input[aria-label="Width (units)"]',
	);
	expect(restored?.value).toBe("10");
	expect(document.body.dataset.theme).toBe("gruvbox");
	expect(target.querySelectorAll(".card")).toHaveLength(1);

	// The reset persists: a reload starts from the default pattern.
	const reloaded = document.createElement("div");
	mount(reloaded);
	const reloadedWidth = reloaded.querySelector<HTMLInputElement>(
		'input[aria-label="Width (units)"]',
	);
	expect(reloadedWidth?.value).toBe("10");
});

test("a query pattern beats a share hash", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	// A 80-unit pattern in the query, the default in the fragment:
	// the query is newer, so it wins.
	const target = document.createElement("div");
	Object.defineProperty(location, "search", {
		value: queryForPattern({
			...paramsOf(defaultState()),
			swatch: { width: 80, height: 100 },
		}),
		configurable: true,
	});
	Object.defineProperty(location, "hash", {
		value: hashForPattern(paramsOf(defaultState())),
		configurable: true,
	});
	try {
		mount(target);
		const width = target.querySelector<HTMLInputElement>(
			'input[aria-label="Width (units)"]',
		);
		expect(width?.value).toBe("80");
	} finally {
		delete (location as { search?: string }).search;
		delete (location as { hash?: string }).hash;
	}
});

test("the history buttons walk the session history", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);

	const buttons = () => ({
		back: target.querySelector<HTMLButtonElement>(
			'button[aria-label="Back one change"]',
		) as HTMLButtonElement,
		forward: target.querySelector<HTMLButtonElement>(
			'button[aria-label="Forward one change"]',
		) as HTMLButtonElement,
		width: target.querySelector<HTMLInputElement>(
			'input[aria-label="Width (units)"]',
		) as HTMLInputElement,
	});

	// Fresh mount: no history to move through.
	const fresh = buttons();
	expect(fresh.back.disabled).toBe(true);
	expect(fresh.forward.disabled).toBe(true);

	fresh.width.value = "80";
	fresh.width.dispatchEvent(new Event("change", { bubbles: true }));
	const afterEdit = buttons();
	expect(afterEdit.back.disabled).toBe(false);

	afterEdit.back.click();
	const afterBack = buttons();
	expect(afterBack.width.value).toBe("10");
	// The URL reflects the walked-to state.
	expect(location.search).toBe(queryForPattern(paramsOf(defaultState())));
	expect(afterBack.forward.disabled).toBe(false);

	afterBack.forward.click();
	const afterForward = buttons();
	expect(afterForward.width.value).toBe("80");
	expect(afterForward.forward.disabled).toBe(true);
});

test("an edit while back prunes the forward path", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	const target = document.createElement("div");
	mount(target);

	const buttons = () => ({
		back: target.querySelector<HTMLButtonElement>(
			'button[aria-label="Back one change"]',
		) as HTMLButtonElement,
		forward: target.querySelector<HTMLButtonElement>(
			'button[aria-label="Forward one change"]',
		) as HTMLButtonElement,
		width: target.querySelector<HTMLInputElement>(
			'input[aria-label="Width (units)"]',
		) as HTMLInputElement,
	});

	buttons().width.value = "80";
	buttons().width.dispatchEvent(new Event("change", { bubbles: true }));
	const afterEdit = buttons();
	afterEdit.back.click();
	expect(buttons().width.value).toBe("10");

	// The new edit replaces the future: forward stays disabled.
	buttons().width.value = "60";
	buttons().width.dispatchEvent(new Event("change", { bubbles: true }));
	expect(buttons().forward.disabled).toBe(true);
	expect(buttons().width.value).toBe("60");
	buttons().back.click();
	expect(buttons().width.value).toBe("10");
	buttons().forward.click();
	expect(buttons().width.value).toBe("60");
});
