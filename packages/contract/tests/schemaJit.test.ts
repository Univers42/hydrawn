import { describe, expect, it } from "vitest";
import { z } from "zod";
import { disableSchemaJit } from "../src/index.ts";

describe("disableSchemaJit", () => {
  it("turns Zod jitless on, so a strict CSP never sees the new Function probe", () => {
    disableSchemaJit();
    expect(z.config().jitless).toBe(true);
  });
});
