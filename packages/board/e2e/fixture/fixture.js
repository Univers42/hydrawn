// A host page: in-memory board routes, a shadow root, the built library. What the store is
// asked to do is kept on `window.__store` for the spec to read.
import { BoardStoreError, boardCss, createHostedStore, mountBoard } from "/dist/index.js";

const now = () => new Date().toISOString();
const boards = new Map();
const calls = [];

const summary = ({ scene, ...rest }) => ({
  ...rest,
  elementCount: scene.elements.filter((element) => !element.isDeleted).length,
});

// The routes a host like the osionos bridge serves: whole scenes kept by `rev`, a 404 for a
// board not created yet, a 409 for a write against a rev that moved. The store over them is
// the library's own (`createHostedStore`), which merges each save on the page's side.
const bridge = {
  async getBoard(slug) {
    calls.push(["getBoard", slug]);
    const board = boards.get(slug);
    if (!board) throw new BoardStoreError(404, "not_found", "No such board.");
    return structuredClone(board);
  },
  async createBoard(title, slug) {
    calls.push(["createBoard", title, slug]);
    const board = {
      slug,
      title,
      rev: 0,
      bounds: null,
      createdAt: now(),
      updatedAt: now(),
      thumbnailAt: null,
      scene: { type: "osidraw", version: 1, elements: [] },
    };
    boards.set(slug, board);
    return summary(board);
  },
  async replaceBoard(slug, scene, rev) {
    calls.push(["replaceBoard", slug, rev]);
    const board = boards.get(slug);
    if (!board) throw new BoardStoreError(404, "not_found", "No such board.");
    if (board.rev !== rev) throw new BoardStoreError(409, "conflict", "The board moved on.");
    Object.assign(board, { scene, rev: rev + 1, updatedAt: now() });
    return structuredClone(board);
  },
  async putThumbnail(slug, blob) {
    calls.push(["putThumbnail", slug, blob.size]);
  },
};

const store = createHostedStore(bridge, () => "Fixture board");

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
