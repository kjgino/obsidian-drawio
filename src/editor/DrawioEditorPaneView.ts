import { ItemView, WorkspaceLeaf } from 'obsidian';
import { DRAWIO_EDITOR_PANE_VIEW_TYPE } from '../constants';
import { DrawioEditor } from './DrawioEditor';
import { OfflineEditorNotInstalledError } from '../model/errors';
import type { DrawioSource } from '../model/DrawioSource';
import type DrawioPlugin from '../main';

/**
 * The reusable editor pane: one bottom split that hosts the drawio editor for
 * whichever diagram was last opened with **Edit** (a code block, a `.drawio`
 * embed, a read-only `.drawio` tab, or a dual-format image). Pressing **Edit**
 * on a different diagram swaps the source in place instead of opening another
 * pane — see `editorPane.ts` for the acquire/reuse side.
 *
 * Desktop-only, like every editing surface: it is registered from within
 * `main.ts`'s `Platform.isDesktopApp` branch.
 *
 * State: the title travels through the view state so the tab header names the
 * diagram. The source itself is a live object (a code-block source is tied to
 * a rendered element and cannot be serialised), so a pane restored with the
 * workspace — after a restart, say — comes back empty and says so rather than
 * guessing at what it used to show.
 */
export class DrawioEditorPaneView extends ItemView {
  private editor: DrawioEditor | null = null;
  private source: DrawioSource | null = null;
  private title = 'Drawio editor';

  constructor(leaf: WorkspaceLeaf, private plugin: DrawioPlugin) {
    super(leaf);
    this.navigation = false;
  }

  getViewType(): string { return DRAWIO_EDITOR_PANE_VIEW_TYPE; }
  getDisplayText(): string { return this.title; }
  getIcon(): string { return 'pencil-ruler'; }

  getState(): Record<string, unknown> {
    return { title: this.title };
  }

  async setState(state: unknown, result: { history: boolean }): Promise<void> {
    const title = (state as { title?: unknown } | null)?.title;
    if (typeof title === 'string' && title) this.title = title;
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    if (!this.source) this.renderPlaceholder();
  }

  /** Point this pane at a different diagram, replacing whatever it was editing. */
  async setSource(source: DrawioSource): Promise<void> {
    this.source = source;
    this.title = source.title();
    this.teardownEditor();
    const c = this.contentEl;
    c.empty();
    c.addClass('drawio-editor-pane');
    const editor = new DrawioEditor(c, source, this.plugin.editorDeps(), {
      // drawio's own close button empties the pane rather than closing it: the
      // user chose where this pane lives, and a leaf detached here would come
      // back somewhere else next time.
      onExit: () => {
        this.source = null;
        this.teardownEditor();
        this.renderPlaceholder();
      },
    });
    this.editor = editor;
    try {
      await editor.mount();
    } catch (err) {
      console.error('[drawio] editor pane failed to mount', err);
      c.empty();
      c.createDiv({
        cls: 'drawio-error',
        text: err instanceof OfflineEditorNotInstalledError || err instanceof Error
          ? err.message
          : String(err),
      });
    }
  }

  private renderPlaceholder(): void {
    const c = this.contentEl;
    c.empty();
    c.addClass('drawio-editor-pane');
    c.createDiv({
      cls: 'drawio-editor-pane-empty',
      text: 'No diagram loaded. Hover a diagram preview and press Edit to open it here.',
    });
  }

  private teardownEditor(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  async onClose(): Promise<void> {
    this.teardownEditor();
    this.source = null;
  }
}
