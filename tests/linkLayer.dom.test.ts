import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildLinkLayer, type LinkSourceViewer } from '../src/preview/linkLayer';

/**
 * Pins the contract the link layer is built on, measured off the REAL vendored
 * viewer: GraphViewer emits NO `<a>` and no cell ids, but its live `graph`
 * still answers `getLinkForCell` and hands out cell states whose coordinates
 * are the SVG's own user units.
 *
 * If a drawio bump breaks either half, this fails loudly instead of silently
 * shipping previews whose links do nothing. Skips when `npm run fetch-drawio`
 * hasn't been run, like the other suites that need the vendored blob.
 */
const viewerPath = join(process.cwd(), 'src/preview/viewer.min.txt');
const hasViewer = existsSync(viewerPath);

/** Geometry is deliberately plain: the assertions are about link plumbing. */
const XML =
  '<mxfile><diagram id="d" name="P"><mxGraphModel dx="0" dy="0" grid="0" '
  + 'page="1" pageWidth="850" pageHeight="1100"><root>'
  + '<mxCell id="0"/><mxCell id="1" parent="0"/>'
  + '<UserObject label="Ext" link="https://example.com" id="2">'
  + '<mxCell style="rounded=0" vertex="1" parent="1">'
  + '<mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></UserObject>'
  + '<UserObject label="Wiki" link="[[Some Note]]" id="3">'
  + '<mxCell style="rounded=0;rotation=30" vertex="1" parent="1">'
  + '<mxGeometry x="40" y="140" width="120" height="60" as="geometry"/></mxCell></UserObject>'
  + '<UserObject label="Nope" link="javascript:alert(1)" id="4">'
  + '<mxCell style="rounded=0" vertex="1" parent="1">'
  + '<mxGeometry x="40" y="240" width="120" height="60" as="geometry"/></mxCell></UserObject>'
  + '<mxCell id="5" value="Plain" style="rounded=0" vertex="1" parent="1">'
  + '<mxGeometry x="40" y="340" width="120" height="60" as="geometry"/></mxCell>'
  + '<UserObject label="EdgeLink" link="[[Edge Note]]" id="6">'
  + '<mxCell style="edgeStyle=none" edge="1" parent="1" source="2" target="5">'
  + '<mxGeometry relative="1" as="geometry"/></mxCell></UserObject>'
  + '</root></mxGraphModel></diagram></mxfile>';

describe.skipIf(!hasViewer)('buildLinkLayer against the real viewer', () => {
  let viewer: LinkSourceViewer;
  let renderedSvg: SVGSVGElement;

  beforeAll(() => {
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

    const mount = document.createElement('div');
    mount.className = 'mxgraph';
    mount.setAttribute('data-mxgraph', JSON.stringify({
      highlight: '#0000ff', nav: false, lightbox: false, toolbar: '', edit: null,
      'check-visible-state': false, 'dark-mode': 'off', page: 0, xml: XML,
    }));
    document.body.appendChild(mount);
    const graphViewer = win.GraphViewer as {
      createViewerForElement(el: HTMLElement, cb: (v: LinkSourceViewer) => void): void;
    };
    graphViewer.createViewerForElement(mount, (created) => { viewer = created; });
    renderedSvg = mount.querySelector('svg')!;
  });

  it('confirms why the layer is needed: the rendered SVG carries no links', () => {
    expect(renderedSvg.querySelectorAll('a').length).toBe(0);
    expect(renderedSvg.outerHTML).not.toContain('xlink:href');
    expect(renderedSvg.outerHTML).not.toContain('data-cell-id');
  });

  it('builds one hotspot per linked cell and none for unlinked ones', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const count = buildLinkLayer(viewer, svg, document);

    // Four links in the diagram, one unlinked shape.
    expect(count).toBe(4);
    const layer = svg.querySelector('.drawio-link-layer')!;
    expect(layer).not.toBeNull();
    const targets = Array.from(layer.querySelectorAll('[data-drawio-link]'))
      .map((el) => el.getAttribute('data-drawio-link'));
    // Note the third entry: drawio's own getLinkForCell already strips the
    // `javascript:` scheme, so what reaches us is an inert string. Our
    // classifier is the second gate (tests/diagramLink.test.ts) — neither is
    // relied on alone.
    expect(targets).toEqual([
      'https://example.com', '[[Some Note]]', 'alert(1)', '[[Edge Note]]',
    ]);
  });

  it('never emits an href or a script scheme — the DOM cannot navigate itself', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    buildLinkLayer(viewer, svg, document);
    const html = svg.outerHTML;
    expect(html).not.toContain('href');
    expect(html).not.toContain('javascript:');
  });

  it('places a vertex hotspot on the shape, in the SVG\'s own coordinates', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    buildLinkLayer(viewer, svg, document);
    const hotspot = svg.querySelector('[data-drawio-link="https://example.com"]')!;
    expect(hotspot.tagName.toLowerCase()).toBe('rect');
    expect(hotspot.getAttribute('width')).toBe('120');
    expect(hotspot.getAttribute('height')).toBe('60');
    expect(hotspot.getAttribute('pointer-events')).toBe('all');

    // The rendered shape carries the same coordinates, which is the whole
    // premise: no rescaling is needed between graph state and SVG user units.
    const shape = Array.from(renderedSvg.querySelectorAll('rect'))
      .find((r) => r.getAttribute('width') === '120')!;
    expect(hotspot.getAttribute('x')).toBe(shape.getAttribute('x'));
    expect(hotspot.getAttribute('y')).toBe(shape.getAttribute('y'));
  });

  it('rotates a rotated shape\'s hotspot around the shape centre', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    buildLinkLayer(viewer, svg, document);
    const hotspot = svg.querySelector('[data-drawio-link="[[Some Note]]"]')!;
    const transform = hotspot.getAttribute('transform') ?? '';
    expect(transform.startsWith('rotate(30 ')).toBe(true);
    const [, cx, cy] = /rotate\(30 ([\d.-]+) ([\d.-]+)\)/.exec(transform)!;
    const x = Number(hotspot.getAttribute('x'));
    const y = Number(hotspot.getAttribute('y'));
    expect(Number(cx)).toBeCloseTo(x + 60, 5);
    expect(Number(cy)).toBeCloseTo(y + 30, 5);
  });

  it('traces an edge with a stroked polyline, not its bounding box', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    buildLinkLayer(viewer, svg, document);
    const hotspot = svg.querySelector('[data-drawio-link="[[Edge Note]]"]')!;
    expect(hotspot.tagName.toLowerCase()).toBe('polyline');
    expect(hotspot.getAttribute('fill')).toBe('none');
    expect(hotspot.getAttribute('pointer-events')).toBe('stroke');
    expect(Number(hotspot.getAttribute('stroke-width'))).toBeGreaterThan(0);
    expect((hotspot.getAttribute('points') ?? '').split(' ').length).toBeGreaterThanOrEqual(2);
  });

  it('carries the target as a tooltip', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    buildLinkLayer(viewer, svg, document);
    const hotspot = svg.querySelector('[data-drawio-link="[[Some Note]]"]')!;
    expect(hotspot.querySelector('title')?.textContent).toBe('[[Some Note]]');
  });

  it('is a no-op without a viewer, and never throws on a broken graph', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(buildLinkLayer(null, svg, document)).toBe(0);
    expect(buildLinkLayer({ graph: null }, svg, document)).toBe(0);
    expect(buildLinkLayer(
      { graph: { getModel() { throw new Error('shape changed'); } } } as never,
      svg, document,
    )).toBe(0);
    expect(svg.childElementCount).toBe(0);
  });
});
