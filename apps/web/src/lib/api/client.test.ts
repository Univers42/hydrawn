import { afterEach, describe, expect, it, vi } from "vitest";

const tokens = { current: vi.fn<() => Promise<string>>(), drop: vi.fn() };
let hosted = true;

// The osionos build's config: the bridge's base and the parent's tokens.
vi.mock("../config.ts", () => ({
  apiBase: () => "https://bridge.example/api/whiteboard",
  apiTokens: () => (hosted ? tokens : null),
}));

const { getBoard, ApiClientError } = await import("./client.ts");

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const denied = () => json(401, { error: { code: "unauthorized", message: "expired" } });
const sentAuthorization = (call: number) =>
  (fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string>).authorization;

afterEach(() => {
  fetchMock.mockReset();
  tokens.current.mockReset();
  tokens.drop.mockReset();
  hosted = true;
});

describe("the API client in the osionos build", () => {
  it("sends the parent's token to the bridge", async () => {
    tokens.current.mockResolvedValue("tok-1");
    fetchMock.mockResolvedValue(json(200, { slug: "abcdef" }));
    await getBoard("abcdef");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://bridge.example/api/whiteboard/v1/boards/abcdef",
    );
    expect(sentAuthorization(0)).toBe("Bearer tok-1");
  });

  it("drops a refused token and retries once with a fresh one", async () => {
    tokens.current.mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh");
    fetchMock.mockResolvedValueOnce(denied()).mockResolvedValueOnce(json(200, { slug: "abcdef" }));
    await expect(getBoard("abcdef")).resolves.toEqual({ slug: "abcdef" });
    expect(tokens.drop).toHaveBeenCalledTimes(1);
    expect(sentAuthorization(1)).toBe("Bearer fresh");
  });

  it("reports a second 401 instead of looping", async () => {
    tokens.current.mockResolvedValue("tok");
    fetchMock.mockImplementation(async () => denied());
    await expect(getBoard("abcdef")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("turns an unanswered token request into a 401 without calling the bridge", async () => {
    tokens.current.mockRejectedValue(new Error("osionos did not answer"));
    const failure = getBoard("abcdef");
    await expect(failure).rejects.toBeInstanceOf(ApiClientError);
    await expect(failure).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends no authorization outside the osionos build", async () => {
    hosted = false;
    fetchMock.mockResolvedValue(json(200, { slug: "abcdef" }));
    await getBoard("abcdef");
    expect(sentAuthorization(0)).toBeUndefined();
    expect(tokens.current).not.toHaveBeenCalled();
  });
});
