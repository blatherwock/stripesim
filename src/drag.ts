/**
 * Drag state shared by every reorderable list of one build: the index
 * of the item being dragged, or null between drags.
 */
export type DragState = { from: number | null };

/** Remove every drop indicator under `host`. */
export function clearDropIndicators(host: HTMLElement): void {
	for (const node of host.querySelectorAll(".drop-above, .drop-below")) {
		node.classList.remove("drop-above", "drop-below");
	}
}

/**
 * Show the drop indicator at the one gap the dragged row will land
 * in: on the top edge of the row that follows the insertion point, or
 * on the bottom edge of the last row when the item lands at the end.
 * Drawing the line from the target index — not from the hovered row —
 * gives each gap exactly one indicator, since hovering the bottom of
 * row i and the top of row i+1 resolve to the same target. A no-op
 * drop shows nothing.
 */
export function showDropIndicator(
	host: HTMLElement,
	selector: string,
	from: number,
	target: number,
): void {
	if (target === from) {
		return;
	}
	const rows = [...host.querySelectorAll(selector)];
	const follower = target < from ? target : target + 1;
	const row = follower < rows.length ? rows[follower] : rows.at(-1);
	if (row) {
		row.classList.add(follower < rows.length ? "drop-above" : "drop-below");
	}
}

/**
 * Insertion index for dropping `from` above or below `row`, adjusted
 * for the removal that the move itself performs. The result equals
 * `from` when the drop reproduces the current order, making the move
 * a no-op.
 */
export function dropTargetIndex(
	from: number,
	row: number,
	below: boolean,
): number {
	const insert = below ? row + 1 : row;
	return from < insert ? insert - 1 : insert;
}

/**
 * Drop wiring for a whole reorderable section, not single rows: the
 * target comes from the cursor's height among the row rects, so the
 * section heading, the row margins, and the area below the last row
 * all land the drop somewhere sensible. `preventDefault` on every
 * dragover is what permits the drop at all; skipping it for
 * self-hovers made the browser cancel edge drops. `onMove` receives
 * the source and target index on drop.
 */
export function attachReorder(
	sectionBox: HTMLElement,
	selector: string,
	drag: DragState,
	onMove: (from: number, target: number) => void,
): void {
	const target = (event: DragEvent): number => {
		const rows = [...sectionBox.querySelectorAll(selector)];
		for (const [index, row] of rows.entries()) {
			const rect = row.getBoundingClientRect();
			if (event.clientY <= rect.top + rect.height / 2) {
				return dropTargetIndex(drag.from ?? 0, index, false);
			}
		}
		const last = rows.length - 1;
		return dropTargetIndex(drag.from ?? 0, last, true);
	};
	sectionBox.addEventListener("dragover", (event) => {
		if (drag.from === null) {
			return;
		}
		event.preventDefault();
		clearDropIndicators(sectionBox);
		showDropIndicator(sectionBox, selector, drag.from, target(event));
	});
	sectionBox.addEventListener("drop", (event) => {
		if (drag.from === null) {
			return;
		}
		event.preventDefault();
		const from = drag.from;
		drag.from = null;
		onMove(from, target(event));
	});
}
