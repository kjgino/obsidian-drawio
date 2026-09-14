import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile } from 'obsidian';

import { openDiagramLink } from '../src/workspace/linkPane';
import type DrawioPlugin from '../src/main';

function fileLeaf() {
  return {
    view: { containerEl: document.createElement('div') },
    openFile: vi.fn().mockResolvedValue(undefined),
  };
}

function fakePlugin(opts: { resolves?: boolean } = {}) {
  const created = fileLeaf();
  const host = { id: 'host', view: { containerEl: document.createElement('div') } };
  const leaves: Array<Record<string, unknown>> = [host];
  const workspace = {
    createLeafBySplit: vi.fn(() => { leaves.push(created); return created; }),
    getLeaf: vi.fn(() => created),
    getMostRecentLeaf: vi.fn(() => host),
    setActiveLeaf: vi.fn(),
    openLinkText: vi.fn().mockResolvedValue(undefined),
    iterateAllLeaves: (cb: (leaf: unknown) => void) => { for (const l of leaves) cb(l); },
  };
  const target = Object.assign(new TFile(), { path: 'Target.md', basename: 'Target' });
  const plugin = {
    app: {
      workspace,
      metadataCache: {
        getFirstLinkpathDest: vi.fn(() => (opts.resolves === false ? null : target)),
      },
    },
    linkPaneLeaf: null,
  } as unknown as DrawioPlugin;
  return { plugin, workspace, created, host, target, leaves };
}

describe('openDiagramLink', () => {
  let origin: HTMLElement;

  beforeEach(() => {
    origin = document.createElement('div');
    document.body.appendChild(origin);
  });

  it('opens a wiki link in a pane split to the right of the note', async () => {
    const { plugin, workspace, created, host, target } = fakePlugin();
    host.view.containerEl.appendChild(origin);

    await openDiagramLink(plugin, '[[Target]]', 'Note.md', origin);

    expect(workspace.createLeafBySplit).toHaveBeenCalledTimes(1);
    const [anchor, direction] = workspace.createLeafBySplit.mock.calls[0] as unknown as [
      { id?: string }, string,
    ];
    expect(anchor.id).toBe('host');
    expect(direction).toBe('vertical');
    expect(created.openFile).toHaveBeenCalledWith(target, undefined);
    expect(plugin.linkPaneLeaf).toBe(created);
  });

  it('reuses that same pane for the next link', async () => {
    const { plugin, workspace, created } = fakePlugin();
    await openDiagramLink(plugin, '[[Target]]', 'Note.md', origin);
    await openDiagramLink(plugin, '[[Other]]', 'Note.md', origin);

    expect(workspace.createLeafBySplit).toHaveBeenCalledTimes(1);
    expect(created.openFile).toHaveBeenCalledTimes(2);
  });

  it('splits again once the user has closed the link pane', async () => {
    const { plugin, workspace, leaves } = fakePlugin();
    await openDiagramLink(plugin, '[[Target]]', 'Note.md', origin);
    // The user closed it: it is no longer among the workspace's leaves.
    leaves.pop();
    await openDiagramLink(plugin, '[[Target]]', 'Note.md', origin);
    expect(workspace.createLeafBySplit).toHaveBeenCalledTimes(2);
  });

  it('passes a heading subpath through to the opened file', async () => {
    const { plugin, created, target } = fakePlugin();
    await openDiagramLink(plugin, '[[Target#Section]]', 'Note.md', origin);
    expect(created.openFile).toHaveBeenCalledWith(target, { eState: { subpath: '#Section' } });
  });

  it('resolves a bare `#heading` against the note holding the diagram', async () => {
    const { plugin } = fakePlugin();
    await openDiagramLink(plugin, '[[#Section]]', 'notes/Note.md', origin);
    const resolve = plugin.app.metadataCache.getFirstLinkpathDest as unknown as ReturnType<typeof vi.fn>;
    expect(resolve).toHaveBeenCalledWith('notes/Note.md', 'notes/Note.md');
  });

  it('falls back to Obsidian link handling for an unresolved target', async () => {
    const { plugin, workspace, created } = fakePlugin({ resolves: false });
    await openDiagramLink(plugin, '[[Not Yet Created]]', 'Note.md', origin);
    expect(created.openFile).not.toHaveBeenCalled();
    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(created, { focus: true });
    expect(workspace.openLinkText).toHaveBeenCalledWith('Not Yet Created', 'Note.md', false);
  });

  it('sends an external URL to the browser, never to a pane', async () => {
    const { plugin, workspace } = fakePlugin();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await openDiagramLink(plugin, 'https://example.com', 'Note.md', origin);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank');
    expect(workspace.createLeafBySplit).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('refuses a blocked link without touching the workspace', async () => {
    const { plugin, workspace } = fakePlugin();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await openDiagramLink(plugin, 'javascript:alert(1)', 'Note.md', origin);
    expect(open).not.toHaveBeenCalled();
    expect(workspace.createLeafBySplit).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
