import { z } from "zod";

/**
 * Zod 4 compiles object schemas with `new Function` after probing for it once. Under a
 * CSP without `unsafe-eval` (the embedded board) the caught probe is still reported as a
 * console issue, so a browser consumer calls this before its first parse. The API keeps
 * the JIT.
 */
export function disableSchemaJit(): void {
  z.config({ jitless: true });
}
