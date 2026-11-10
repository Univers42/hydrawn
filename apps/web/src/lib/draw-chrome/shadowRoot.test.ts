import { describe, expect, it } from "vitest";
import { eventOrigin, rootOf } from "./shadowRoot.ts";

const doc = { nodeType: 9, activeElement: null, querySelector: () => null };

describe("rootOf", () => {
  it("is the shadow root a node is in", () => {
    const shadow = { nodeType: 11, host: {}, activeElement: null, querySelector: () => null };
    expect(rootOf({ getRootNode: () => shadow } as never, doc as never)).toBe(shadow);
  });

  it("is the document for a node in the document, a detached node, or none", () => {
    expect(rootOf({ getRootNode: () => doc } as never, doc as never)).toBe(doc);
    // A detached subtree's root is its topmost element, which has no `host`.
    expect(rootOf({ getRootNode: () => ({ nodeType: 1 }) } as never, doc as never)).toBe(doc);
    expect(rootOf(undefined, doc as never)).toBe(doc);
  });
});

describe("eventOrigin", () => {
  it("is the node the event started on, not the shadow host it was retargeted to", () => {
    const inner = {};
    const host = {};
    const event = { target: host, composedPath: () => [inner, host] };
    expect(eventOrigin(event as never)).toBe(inner);
  });

  it("is the target when the event has no path any more", () => {
    // `composedPath()` is empty once dispatch is over.
    const target = {};
    expect(eventOrigin({ target, composedPath: () => [] } as never)).toBe(target);
  });
});
