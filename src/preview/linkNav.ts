import { openDiagramLink } from '../workspace/linkPane';
import type DrawioPlugin from '../main';

/**
 * Make the hotspots `linkLayer.ts` builds (and any `<a href>` drawio rendered
 * inside an html=1 label) actually open.
 *
 * One delegated listener per preview root, in the CAPTURE phase, so a link
 * click is claimed before the preview's own click handler (open the editor /
 * activate the interactive viewer) ever sees it. A pointer that travelled more
 * than a few pixels is a pan gesture in the interactive viewer, not a click,
 * and must not navigate.
 */

/** Pointer travel (px) beyond which a click is treated as the end of a drag. */
const DRAG_CANCEL_THRESHOLD = 4;

export interface DiagramLinkHandle {
  dispose(): void;
}

export interface DiagramLinkOptions {
  /** Note that owns the preview — the path links resolve against. Resolved
   * per click so a re-used view (file tabs) always reports its current file. */
  sourcePath(): string;
}

/** The link target under `target`, or null when the click wasn't on a link. */
function linkAt(target: EventTarget | null): string | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return null;
  const hotspot = el.closest('[data-drawio-link]');
  if (hotspot) return hotspot.getAttribute('data-drawio-link');
  // html=1 labels can contain real anchors; drawio renders them inside a
  // <foreignObject>, which the sanitizer preserves (with unsafe schemes
  // already stripped). They are classified again before opening.
  const anchor = el.closest('a[href]');
  return anchor ? anchor.getAttribute('href') : null;
}

export function registerDiagramLinks(
  root: HTMLElement,
  plugin: DrawioPlugin,
  opts: DiagramLinkOptions,
): DiagramLinkHandle {
  let downX = 0;
  let downY = 0;
  let dragged = false;

  const onPointerDown = (event: PointerEvent): void => {
    downX = event.clientX;
    downY = event.clientY;
    dragged = false;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (dragged) return;
    if (Math.abs(event.clientX - downX) > DRAG_CANCEL_THRESHOLD
        || Math.abs(event.clientY - downY) > DRAG_CANCEL_THRESHOLD) {
      dragged = true;
    }
  };

  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const link = linkAt(event.target);
    if (link === null) return;
    // Let a pan gesture that happened to end on a hotspot finish quietly —
    // but still claim the event, so it doesn't fall through to the preview's
    // own click action either.
    event.preventDefault();
    event.stopPropagation();
    if (dragged) return;
    void openDiagramLink(plugin, link, opts.sourcePath(), root);
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('pointermove', onPointerMove, true);
  root.addEventListener('click', onClick, true);

  return {
    dispose(): void {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('click', onClick, true);
    },
  };
}
