import { describe, it, expect, vi } from 'vitest';
import { mountEditButton } from '../src/preview/editButton';

describe('mountEditButton', () => {
  it('mounts a real, labelled button', () => {
    const host = document.createElement('div');
    const handle = mountEditButton(host, { label: 'Edit diagram', onEdit: () => {} });

    const button = host.querySelector('button.drawio-edit-button')!;
    expect(button).toBe(handle.buttonEl);
    expect(button.textContent).toBe('Edit');
    expect(button.getAttribute('aria-label')).toBe('Edit diagram');
    expect(button.getAttribute('title')).toBe('Edit diagram');
    // Live Preview renders inside a contenteditable region.
    expect(button.getAttribute('contenteditable')).toBe('false');
  });

  it('runs the action and keeps the click away from the preview', () => {
    const host = document.createElement('div');
    const previewAction = vi.fn();
    host.addEventListener('click', previewAction);
    const onEdit = vi.fn();
    const handle = mountEditButton(host, { label: 'Edit diagram', onEdit });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    handle.buttonEl.dispatchEvent(event);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(previewAction).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('swallows pointerdown so the interactive viewer never starts a pan', () => {
    const host = document.createElement('div');
    const panStart = vi.fn();
    host.addEventListener('pointerdown', panStart);
    const handle = mountEditButton(host, { label: 'Edit diagram', onEdit: () => {} });

    handle.buttonEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(panStart).not.toHaveBeenCalled();
  });

  it('removes itself and its listeners on dispose', () => {
    const host = document.createElement('div');
    const onEdit = vi.fn();
    const handle = mountEditButton(host, { label: 'Edit diagram', onEdit });
    const { buttonEl } = handle;

    handle.dispose();
    expect(host.querySelector('.drawio-edit-button')).toBeNull();
    buttonEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onEdit).not.toHaveBeenCalled();
  });
});
