import { describe, expect, test, vi } from "vitest";
import type { PatternParams } from "./model";
import type { SavedPattern } from "./saved";
import { serializeSaved } from "./saved";
import { decodePattern } from "./share";
import { buildSidebar, type SavedChange, type SidebarDeps } from "./sidebar";

// Three cards with distinct swatch shapes, so a wrong card's thumbnail
// shows up in assertions. Cards hold pattern parameters only.
function savedList(): SavedPattern[] {
	const params = (width: number, height: number): PatternParams => ({
		palette: [{ id: "a", hex: "#2563eb" }],
		stripes: [{ colorId: "a", thickness: 2 }],
		repeat: "cycle",
		origin: "bottom",
		angle: 45,
		swatch: { width, height },
	});
	return [
		{ id: "card-0", params: params(10, 100) },
		{ id: "card-1", params: params(50, 50) },
		{ id: "card-2", params: params(100, 10) },
	];
}

type Harness = {
	host: HTMLElement;
	changes: SavedChange[];
	rebuild(): void;
	setCollapsed(collapsed: boolean): void;
	setCanSave(canSave: boolean): void;
};

// Mirrors the app wiring: the sidebar reads state and list through
// deps and records every intent for the owner to apply.
function harness(): Harness {
	const changes: SavedChange[] = [];
	let collapsed = false;
	let canSave = true;
	const deps: SidebarDeps = {
		getList: savedList,
		isCollapsed: () => collapsed,
		canSave: () => canSave,
		onChange: (change) => {
			changes.push(change);
		},
	};
	const host = document.createElement("aside");
	const build = () => {
		buildSidebar(host, deps);
	};
	build();
	return {
		host,
		changes,
		rebuild: build,
		setCollapsed: (value: boolean) => {
			collapsed = value;
		},
		setCanSave: (value: boolean) => {
			canSave = value;
		},
	};
}

function buttons(host: HTMLElement, label: string): HTMLButtonElement[] {
	return [...host.querySelectorAll("button")].filter(
		(button) => button.getAttribute("aria-label") === label,
	);
}

function click(node: HTMLElement): void {
	node.dispatchEvent(new Event("click", { bubbles: true }));
}

function cards(host: HTMLElement): HTMLElement[] {
	return [...host.querySelectorAll(".card")] as HTMLElement[];
}

function makeDragEvent(type: string, clientY: number): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "clientY", { value: clientY });
	return event;
}

// Cards stacked 100px apart, 80px tall, so the target walk reads a
// plausible geometry for every card.
function stubCardRects(host: HTMLElement): void {
	for (const [index, node] of cards(host).entries()) {
		const top = index * 100;
		node.getBoundingClientRect = () =>
			({
				x: 0,
				y: top,
				top,
				left: 0,
				right: 0,
				bottom: top + 80,
				width: 126,
				height: 80,
				toJSON: () => ({}),
			}) as DOMRect;
	}
}

// Compare decoded patterns by content: the codec mints fresh ids,
// so a deep equal on ids would fail by design.
function contentOf(patterns: readonly PatternParams[]) {
	return patterns.map((p) => ({
		hexes: p.palette.map((c) => c.hex),
		stripes: p.stripes.map((s) => ({
			hex: p.palette.find((c) => c.id === s.colorId)?.hex,
			thickness: s.thickness,
		})),
		repeat: p.repeat,
		origin: p.origin,
		angle: p.angle,
		swatch: p.swatch,
	}));
}
describe("sidebar structure", () => {
	test("renders the header buttons and one card per saved pattern", () => {
		const t = harness();
		expect(buttons(t.host, "Save pattern")).toHaveLength(1);
		expect(buttons(t.host, "Hide saved list")).toHaveLength(1);
		expect(cards(t.host)).toHaveLength(3);
	});

	test("each card holds a thumbnail canvas fitted to the swatch", () => {
		const t = harness();
		const thumb = cards(t.host)[0]?.querySelector("canvas");
		expect(thumb).not.toBeNull();
		// A 10x100 swatch in a 126x84 box fits at 0.84 px/unit.
		expect(thumb?.width).toBe(8);
		expect(thumb?.height).toBe(84);
	});

	test("each card carries the save button above the delete button", () => {
		const t = harness();
		const card = cards(t.host)[1];
		const save = buttons(card ?? t.host, "Overwrite with current pattern");
		const remove = buttons(card ?? t.host, "Delete saved pattern");
		expect(save).toHaveLength(1);
		expect(remove).toHaveLength(1);
		const actions = save[0]?.parentElement;
		expect(actions?.children[0]).toBe(save[0]);
		expect(actions?.children[1]).toBe(remove[0]);
	});
});

describe("sidebar intents", () => {
	test("the header save button asks to create a card", () => {
		const t = harness();
		click(buttons(t.host, "Save pattern")[0] as HTMLButtonElement);
		expect(t.changes).toEqual([{ kind: "create" }]);
	});

	test("a card's save button asks to overwrite that card only", () => {
		const t = harness();
		const save = buttons(
			cards(t.host)[1] ?? t.host,
			"Overwrite with current pattern",
		);
		click(save[0] as HTMLButtonElement);
		expect(t.changes).toEqual([{ kind: "overwrite", id: "card-1" }]);
	});

	test("a card's delete button asks to remove that card only", () => {
		const t = harness();
		const remove = buttons(cards(t.host)[2] ?? t.host, "Delete saved pattern");
		click(remove[0] as HTMLButtonElement);
		expect(t.changes).toEqual([{ kind: "remove", id: "card-2" }]);
	});

	test("clicking a card asks to restore that card's parameters", () => {
		const t = harness();
		const list = savedList();
		click(cards(t.host)[1] as HTMLElement);
		expect(t.changes).toEqual([{ kind: "restore", params: list[1]?.params }]);
	});

	test("failed saves disable the header and card save buttons", () => {
		const t = harness();
		t.setCanSave(false);
		t.rebuild();
		expect(buttons(t.host, "Save pattern")[0]?.disabled).toBe(true);
		const card = cards(t.host)[0];
		const save = buttons(card ?? t.host, "Overwrite with current pattern");
		expect(save[0]?.disabled).toBe(true);
		const remove = buttons(card ?? t.host, "Delete saved pattern");
		expect(remove[0]?.disabled).toBe(false);
	});
});

describe("collapse", () => {
	test("the toggle asks to collapse the column", () => {
		const t = harness();
		click(buttons(t.host, "Hide saved list")[0] as HTMLButtonElement);
		expect(t.changes).toEqual([{ kind: "collapse" }]);
	});

	test("the collapsed column is a rail with only an expand button", () => {
		const t = harness();
		t.setCollapsed(true);
		t.rebuild();
		expect(t.host.classList.contains("collapsed")).toBe(true);
		const expand = buttons(t.host, "Show saved list");
		expect(expand).toHaveLength(1);
		expect(cards(t.host)).toHaveLength(0);
		click(expand[0] as HTMLButtonElement);
		expect(t.changes).toEqual([{ kind: "expand" }]);
	});
});

describe("card reordering", () => {
	test("dragging a card onto a lower gap asks to move it there", () => {
		const t = harness();
		stubCardRects(t.host);
		const first = cards(t.host)[0] as HTMLElement;
		first.dispatchEvent(makeDragEvent("dragstart", 0));
		// Hovering below card 1 (y 150) points at the gap card 0 fills
		// after its own removal: index 1 of the remaining two cards.
		const list = first.parentElement as HTMLElement;
		list.dispatchEvent(makeDragEvent("dragover", 150));
		expect(cards(t.host)[2]?.classList.contains("drop-above")).toBe(true);
		list.dispatchEvent(makeDragEvent("drop", 150));
		expect(t.changes).toEqual([{ kind: "move", from: 0, target: 1 }]);
	});

	test("a drop that reproduces the order asks for a no-op move", () => {
		const t = harness();
		stubCardRects(t.host);
		const first = cards(t.host)[0] as HTMLElement;
		first.dispatchEvent(makeDragEvent("dragstart", 0));
		const list = first.parentElement as HTMLElement;
		list.dispatchEvent(makeDragEvent("dragover", 10));
		expect(t.host.querySelectorAll(".drop-above, .drop-below")).toHaveLength(0);
		list.dispatchEvent(makeDragEvent("drop", 10));
		expect(t.changes).toEqual([{ kind: "move", from: 0, target: 0 }]);
	});

	test("an aborted drag clears the dragging and drop indicators", () => {
		const t = harness();
		stubCardRects(t.host);
		const first = cards(t.host)[0] as HTMLElement;
		first.dispatchEvent(makeDragEvent("dragstart", 0));
		expect(first.classList.contains("dragging")).toBe(true);
		const list = first.parentElement as HTMLElement;
		list.dispatchEvent(makeDragEvent("dragover", 150));
		first.dispatchEvent(makeDragEvent("dragend", 0));
		expect(first.classList.contains("dragging")).toBe(false);
		expect(list.querySelectorAll(".drop-above, .drop-below")).toHaveLength(0);
	});
});

describe("export", () => {
	test("clicking export downloads the saved list as a JSON file", async () => {
		// Patch the blob URL methods onto the real URL: replacing the
		// whole constructor breaks happy-dom, whose anchor clicks navigate.
		const createObjectURL = vi.fn((_blob: Blob) => "blob:mock");
		const revokeObjectURL = vi.fn();
		const hadCreate = "createObjectURL" in URL;
		const hadRevoke = "revokeObjectURL" in URL;
		Object.defineProperty(URL, "createObjectURL", {
			value: createObjectURL,
			configurable: true,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			value: revokeObjectURL,
			configurable: true,
		});
		const anchors: HTMLAnchorElement[] = [];
		const capture = (event: Event): void => {
			if (event.target instanceof HTMLAnchorElement) {
				// The click is a download, never a navigation.
				event.preventDefault();
				anchors.push(event.target);
			}
		};
		document.addEventListener("click", capture);
		try {
			const t = harness();
			buttons(t.host, "Export patterns")[0]?.click();

			expect(anchors).toHaveLength(1);
			expect(anchors[0]?.download).toBe("stripe-planner-patterns.json");
			expect(anchors[0]?.getAttribute("href")).toBe("blob:mock");
			const blob = createObjectURL.mock.calls[0]?.[0];
			expect(blob).toBeInstanceOf(Blob);
			const text = await (blob as Blob).text();
			// The file is the codec's file form: verify by decoding.
			const decoded = (JSON.parse(text) as string[]).map((entry) =>
				decodePattern(entry),
			);
			const patterns = decoded.map((result) => {
				if (!result.ok) {
					throw new Error("export did not decode");
				}
				return result.params;
			});
			expect(contentOf(patterns)).toEqual(
				contentOf(savedList().map((item) => item.params)),
			);
			expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
		} finally {
			document.removeEventListener("click", capture);
			if (!hadCreate) {
				Reflect.deleteProperty(URL, "createObjectURL");
			}
			if (!hadRevoke) {
				Reflect.deleteProperty(URL, "revokeObjectURL");
			}
		}
	});
});

describe("import", () => {
	// Pick the file the hidden input "chose" and wait for the modal.
	async function chooseImportFile(t: Harness, text: string): Promise<void> {
		const input = t.host.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) {
			throw new Error("missing file input");
		}
		Object.defineProperty(input, "files", {
			value: [new File([text], "patterns.json", { type: "application/json" })],
			configurable: true,
		});
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => {
			if (!t.host.querySelector(".modal")) {
				throw new Error("modal not open");
			}
		});
	}

	const first = savedList()[0] as SavedPattern;
	const onePattern = serializeSaved([first]);

	test("a valid file opens the modal with overwrite, append, and cancel", async () => {
		const t = harness();
		await chooseImportFile(t, onePattern);
		expect(buttons(t.host, "Replace saved patterns")).toHaveLength(1);
		expect(buttons(t.host, "Add saved patterns")).toHaveLength(1);
		expect(buttons(t.host, "Cancel import")).toHaveLength(1);
	});

	test("choosing overwrite dispatches the file's items", async () => {
		const t = harness();
		await chooseImportFile(t, onePattern);
		buttons(t.host, "Replace saved patterns")[0]?.click();
		const change = t.changes[0] as Extract<SavedChange, { kind: "import" }>;
		expect(change.kind).toBe("import");
		expect(change.mode).toBe("replace");
		expect(contentOf(change.params)).toEqual(contentOf([first.params]));
		expect(t.host.querySelector(".modal")).toBeNull();
	});

	test("choosing append dispatches the file's items", async () => {
		const t = harness();
		await chooseImportFile(t, onePattern);
		buttons(t.host, "Add saved patterns")[0]?.click();
		const change = t.changes[0] as Extract<SavedChange, { kind: "import" }>;
		expect(change.kind).toBe("import");
		expect(change.mode).toBe("add");
		expect(contentOf(change.params)).toEqual(contentOf([first.params]));
	});

	test("cancel closes the modal and dispatches nothing", async () => {
		const t = harness();
		await chooseImportFile(t, onePattern);
		buttons(t.host, "Cancel import")[0]?.click();
		expect(t.host.querySelector(".modal")).toBeNull();
		expect(t.changes).toHaveLength(0);
	});

	test("the escape key and a backdrop click dismiss as cancel", async () => {
		const t = harness();
		await chooseImportFile(t, onePattern);
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(t.host.querySelector(".modal")).toBeNull();

		await chooseImportFile(t, onePattern);
		const backdrop = t.host.querySelector(".modal-backdrop");
		backdrop?.dispatchEvent(
			new Event("click", { bubbles: true, cancelable: true }),
		);
		expect(t.host.querySelector(".modal")).toBeNull();
		expect(t.changes).toHaveLength(0);
	});

	test("an invalid file shows an error with only a cancel button", async () => {
		const t = harness();
		await chooseImportFile(t, "{not json");
		const error = t.host.querySelector(".modal-error");
		expect(error?.textContent).toBe("This file is not a valid pattern export.");
		expect(buttons(t.host, "Replace saved patterns")).toHaveLength(0);
		expect(buttons(t.host, "Add saved patterns")).toHaveLength(0);
		expect(buttons(t.host, "Cancel import")).toHaveLength(1);
		buttons(t.host, "Cancel import")[0]?.click();
		expect(t.host.querySelector(".modal")).toBeNull();
	});
});
