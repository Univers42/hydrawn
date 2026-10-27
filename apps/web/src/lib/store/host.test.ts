import { describe, expect, it, vi } from "vitest";
import type { Board, OsidrawFile } from "@drawnosaurus/contract";
import type { StampedElement } from "../autosave/sceneDiff.ts";

// `api/client.ts` reads the runtime config, which reads this SvelteKit virtual module.
vi.mock("$env/dynamic/public", () => ({ env: {} }));

const { ApiClientError } = await import("../api/client.ts");
const { mergeAndReplace } = await import("./host.ts");

interface Shape extends StampedElement {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl?: string;
}

const shape = (id: string, more: Partial<Shape> = {}): Shape => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  version: 1,
  versionNonce: 1,
  updated: 0,
  isDeleted: false,
  ...more,
});

const board = (rev: number, elements: Shape[]): Board => ({
  slug: "abcdef123456",
  title: "Plan",
  elementCount: elements.filter((element) => !element.isDeleted).length,
  bounds: null,
  rev,
  createdAt: "2026-10-28T00:00:00.000Z",
  updatedAt: "2026-10-28T00:00:00.000Z",
  thumbnailAt: null,
  scene: {
    type: "osidraw",
    version: 1,
    elements: elements as unknown as Board["scene"]["elements"],
  },
});

/** A bridge holding one board by `rev`, as the osionos bridge does. */
function fakeBridge(initial: Board) {
  let current = initial;
  const writes: OsidrawFile[] = [];
  return {
    writes,
    current: () => current,
    move: (next: Board) => (current = next),
    getBoard: vi.fn(async () => current),
    replaceBoard: vi.fn(async (_slug: string, scene: OsidrawFile, rev: number) => {
      if (rev !== current.rev) throw new ApiClientError(409, "conflict", "moved on");
      writes.push(scene);
      current = { ...current, rev: rev + 1, scene };
      return current;
    }),
  };
}

describe("mergeAndReplace", () => {
  it("merges the patch into the stored board, newest stamp winning, and writes at the rev it read", async () => {
    const bridge = fakeBridge(board(3, [shape("a"), shape("b", { version: 5 })]));
    const ack = await mergeAndReplace(bridge, "abcdef123456", {
      elements: [shape("b", { version: 2, x: 99 }), shape("c")],
    });
    expect(ack).toMatchObject({ rev: 4, applied: 1, rejected: 1 });
    expect(ack).not.toHaveProperty("scene");
    const ids = bridge.current().scene.elements.map((element) => element.id);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(bridge.current().scene.elements[1]).toMatchObject({ version: 5, x: 0 });
  });

  it("keeps a tombstone winning and the stored picture of an image sent without it", async () => {
    const picture = "data:image/png;base64,AAAA";
    const bridge = fakeBridge(
      board(1, [
        shape("img", { type: "image", dataUrl: picture }),
        shape("gone", { version: 4, isDeleted: true }),
      ]),
    );
    await mergeAndReplace(bridge, "abcdef123456", {
      elements: [shape("img", { type: "image", version: 2, x: 5 }), shape("gone", { version: 3 })],
    });
    const [image, gone] = bridge.current().scene.elements as unknown as Shape[];
    expect(image).toMatchObject({ x: 5, dataUrl: picture });
    expect(gone).toMatchObject({ isDeleted: true, version: 4 });
  });

  it("re-reads and merges again when another writer saved between the read and the write", async () => {
    const bridge = fakeBridge(board(1, [shape("a")]));
    bridge.getBoard.mockImplementationOnce(async () => {
      const read = bridge.current();
      // Another tab saves right after this read.
      bridge.move(board(2, [shape("a"), shape("theirs")]));
      return read;
    });
    await mergeAndReplace(bridge, "abcdef123456", { elements: [shape("mine")] });
    const ids = bridge.current().scene.elements.map((element) => element.id);
    expect(ids).toEqual(["a", "theirs", "mine"]);
    expect(bridge.replaceBoard).toHaveBeenCalledTimes(2);
  });

  it("gives up with the 409 after three lost races, and passes any other failure through at once", async () => {
    const bridge = fakeBridge(board(1, []));
    bridge.replaceBoard.mockRejectedValue(new ApiClientError(409, "conflict", "moved on"));
    await expect(
      mergeAndReplace(bridge, "abcdef123456", { elements: [shape("a")] }),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(bridge.replaceBoard).toHaveBeenCalledTimes(3);

    bridge.replaceBoard.mockReset();
    bridge.replaceBoard.mockRejectedValue(new ApiClientError(413, "too_large", "too large"));
    await expect(
      mergeAndReplace(bridge, "abcdef123456", { elements: [shape("a")] }),
    ).rejects.toMatchObject({
      status: 413,
    });
    expect(bridge.replaceBoard).toHaveBeenCalledTimes(1);
  });

  it("applies an explicit z-order", async () => {
    const bridge = fakeBridge(board(1, [shape("a"), shape("b")]));
    await mergeAndReplace(bridge, "abcdef123456", { elements: [], order: ["b", "a"] });
    expect(bridge.current().scene.elements.map((element) => element.id)).toEqual(["b", "a"]);
  });
});
