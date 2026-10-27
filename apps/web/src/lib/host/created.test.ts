import { MAX_TITLE_LENGTH } from "@drawnosaurus/contract";
import { describe, expect, it, vi } from "vitest";
import { announceBoard, BOARD_CREATED, newBoardTitle, UNTITLED } from "./created.ts";

const PARENT = "https://osionos.example";
const params = (query: string) => new URLSearchParams(query);

describe("newBoardTitle", () => {
  it("collapses spaces and trims", () => {
    expect(newBoardTitle(params("title=%20My%20%20%0Aplan%20"))).toBe("My plan");
  });

  it("is Untitled when absent or blank", () => {
    expect(newBoardTitle(params(""))).toBe(UNTITLED);
    expect(newBoardTitle(params("title=%20%20"))).toBe(UNTITLED);
  });

  it("caps at the contract's length", () => {
    expect(newBoardTitle(params(`title=${"a".repeat(MAX_TITLE_LENGTH + 50)}`))).toHaveLength(
      MAX_TITLE_LENGTH,
    );
  });
});

describe("announceBoard", () => {
  it("posts the slug to the parent's origin only", () => {
    const parent = { postMessage: vi.fn() };
    announceBoard(parent, PARENT, "abcd1234efgh");
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: BOARD_CREATED, slug: "abcd1234efgh" },
      PARENT,
    );
  });

  it("says nothing without a parent or a configured parent origin", () => {
    const parent = { postMessage: vi.fn() };
    announceBoard(null, PARENT, "abcd1234efgh");
    announceBoard(parent, "", "abcd1234efgh");
    expect(parent.postMessage).not.toHaveBeenCalled();
  });
});
