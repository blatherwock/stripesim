import "./style.css";
import {
	atNewest,
	atOldest,
	backHistory,
	currentState,
	forwardHistory,
	newHistory,
	pushHistory,
} from "./history";
import {
	defaultState,
	type PatternState,
	paramsOf,
	type Theme,
	withParams,
} from "./model";
import { previewScale, renderPattern, swatchPixelSize } from "./render";
import {
	createSaved,
	loadCollapsed,
	loadSaved,
	loadTheme,
	moveSaved,
	overwriteSaved,
	removeSaved,
	type SavedPattern,
	storeCollapsed,
	storeTheme,
	toSaved,
	writeSaved,
} from "./saved";
import {
	decodePattern,
	encodePattern,
	patternFromHash,
	patternFromQuery,
	queryForPattern,
} from "./share";
import { buildSidebar, type SavedChange, type SidebarDeps } from "./sidebar";
import { buildPanel, type ChangeKind, type HistoryDeps } from "./ui";

/**
 * Mount the app into `target`. The panel and the sidebar dispatch
 * changes here; this module owns the state and the persisted saved
 * list, applies side effects, and re-renders. Returns a `dispose` that
 * disconnects the pane observer.
 */
export function mount(target: HTMLElement): () => void {
	target.replaceChildren();

	const storage = window.localStorage;

	// The working pattern lives in the URL: the query names what is
	// on screen now, and a share link's fragment names what was
	// shared. The query beats the fragment (it is newer), the theme
	// still loads from its own key, and anything undecodable falls
	// back to the default demo pattern.
	let state: PatternState = {
		...(patternFromQuery(location.search) ??
			patternFromHash(location.hash) ??
			paramsOf(defaultState())),
		theme: loadTheme(storage) ?? preferredTheme(),
	};
	let savedList: SavedPattern[] = loadSaved(storage);
	let sidebarCollapsed = loadCollapsed(storage) ?? false;
	// Session history of the working pattern: the encoded query at
	// every change, with a cursor pointing at the current state.
	let patternHistory = newHistory(encodePattern(paramsOf(state)));
	// Set false by a failed saved-list write; a later successful write
	// restores it. Theme and collapse writes never touch it.
	let savesHealthy = true;

	const pane = document.createElement("div");
	pane.className = "pane";
	const canvas = document.createElement("canvas");
	pane.append(canvas);

	const panel = document.createElement("aside");
	panel.className = "panel";

	const sidebar = document.createElement("aside");
	sidebar.className = "sidebar";

	const layout = document.createElement("div");
	layout.className = "app";
	layout.append(panel, pane, sidebar);
	target.append(layout);

	function applyTheme(): void {
		// The theme lives on the body as a data attribute; the stylesheet
		// derives every chrome color from it. One sync point, here, and
		// the theme persists with every change; a failed write keeps the
		// theme for the session and surfaces nothing.
		document.body.dataset.theme = state.theme;
		storeTheme(storage, state.theme);
	}

	function refreshCanvas(): void {
		const scale = previewScale(state.swatch, {
			width: pane.clientWidth,
			height: pane.clientHeight,
		});
		const size = swatchPixelSize(state.swatch, scale);
		// Assigning width or height clears the bitmap and resizes the
		// canvas's compositor layer, which can present a stale frame for
		// one composite; skip the assignment when the size already
		// matches, so same-size redraws never resize.
		if (canvas.width !== size.width) {
			canvas.width = size.width;
		}
		if (canvas.height !== size.height) {
			canvas.height = size.height;
		}
		const ctx = canvas.getContext("2d");
		if (ctx) {
			renderPattern(ctx, state, scale);
		}
	}

	function onState(next: PatternState, kind: ChangeKind): void {
		state = next;
		applyTheme();
		// Every state change rewrites the query parameter, so the URL
		// is the current state: copy it, bookmark it, reload it.
		// replaceState keeps edits out of the browser history.
		history.replaceState(null, "", queryForPattern(paramsOf(state)));
		// Every pattern change enters the session history, so back can
		// undo it; identical consecutive states are skipped inside.
		const encoded = encodePattern(paramsOf(state));
		patternHistory = pushHistory(patternHistory, encoded);
		history.replaceState(null, "", `?p=${encoded}`);
		if (kind === "structure") {
			buildPanel(panel, getState, onState, historyDeps);
		}
		syncHistoryButtons();
		refreshCanvas();
	}

	function rebuildSidebar(): void {
		buildSidebar(sidebar, sidebarDeps);
	}

	/*
	 * Sidebar changes: list mutations write through to storage first
	 * and only then update the in-memory list, so a failed write leaves
	 * both untouched and the save buttons disabled. Restoring re-enters
	 * the panel's state path, keeping the theme as a structure rebuild.
	 */
	function onSavedChange(change: SavedChange): void {
		switch (change.kind) {
			case "create": {
				applySavedWrite(createSaved(savedList, paramsOf(state)));
				break;
			}
			case "overwrite": {
				applySavedWrite(overwriteSaved(savedList, change.id, paramsOf(state)));
				break;
			}
			case "remove": {
				applySavedWrite(removeSaved(savedList, change.id));
				break;
			}
			case "move": {
				applySavedWrite(moveSaved(savedList, change.from, change.target));
				break;
			}
			case "import": {
				// Imported parameters carry no identity; every entry mints
				// a fresh id on entering the list, so a file added twice never
				// collides with its earlier copy. Replace swaps the list
				// wholesale; add puts the entries after the cards.
				const fresh = toSaved(change.params);
				const next =
					change.mode === "replace" ? fresh : [...savedList, ...fresh];
				applySavedWrite(next);
				break;
			}
			case "restore": {
				onState(withParams(state, change.params), "structure");
				break;
			}
			case "share": {
				// The query parameter is the current state, so the URL is
				// already the share link: copy it. If the clipboard
				// blocks, the address bar still shows the link.
				navigator.clipboard?.writeText(location.href);
				break;
			}
			case "collapse": {
				sidebarCollapsed = true;
				storeCollapsed(storage, true);
				rebuildSidebar();
				break;
			}
			case "expand": {
				sidebarCollapsed = false;
				storeCollapsed(storage, false);
				rebuildSidebar();
				break;
			}
		}
	}

	function applySavedWrite(next: SavedPattern[]): void {
		if (writeSaved(storage, next)) {
			savedList = next;
			savesHealthy = true;
		} else {
			savesHealthy = false;
		}
		rebuildSidebar();
	}

	/*
	 * The history buttons' disabled state follows the cursor; canvas-
	 * only changes do not rebuild the panel, so the two buttons sync
	 * in place after every change.
	 */
	function syncHistoryButtons(): void {
		const back = panel.querySelector<HTMLButtonElement>(
			'button[aria-label="Back one change"]',
		);
		const forward = panel.querySelector<HTMLButtonElement>(
			'button[aria-label="Forward one change"]',
		);
		if (back) {
			back.disabled = atOldest(patternHistory);
		}
		if (forward) {
			forward.disabled = atNewest(patternHistory);
		}
	}

	const getState = (): PatternState => state;
	const historyDeps: HistoryDeps = {
		canBack: () => !atOldest(patternHistory),
		canForward: () => !atNewest(patternHistory),
		onMove: (direction) => {
			patternHistory =
				direction === "back"
					? backHistory(patternHistory)
					: forwardHistory(patternHistory);
			const result = decodePattern(currentState(patternHistory));
			if (!result.ok) {
				return;
			}
			state = withParams(state, result.params);
			applyTheme();
			buildPanel(panel, getState, onState, historyDeps);
			syncHistoryButtons();
			refreshCanvas();
			history.replaceState(null, "", `?p=${currentState(patternHistory)}`);
		},
	};

	const sidebarDeps: SidebarDeps = {
		getList: () => savedList,
		isCollapsed: () => sidebarCollapsed,
		canSave: () => savesHealthy,
		onChange: onSavedChange,
	};

	applyTheme();
	buildPanel(panel, getState, onState, historyDeps);
	rebuildSidebar();
	refreshCanvas();
	// The swatch always fills 85% of the pane, so the pane laying out at
	// a new size re-fits it. The observer's first delivery also corrects
	// the eager fit above when it raced the initial stylesheet layout
	// and measured an unstyled (zero-sized) pane.
	const observer = new ResizeObserver(() => refreshCanvas());
	observer.observe(pane);
	return () => observer.disconnect();
}

// The browser's preferred color scheme decides the starting theme:
// dark-mode browsers start in the dark theme, everyone else in light.
function preferredTheme(): Theme {
	const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
	return dark ? "dark" : "light";
}

const app = document.querySelector<HTMLElement>("#app");
if (app) {
	mount(app);
}
