# Manual Test Checklist

Run in a desktop test vault after `npm run build` and copying the plugin (or symlinking `main.js`, `manifest.json`, `styles.css`, `webapp/`) into `<vault>/.obsidian/plugins/obsidian-drawio/`. Reload Obsidian (Ctrl/Cmd+R) after each rebuild.

## Code blocks
- [ ] A ` ```drawio ` block with valid mxfile XML renders an SVG preview in reading mode.
- [ ] Hovering the preview reveals an **Edit** button in its top-right corner; clicking the diagram itself does nothing (default **Preview click action → Do nothing**).
- [ ] Editing and saving in the editor pane updates the code block XML and the preview.
- [ ] Repeated autosaves while editing keep updating the SAME block (no "failed to save" spam, correct block among multiple).
- [ ] Invalid XML in the block shows the error placeholder + an Edit button.
- [ ] Two drawio blocks in one note edit independently (editing one doesn't corrupt the other).

## Files
- [ ] "Create new drawio diagram" command creates and opens a `.drawio` file in the custom view.
- [ ] Opening an existing `.drawio` file uses the custom view (preview + Edit), not plain text.
- [ ] Edit → Save persists to the file; the preview updates.

## Embeds
- [ ] `![[x.drawio]]` shows a preview in reading mode; hovering reveals the **Edit** button.
- [ ] Editing an embed saves to the underlying file; the embed updates after the note re-renders.
- [ ] Previews sit flush with the left margin of the note (default **Preview alignment → Left**).

## Editor pane (0.8.0)
- [ ] **Edit** on a code block opens the editor in a pane split BELOW the note; the note stays visible above it.
- [ ] **Edit** on a different diagram (embed, another block, the read-only `.drawio` tab, a `.drawio.svg` embed) loads into that SAME pane — no second pane, and the tab header shows the new diagram's name.
- [ ] Closing the pane and pressing **Edit** again opens a new one below the note.
- [ ] Moving the pane elsewhere (e.g. to the right, or to its own window) and pressing **Edit** again keeps it where the user put it.
- [ ] Editing saves back to the right source in every case; the preview updates.
- [ ] drawio's own close (×) empties the pane with a short placeholder instead of closing it.
- [ ] Restarting Obsidian with the pane open restores an empty pane with that placeholder (no error).
- [ ] With **Edit button action → Open in system default app**, **Edit** on a file-backed diagram opens the OS app instead; a code block still opens the built-in editor.

## Diagram links (0.8.0)

Needs a diagram whose shapes carry links (drawio: right-click a shape → **Edit Link…**):
one `[[Some Note]]`, one `obsidian://open?vault=<vault>&file=Some%20Note`, one
`https://example.com`, one on an EDGE, and one on a note that does not exist yet.

- [ ] Hovering a linked shape shows a pointer cursor and the link target as a tooltip; unlinked shapes do not.
- [ ] Clicking a `[[wiki link]]` opens that note in a pane split to the RIGHT of the note holding the diagram.
- [ ] Clicking a different link reuses that same right pane (no pane pile-up).
- [ ] The `obsidian://open?...file=` link behaves exactly like the wiki link.
- [ ] `[[Note#Heading]]` scrolls to the heading.
- [ ] A link to a note that doesn't exist behaves like any Obsidian link to a missing note.
- [ ] An `https://` link opens in the system browser, and does NOT touch the right pane.
- [ ] The link on the EDGE is clickable along the line, not across its bounding box.
- [ ] Links work in code blocks, `.drawio` embeds (Live Preview AND Reading view), and the read-only `.drawio` tab — and on mobile too.
- [ ] With **Preview click action → Interactive viewer**: zooming/panning still works, a drag that ends on a linked shape does NOT navigate, and a plain click on it does.
- [ ] Closing the right pane and clicking another link opens a fresh one.

## Settings / theming
- [ ] Switching Obsidian dark/light updates the editor theme on the next editor open.
- [ ] Changing "Preview alignment" realigns already-rendered previews immediately (no re-render), including in a popped-out window.
- [ ] Disabling the plugin removes the left-alignment (previews in still-open notes fall back to centered).
- [ ] "Custom URL" mode loads the editor from the configured URL (e.g. https://embed.diagrams.net/).
- [ ] Server idle timeout persists across reloads; values below 5 are rejected.

## Server lifecycle
- [ ] First edit lazily starts the local server (check the dev console / network).
- [ ] The editor still opens if the first port in the range is occupied (auto-fallback).
- [ ] After the idle timeout with no editor open, the server stops.

## Cleanup
- [ ] Disabling the plugin with a `.drawio` file open does not leave a broken "No view of type" pane.
- [ ] No errors in the console on enable/disable cycles.

## Pin embed page (0.5.x)

Needs a note embedding a multi-page diagram twice: once bare
(`![[multi.drawio]]`), once with a subpath (`![[multi.drawio#Page-2]]`).

- [ ] Pin button appears on embed page controls only (code blocks and the
      read-only file view show none), enabled only after flipping away from
      the linked page. Works on mobile as well as desktop.
- [ ] Flipping the bare embed to page 2 and pinning rewrites that link to
      `![[multi.drawio#Page-2]]` (alias preserved if present), shows a
      confirming Notice, and the embed re-renders on the pinned page.
      Reopening the note lands on the pinned page.
- [ ] With TWO identical links to the same file in one note, pinning shows
      the "several identical links" Notice and leaves the note untouched.
- [ ] Pinning in Live Preview and in Reading view both work; the OTHER
      embed of the same file (different subpath) never changes.
- [ ] A markdown-style embed (`![alt](multi.drawio)`) shows the "markdown-style link" Notice on pin and the note text is untouched.
- [ ] Clicking the pin never also triggers the embed click action
      (editor/default app).

## Dual-format embed click-to-edit (0.6.0)

Needs a `.drawio.svg` (and a `.drawio.png`) embedded in a note:
`![[diagram.drawio.svg]]`. Test in **Reading view** (the hotspot is
Reading-view only by design).

- [ ] Hovering the image reveals the **Edit** button; pressing it opens the
      embedded diagram in the editor pane (not Obsidian's image lightbox).
      There are no link hotspots here — the image is Obsidian's own `<img>`.
- [ ] Editing and saving updates both the embedded XML and the rendered image.
- [ ] With **Preview click action → Open built-in editor**, clicking the image
      opens the editor too; with **Open in default app** it opens the OS app;
      with **Do nothing** (the default) the image is not clickable.
- [ ] With **Preview click action → Interactive viewer**, clicking opens the
      editor (the interactive viewer only drives `.drawio` SVG previews; the
      native image has nothing to explore).
- [ ] A plain (non-drawio) `.svg`/`.png` embed is unaffected — normal
      image behavior.
- [ ] On mobile, the native image is untouched (no hijacked click).
- [ ] The standalone `.drawio.svg`/`.drawio.png` file tab still edits via the
      right-click **Edit drawio diagram** menu / command (file-tab hotspot is
      intentionally not added — Obsidian owns the native image view).
