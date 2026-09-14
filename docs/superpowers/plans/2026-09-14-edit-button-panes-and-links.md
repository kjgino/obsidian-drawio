# Plan — hover Edit button, split-pane editor, diagram links, left-aligned previews

Date: 2026-09-14

Six behaviour changes requested:

1. Clicking a preview no longer opens the editor. Hovering shows an **Edit**
   button; pressing it opens the editor in a **bottom split pane**.
2. Pressing **Edit** on another diagram **reuses** that bottom pane.
3. Diagram links accept **Obsidian URIs** (`obsidian://open?...`) and
   **wiki links** (`[[Note]]`), alongside plain vault paths and external URLs.
4. Clicking a link opens a **right split pane** showing the link target.
5. A second link click **reuses** the same right pane.
6. Drawio previews in notes are **left-aligned**.

Confirmed decisions: preview click action default becomes **Do nothing**;
`DrawioModal` is removed (the split pane is the only editor surface for
blocks/embeds); `Preview alignment` keeps its setting but defaults to **Left**;
Edit button applies to code blocks, `.drawio` embeds, the read-only `.drawio`
tab, and dual-format image embeds (Edit button only — a native `<img>` has no
SVG to hit-test, so no links there).

## Key finding that shapes the link work

GraphViewer's rendered SVG contains **no `<a>` elements and no cell ids** — the
editor's link handling lives in click listeners on GraphViewer's own container,
which `ViewerRenderer` deliberately throws away. Verified against the real
vendored viewer in jsdom.

What *is* available: `createViewerForElement(el, cb)` hands back the
`GraphViewer` instance, and from it `graph.getLinkForCell(cell)` returns the raw
link string, while `graph.view.getState(cell)` gives bounds in **exactly the
SVG's user coordinate space** (GraphViewer renders at scale 1, so state
coordinates equal the coordinates in the extracted SVG). Edges expose
`state.absolutePoints`; rotation comes from `state.style.rotation`.

So: build a transparent **hotspot layer** into the sanitized SVG at render time,
carrying the link target in `data-drawio-link` (never in an `href`, so the DOM
can never navigate on its own), and handle activation ourselves.

## Work items

### 1. Link model — `src/model/diagramLink.ts` (pure, unit-tested)

`classifyDiagramLink(raw)` → `{kind:'internal', linktext}` | `{kind:'external',
url}` | `{kind:'blocked'}`.

- `[[Target#Heading|alias]]` → internal, linktext `Target#Heading`.
- `obsidian://open?vault=V&file=F` (and `?file=` alone) → internal.
  `obsidian://` URIs we cannot map to a vault path stay external.
- `http(s):`/`mailto:`/`file:`/`ftp:` → external.
- Anything else carrying a scheme (`javascript:`, `data:`, `vbscript:`, …) →
  blocked. Scheme detection normalises control/whitespace characters the way
  `svgSanitizer.isUnsafeUrl` does.
- No scheme → internal (vault-relative path or bare note name, `#heading`
  inside the current note included).

Regex constraint: no lookbehind / named groups / `\p{}` in literals
(mobile parse-time crash — see CLAUDE.md).

### 2. Hotspot layer — `src/preview/linkLayer.ts`

`buildLinkLayer(graph, svg, doc)` appends `<g class="drawio-link-layer">` to the
sanitized SVG:

- vertex → `<rect>` at the state bounds, `fill:transparent`,
  `pointer-events:all`, `transform="rotate(a cx cy)"` when rotated;
- edge → `<polyline>` through `absolutePoints`, transparent stroke ~12px,
  `pointer-events:stroke` (bbox `<rect>` fallback when points are missing);
- each carries `data-drawio-link` and a `<title>` with the target;
- built with `createElementNS`, appended *after* sanitization, no `href`.

`ViewerRenderer.renderPreview` captures the viewer instance via the
`createViewerForElement` callback and calls this from `extractSizedSvg`'s
caller. Return type stays `boolean` (existing call sites and tests unchanged).

### 3. Link activation — `src/preview/linkNav.ts` + `src/workspace/linkPane.ts`

`registerDiagramLinks(root, {app, sourcePath, getPlugin})` attaches one
capture-phase `click` (plus a `pointerdown` drag guard, so a pan gesture in the
interactive viewer never fires a link) and resolves
`closest('[data-drawio-link]')` or `closest('a[href]')` (html-label links).

`openDiagramLink(plugin, link, sourcePath, originEl)`:
- external → `window.open(url, '_blank')`;
- blocked → `Notice`, nothing else;
- internal → reuse the tracked right-split leaf, validated via
  `iterateAllLeaves` (`getLeafById` is `@since 1.5.1`, above `minAppVersion`);
  create it with `createLeafBySplit(hostLeaf, 'vertical')` where `hostLeaf` is
  the leaf containing the clicked preview. Open with `leaf.openFile(file,
  {eState:{subpath}})` when the link resolves through `metadataCache`, else
  activate the leaf and fall back to `workspace.openLinkText(...)` so
  non-existent targets behave like ordinary Obsidian links.

Available on mobile too — no Node/Electron APIs involved.

### 4. Editor pane — `src/editor/DrawioEditorPaneView.ts` + `src/editor/editorPane.ts`

New view type `drawio-editor-pane` (added to `src/constants.ts`), registered
desktop-only through the existing dynamic-import gate in `main.ts`.

- `DrawioEditorPaneView extends ItemView` hosts a `DrawioEditor` and swaps its
  source via `setSource(source)`; `setState({title})` keeps the tab header in
  step and a restored (source-less) pane shows a short placeholder.
- `openInEditorPane(plugin, source, originEl)` reuses
  `getLeavesOfType(DRAWIO_EDITOR_PANE_VIEW_TYPE)[0]`, else splits the host leaf
  horizontally (`createLeafBySplit(host, 'horizontal')` → below), then
  `setViewState` + `setSource` + `setActiveLeaf`.
- `DrawioPlugin.openEditor()` routes here; **`src/editor/DrawioModal.ts` is
  deleted** along with its tests/references.

### 5. Hover Edit button — `src/preview/editButton.ts`

`mountEditButton(root, {onEdit, title})` creates a real
`<button class="drawio-edit-button">`, top-right, revealed on hover/focus
(CSS only), hidden while the interactive viewer is active (its toolbar already
has an Edit button). Click stops propagation so it never reaches the preview's
own click handler. Mounted by `DrawioCodeBlock`, both embed paths,
`registerDualFormatEmbeds`, and `DrawioPreviewFileView`; desktop only.
The action still follows the existing **Edit button action** setting, whose
settings row now renders unconditionally (it was gated on the interactive
viewer).

### 6. Defaults

- `previewClickAction` default `'editor'` → `'none'`.
- `previewAlignment` default `'center'` → `'left'`.
- Both remain settable; existing users keep their saved values.

### 7. Styles

`.drawio-edit-button` (hover reveal, theme tokens), `.drawio-link-hotspot`
(`cursor: pointer`), `.drawio-editor-pane` (iframe fills the pane).

### 8. Tests

New: `diagramLink.test.ts`, `linkLayer.dom.test.ts` (real vendored viewer,
skipped when absent — asserts hotspot geometry, rotation, edge polyline and
that **no `href` is ever emitted**), `linkNav.dom.test.ts` (routing, drag
suppression, blocked schemes), `editButton.dom.test.ts`, `editorPane.test.ts`
(pane reuse + split direction).
Updated: `settings.test.ts`, `clickAction.test.ts`, `main.test.ts`,
`drawioPreviewFileView.test.ts`, `dualFormatEmbed.dom.test.ts`, the two mobile
suites, `settingsTab.test.ts`.

### 9. Docs

`README.md` + `README.zh-CN.md` (mirrored), `docs/MANUAL_TESTS.md`,
`CLAUDE.md` (module map, new non-obvious decisions: the hotspot-layer approach
and why links cannot come from the SVG itself), `CHANGELOG.md` under
`### Changed — action may be required` (click action and alignment defaults,
modal removal) plus `### Added`.

## Outcome notes (post-implementation)

- Confirmed against the real vendored viewer: GraphViewer emits no `<a>`, no
  `xlink:href` and no cell ids, and its cell-state coordinates equal the
  extracted SVG's user units — the whole hotspot approach rests on that, and
  `tests/linkLayer.dom.test.ts` now pins both halves.
- Discovered while testing: drawio's own `getLinkForCell` already strips a
  `javascript:` scheme (`javascript:alert(1)` arrives as the inert
  `alert(1)`). That is a second gate, not a replacement for ours —
  `classifyDiagramLink` still allowlists schemes at build time and again at
  click time.
- `Workspace.getLeafById` (`@since 1.5.1`) and `revealLeaf` (`@since 1.7.2`)
  were both avoided as above `minAppVersion` 1.4.0; `createLeafBySplit`
  (0.9.7), `getLeavesOfType`/`iterateAllLeaves` (0.9.7), `setActiveLeaf`
  (0.16.3), `openLinkText` (0.16.0) and `getMostRecentLeaf` (0.15.4) are all
  safe. Verified by running `obsidianmd/no-unsupported-api` locally: no
  findings in the new code.
- **Post-ship bug found in the app, not in tests:** hotspots were appended at
  the SVG root, which is only correct while mxGraph's `useCssTransforms` is
  off. jsdom keeps it off (`mxClient.NO_FO`, and a Safari-looking UA that
  drawio excludes); a real browser turns it on, moving the zoom/origin onto the
  shape group and leaving cell states in model coordinates — so every hotspot
  sat one whole translate away from its shape and no link could be clicked.
  Fixed by copying that group's `transform` onto the layer, and pinned by
  `tests/previewLinkTransform.dom.test.ts`, which forces the browser path on.
