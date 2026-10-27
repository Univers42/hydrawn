import { describe, expect, it, vi } from "vitest";
import { hostTokens, readReply, TOKEN_REPLY, TOKEN_REQUEST } from "./token.ts";

const PARENT = "https://osionos.example";
const NOW = 1_800_000_000_000;

/** A frame whose parent answers each request the way `answer` says. */
function framed(answer: (frame: ReturnType<typeof makeFrame>) => void) {
  const frame = makeFrame();
  frame.parent.postMessage.mockImplementation(() => answer(frame));
  return frame;
}

function makeFrame() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const parent = { postMessage: vi.fn() };
  return {
    parent,
    addEventListener: (_type: "message", listener: (event: MessageEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: "message", listener: (event: MessageEvent) => void) =>
      listeners.delete(listener),
    deliver: (data: unknown, origin: string, source: unknown) => {
      for (const listener of [...listeners]) listener({ data, origin, source } as MessageEvent);
    },
    listening: () => listeners.size,
  };
}

const reply = (token: string, expSeconds = NOW / 1000 + 300) => ({
  type: TOKEN_REPLY,
  token,
  exp: expSeconds,
});

describe("readReply", () => {
  it("takes exactly the reply shape, with a live expiry and a bounded token", () => {
    expect(readReply(reply("t"), NOW)).toEqual({ token: "t", expiresAt: NOW + 300_000 });
    expect(readReply({ ...reply("t"), extra: 1 }, NOW)).toBeNull();
    expect(readReply({ type: TOKEN_REPLY, token: "t" }, NOW)).toBeNull();
    expect(readReply(reply(""), NOW)).toBeNull();
    expect(readReply(reply("x".repeat(2049)), NOW)).toBeNull();
    expect(readReply(reply("t", NOW / 1000 - 1), NOW)).toBeNull();
    expect(readReply("hydrawn:token", NOW)).toBeNull();
  });
});

describe("hostTokens", () => {
  it("asks the parent at its origin only, and keeps the token until it nears expiry", async () => {
    let now = NOW;
    const frame = framed((self) => self.deliver(reply(`t${now}`), PARENT, self.parent));
    const tokens = hostTokens({ parentOrigin: PARENT, frame, now: () => now });

    expect(await tokens.current()).toBe(`t${NOW}`);
    expect(frame.parent.postMessage).toHaveBeenCalledWith({ type: TOKEN_REQUEST }, PARENT);
    expect(await tokens.current()).toBe(`t${NOW}`);
    expect(frame.parent.postMessage).toHaveBeenCalledTimes(1);

    now = NOW + 280_000; // inside the 30 s renew margin
    expect(await tokens.current()).toBe(`t${now}`);
    expect(frame.listening()).toBe(0);
  });

  it("ignores a reply from another origin or another window, and times out", async () => {
    vi.useFakeTimers();
    try {
      const frame = framed((self) => {
        self.deliver(reply("wrong-origin"), "https://evil.example", self.parent);
        self.deliver(reply("wrong-source"), PARENT, { postMessage() {} });
      });
      const tokens = hostTokens({ parentOrigin: PARENT, frame, now: () => NOW, timeoutMs: 50 });
      const pending = expect(tokens.current()).rejects.toThrow(/did not answer/);
      await vi.advanceTimersByTimeAsync(60);
      await pending;
      expect(frame.listening()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares one request between concurrent callers, and asks again after drop()", async () => {
    let issued = 0;
    const frame = framed((self) =>
      queueMicrotask(() => self.deliver(reply(`t${++issued}`), PARENT, self.parent)),
    );
    const tokens = hostTokens({ parentOrigin: PARENT, frame, now: () => NOW });
    expect(await Promise.all([tokens.current(), tokens.current()])).toEqual(["t1", "t1"]);
    tokens.drop();
    expect(await tokens.current()).toBe("t2");
  });

  it("refuses when the page is not framed", async () => {
    const frame = makeFrame();
    const unframed = { ...frame, parent: null };
    await expect(hostTokens({ parentOrigin: PARENT, frame: unframed }).current()).rejects.toThrow(
      /not framed/,
    );
  });
});
