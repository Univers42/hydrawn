import { z } from "zod";

/**
 * Zod 4 compiles object schemas with `new Function` after probing for it once. Under a
 * CSP without `unsafe-eval` (the embedded board) the caught probe is still reported as a
 * console issue. The probe runs when an object schema is CONSTRUCTED (zod 4.6.4
 * `v4/core/schemas.js:1168`), so a browser consumer imports this module on its own, from
 * `@drawnosaurus/contract/schema-jit`, and calls it before anything imports the contract's
 * index: importing the index builds every schema first. The API keeps the JIT.
 */
export function disableSchemaJit(): void {
  z.config({ jitless: true });
}
