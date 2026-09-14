import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { registerDiagramLinks } from '../src/preview/linkNav';
import * as linkPane from '../src/workspace/linkPane';
import type DrawioPlugin from '../src/main';

const plugin = {} as DrawioPlugin;

/** Intercept the workspace side: this suite is about which link is claimed. */
function spyOnOpen() {
  return vi.spyOn(linkPane, 'openDiagramLink').mockResolvedValue(undefined);
}

function hotspot(root: HTMLElement, link: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-drawio-link', link);
  root.appendChild(el);
  return el;
}

function click(el: HTMLElement, button = 0): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button });
  el.dispatchEvent(event);
  return event;
}

function drag(root: HTMLElement, from: number, to: number): void {
  root.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: from, clientY: 0 }));
  root.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: to, clientY: 0 }));
}

describe('registerDiagramLinks', () => {
  let root: HTMLElement;
  let open: ReturnType<typeof spyOnOpen>;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    open = spyOnOpen();
  });

  afterEach(() => {
    open.mockRestore();
    root.remove();
  });

  it('opens the hotspot\'s link with the note that owns the preview', () => {
    registerDiagramLinks(root, plugin, { sourcePath: () => 'notes/Note.md' });
    click(hotspot(root, '[[Target]]'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[0]).toBe(plugin);
    expect(open.mock.calls[0]?.[1]).toBe('[[Target]]');
    expect(open.mock.calls[0]?.[2]).toBe('notes/Note.md');
  });

  it('claims the click so the preview\'s own action never runs', () => {
    const outer = document.createElement('div');
    outer.appendChild(root);
    document.body.appendChild(outer);
    const previewAction = vi.fn();
    outer.addEventListener('click', previewAction);

    registerDiagramLinks(root, plugin, { sourcePath: () => 'Note.md' });
    const event = click(hotspot(root, '[[Target]]'));

    expect(previewAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    outer.remove();
  });

  it('leaves clicks outside a hotspot alone', () => {
    registerDiagramLinks(root, plugin, { sourcePath: () => 'Note.md' });
    const plain = document.createElement('div');
    root.appendChild(plain);
    const event = click(plain);
    expect(open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('follows an <a href> from an html=1 label', () => {
    registerDiagramLinks(root, plugin, { sourcePath: () => 'Note.md' });
    const anchor = document.createElement('a');
    anchor.setAttribute('href', 'https://example.com');
    root.appendChild(anchor);
    click(anchor);
    expect(open.mock.calls[0]?.[1]).toBe('https://example.com');
  });

  it('does not navigate when the click ends a pan gesture', () => {
    registerDiagramLinks(root, plugin, { sourcePath: () => 'Note.md' });
    const target = hotspot(root, '[[Target]]');
    drag(root, 0, 40);
    const event = click(target);
    expect(open).not.toHaveBeenCalled();
    // Still claimed: a drag that ends on a hotspot must not fall through to
    // the preview's click action either.
    expect(event.defaultPrevented).toBe(true);
  });

  it('navigates when the pointer barely moved (a click, not a drag)', () => {
    registerDiagramLinks(root, plugin, { sourcePath: () => 'Note.md' });
    const target = hotspot(root, '[[Target]]');
    drag(root, 0, 2);
    click(target);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('ignores non-primary buttons', () => {
    registerDiagramLinks(root, plugin, { sourcePath: () => 'Note.md' });
    click(hotspot(root, '[[Target]]'), 2);
    expect(open).not.toHaveBeenCalled();
  });

  it('stops listening after dispose', () => {
    const handle = registerDiagramLinks(root, plugin, { sourcePath: () => 'Note.md' });
    const target = hotspot(root, '[[Target]]');
    handle.dispose();
    click(target);
    expect(open).not.toHaveBeenCalled();
  });
});
