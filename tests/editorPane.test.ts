import { describe, it, expect, vi, beforeEach } from 'vitest';

import { openInEditorPane } from '../src/editor/editorPane';
import { DrawioEditorPaneView } from '../src/editor/DrawioEditorPaneView';
import { DRAWIO_EDITOR_PANE_VIEW_TYPE } from '../src/constants';
import type { DrawioSource } from '../src/model/DrawioSource';
import type DrawioPlugin from '../src/main';

const source: DrawioSource = {
  title: () => 'Diagram',
  read: async () => '<mxfile/>',
  write: async () => {},
};

/** A leaf whose view is a real (but inert) editor-pane view. */
function paneLeaf(): { leaf: Record<string, unknown>; setSource: ReturnType<typeof vi.fn> } {
  const setSource = vi.fn().mockResolvedValue(undefined);
  const view = Object.create(DrawioEditorPaneView.prototype) as Record<string, unknown>;
  view.setSource = setSource;
  view.containerEl = document.createElement('div');
  const leaf = { view, setViewState: vi.fn().mockResolvedValue(undefined) };
  return { leaf, setSource };
}

/** A plain leaf holding `el` — what a note pane looks like to splitPane.ts. */
function hostLeaf(id: string, el: HTMLElement): Record<string, unknown> {
  return { id, view: { containerEl: el } };
}

function fakeWorkspace(opts: {
  panes?: Array<Record<string, unknown>>;
  leaves?: Array<Record<string, unknown>>;
  mostRecent?: Record<string, unknown> | null;
}) {
  const created = paneLeaf();
  const workspace = {
    getLeavesOfType: vi.fn(() => opts.panes ?? []),
    createLeafBySplit: vi.fn(() => created.leaf),
    getLeaf: vi.fn(() => created.leaf),
    getMostRecentLeaf: vi.fn(() => opts.mostRecent ?? null),
    setActiveLeaf: vi.fn(),
    iterateAllLeaves: (cb: (leaf: unknown) => void) => {
      for (const leaf of opts.leaves ?? []) cb(leaf);
      for (const pane of opts.panes ?? []) cb(pane);
      if (opts.mostRecent) cb(opts.mostRecent);
    },
  };
  return { workspace, created };
}

function fakePlugin(workspace: unknown): DrawioPlugin {
  return { app: { workspace }, linkPaneLeaf: null } as unknown as DrawioPlugin;
}

describe('openInEditorPane', () => {
  let origin: HTMLElement;

  beforeEach(() => {
    origin = document.createElement('div');
    document.body.appendChild(origin);
  });

  it('splits the pane holding the clicked preview, downwards', async () => {
    const { workspace, created } = fakeWorkspace({ leaves: [hostLeaf('host', origin)] });
    await openInEditorPane(fakePlugin(workspace), source, origin);

    expect(workspace.createLeafBySplit).toHaveBeenCalledTimes(1);
    const [anchor, direction] = workspace.createLeafBySplit.mock.calls[0] as unknown as [
      { id?: string }, string,
    ];
    expect(anchor.id).toBe('host');
    expect(direction).toBe('horizontal');
    expect(created.setSource).toHaveBeenCalledWith(source);
  });

  it('names the pane after the diagram before mounting the editor', async () => {
    const { workspace, created } = fakeWorkspace({ leaves: [] });
    await openInEditorPane(fakePlugin(workspace), source, origin);
    const leaf = created.leaf as { setViewState: ReturnType<typeof vi.fn> };
    expect(leaf.setViewState).toHaveBeenCalledWith({
      type: DRAWIO_EDITOR_PANE_VIEW_TYPE,
      active: true,
      state: { title: 'Diagram' },
    });
  });

  it('reuses an open editor pane instead of splitting again', async () => {
    const existing = paneLeaf();
    const { workspace } = fakeWorkspace({ panes: [existing.leaf] });
    await openInEditorPane(fakePlugin(workspace), source, origin);

    expect(workspace.createLeafBySplit).not.toHaveBeenCalled();
    expect(existing.setSource).toHaveBeenCalledWith(source);
  });

  it('falls back to the most recent leaf when the preview is in no pane', async () => {
    const recent = hostLeaf('recent', document.createElement('div'));
    const { workspace } = fakeWorkspace({ leaves: [], mostRecent: recent });
    await openInEditorPane(fakePlugin(workspace), source, null);
    expect(workspace.createLeafBySplit).toHaveBeenCalledTimes(1);
    expect((workspace.createLeafBySplit.mock.calls[0] as unknown as [{ id?: string }])[0].id).toBe('recent');
  });

  it('splits a fresh leaf when the workspace has none at all', async () => {
    const { workspace } = fakeWorkspace({ leaves: [], mostRecent: null });
    await openInEditorPane(fakePlugin(workspace), source, null);
    expect(workspace.createLeafBySplit).not.toHaveBeenCalled();
    expect(workspace.getLeaf).toHaveBeenCalledWith('split', 'horizontal');
  });
});
