import { afterEach, expect, test, vi } from "vitest";
import { mount } from "./main";

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
