import { ORIGINS, type PatternParams } from "./model";

/*
 * The share format packs a pattern into the shortest URL-compliant
 * text possible: one packed control byte (version, repeat, origin),
 * an angle byte, LEB128 varints for sizes and counts, three RGB
 * bytes per palette color, and one varint pair per stripe. Colors
 * are referenced by palette position, never by id, mirroring the
 * export file's id-free content.
 *
 * The byte stream encodes as base64url (alphabet A-Z a-z 0-9 - _),
 * whose characters are all URL-unreserved: the value needs no
 * percent-encoding in a fragment, query, or path.
 */

/** Version of the share format, in the control byte's high bits. */
const SHARE_VERSION = 1;

/**
 * Pack the control byte: version in the high 4 bits, repeat in bit
 * 3, the origin index in the low 3 bits.
 */
function packControl(
	repeat: PatternParams["repeat"],
	origin: PatternParams["origin"],
): number {
	return (
		(SHARE_VERSION << 4) |
		((repeat === "ping-pong" ? 1 : 0) << 3) |
		ORIGINS.indexOf(origin)
	);
}

/** The inverse; an unknown version, repeat, or origin rejects. */
function unpackControl(
	byte: number,
): { repeat: "cycle" | "ping-pong"; origin: PatternParams["origin"] } | null {
	if (byte >> 4 !== SHARE_VERSION) {
		return null;
	}
	const origin = ORIGINS[byte & 7];
	if (origin === undefined) {
		return null;
	}
	return {
		repeat: ((byte >> 3) & 1) === 1 ? "ping-pong" : "cycle",
		origin,
	};
}

/** Alphabet of the base64url codec: URL-unreserved characters only. */
const ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Encode a pattern as the text of a share value. The result contains
 * only base64url characters and is safe to place in any URL part.
 */
export function encodePattern(pattern: PatternParams): string {
	return encodeBase64url(patternBytes(pattern));
}

// The byte stream of one pattern, in the order the decoder reads it:
// control byte, angle, swatch varints, palette RGB triples, and one
// color-index/thickness varint pair per stripe. Colors are referenced
// by palette position, never by id, mirroring the export file's
// id-free content.
function patternBytes(pattern: PatternParams): number[] {
	const bytes: number[] = [];
	bytes.push(packControl(pattern.repeat, pattern.origin));
	// Preset angles are multiples of 15, so one byte covers them with
	// room to spare; decode clamps anything unexpected.
	bytes.push(Math.round(pattern.angle / 15));
	pushVarint(bytes, pattern.swatch.width);
	pushVarint(bytes, pattern.swatch.height);
	pushVarint(bytes, pattern.palette.length);
	for (const color of pattern.palette) {
		const value = Number.parseInt(color.hex.slice(1, 7), 16);
		if (Number.isNaN(value)) {
			bytes.push(0, 0, 0);
			continue;
		}
		bytes.push((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
	}
	// Unknown stripe colors drop here: a share never silently
	// recolors a stripe that points outside the palette.
	const pairs = pattern.stripes.flatMap((stripe) => {
		const index = pattern.palette.findIndex(
			(color) => color.id === stripe.colorId,
		);
		return index < 0 ? [] : [[index, stripe.thickness] as const];
	});
	pushVarint(bytes, pairs.length);
	for (const [index, thickness] of pairs) {
		pushVarint(bytes, index);
		pushVarint(bytes, thickness);
	}
	return bytes;
}

/**
 * Read a pattern's share value from a URL fragment, if one is present.
 * The fragment holds `#p=` plus the encoded value.
 */
export function patternFromHash(hash: string): PatternParams | null {
	if (!hash.startsWith("#p=")) {
		return null;
	}
	const result = decodePattern(hash.slice(3));
	return result.ok ? result.params : null;
}

/**
 * The query string that names `pattern` as the working state:
 * `?p=` plus the encoded value. The app writes this with
 * `history.replaceState`, so edits never add browser history items.
 */
export function queryForPattern(pattern: PatternParams): string {
	return `?p=${encodePattern(pattern)}`;
}

/**
 * Read the working pattern from a query string, if one is present.
 * The query holds `?p=` plus the encoded value. Decode failures are
 * silent: the caller falls back to the default pattern.
 */
export function patternFromQuery(search: string): PatternParams | null {
	if (!search.startsWith("?p=")) {
		return null;
	}
	const result = decodePattern(search.slice(3));
	return result.ok ? result.params : null;
}

/**
 * The share fragment for `pattern`: `#p=` plus the encoded value.
 */
export function hashForPattern(pattern: PatternParams): string {
	return `#p=${encodePattern(pattern)}`;
}

/**
 * Why a share value failed to decode. `malformed` covers an
 * alphabet violation or a stray nonzero bit tail; `version` an
 * unknown version nibble; `structure` a truncated or overrun byte
 * stream, with the byte offset as detail.
 */
export type DecodeReason = "malformed" | "version" | "structure";

/** The outcome of decoding a share value. */
export type ShareResult =
	| { ok: true; params: PatternParams; dropped: number }
	| { ok: false; reason: DecodeReason; detail?: number };

/**
 * Decode a share value. Stripes whose color index exceeds the
 * palette are dropped and counted in `dropped`; every other defect
 * rejects the value.
 */
export function decodePattern(text: string): ShareResult {
	const bytes = decodeBase64url(text);
	if (bytes === null) {
		return { ok: false, reason: "malformed" };
	}
	const parsed = parsePattern(bytes, 0);
	if (parsed.ok) {
		return { ok: true, params: parsed.params, dropped: parsed.dropped };
	}
	return { ok: false, reason: parsed.reason, detail: parsed.detail };
}

/**
 * Parse the byte stream from `offset`. `ok` carries the params and
 * how many stripes were dropped for unknown colors; a failure
 * carries the reason and, for `structure`, the byte offset reached.
 */
function parsePattern(
	bytes: readonly number[],
	offset: number,
):
	| { ok: true; params: PatternParams; dropped: number; next: number }
	| { ok: false; reason: "structure" | "version"; detail?: number } {
	let cursor = offset;
	const read = (): number | null =>
		cursor < bytes.length ? (bytes[cursor++] as number) : null;
	const readVarint = (): number | null => {
		let value = 0;
		let shift = 0;
		for (;;) {
			const byte = read();
			if (byte === null) {
				return null;
			}
			value |= (byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) {
				return value;
			}
			shift += 7;
		}
	};
	const controlByte = read();
	if (controlByte === null) {
		return { ok: false, reason: "structure", detail: cursor };
	}
	const control = unpackControl(controlByte);
	if (control === null) {
		return { ok: false, reason: "version", detail: cursor };
	}
	const { repeat, origin } = control;
	const angleByte = read();
	if (angleByte === null) {
		return { ok: false, reason: "structure", detail: cursor };
	}
	const angle = Math.min(Math.max(angleByte, 1), 5) * 15;
	const width = readVarint();
	const height = readVarint();
	if (width === null || height === null) {
		return { ok: false, reason: "structure", detail: cursor };
	}
	const swatch = { width: Math.max(width, 1), height: Math.max(height, 1) };
	const palette: PatternParams["palette"] = [];
	const paletteLength = readVarint();
	if (paletteLength === null) {
		return { ok: false, reason: "structure", detail: cursor };
	}
	for (let i = 0; i < paletteLength; i++) {
		const red = read();
		const green = read();
		const blue = read();
		if (red === null || green === null || blue === null) {
			return { ok: false, reason: "structure", detail: cursor };
		}
		const hex = `#${((red << 16) | (green << 8) | blue)
			.toString(16)
			.padStart(6, "0")}`;
		palette.push({ id: crypto.randomUUID(), hex });
	}
	const stripes: PatternParams["stripes"] = [];
	const stripesLength = readVarint();
	if (stripesLength === null) {
		return { ok: false, reason: "structure", detail: cursor };
	}
	let dropped = 0;
	for (let i = 0; i < stripesLength; i++) {
		const colorIndex = readVarint();
		const thickness = readVarint();
		if (colorIndex === null || thickness === null) {
			return { ok: false, reason: "structure", detail: cursor };
		}
		if (colorIndex < palette.length) {
			const color = palette[colorIndex] as { id: string; hex: string };
			stripes.push({ colorId: color.id, thickness });
		} else {
			dropped++;
		}
	}
	return {
		ok: true,
		next: cursor,
		params: { palette, stripes, repeat, origin, angle, swatch },
		dropped,
	};
}

// Push one unsigned integer as a LEB128 varint: 7 payload bits per
// byte, the high bit set on every byte but the last.
function pushVarint(bytes: number[], value: number): void {
	let rest = Math.max(Math.round(value), 0);
	do {
		let byte = rest & 0x7f;
		rest >>>= 7;
		if (rest > 0) {
			byte |= 0x80;
		}
		bytes.push(byte);
	} while (rest > 0);
}

// Base64url without padding, over the URL-safe alphabet above.
function encodeBase64url(bytes: readonly number[]): string {
	let text = "";
	for (let i = 0; i < bytes.length; i += 3) {
		const a = bytes[i] ?? 0;
		const b = bytes[i + 1];
		const c = bytes[i + 2];
		text += ALPHABET[a >> 2];
		text +=
			b === undefined
				? ALPHABET[(a & 3) << 4]
				: ALPHABET[((a & 3) << 4) | (b >> 4)];
		if (b === undefined) {
			break;
		}
		text +=
			c === undefined
				? ALPHABET[(b & 15) << 2]
				: ALPHABET[((b & 15) << 2) | (c >> 6)];
		if (c === undefined) {
			break;
		}
		text += ALPHABET[c & 63];
	}
	return text;
}

// The inverse; anything outside the alphabet (including '=' padding)
// rejects the whole value.
function decodeBase64url(text: string): readonly number[] | null {
	const bytes: number[] = [];
	let buffer = 0;
	let bits = 0;
	for (const char of text) {
		const value = ALPHABET.indexOf(char);
		if (value < 0) {
			return null;
		}
		buffer = (buffer << 6) | value;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((buffer >> bits) & 0xff);
		}
	}
	if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
		return null;
	}
	return bytes;
}
