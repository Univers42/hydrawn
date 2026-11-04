// The entry's first import, for its side effect: Zod's JIT is off before any module that
// defines or parses a schema is evaluated. Zod probes `new Function` once, on the first
// parse, and caches the answer; under a host CSP without 'unsafe-eval' that probe is a
// violation report even though Zod catches it. A call inside `mountBoard` ran after the
// imports above it, which is how the app's own root layout got it wrong.
import { disableSchemaJit } from "@drawnosaurus/contract/schema-jit";

disableSchemaJit();
