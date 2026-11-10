// The entry's first import, for its side effect: Zod's JIT is off before any module that
// builds a schema is evaluated. Zod 4.6.4 probes `new Function` when an object schema is
// constructed (`v4/core/schemas.js:1168`), so importing the contract's index — which builds
// every schema — before this call is already too late; under a host CSP without
// 'unsafe-eval' that probe is a violation report even though Zod catches it. This imports
// the schema-jit subpath alone, which builds none.
import { disableSchemaJit } from "@drawnosaurus/contract/schema-jit";

disableSchemaJit();
