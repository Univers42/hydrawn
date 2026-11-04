import { disableSchemaJit } from "@drawnosaurus/contract/schema-jit";

// SvelteKit imports the client hooks from the app entry before it loads any node, and this
// imports schemaJit alone, not the contract's index, so the JIT is off before any schema
// is constructed. Calling it from +layout.ts with the index import was too late: building
// the contract's schemas probed `new Function`, and the board CSP reported an eval
// violation (osionos frame, 2026-11-04).
disableSchemaJit();
