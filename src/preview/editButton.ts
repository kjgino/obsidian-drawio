/**
 * The hover **Edit** button shown on every diagram preview (desktop only).
 *
 * Clicking a preview no longer opens the editor — this button is the way in.
 * It is a real `<button>` parked in the preview's top-right corner and revealed
 * on hover or keyboard focus (CSS only, so it never goes stale when a setting
 * changes). It is NOT the centred overlay removed in 0.6.1: that one covered
 * the diagram, wasn't focusable, and wasn't a button.
 *
 * The host element must be a positioning context — every mount point
 * (`.drawio-codeblock`, `.drawio-embed`, `.drawio-dualformat-embed`,
 * `.drawio-preview-file-view`) already sets `position: relative` in styles.css.
 */

export interface EditButtonHandle {
  readonly buttonEl: HTMLButtonElement;
  dispose(): void;
}

export interface EditButtonOptions {
  /** Tooltip / accessible name, e.g. "Edit diagram". */
  label: string;
  onEdit(): void;
}

export function mountEditButton(
  host: HTMLElement,
  opts: EditButtonOptions,
): EditButtonHandle {
  const button = host.createEl('button', { cls: 'drawio-edit-button', text: 'Edit' });
  button.setAttribute('aria-label', opts.label);
  button.setAttribute('title', opts.label);
  // A preview inside Live Preview sits in a contenteditable region; without
  // this the browser puts the caret in the button instead of clicking it.
  button.setAttribute('contenteditable', 'false');
  button.type = 'button';

  const onClick = (event: MouseEvent): void => {
    // The preview's own click handler (and Obsidian's embed click handling)
    // must never see this.
    event.preventDefault();
    event.stopPropagation();
    opts.onEdit();
  };
  // The preview click handler is registered in the bubble phase, and the
  // interactive viewer listens on pointerdown — claim both here.
  const onPointerDown = (event: PointerEvent): void => { event.stopPropagation(); };

  button.addEventListener('click', onClick);
  button.addEventListener('pointerdown', onPointerDown);

  return {
    buttonEl: button,
    dispose(): void {
      button.removeEventListener('click', onClick);
      button.removeEventListener('pointerdown', onPointerDown);
      button.remove();
    },
  };
}
