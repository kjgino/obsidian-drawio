/**
 * Classify a link string stored on a diagram shape (drawio's per-cell `link`
 * attribute, or an `<a href>` inside an html=1 label) into something the
 * plugin knows how to open.
 *
 * Pure and DOM-free so it can be unit-tested directly; the DOM/workspace side
 * lives in `src/preview/linkNav.ts` and `src/workspace/linkPane.ts`.
 *
 * Supported inputs, in the order they are recognised:
 *  - wiki links — `[[Note]]`, `[[Note#Heading]]`, `[[Note|alias]]`
 *  - Obsidian URIs — `obsidian://open?vault=V&file=F` (and `?file=` alone)
 *  - absolute URLs with a known-safe scheme — opened outside Obsidian
 *  - anything else without a scheme — a vault-relative path, a bare note name,
 *    or a `#heading` inside the note that owns the diagram
 *
 * Everything that carries an unknown scheme (`javascript:`, `data:`,
 * `vbscript:`, …) is blocked. The renderer never puts these strings in an
 * `href`, so nothing can navigate on its own — but the activation path checks
 * again here before opening anything.
 */

export type DiagramLink =
  /** Resolvable inside the vault; `linktext` is Obsidian link syntax
   *  (`Note`, `Note#Heading`, `folder/Note.md`, `#Heading`). */
  | { kind: 'internal'; linktext: string }
  /** Handed to the OS / browser as-is. */
  | { kind: 'external'; url: string }
  /** Refused: an unknown or script-bearing scheme, or nothing to open. */
  | { kind: 'blocked' };

/** Schemes we are willing to hand to the OS. Everything else is refused —
 * an allowlist, so a new script-bearing scheme can never slip through. */
const EXTERNAL_SCHEMES = new Set(['http', 'https', 'mailto', 'file', 'ftp', 'ftps']);

/**
 * Leading scheme of `value`, lowercased, or null when there is none.
 *
 * Browsers strip ASCII whitespace and control characters before resolving a
 * scheme (`java\tscript:` executes), so those are removed first — the same
 * normalisation `svgSanitizer.isUnsafeUrl` performs, and for the same reason.
 * Done char-by-char rather than with a control-character regex (see the lint
 * checklist in CLAUDE.md).
 */
function schemeOf(value: string): string | null {
  let norm = '';
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x20) norm += value[i];
  }
  const colon = norm.indexOf(':');
  if (colon <= 0) return null;
  const scheme = norm.slice(0, colon).toLowerCase();
  // A scheme is ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ). Anything else
  // (e.g. `Notes/2024: review.md`) is a path that happens to contain a colon.
  if (!/^[a-z][a-z0-9+\-.]*$/.test(scheme)) return null;
  return scheme;
}

/** Strip the `|alias` tail of a wiki-link target, keeping any `#subpath`. */
function stripAlias(target: string): string {
  const pipe = target.indexOf('|');
  return (pipe === -1 ? target : target.slice(0, pipe)).trim();
}

/**
 * Pull the vault-relative file out of an `obsidian://` URI.
 *
 * Only the `open` action's `file` parameter is understood — that is what
 * "Copy Obsidian URL" produces. `path=` carries an absolute filesystem path,
 * which cannot be mapped to a vault path from here, so those (and every other
 * action, including community URI plugins) stay external and are handed to the
 * OS, which routes them back into Obsidian.
 */
function parseObsidianUri(raw: string): DiagramLink {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'blocked' };
  }
  // `obsidian://open?...` parses with host 'open' and an empty path; the
  // alternative `obsidian:///open?...` form puts it in the pathname.
  const action = (url.hostname || url.pathname.replace(/^\/+/, '')).toLowerCase();
  if (action !== 'open') return { kind: 'external', url: raw };
  const file = url.searchParams.get('file');
  if (file === null || !file.trim()) return { kind: 'external', url: raw };
  return { kind: 'internal', linktext: file.trim() };
}

/** Classify one raw link string from a diagram. */
export function classifyDiagramLink(raw: string): DiagramLink {
  const value = (raw ?? '').trim();
  if (!value) return { kind: 'blocked' };

  if (value.startsWith('[[') && value.endsWith(']]')) {
    const target = stripAlias(value.slice(2, -2));
    return target ? { kind: 'internal', linktext: target } : { kind: 'blocked' };
  }

  const scheme = schemeOf(value);
  if (scheme === null) {
    // No scheme: a vault path, a bare note name, or an in-note `#heading`.
    // A protocol-relative URL (`//host/x`) is a network fetch in disguise.
    if (value.startsWith('//')) return { kind: 'blocked' };
    return { kind: 'internal', linktext: stripAlias(value) };
  }
  if (scheme === 'obsidian') return parseObsidianUri(value);
  if (EXTERNAL_SCHEMES.has(scheme)) return { kind: 'external', url: value };
  return { kind: 'blocked' };
}

/** Split an Obsidian linktext into its path and `#subpath` parts. */
export function splitLinktext(linktext: string): { path: string; subpath: string } {
  const hash = linktext.indexOf('#');
  if (hash === -1) return { path: linktext, subpath: '' };
  return { path: linktext.slice(0, hash), subpath: linktext.slice(hash) };
}
