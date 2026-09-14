import { MarkdownPostProcessorContext, Notice, Platform } from 'obsidian';
import { renderPreview } from '../preview/ViewerRenderer';
import { renderPageControl } from '../preview/pageControl';
import { resolveClickAction, resolveEditButtonAction } from '../preview/clickAction';
import { mountInteractiveViewer, type InteractiveMountHandle } from '../preview/interactiveMount';
import { mountEditButton } from '../preview/editButton';
import { registerDiagramLinks } from '../preview/linkNav';
import { SectionLifecycle } from '../preview/sectionLifecycle';
import {
  readCodeBlockViewportHeight, writeCodeBlockViewportHeight,
} from '../preview/viewportHeight';
import { getDiagramPages, ensureMxfile } from '../model/xmlUtils';
import { CodeBlockSource } from './CodeBlockSource';
import type DrawioPlugin from '../main';

export function registerDrawioCodeBlock(plugin: DrawioPlugin) {
  plugin.registerMarkdownCodeBlockProcessor('drawio', (source, el, ctx) =>
    renderCodeBlock(plugin, source, el, ctx));
}

async function renderCodeBlock(
  plugin: DrawioPlugin,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): Promise<void> {
  const action = resolveClickAction(plugin.settings.previewClickAction, 'codeblock');
  let initialHeight: number | null = null;
  if (Platform.isDesktopApp && action.kind === 'interactive') {
    try {
      initialHeight = await readCodeBlockViewportHeight(plugin.app, ctx, el, source);
    } catch {
      // A failed metadata read must never abort rendering the diagram itself.
      initialHeight = null;
    }
  }
  const wrapper = el.createDiv({ cls: 'drawio-codeblock' });
  wrapper.setAttribute('title', Platform.isDesktopApp ? action.title : 'Drawio diagram');
  wrapper.toggleClass('drawio-no-action', Platform.isDesktopApp && action.kind === 'none');
  const preview = wrapper.createDiv({ cls: 'drawio-preview' });

  const wrapped = ensureMxfile(source);
  const pages = getDiagramPages(wrapped);
  let currentPage = 0;
  let interactive: InteractiveMountHandle | null = null;
  renderPreview(preview, source, { ...plugin.previewOpts(), page: currentPage });

  if (pages.length > 1) {
    const pageControlEl = wrapper.createDiv({ cls: 'drawio-page-control' });
    renderPageControl(pageControlEl, {
      pages,
      initialPage: currentPage,
      onPageChange: (page) => {
        currentPage = page;
        renderPreview(preview, source, { ...plugin.previewOpts(), page });
        interactive?.bindSvg(preview.querySelector('svg'), { preserveViewportHeight: true });
      },
    });
  }

  // The section may have been torn down while the stored-height read above was
  // in flight (a child added to an unloaded owner is stored but never loaded,
  // so nothing registered then would ever be disposed). Everything that needs a
  // teardown is queued through this and hangs off its unload.
  const lifecycle = new SectionLifecycle(wrapper);
  ctx.addChild(lifecycle);

  // Diagram links (shape links and html-label anchors) work on every platform:
  // following one only moves the workspace around, which mobile can do too.
  lifecycle.whenReady(() => {
    const links = registerDiagramLinks(wrapper, plugin, { sourcePath: () => ctx.sourcePath });
    lifecycle.register(() => links.dispose());
  });

  const runEditAction = () => {
    const editAction = resolveEditButtonAction(plugin.settings.editButtonAction, 'codeblock');
    if (editAction.kind === 'editor') {
      plugin.openEditor(new CodeBlockSource(plugin.app, ctx, el, source), wrapper);
    }
  };

  if (Platform.isDesktopApp) {
    lifecycle.whenReady(() => {
      // The hover Edit button is the way into the editor now that clicking the
      // preview doesn't open it.
      const editButton = mountEditButton(wrapper, {
        label: 'Edit diagram',
        onEdit: runEditAction,
      });
      lifecycle.register(() => editButton.dispose());

      const handle = mountInteractiveViewer(wrapper, preview, {
        isEnabled: () =>
          resolveClickAction(plugin.settings.previewClickAction, 'codeblock').kind === 'interactive',
        initialHeight: initialHeight ?? undefined,
        loadPersistedHeight: () => readCodeBlockViewportHeight(plugin.app, ctx, el, source),
        onHeightCommit: (height) => {
          void writeCodeBlockViewportHeight(plugin.app, ctx, el, source, height).then((written) => {
            if (!written) new Notice('Drawio: could not save the viewer height for this code block.');
          }).catch((err) => {
            new Notice(`Drawio: could not save viewer height — ${String(err)}`);
          });
        },
        onEdit: runEditAction,
      });
      interactive = handle;
      lifecycle.register(() => handle.dispose());
    });
  }

  // Click anywhere on the diagram. Since 0.8.0 the default is "Do nothing"
  // (editing goes through the hover Edit button), but the setting still offers
  // click-to-edit; it is re-resolved at click time so a settings change applies
  // to already-rendered blocks. Mobile has no editor at all.
  wrapper.addEventListener('click', () => {
    if (!Platform.isDesktopApp) return;
    const current = resolveClickAction(plugin.settings.previewClickAction, 'codeblock');
    if (current.kind === 'editor') {
      plugin.openEditor(new CodeBlockSource(plugin.app, ctx, el, source), wrapper);
    }
  });
}
