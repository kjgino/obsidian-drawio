import { describe, it, expect, beforeAll, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The real viewer is eval'd into the window below, so ensureViewerLoaded
// short-circuits on window.GraphViewer and this raw-text stub is never used.
vi.mock('../src/preview/viewer.min.txt', () => ({ default: '' }));

/**
 * Guards the coordinate space link hotspots live in — the one thing about them
 * that jsdom does NOT reproduce by default, and the cause of the 0.8.0 bug
 * where diagram links did nothing in Obsidian while every test passed.
 *
 * In a real browser GraphViewer enables mxGraph's `useCssTransforms`: the graph
 * is rendered at scale 1 / translate 0 and the real zoom and origin are put on
 * the group holding the shapes (`updateCssTransform` sets
 * `transform="scale(s,s)translate(tx,ty)"` on the draw pane's parent). Cell
 * states are then MODEL coordinates. Under jsdom `mxClient.NO_FO` is true (and
 * its UA reads as Safari, which drawio opts out of), that path stays off, and
 * the same numbers arrive already baked into the shapes — so hotspots placed at
 * the SVG root look correct there and are displaced by the whole translate in
 * the app.
 *
 * This suite forces the browser path on by flipping those two mxClient flags,
 * then renders through the REAL renderPreview and checks the hotspot lands on
 * the shape. It asserts the mode is genuinely active first, so the test can
 * never quietly degrade into the jsdom-only case it exists to cover.
 */
const viewerPath = join(process.cwd(), 'src/preview/viewer.min.txt');
const hasViewer = existsSync(viewerPath);

const GEOM = { x: 400, y: 500, w: 120, h: 60 };
const XML =
  '<mxfile><diagram id="d" name="P"><mxGraphModel dx="0" dy="0" grid="0" '
  + 'page="1" pageWidth="850" pageHeight="1100"><root>'
  + '<mxCell id="0"/><mxCell id="1" parent="0"/>'
  + '<UserObject label="Wiki" link="[[Some Note]]" id="2">'
  + '<mxCell style="rounded=0" vertex="1" parent="1">'
  + `<mxGeometry x="${GEOM.x}" y="${GEOM.y}" width="${GEOM.w}" height="${GEOM.h}" as="geometry"/>`
  + '</mxCell></UserObject>'
  + '</root></mxGraphModel></diagram></mxfile>';

describe.skipIf(!hasViewer)('preview link hotspots under css transforms', () => {
  let svg: SVGSVGElement;

  beforeAll(async () => {
    const win = window as unknown as Record<string, unknown> & { eval: (c: string) => void };
    // Same offline pre-flight as loadViewer.ts.
    win.mxLoadResources = false;
    win.mxLoadStylesheets = false;
    win.mxForceIncludes = false;
    win.STYLE_PATH = '.';
    win.RESOURCE_BASE = '.';
    win.mxBasePath = '.';
    win.PROXY_URL = '';
    win.onDrawioViewerLoad = (): void => { /* no-op */ };
    win.eval(readFileSync(viewerPath, 'utf8'));

    // Make drawio take the browser branch: foreignObject supported, and not
    // the Safari exclusion that jsdom's UA otherwise triggers.
    const mxClient = win.mxClient as { NO_FO: boolean; IS_SF: boolean };
    mxClient.NO_FO = false;
    mxClient.IS_SF = false;

    const { renderPreview } = await import('../src/preview/ViewerRenderer');
    const el = document.createElement('div');
    document.body.appendChild(el);
    renderPreview(el, XML, { dark: false, page: 0 });
    svg = el.querySelector('svg')!;
  });

  it('really is in css-transform mode (otherwise this suite proves nothing)', () => {
    const canvas = svg.firstElementChild!;
    expect(canvas.tagName.toLowerCase()).toBe('g');
    expect(canvas.getAttribute('transform')).toMatch(/^scale\([^)]+\)translate\([^)]+\)$/);
    // Model coordinates, not view coordinates: the proof that the shapes are
    // no longer drawn where the viewBox origin would put them.
    const shape = Array.from(svg.querySelectorAll('rect'))
      .find((r) => r.getAttribute('width') === String(GEOM.w))!;
    expect(shape.getAttribute('x')).toBe(String(GEOM.x));
  });

  it('places the hotspot on the shape, carrying the same transform', () => {
    const layer = svg.querySelector('.drawio-link-layer')!;
    const canvas = svg.firstElementChild!;
    expect(layer.getAttribute('transform')).toBe(canvas.getAttribute('transform'));

    const hotspot = svg.querySelector('[data-drawio-link="[[Some Note]]"]')!;
    const shape = Array.from(svg.querySelectorAll('rect'))
      .find((r) => r.getAttribute('width') === String(GEOM.w))!;
    expect(hotspot.getAttribute('x')).toBe(shape.getAttribute('x'));
    expect(hotspot.getAttribute('y')).toBe(shape.getAttribute('y'));
    expect(hotspot.getAttribute('width')).toBe(String(GEOM.w));
    expect(hotspot.getAttribute('height')).toBe(String(GEOM.h));
  });
});
