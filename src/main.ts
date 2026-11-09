import "./style.css";
import { defaultState, type PatternState, type Theme } from "./model";
import { previewScale, renderPattern, swatchPixelSize } from "./render";
import { buildPanel, type ChangeKind } from "./ui";

/**
 * Mount the app into `target`. The panel dispatches next states here;
 * this module owns the state variable, applies theme side effects, and
 * re-renders. Returns a `dispose` that disconnects the pane observer.
 */
export function mount(target: HTMLElement): () => void {
	target.replaceChildren();

	let state: PatternState = { ...defaultState(), theme: preferredTheme() };

	const pane = document.createElement("div");
	pane.className = "pane";
	const canvas = document.createElement("canvas");
	pane.append(canvas);

	const panel = document.createElement("aside");
	panel.className = "panel";

	const layout = document.createElement("div");
	layout.className = "app";
	layout.append(panel, pane);
	target.append(layout);

	function applyTheme(): void {
		// The theme lives on the body as a data attribute; the stylesheet
		// derives every chrome color from it. One sync point, here.
		document.body.dataset.theme = state.theme;
	}

	function refreshCanvas(): void {
		const scale = previewScale(state.swatch, {
			width: pane.clientWidth,
			height: pane.clientHeight,
		});
		const size = swatchPixelSize(state.swatch, scale);
		canvas.width = size.width;
		canvas.height = size.height;
		const ctx = canvas.getContext("2d");
		if (ctx) {
			renderPattern(ctx, state, scale);
		}
	}

	function onState(next: PatternState, kind: ChangeKind): void {
		state = next;
		applyTheme();
		if (kind === "structure") {
			buildPanel(panel, getState, onState);
		}
		refreshCanvas();
	}

	const getState = (): PatternState => state;

	applyTheme();
	buildPanel(panel, getState, onState);
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
