// tsc cannot read a .svelte file; svelte-check types Board.svelte in apps/web. This program
// sees it as the component `mountBoard` mounts: its props unchecked here, its exports typed.
declare module "*.svelte" {
  import type { Component } from "svelte";

  const component: Component<Record<string, unknown>, { flushPending(): void }>;
  export default component;
}
