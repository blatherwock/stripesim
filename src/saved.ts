import { moveItem, ORIGINS, type PatternParams, type Theme } from "./model";
import { type DecodeReason, decodePattern, encodePattern } from "./share";

// The pattern fields a saved card captures live in the model as
// `PatternParams`: the state minus the theme.

/** One saved card: a stable id plus the pattern parameters it holds. */
export type SavedPattern = {
	id: string;
	params: PatternParams;
};

/** Return the list with a new card holding `params` appended. */
export function createSaved(
	list: readonly SavedPattern[],
	params: PatternParams,
): SavedPattern[] {
	return [...list, { id: crypto.randomUUID(), params }];
}

/** Return the list with the card `id`'s parameters replaced in place. */
export function overwriteSaved(
	list: readonly SavedPattern[],
	id: string,
	params: PatternParams,
): SavedPattern[] {
	return list.map((item) => (item.id === id ? { ...item, params } : item));
}

/** Return the list without the card `id`. */
export function removeSaved(
	list: readonly SavedPattern[],
	id: string,
): SavedPattern[] {
	return list.filter((item) => item.id !== id);
}

/**
 * Return the list with the card at `from` moved to `target`, both
 * indices into the current list.
 */
export function moveSaved(
	list: readonly SavedPattern[],
	from: number,
	target: number,
): SavedPattern[] {
	return moveItem(list, from, target);
}

/*
 * Persistence: three independent `localStorage` keys (saved list, theme,
 * sidebar collapse), each written through the storage backend passed
 * in. Tests inject fakes; the app passes `window.localStorage`. The
 * working pattern lives in the URL query, not in storage.
 */

/**
 * Serialize the saved list as a JSON export file: an array whose
 * entries are the share codec's encoded values, one per pattern.
 * JSON keeps the file inspectable; the encoded values keep each
 * entry as small as the share link.
 */
export function serializeSaved(list: readonly SavedPattern[]): string {
	return JSON.stringify(list.map((item) => encodePattern(item.params)));
}

/**
 * Parse an import file's text: a JSON array of encoded pattern
 * values. Returns the parameters with the number of stripes that
 * were dropped for unknown colors, or null when the text is not a
 * readable export: invalid JSON, a wrong shape, a foreign version,
 * or any invalid pattern. Import is all-or-nothing; unlike storage
 * loads, invalid entries are never dropped silently from a file the
 * user chose by name.
 */
export function parseImportFile(
	text: string,
):
	| { ok: true; patterns: PatternParams[]; dropped: number }
	| { ok: false; reason: DecodeReason; detail?: number } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, reason: "malformed" };
	}
	if (!Array.isArray(parsed)) {
		return { ok: false, reason: "structure" };
	}
	const patterns: PatternParams[] = [];
	let dropped = 0;
	for (const entry of parsed) {
		if (typeof entry !== "string") {
			return { ok: false, reason: "structure" };
		}
		const result = decodePattern(entry);
		if (!result.ok) {
			return { ok: false, reason: result.reason, detail: result.detail };
		}
		patterns.push(result.params);
		dropped += result.dropped;
	}
	return { ok: true, patterns, dropped };
}

/**
 * Return `patterns` as new cards, each with a freshly minted id.
 * Identity belongs to the list slot, not the pattern: imported
 * parameters carry none, so appending the same file twice can never
 * collide with earlier copies.
 */
export function toSaved(patterns: readonly PatternParams[]): SavedPattern[] {
	return patterns.map((params) => ({ id: crypto.randomUUID(), params }));
}

/** Storage backend the persistence helpers read and write through. */
export type StorageBackend = Pick<Storage, "getItem" | "setItem">;

const SAVED_KEY = "stripe-planner.saved";
const THEME_KEY = "stripe-planner.theme";
const COLLAPSED_KEY = "stripe-planner.sidebar-collapsed";

/**
 * Read the saved list. Unreadable storage yields an empty list; items
 * that fail validation are dropped individually and the rest load.
 */
export function loadSaved(storage: StorageBackend): SavedPattern[] {
	const raw = storage.getItem(SAVED_KEY);
	if (raw === null) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// Not valid JSON at all: nothing is recoverable.
		return [];
	}
	if (!Array.isArray(parsed)) {
		return [];
	}
	return parsed.filter(isSavedPattern);
}

/**
 * Persist the saved list. Returns false when the write throws (quota
 * exceeded, storage unavailable); callers treat that as "do not apply
 * the change", keeping what the UI shows in sync with what survives a
 * reload.
 */
export function writeSaved(
	storage: StorageBackend,
	list: readonly SavedPattern[],
): boolean {
	return write(storage, SAVED_KEY, JSON.stringify(list));
}

/**
 * Read the persisted theme, or null when no valid value is stored; the
 * caller falls back to the browser's preferred color scheme.
 */
export function loadTheme(storage: StorageBackend): Theme | null {
	const value = storage.getItem(THEME_KEY);
	return isTheme(value) ? value : null;
}

/** Persist `theme` immediately. Returns false when the write throws. */
export function storeTheme(storage: StorageBackend, theme: Theme): boolean {
	return write(storage, THEME_KEY, theme);
}

/**
 * Read the persisted sidebar state: true means collapsed, false means
 * expanded, null means no valid value stored (the sidebar starts
 * expanded).
 */
export function loadCollapsed(storage: StorageBackend): boolean | null {
	const value = storage.getItem(COLLAPSED_KEY);
	if (value !== "true" && value !== "false") {
		return null;
	}
	return value === "true";
}

/** Persist the sidebar state. Returns false when the write throws. */
export function storeCollapsed(
	storage: StorageBackend,
	collapsed: boolean,
): boolean {
	return write(storage, COLLAPSED_KEY, collapsed ? "true" : "false");
}

// One write path for all keys: storage writes throw on quota overflow
// and in private modes where storage is blocked, and every caller's
// contract is the same boolean success flag.
function write(storage: StorageBackend, key: string, value: string): boolean {
	try {
		storage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

function isTheme(value: unknown): value is Theme {
	return (
		value === "light" ||
		value === "beige" ||
		value === "gruvbox" ||
		value === "dark"
	);
}

// Validate one stored card: a string id plus a full set of correctly
// typed pattern parameters. Structural checks only; values such as hex
// strings and stripe thicknesses are safe to render whatever they hold.
function isSavedPattern(value: unknown): value is SavedPattern {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const item = value as Record<string, unknown>;
	return typeof item.id === "string" && isPatternParams(item.params);
}

function isPatternParams(value: unknown): value is PatternParams {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const params = value as Record<string, unknown>;
	return (
		Array.isArray(params.palette) &&
		params.palette.every(isColor) &&
		Array.isArray(params.stripes) &&
		params.stripes.every(isStripe) &&
		(params.repeat === "cycle" || params.repeat === "ping-pong") &&
		isOrigin(params.origin) &&
		typeof params.angle === "number" &&
		isSwatch(params.swatch)
	);
}

function isColor(value: unknown): value is PatternParams["palette"][number] {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const color = value as Record<string, unknown>;
	return typeof color.id === "string" && typeof color.hex === "string";
}

function isStripe(value: unknown): value is PatternParams["stripes"][number] {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const stripe = value as Record<string, unknown>;
	return (
		typeof stripe.colorId === "string" && typeof stripe.thickness === "number"
	);
}

function isOrigin(value: unknown): value is PatternParams["origin"] {
	return (
		typeof value === "string" &&
		ORIGINS.includes(value as PatternParams["origin"])
	);
}

function isSwatch(value: unknown): value is PatternParams["swatch"] {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const swatch = value as Record<string, unknown>;
	return typeof swatch.width === "number" && typeof swatch.height === "number";
}
