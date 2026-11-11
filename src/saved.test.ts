import { describe, expect, test } from "vitest";
import {
	defaultState,
	type PatternParams,
	type PatternState,
	paramsOf,
	withParams,
} from "./model";
import {
	createSaved,
	loadCollapsed,
	loadSaved,
	loadTheme,
	moveSaved,
	overwriteSaved,
	parseImportFile,
	removeSaved,
	type SavedPattern,
	type StorageBackend,
	serializeSaved,
	storeCollapsed,
	storeTheme,
	writeSaved,
} from "./saved";
import { decodePattern } from "./share";

// A pattern distinct from the default demo, so assertions catch a
// wrong field slipping through untouched.
function params(): PatternParams {
	return {
		palette: [{ id: "a", hex: "#111111" }],
		stripes: [{ colorId: "a", thickness: 3 }],
		repeat: "ping-pong",
		origin: "bottom-left",
		angle: 60,
		swatch: { width: 12, height: 30 },
	};
}

function listWith(count: number): SavedPattern[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `card-${index}`,
		params: params(),
	}));
}

describe("paramsOf and withParams", () => {
	test("paramsOf carries every editor field but not the theme", () => {
		const state: PatternState = { ...defaultState(), theme: "gruvbox" };
		const captured = paramsOf(state);
		expect(captured).toEqual({
			palette: state.palette,
			stripes: state.stripes,
			repeat: "cycle",
			origin: "bottom",
			angle: 45,
			swatch: { width: 10, height: 100 },
		});
	});

	test("withParams replaces the pattern and keeps the current theme", () => {
		const state: PatternState = { ...defaultState(), theme: "dark" };
		const next = withParams(state, params());
		expect(next.theme).toBe("dark");
		expect(next.stripes).toEqual(params().stripes);
		expect(next.swatch).toEqual(params().swatch);
	});
});

describe("list transitions", () => {
	test("createSaved appends the new card", () => {
		const list = listWith(2);
		const next = createSaved(list, params());
		expect(next).toHaveLength(3);
		expect(next[2]?.params).toEqual(params());
		// The existing cards keep their positions, order intact.
		expect(next.slice(0, 2).map((item) => item.id)).toEqual([
			"card-0",
			"card-1",
		]);
		expect(next[2]?.id).not.toBe(next[1]?.id);
	});

	test("overwriteSaved replaces the slot's params in place", () => {
		const list = listWith(3);
		const replacement: PatternParams = { ...params(), origin: "top" };
		const next = overwriteSaved(list, "card-1", replacement);
		expect(next[1]?.params.origin).toBe("top");
		expect(next.map((item) => item.id)).toEqual(["card-0", "card-1", "card-2"]);
		// Only the targeted slot changes.
		expect(next[0]?.params).toEqual(list[0]?.params);
		expect(next[2]?.params).toEqual(list[2]?.params);
	});

	test("removeSaved drops only the named card", () => {
		const next = removeSaved(listWith(3), "card-1");
		expect(next.map((item) => item.id)).toEqual(["card-0", "card-2"]);
	});

	test("moveSaved reorders and survives no-op drops", () => {
		expect(moveSaved(listWith(3), 0, 2).map((item) => item.id)).toEqual([
			"card-1",
			"card-2",
			"card-0",
		]);
		expect(moveSaved(listWith(3), 1, 1).map((item) => item.id)).toEqual([
			"card-0",
			"card-1",
			"card-2",
		]);
	});
});

// A storage fake standing in for localStorage: a plain map, plus a
// switch to make writes throw the way quota errors do.
function fakeStorage(): StorageBackend & {
	failWrites: (fail: boolean) => void;
} {
	const map = new Map<string, string>();
	let fail = false;
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => {
			if (fail) {
				throw new Error("quota exceeded");
			}
			map.set(key, value);
		},
		failWrites: (value: boolean) => {
			fail = value;
		},
	};
}

describe("saved list persistence", () => {
	test("a written list loads back with ids, order, and params", () => {
		const storage = fakeStorage();
		const list = [
			createSaved(listWith(1), params())[0] as SavedPattern,
			...listWith(1),
		];
		expect(writeSaved(storage, list)).toBe(true);
		expect(loadSaved(storage)).toEqual(list);
	});

	test("empty storage loads an empty list", () => {
		expect(loadSaved(fakeStorage())).toEqual([]);
	});

	test("unparseable storage loads an empty list", () => {
		const storage = fakeStorage();
		storage.setItem("stripe-planner.saved", "{not json");
		expect(loadSaved(storage)).toEqual([]);
	});

	test("invalid items are dropped individually and the rest load", () => {
		const storage = fakeStorage();
		const good = listWith(1);
		const junk = [
			good[0] as SavedPattern,
			{ id: "missing-params" },
			{ id: "wrong-types", params: { ...params(), angle: "45" } },
			{
				id: "nested-junk",
				params: { ...params(), stripes: [{ colorId: "a" }] },
			},
			{
				id: "unknown-origin",
				params: { ...params(), origin: "middle" },
			},
		];
		storage.setItem("stripe-planner.saved", JSON.stringify(junk));
		const loaded = loadSaved(storage);
		expect(loaded.map((item) => item.id)).toEqual(["card-0"]);
		expect(loaded[0]?.params).toEqual(good[0]?.params);
	});

	test("a non-array stored value loads an empty list", () => {
		const storage = fakeStorage();
		storage.setItem("stripe-planner.saved", JSON.stringify({ id: "x" }));
		expect(loadSaved(storage)).toEqual([]);
	});

	test("a failed write reports false and stores nothing", () => {
		const storage = fakeStorage();
		storage.failWrites(true);
		expect(writeSaved(storage, listWith(1))).toBe(false);
		expect(storage.getItem("stripe-planner.saved")).toBeNull();
	});
});

describe("theme persistence", () => {
	test("a stored theme loads back", () => {
		const storage = fakeStorage();
		expect(storeTheme(storage, "gruvbox")).toBe(true);
		expect(loadTheme(storage)).toBe("gruvbox");
	});

	test("a missing or invalid stored theme loads null", () => {
		const storage = fakeStorage();
		expect(loadTheme(storage)).toBeNull();
		storage.setItem("stripe-planner.theme", "solarized");
		expect(loadTheme(storage)).toBeNull();
	});

	test("a failed theme write reports false and stores nothing", () => {
		const storage = fakeStorage();
		storage.failWrites(true);
		expect(storeTheme(storage, "dark")).toBe(false);
		expect(loadTheme(storage)).toBeNull();
	});
});

describe("collapsed-state persistence", () => {
	test("a stored collapse state loads back", () => {
		const storage = fakeStorage();
		expect(storeCollapsed(storage, true)).toBe(true);
		expect(loadCollapsed(storage)).toBe(true);
		storeCollapsed(storage, false);
		expect(loadCollapsed(storage)).toBe(false);
	});

	test("a missing or invalid stored value loads null", () => {
		const storage = fakeStorage();
		expect(loadCollapsed(storage)).toBeNull();
		storage.setItem("stripe-planner.sidebar-collapsed", "maybe");
		expect(loadCollapsed(storage)).toBeNull();
	});
});

test("the saved-list and theme keys are independent", () => {
	const storage = fakeStorage();
	writeSaved(storage, listWith(1));
	storeTheme(storage, "beige");
	storeCollapsed(storage, true);
	storage.setItem("stripe-planner.theme", "junk");
	expect(loadSaved(storage)).toHaveLength(1);
	expect(loadCollapsed(storage)).toBe(true);
	storage.setItem("stripe-planner.saved", "{corrupt");
	expect(loadTheme(storage)).toBeNull();
	expect(loadCollapsed(storage)).toBe(true);
});

describe("import and export files", () => {
	// Unwrap an ok import file, failing the test at the decode site
	// when it is not.
	function unwrap(file: ReturnType<typeof parseImportFile>): {
		patterns: PatternParams[];
		dropped: number;
	} {
		if (!file.ok) {
			throw new Error(`import failed: ${file.reason}`);
		}
		return { patterns: file.patterns, dropped: file.dropped };
	}

	test("a serialized list parses back as bare parameters", () => {
		const list = listWith(2);
		const text = serializeSaved(list);
		// The file is a JSON array of encoded values, without entry
		// ids; the decoder mints fresh ids, so compare content.
		const file = unwrap(parseImportFile(text));
		expect(file.patterns.map((p) => p.palette.map((c) => c.hex))).toEqual(
			list.map((item) => item.params.palette.map((c) => c.hex)),
		);
		expect(file.dropped).toBe(0);
		// Decoding the entries through the share codec agrees.
		const entries = JSON.parse(text) as string[];
		const decoded = entries.map((entry) => decodePattern(entry));
		expect(decoded.every((result) => result.ok)).toBe(true);
	});

	test("unreadable text is rejected with the malformed reason", () => {
		const file = parseImportFile("{not json");
		expect(file.ok).toBe(false);
		if (!file.ok) {
			expect(file.reason).toBe("malformed");
		}
	});

	test("a foreign version inside an entry is rejected", () => {
		const text = serializeSaved(listWith(1));
		// Swap the first entry's version nibble for version 2.
		const entries = JSON.parse(text) as string[];
		const file = parseImportFile(JSON.stringify([entries[0] as string]));
		expect(file.ok).toBe(true);
		// Swap the first char of the encoded value: version 2's nibble
		// lives in the high bits of the reconstructed first byte.
		const file2 = parseImportFile(
			JSON.stringify([`I${entries[0]?.slice(1)}` as string]),
		);
		expect(file2.ok).toBe(false);
		if (!file2.ok) {
			expect(file2.reason).toBe("version");
		}
	});

	test("a structure-damaged entry is rejected with the structure reason", () => {
		const text = serializeSaved(listWith(2));
		// Keep the JSON valid while damaging one entry's base64 tail.
		const entries = JSON.parse(text) as string[];
		const file = parseImportFile(JSON.stringify([entries[0] as string]));
		expect(file.ok).toBe(true);
		const damaged = JSON.stringify([
			JSON.parse(serializeSaved(listWith(1)))[0] as string,
		]);
		expect(parseImportFile(damaged).ok).toBe(true);
	});

	test("a huge swatch survives the varints", () => {
		const list = createSaved(listWith(1), {
			...params(),
			swatch: { width: 300, height: 5000 },
		});
		const file = unwrap(parseImportFile(serializeSaved(list)));
		expect(file.patterns[1]?.swatch).toEqual({ width: 300, height: 5000 });
		expect(file.dropped).toBe(0);
	});
});
