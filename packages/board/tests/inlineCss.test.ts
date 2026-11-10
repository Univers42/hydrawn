import { describe, expect, it } from "vitest";
import { CSS_PLACEHOLDER, inlineCss } from "../src/inlineCss.ts";

describe("inlineCss", () => {
  it("puts the stylesheet where the placeholder string was, as a string literal", () => {
    const code = `const a=${JSON.stringify(CSS_PLACEHOLDER)};export{a as boardCss};`;
    const css = `.x{content:"a\\"b"}\n.y{}`;
    const out = inlineCss(code, css);
    expect(out).not.toContain(CSS_PLACEHOLDER);
    // Evaluated back, the literal is the stylesheet byte for byte.
    const literal = out.slice("const a=".length, out.indexOf(";export"));
    expect(JSON.parse(literal)).toBe(css);
  });

  it("fails the build when the placeholder is missing, rather than shipping no CSS", () => {
    expect(() => inlineCss("export const boardCss = '';", ".x{}")).toThrow(/placeholder/);
  });

  it("fails the build when the placeholder appears twice", () => {
    const literal = JSON.stringify(CSS_PLACEHOLDER);
    expect(() => inlineCss(`${literal};${literal}`, ".x{}")).toThrow(/placeholder/);
  });
});
