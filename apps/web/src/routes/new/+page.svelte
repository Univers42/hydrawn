<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { announceBoard, newBoardTitle } from "$lib/host/created.ts";
  import { HOST_MODE } from "$lib/mode.ts";
  import { boards } from "$lib/store/index.ts";

  // osionos frames this for a new inline board. Framed, the page stays here once the board
  // exists: osionos stores the slug in its block and points the frame at the board, so the
  // board page loads once and a frame rebuilt after that never lands here again.
  // Caveat: a frame rebuilt BEFORE the slug arrives (the block scrolled away and back within
  // the round trip) creates a second, empty board; it shows in the gallery and can be deleted.
  let error = $state<string | null>(null);

  onMount(() => {
    if (!HOST_MODE) {
      void goto(resolve("/"), { replaceState: true });
      return;
    }
    void boards
      .create(newBoardTitle(page.url.searchParams))
      .then((board) => {
        if (window.parent !== window) {
          announceBoard(window.parent, import.meta.env.VITE_HYDRAWN_PARENT_ORIGIN ?? "", board.slug);
          return;
        }
        return goto(resolve("/boards/[slug]", { slug: board.slug }), { replaceState: true });
      })
      .catch((cause: unknown) => {
        error = cause instanceof Error ? cause.message : "The board could not be created.";
      });
  });
</script>

<p class="status" role={error ? "alert" : "status"}>
  {error ?? "Creating board…"}
</p>

<style>
  .status {
    margin: 0;
    padding: 2rem 1.5rem;
    text-align: center;
    color: var(--muted);
  }
</style>
