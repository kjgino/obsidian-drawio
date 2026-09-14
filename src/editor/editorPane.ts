import { Notice } from 'obsidian';
import { DRAWIO_EDITOR_PANE_VIEW_TYPE } from '../constants';
import { DrawioEditorPaneView } from './DrawioEditorPaneView';
import { acquireSplitLeaf, leafContaining } from '../workspace/splitPane';
import type { DrawioSource } from '../model/DrawioSource';
import type DrawioPlugin from '../main';

/**
 * Open `source` in the shared bottom editor pane.
 *
 * Reuse rule: if a pane of this view type is already open anywhere in the
 * workspace it is reused (and its source swapped), no matter which diagram
 * opened it — that is the whole point of the pane. Only when there is none is
 * a new one split off BELOW the pane the diagram was clicked in
 * (`createLeafBySplit(host, 'horizontal')`), so the note stays visible above
 * the editor.
 *
 * `originEl` is the clicked preview; it anchors the split to the right note
 * even when some other pane is active.
 */
export async function openInEditorPane(
  plugin: DrawioPlugin,
  source: DrawioSource,
  originEl?: HTMLElement | null,
): Promise<void> {
  const { app } = plugin;
  const existing = app.workspace.getLeavesOfType(DRAWIO_EDITOR_PANE_VIEW_TYPE)[0] ?? null;
  const leaf = acquireSplitLeaf(
    app, existing, 'horizontal', leafContaining(app, originEl),
  );
  // Set the state first so the tab header carries the diagram's name before
  // the (async) editor mount starts.
  await leaf.setViewState({
    type: DRAWIO_EDITOR_PANE_VIEW_TYPE,
    active: true,
    state: { title: source.title() },
  });
  app.workspace.setActiveLeaf(leaf, { focus: true });
  const view = leaf.view;
  if (!(view instanceof DrawioEditorPaneView)) {
    new Notice('Drawio: could not open the editor pane.');
    return;
  }
  await view.setSource(source);
}
