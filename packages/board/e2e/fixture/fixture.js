// A host page: an in-memory BoardStore, a shadow root, the built library. What the store is
// asked to do is kept on `window.__store` for the spec to read.
import { BoardStoreError, boardCss, mountBoard } from "/dist/index.js";

const now = () => new Date().toISOString();
const boards = new Map();
const calls = [];

const summary = ({ scene, ...rest }) => ({ ...rest, elementCount: scene.elements.length });

const store = {
  async list() {
    calls.push(["list"]);
    return { items: [...boards.values()].map(summary), nextCursor: null };
  },
  async create(title) {
    calls.push(["create", title]);
    throw new BoardStoreError(403, "forbidden", "This host does not create boards.");
  },
  async get(slug) {
    calls.push(["get", slug]);
    const board = boards.get(slug);
    if (!board) throw new BoardStoreError(404, "not_found", "No such board.");
    return structuredClone(board);
  },
  async patchElements(slug, patch) {
    calls.push(["patchElements", slug, patch.elements.length]);
    const board = boards.get(slug) ?? {
      slug,
      title: "Fixture",
      rev: 0,
      bounds: null,
      createdAt: now(),
      updatedAt: now(),
      thumbnailAt: null,
      scene: { type: "osidraw", version: 1, elements: [] },
    };
    const byId = new Map(board.scene.elements.map((element) => [element.id, element]));
    for (const element of patch.elements) byId.set(element.id, element);
    board.scene.elements = [...byId.values()];
    board.rev += 1;
    board.updatedAt = now();
    boards.set(slug, board);
    return { ...summary(board), applied: patch.elements.length, rejected: 0 };
  },
  async replace(slug, scene, rev) {
    calls.push(["replace", slug, rev]);
    throw new BoardStoreError(409, "conflict", "Not in this fixture.");
  },
  async remove(slug) {
    calls.push(["remove", slug]);
    boards.delete(slug);
  },
  async putThumbnail(slug, blob) {
    calls.push(["putThumbnail", slug, blob.size]);
  },
  async thumbnail() {
    return null;
  },
};

const host = document.getElementById("host");
const shadow = host.attachShadow({ mode: "open" });
const sheet = new CSSStyleSheet();
sheet.replaceSync(boardCss);
shadow.adoptedStyleSheets = [sheet];

window.__store = { boards, calls };
window.__mount = (options = {}) => {
  window.__board = mountBoard(shadow, {
    store,
    slug: "fixture",
    title: "Fixture board",
    theme: "light",
    // Not where the build put it: the host chooses (`MountBoardOptions.engineUrl`).
    engineUrl: "/engine.wasm",
    ...options,
  });
};
window.__fixtureReady = true;
