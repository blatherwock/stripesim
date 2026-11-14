# Stripesim

Stripesim is a browser app for planning striped fabric. Pick your colors, arrange them into a sequence of stripes, set widths and a direction, and the swatch redraws on every change. It is entirely client side: no account, no server, and the address bar always holds a link to exactly what is on screen.

## Why it exists

Judging a striped pattern means answering a lot of small questions at once: which color follows which, how wide each band runs, where the sequence starts, whether it repeats forward or back and forth. On paper, every change means redrawing the swatch by hand, and a wrong call only shows up after the fabric exists. Stripesim redraws the swatch for you, so the design is settled on screen before it reaches yarn.

## The screen

Settings sit on the left, the swatch in the middle, and saved patterns on the right.

## Palette

Every color in the pattern comes from the palette:

- Add colors with the plus button
- Click a swatch to open your system picker, or type a hex code
- Remove a color with the x button; this also removes its stripes from the sequence
- Drag a row by its handle to reorder the palette

## Stripe sequence

A pattern is a list of bands, each with a color and a thickness, repeated across the swatch. Add stripes with the plus button (a new stripe takes the first palette color), click a swatch to recolor one, and type a thickness in units. Bands stack in list order from the start point. Drag to reorder, or use the x to remove a stripe.

## Direction and repeat

- Start: the grid of arrows in the Pattern section picks where the sequence begins. An edge runs straight stripes (top and bottom give horizontal, left and right give vertical); a corner runs diagonal stripes from that corner
- Angle: with a corner start, pick the slant from the presets, 15 through 75 degrees
- Repeat: cycle restarts the sequence from its first band; ping-pong runs it forward and then back through the middle, so the bands at each end are not doubled

## Swatch size

Set the swatch's width × height in units. The preview always scales to fit the canvas.

## Undo and reset

Every pattern change goes into the session history. Step through it with the back and forward buttons at the top of the panel; the reset button restores the demo pattern. Your browser's back button does not undo pattern edits.

## Saving patterns

The saved list on the right keeps patterns across visits, stored in your browser. Save the current pattern with the save button, click a card to load it back into the editor, and hover a card to overwrite it with the current pattern or delete it. Drag cards to reorder, and use the chevron to collapse the list when you want more room for the canvas.

## Links and files

The address bar always holds a link to the current pattern: copy it, bookmark it, or reload the page, and the pattern comes back exactly as it was. The share button in the saved list footer copies that link to your clipboard.

For backups, export downloads the whole saved list as a JSON file. Import reads a file back and asks whether to replace the saved list or add to it. A damaged file is refused with a message, and stripes whose colors the file does not define are dropped.

## Themes

The four-segment picker at the bottom of the panel switches between light, beige, gruvbox, and dark. The app defaults to your system preference and saves further choices between sessions.
