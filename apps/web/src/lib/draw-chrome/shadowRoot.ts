/**
 * The board inside a shadow root (`mountBoard`, `packages/board`).
 *
 * Two document-level answers stop at a shadow root's host: `document.activeElement` is the
 * host, not the field inside it, and an event heard on `window` has the host as its
 * `target`. So "is the focus in the text editor" and "was this press outside the menu" both
 * read wrong there — a menu closed on every click inside it. These ask the root the board
 * is in, and the node an event started on. In the app's own document both are what they
 * were.
 */

type Root = Pick<Document, "activeElement" | "querySelector">;

/** The shadow root `node` is in, or `fallback` (the document) when it is in none. */
export function rootOf(
  node: Pick<Node, "getRootNode"> | null | undefined,
  fallback: Root = document,
): Root {
  const root = node?.getRootNode() as (Root & { nodeType?: number; host?: unknown }) | undefined;
  // DOCUMENT_FRAGMENT_NODE with a host: a shadow root. Duck-typed so it runs where
  // `ShadowRoot` is not a global.
  return root?.nodeType === 11 && root.host !== undefined ? root : fallback;
}

/**
 * The node `event` started on. Caveat: a closed shadow root keeps its nodes out of the
 * path, so there this is the host again; `mountBoard` needs an open one.
 */
export function eventOrigin(event: Pick<Event, "target" | "composedPath">): EventTarget | null {
  return event.composedPath()[0] ?? event.target;
}
