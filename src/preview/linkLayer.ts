import { classifyDiagramLink } from '../model/diagramLink';

/**
 * Build the clickable link layer for a rendered preview.
 *
 * WHY THIS EXISTS AT ALL: GraphViewer's rendered SVG contains no `<a>`
 * elements and no cell ids — drawio implements link clicks with listeners on
 * GraphViewer's own container, which `ViewerRenderer` deliberately throws away
 * (that container also carries the lightbox/zoom handlers we don't want). So a
 * preview lifted out of GraphViewer has nothing left to click.
 *
 * What survives is the GraphViewer instance itself: `graph.getLinkForCell(cell)`
 * returns the raw link string, and `graph.view.getState(cell)` gives the cell's
 * bounds in EXACTLY the coordinate space of the extracted SVG (GraphViewer
 * renders at scale 1, so state coordinates and SVG user units coincide — the
 * viewBox origin shift in ViewerRenderer moves the box, not the contents).
 * This module turns those two facts into a transparent hotspot per linked cell.
 *
 * The target is carried in `data-drawio-link`, never in `href`: the DOM must
 * not be able to navigate on its own, and the sanitizer never sees these nodes
 * (they are created here, after sanitization, from our own markup). Activation
 * — including a second scheme check — happens in `linkNav.ts`.
 *
 * ONE TRANSFORM CAVEAT, and it is the whole reason hotspots carry a transform:
 * in a real browser GraphViewer turns on mxGraph's `useCssTransforms` (see
 * `updateCssTransform` in the vendored blob), which renders the graph at
 * scale 1 / translate 0 and puts the real zoom and origin on the group that
 * holds the shapes — so `state` coordinates are MODEL coordinates there. In
 * jsdom `mxClient.NO_FO` is true, that path is off, and the same coordinates
 * come out already baked into the shapes. Copying that group's `transform`
 * onto the hotspot layer is correct in both modes, because the hotspots then
 * live in exactly the coordinate space the shapes are drawn in. Placing them
 * at the SVG root instead looks right under jsdom and is silently wrong in
 * Obsidian — that was the 0.8.0 "links do nothing" bug.
 *
 * Two independent gates keep script URLs out, and neither is relied on alone:
 * drawio's own `getLinkForCell` already strips a `javascript:` scheme (a link
 * of `javascript:alert(1)` reaches us as the inert `alert(1)`), and
 * `classifyDiagramLink` refuses anything outside its scheme allowlist both
 * here, when the hotspot is built, and again when it is clicked.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Click tolerance around an edge, in diagram units. */
const EDGE_HIT_WIDTH = 12;

interface MxPoint { x: number; y: number }

interface MxCell { id?: string }

interface MxCellState {
  x: number;
  y: number;
  width: number;
  height: number;
  style?: Record<string, unknown> | null;
  absolutePoints?: (MxPoint | null)[] | null;
}

interface MxModel {
  getRoot(): MxCell | null;
  getChildCount(cell: MxCell): number;
  getChildAt(cell: MxCell, index: number): MxCell | null;
  isEdge(cell: MxCell): boolean;
}

interface MxGraph {
  getModel(): MxModel;
  view: {
    getState(cell: MxCell): MxCellState | null;
    /** The <g> the shapes are rendered into; its PARENT carries the transform. */
    getDrawPane?(): Element | null | undefined;
  };
  getLinkForCell?(cell: MxCell): string | null | undefined;
}

/** The subset of a GraphViewer instance this module needs. */
export interface LinkSourceViewer {
  graph?: MxGraph | null;
}

interface LinkedCell {
  link: string;
  edge: boolean;
  state: MxCellState;
}

/** Walk the model and collect every cell that carries an openable link. */
function collectLinkedCells(graph: MxGraph): LinkedCell[] {
  const out: LinkedCell[] = [];
  if (typeof graph.getLinkForCell !== 'function') return out;
  const model = graph.getModel();
  const root = model.getRoot();
  if (!root) return out;

  const visit = (cell: MxCell): void => {
    let link: string | null | undefined;
    try {
      link = graph.getLinkForCell!(cell);
    } catch {
      link = null;
    }
    if (typeof link === 'string' && link.trim()
        && classifyDiagramLink(link).kind !== 'blocked') {
      const state = graph.view.getState(cell);
      // No state = the cell isn't on the rendered page (multi-page files keep
      // every page in one model) or is hidden; nothing to make clickable.
      if (state) out.push({ link, edge: model.isEdge(cell), state });
    }
    const count = model.getChildCount(cell);
    for (let i = 0; i < count; i++) {
      const child = model.getChildAt(cell, i);
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

/**
 * The `transform` the shapes are drawn under (mxGraph's canvas group — the
 * draw pane's parent), or null when there is none. See the caveat above:
 * under `useCssTransforms` this carries the zoom and origin that cell states
 * no longer include.
 */
function contentTransform(graph: MxGraph): string | null {
  try {
    const pane = graph.view.getDrawPane?.();
    const canvas = pane?.parentNode as Element | null | undefined;
    const transform = canvas?.getAttribute?.('transform');
    return transform && transform.trim() ? transform : null;
  } catch {
    return null;
  }
}

function rotationOf(state: MxCellState): number {
  const raw = state.style?.rotation;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function createVertexHotspot(doc: Document, state: MxCellState): SVGElement | null {
  if (!(state.width > 0) || !(state.height > 0)) return null;
  const rect = doc.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', String(state.x));
  rect.setAttribute('y', String(state.y));
  rect.setAttribute('width', String(state.width));
  rect.setAttribute('height', String(state.height));
  rect.setAttribute('fill', 'transparent');
  rect.setAttribute('pointer-events', 'all');
  const rotation = rotationOf(state);
  if (rotation !== 0) {
    const cx = state.x + state.width / 2;
    const cy = state.y + state.height / 2;
    rect.setAttribute('transform', `rotate(${rotation} ${cx} ${cy})`);
  }
  return rect;
}

function createEdgeHotspot(doc: Document, state: MxCellState): SVGElement | null {
  const points = (state.absolutePoints ?? []).filter((p): p is MxPoint =>
    !!p && Number.isFinite(p.x) && Number.isFinite(p.y));
  // A routed edge has no meaningful box — its bounding rectangle would swallow
  // clicks across the whole diagonal — so only a stroked polyline will do.
  if (points.length < 2) return null;
  const line = doc.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('points', points.map((p) => `${p.x},${p.y}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'transparent');
  line.setAttribute('stroke-width', String(EDGE_HIT_WIDTH));
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('pointer-events', 'stroke');
  return line;
}

/**
 * Append a transparent hotspot layer for every linked cell to `svg`.
 * Returns the number of hotspots created (0 leaves the SVG untouched).
 */
export function buildLinkLayer(
  viewer: LinkSourceViewer | null | undefined,
  svg: SVGElement,
  doc: Document,
): number {
  const graph = viewer?.graph;
  if (!graph) return 0;

  let cells: LinkedCell[];
  try {
    cells = collectLinkedCells(graph);
  } catch {
    // A viewer-shape change must degrade to "no links", never break the preview.
    return 0;
  }
  if (cells.length === 0) return 0;

  const layer = doc.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'drawio-link-layer');
  // Put the layer in the same coordinate space as the shapes (see above).
  const transform = contentTransform(graph);
  if (transform) layer.setAttribute('transform', transform);
  let created = 0;
  for (const { link, edge, state } of cells) {
    const hotspot = edge ? createEdgeHotspot(doc, state) : createVertexHotspot(doc, state);
    if (!hotspot) continue;
    hotspot.setAttribute('class', 'drawio-link-hotspot');
    hotspot.setAttribute('data-drawio-link', link);
    const tooltip = doc.createElementNS(SVG_NS, 'title');
    tooltip.textContent = link;
    hotspot.appendChild(tooltip);
    layer.appendChild(hotspot);
    created++;
  }
  if (created === 0) return 0;
  // Last child: hotspots must sit above the shapes they cover.
  svg.appendChild(layer);
  return created;
}
