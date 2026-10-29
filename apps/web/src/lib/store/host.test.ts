import { describe, expect, it, vi } from "vitest";
import type { Board, BoardSummary, OsidrawFile } from "@drawnosaurus/contract";
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
    createBoard: vi.fn(async (_title: string, _slug?: string): Promise<BoardSummary> => {
      throw new ApiClientError(500, "unexpected", "not expected here");
    }),
  };
}

const title = () => "Plan";

describe("mergeAndReplace", () => {
  it("merges the patch into the stored board, newest stamp winning, and writes at the rev it read", async () => {
    const bridge = fakeBridge(board(3, [shape("a"), shape("b", { version: 5 })]));
    const ack = await mergeAndReplace(
      bridge,
      "abcdef123456",
      {
        elements: [shape("b", { version: 2, x: 99 }), shape("c")],
      },
      title,
    );
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
    await mergeAndReplace(
      bridge,
      "abcdef123456",
      {
        elements: [
          shape("img", { type: "image", version: 2, x: 5 }),
          shape("gone", { version: 3 }),
        ],
      },
      title,
    );
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
    await mergeAndReplace(bridge, "abcdef123456", { elements: [shape("mine")] }, title);
    const ids = bridge.current().scene.elements.map((element) => element.id);
    expect(ids).toEqual(["a", "theirs", "mine"]);
    expect(bridge.replaceBoard).toHaveBeenCalledTimes(2);
  });

  it("gives up with the 409 after three lost races, and passes any other failure through at once", async () => {
    const bridge = fakeBridge(board(1, []));
    bridge.replaceBoard.mockRejectedValue(new ApiClientError(409, "conflict", "moved on"));
    await expect(
      mergeAndReplace(bridge, "abcdef123456", { elements: [shape("a")] }, title),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(bridge.replaceBoard).toHaveBeenCalledTimes(3);

    bridge.replaceBoard.mockReset();
    bridge.replaceBoard.mockRejectedValue(new ApiClientError(413, "too_large", "too large"));
    await expect(
      mergeAndReplace(bridge, "abcdef123456", { elements: [shape("a")] }, title),
    ).rejects.toMatchObject({
      status: 413,
    });
    expect(bridge.replaceBoard).toHaveBeenCalledTimes(1);
  });

  it("creates a board osionos framed before it existed, under its slug and title, then saves into it", async () => {
    const bridge = fakeBridge(board(0, []));
    bridge.getBoard.mockRejectedValueOnce(new ApiClientError(404, "not_found", "no such board"));
    bridge.createBoard.mockImplementationOnce(async (_title: string, slug?: string) => ({
      ...board(0, []),
      slug: slug ?? "minted",
    }));
    await mergeAndReplace(bridge, "abcdef123456", { elements: [shape("a")] }, () => "Sprint plan");
    expect(bridge.createBoard).toHaveBeenCalledWith("Sprint plan", "abcdef123456");
    expect(bridge.current().scene.elements.map((element) => element.id)).toEqual(["a"]);
  });

  it("stops when the service minted another slug, and creates nothing on any other read failure", async () => {
    const bridge = fakeBridge(board(0, []));
    bridge.getBoard.mockRejectedValueOnce(new ApiClientError(404, "not_found", "no such board"));
    bridge.createBoard.mockImplementationOnce(async () => ({
      ...board(0, []),
      slug: "otherslug123",
    }));
    await expect(
      mergeAndReplace(bridge, "abcdef123456", { elements: [shape("a")] }, title),
    ).rejects.toMatchObject({ code: "slug_ignored" });
    expect(bridge.replaceBoard).not.toHaveBeenCalled();

    bridge.createBoard.mockClear();
    bridge.getBoard.mockRejectedValueOnce(new ApiClientError(503, "unavailable", "down"));
    await expect(
      mergeAndReplace(bridge, "abcdef123456", { elements: [shape("a")] }, title),
    ).rejects.toMatchObject({ status: 503 });
    expect(bridge.createBoard).not.toHaveBeenCalled();
  });

  it("applies an explicit z-order", async () => {
    const bridge = fakeBridge(board(1, [shape("a"), shape("b")]));
    await mergeAndReplace(bridge, "abcdef123456", { elements: [], order: ["b", "a"] }, title);
    expect(bridge.current().scene.elements.map((element) => element.id)).toEqual(["b", "a"]);
  });
});
