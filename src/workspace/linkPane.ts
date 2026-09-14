import { Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { classifyDiagramLink, splitLinktext } from '../model/diagramLink';
import { acquireSplitLeaf, leafContaining } from './splitPane';
import type DrawioPlugin from '../main';

/**
 * Open a link that was clicked inside a diagram preview.
 *
 * Internal targets go into ONE reusable pane split off to the right of the
 * note the diagram lives in; every later link click reuses that same pane
 * (`plugin.linkPaneLeaf`), so following a chain of links never buries the
 * workspace in tabs. External URLs are handed to the OS instead — a browser
 * page has nothing to do with an Obsidian pane.
 *
 * Nothing here touches Node or Electron, so diagram links work on mobile too,
 * where previews are all there is.
 */
export async function openDiagramLink(
  plugin: DrawioPlugin,
  rawLink: string,
  sourcePath: string,
  originEl: HTMLElement | null,
): Promise<void> {
  const link = classifyDiagramLink(rawLink);
  if (link.kind === 'blocked') {
    new Notice(`Drawio: this diagram link cannot be opened — ${rawLink}`);
    return;
  }
  if (link.kind === 'external') {
    const win = originEl?.ownerDocument.defaultView ?? activeWindow;
    win.open(link.url, '_blank');
    return;
  }

  const { app } = plugin;
  const leaf = acquireSplitLeaf(
    app, plugin.linkPaneLeaf, 'vertical', leafContaining(app, originEl),
  );
  plugin.linkPaneLeaf = leaf;

  const { path, subpath } = splitLinktext(link.linktext);
  // A `#heading`-only link points inside the note that owns the diagram.
  const targetPath = path || sourcePath;
  const file = targetPath
    ? app.metadataCache.getFirstLinkpathDest(targetPath, sourcePath)
    : null;
  try {
    if (file instanceof TFile) {
      await leaf.openFile(file, subpath ? { eState: { subpath } } : undefined);
      app.workspace.setActiveLeaf(leaf, { focus: true });
      return;
    }
    // Unresolved (a note that doesn't exist yet, an attachment shorthand,
    // an alias Obsidian resolves differently): let Obsidian's own link
    // handling deal with it, aimed at the pane we just acquired.
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await app.workspace.openLinkText(link.linktext, sourcePath, false);
  } catch (err) {
    new Notice(`Drawio: could not open "${link.linktext}" — ${String(err)}`);
  }
}

/** Forget the link pane (e.g. on unload) without detaching it — detaching a
 * leaf would discard where the user moved it. */
export function forgetLinkPane(plugin: { linkPaneLeaf: WorkspaceLeaf | null }): void {
  plugin.linkPaneLeaf = null;
}
