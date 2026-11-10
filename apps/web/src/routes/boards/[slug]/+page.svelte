<script lang="ts">
  import { beforeNavigate, goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import Board from "$lib/board/Board.svelte";
  import { holdForSave } from "$lib/boards/holdForSave.ts";
  import { newBoardTitle } from "$lib/host/created.ts";
  import { BROWSER_MODE, HOST_MODE } from "$lib/mode.ts";
  import { boards, secrets } from "$lib/store/index.ts";

  /**
   * The board at its address. The board itself is `Board.svelte`, which `mountBoard`
   * (`packages/board`) renders too; what is SvelteKit's — the slug from the URL, the title
   * in the tab, the navigation that leaves — is here.
   *
   * Read once: this page is one board's for its whole life (`+layout.svelte` makes a new
   * one for each slug).
   */
  const slug = page.params.slug ?? "";

  let title = $state("Board");
  let board = $state<ReturnType<typeof Board> | null>(null);

  async function open(next: string): Promise<void> {
    await goto(resolve("/boards/[slug]", { slug: next }));
  }

  // Leaving inside the app tears this page down with `onDestroy`, which disposes the
  // saver — an edit still inside the debounce was never sent. `beforeNavigate` runs ahead
  // of any teardown, so the engine can still render the thumbnail too. In the public build
  // the navigation waits for the save as well, and does not happen if it failed: there is
  // no draft behind the saver there (`holdForSave.ts`).
  beforeNavigate((navigation) => {
    if (board === null) return;
    const current = board;
    const held = holdForSave(navigation, {
      browser: BROWSER_MODE,
      status: () => current.saveStatus(),
      flush: () => current.flush(),
      go: (delta) => history.go(delta),
      goto,
    });
    if (held === null) current.flushPending();
  });
</script>

<svelte:head><title>{title} · Hydrawn</title></svelte:head>

<div class="page">
  <Board
    bind:this={board}
    bind:title
    store={boards}
    {secrets}
    {slug}
    browser={BROWSER_MODE}
    collaboration={!HOST_MODE}
    newTitle={HOST_MODE ? newBoardTitle(page.url.searchParams) : undefined}
    openBoard={open}
    galleryHref={resolve("/gallery")}
  />
</div>

<style>
  .page {
    height: 100dvh;
    width: 100vw;
  }
</style>
