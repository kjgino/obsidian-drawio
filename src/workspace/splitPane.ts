import { App, SplitDirection, WorkspaceLeaf } from 'obsidian';

/**
 * Shared helpers for the two reusable split panes this plugin opens: the
 * bottom editor pane (Edit button) and the right link pane (diagram links).
 *
 * Both follow the same rule — open ONE pane and keep reusing it — so both need
 * the same two primitives: find the leaf a preview lives in (so the split is
 * anchored to the note the user clicked in, not to whatever happens to be
 * active), and tell whether a remembered leaf is still open.
 *
 * `Workspace.getLeafById` would answer the second question directly, but it is
 * `@since 1.5.1` — above this plugin's `minAppVersion` of 1.4.0 — so the leaf
 * object itself is tracked and validated by walking the workspace
 * (`iterateAllLeaves`, `@since 0.9.7`).
 */

/** The leaf whose view currently contains `el`, or null. */
export function leafContaining(app: App, el: Node | null | undefined): WorkspaceLeaf | null {
  if (!el) return null;
  let found: WorkspaceLeaf | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    // A leaf without a container (a deferred or half-built view) simply isn't
    // the one holding this element — never let it break the lookup.
    if (found || !leaf.view?.containerEl) return;
    if (leaf.view.containerEl.contains(el)) found = leaf;
  });
  return found;
}

/** Whether `leaf` is still part of the workspace (not closed by the user). */
export function isLeafAttached(app: App, leaf: WorkspaceLeaf | null): boolean {
  if (!leaf) return false;
  let attached = false;
  app.workspace.iterateAllLeaves((candidate) => {
    if (candidate === leaf) attached = true;
  });
  return attached;
}

/**
 * Return the pane to use: `tracked` when it is still open, otherwise a fresh
 * split of `host` (falling back to the most recent leaf, then to Obsidian's own
 * "split the active leaf" behaviour when the workspace is empty).
 *
 * `direction: 'horizontal'` puts the new pane BELOW, `'vertical'` to the RIGHT.
 */
export function acquireSplitLeaf(
  app: App,
  tracked: WorkspaceLeaf | null,
  direction: SplitDirection,
  host: WorkspaceLeaf | null,
): WorkspaceLeaf {
  if (isLeafAttached(app, tracked)) return tracked!;
  const anchor = host && isLeafAttached(app, host) ? host : app.workspace.getMostRecentLeaf();
  if (anchor) return app.workspace.createLeafBySplit(anchor, direction);
  return app.workspace.getLeaf('split', direction);
}
