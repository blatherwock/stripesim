import { attachReorder, clearDropIndicators } from "./drag";
import type { PatternParams } from "./model";
import { fitScale, renderPattern, swatchPixelSize } from "./render";
import { parseImportFile, type SavedPattern, serializeSaved } from "./saved";

import { iconButton } from "./ui";

/*
 * Icon glyphs from the vendored nerd symbols font: the floppy disk and
 * trash can for card actions, chevrons for the collapse toggle and the
 * collapsed rail's expand button.
 */
const ICON_FLOPPY = "\u{F0C7}";
const ICON_TRASH = "\u{F1F8}";
const ICON_CHEVRON_RIGHT = "\u{F054}";
const ICON_CHEVRON_LEFT = "\u{F053}";
/* Import and export: an arrow entering and leaving a file box. */
const ICON_FILE_IMPORT = "\u{EE38}";
const ICON_SHARE = "\u{F1E0}";
const ICON_FILE_EXPORT = "\u{EE37}";

/** Thumbnail box: the 150 px column minus padding, in CSS pixels. */
const THUMB_BOX = { width: 126, height: 84 };

/** Name of the file the export button downloads. */
const EXPORT_NAME = "stripe-planner-patterns.json";

/**
 * One user intent from the sidebar: create a card from the current
 * parameters, overwrite or delete or restore a card, reorder the list,
 * or collapse and expand the column. The owner applies each against the
 * persisted list and rebuilds the sidebar.
 */
export type SavedChange =
	| { kind: "create" }
	| { kind: "overwrite"; id: string }
	| { kind: "remove"; id: string }
	| { kind: "restore"; params: PatternParams }
	| { kind: "move"; from: number; target: number }
	| { kind: "import"; mode: "replace" | "add"; params: PatternParams[] }
	| { kind: "share" }
	| { kind: "collapse" }
	| { kind: "expand" };

/** What the sidebar reads from its owner; read at event time, never cached. */
export type SidebarDeps = {
	getList: () => SavedPattern[];
	isCollapsed: () => boolean;
	canSave: () => boolean;
	onChange: (change: SavedChange) => void;
};

// Drag state shared by all cards of one sidebar build.
type DragState = { from: number | null };

/**
 * Build the saved-patterns sidebar into `host`, replacing its contents.
 * Reads the editor state and saved list through `deps` and, on user
 * input, hands one `SavedChange` to `onChange`; the owner applies it
 * through the storage layer and calls this again to rebuild.
 */
export function buildSidebar(host: HTMLElement, deps: SidebarDeps): void {
	host.replaceChildren();
	host.classList.toggle("collapsed", deps.isCollapsed());
	if (deps.isCollapsed()) {
		const expand = iconButton(ICON_CHEVRON_LEFT, "Show saved list", () => {
			deps.onChange({ kind: "expand" });
		});
		expand.className = "nf sidebar-expand";
		host.append(expand);
		return;
	}

	const toggle = iconButton(ICON_CHEVRON_RIGHT, "Hide saved list", () => {
		deps.onChange({ kind: "collapse" });
	});
	toggle.className = "nf sidebar-toggle";
	const save = iconButton(ICON_FLOPPY, "Save pattern", () => {
		deps.onChange({ kind: "create" });
	});
	save.className = "nf sidebar-save";
	save.disabled = !deps.canSave();
	const header = document.createElement("div");
	header.className = "sidebar-header";
	header.append(save, toggle);

	const drag: DragState = { from: null };
	const list = document.createElement("div");
	list.className = "saved-list";
	for (const [index, item] of deps.getList().entries()) {
		list.append(card(item, index, deps, drag));
	}
	attachReorder(list, ".card", drag, (from, target) =>
		deps.onChange({ kind: "move", from, target }),
	);

	host.append(header, list, footerSection(host, deps));
}

/*
 * Footer row under the card list: export downloads the saved list as
 * a JSON file, import opens a file picker whose chosen file feeds the
 * confirmation modal. The file input itself stays invisible inside
 * the footer.
 */
function footerSection(host: HTMLElement, deps: SidebarDeps): HTMLElement {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "application/json,.json";
	input.addEventListener("change", async () => {
		const file = input.files?.[0];
		// Reset so picking the same file again still fires a change.
		input.value = "";
		if (file) {
			showModal(host, deps, parseImportFile(await file.text()));
		}
	});

	const shareButton = document.createElement("button");
	shareButton.type = "button";
	shareButton.className = "nf";
	shareButton.textContent = ICON_SHARE;
	shareButton.setAttribute("aria-label", "Share pattern");
	shareButton.title = "Copy a link to this pattern";
	shareButton.addEventListener("click", () => {
		// The intent dispatches to the owner, which owns the state and
		// the URL: it copies the share link to the clipboard.
		deps.onChange({ kind: "share" });
	});

	const exportButton = document.createElement("button");
	exportButton.type = "button";
	exportButton.className = "nf";
	exportButton.textContent = ICON_FILE_EXPORT;
	exportButton.setAttribute("aria-label", "Export patterns");
	exportButton.title = "Download saved patterns";
	exportButton.addEventListener("click", () => {
		downloadSaved(deps.getList());
	});

	const importButton = document.createElement("button");
	importButton.type = "button";
	importButton.className = "nf";
	importButton.textContent = ICON_FILE_IMPORT;
	importButton.setAttribute("aria-label", "Import patterns");
	importButton.title = "Load patterns from a file";
	importButton.addEventListener("click", () => {
		input.click();
	});

	const footer = document.createElement("div");
	footer.className = "sidebar-footer";
	footer.append(shareButton, exportButton, importButton, input);
	return footer;
}

/*
 * Download the saved list as a JSON file: a blob URL fed to a
 * throwaway anchor. The anchor joins the body first, since a
 * detached element's click never bubbles; it leaves again right
 * after.
 */
function downloadSaved(list: readonly SavedPattern[]): void {
	const blob = new Blob([serializeSaved(list)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = EXPORT_NAME;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

/*
 * The import confirmation modal, rendered into the sidebar host as a
 * viewport overlay. A readable file shows replace, add, and cancel;
 * an unreadable one shows an error message with cancel, and the user
 * retries by picking a file again. Escape and a backdrop
 * click dismiss as cancel. Replace and add close the modal and
 * hand the items to the owner, whose rebuild replaces the whole
 * sidebar, modal included.
 */
/**
 * User-facing text for a share value that failed to decode: keyed by
 * the codec's reason codes, falling back to the malformed wording.
 */
const reasonText = (reason: string): string =>
	REASON_TEXTS[reason] ?? "This file is not a valid pattern export.";
const REASON_TEXTS: Record<string, string> = {
	malformed: "This file is not a valid pattern export.",
	version: "This file was made by a different version of the app.",
	structure: "This file is incomplete or damaged.",
};

function showModal(
	host: HTMLElement,
	deps: SidebarDeps,
	file: ReturnType<typeof parseImportFile>,
): void {
	host.querySelector(".modal-backdrop")?.remove();
	const backdrop = document.createElement("div");
	backdrop.className = "modal-backdrop";
	const dialog = document.createElement("div");
	dialog.className = "modal";
	dialog.setAttribute("role", "dialog");

	const close = (): void => {
		backdrop.remove();
		document.removeEventListener("keydown", onKeydown);
	};
	const onKeydown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			close();
		}
	};
	backdrop.addEventListener("click", (event) => {
		if (event.target === backdrop) {
			close();
		}
	});
	document.addEventListener("keydown", onKeydown);

	if (file.ok) {
		if (file.dropped > 0) {
			const warning = document.createElement("p");
			warning.className = "modal-error";
			warning.textContent =
				file.dropped === 1
					? "1 stripe could not be loaded (unknown color)."
					: `${file.dropped} stripes could not be loaded (unknown colors).`;
			dialog.append(warning);
		}
		dialog.append(
			modalButton("Replace", "Replace saved patterns", () => {
				close();
				deps.onChange({
					kind: "import",
					mode: "replace",
					params: file.patterns,
				});
			}),
			modalButton("Add", "Add saved patterns", () => {
				close();
				deps.onChange({ kind: "import", mode: "add", params: file.patterns });
			}),
			modalButton("Cancel", "Cancel import", close),
		);
	} else {
		const error = document.createElement("p");
		error.className = "modal-error";
		error.textContent = reasonText(file.reason);
		dialog.append(error, modalButton("Cancel", "Cancel import", close));
	}
	backdrop.append(dialog);
	host.append(backdrop);
}

// One modal button: a plain text label and its explicit aria-label.
function modalButton(
	label: string,
	ariaLabel: string,
	onClick: () => void,
): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.textContent = label;
	button.setAttribute("aria-label", ariaLabel);
	button.addEventListener("click", onClick);
	return button;
}

// One card: a thumbnail of the saved pattern plus the hover-revealed
// action pair (save above delete) on its right side. Clicking anywhere
// else on the card restores it; clicking an action leaves the card's
// click dead so the two never fire together.
function card(
	item: SavedPattern,
	index: number,
	deps: SidebarDeps,
	drag: DragState,
): HTMLElement {
	const node = document.createElement("div");
	node.className = "card";
	node.draggable = true;

	const canvas = document.createElement("canvas");
	canvas.className = "card-thumb";
	const scale = fitScale(item.params.swatch, THUMB_BOX);
	const size = swatchPixelSize(item.params.swatch, scale);
	canvas.width = size.width;
	canvas.height = size.height;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		renderPattern(ctx, item.params, scale);
	}

	const actions = document.createElement("div");
	actions.className = "card-actions";
	const save = iconButton(ICON_FLOPPY, "Overwrite with current pattern", () => {
		deps.onChange({ kind: "overwrite", id: item.id });
	});
	const remove = iconButton(ICON_TRASH, "Delete saved pattern", () => {
		deps.onChange({ kind: "remove", id: item.id });
	});
	save.disabled = !deps.canSave();
	actions.append(save, remove);

	node.addEventListener("click", (event) => {
		if (event.target instanceof Node && actions.contains(event.target)) {
			return;
		}
		deps.onChange({ kind: "restore", params: item.params });
	});
	node.addEventListener("dragstart", (event) => {
		event.dataTransfer?.setData("text/plain", String(index));
		drag.from = index;
		node.classList.add("dragging");
	});
	node.addEventListener("dragend", () => {
		drag.from = null;
		node.classList.remove("dragging");
		clearDropIndicators(node.parentElement ?? node);
	});

	node.append(canvas, actions);
	return node;
}
