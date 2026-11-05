import { afterEach, describe, expect, it, vi } from "vitest";

const tokens = { current: vi.fn<() => Promise<string>>(), drop: vi.fn() };
let hosted = true;

// The osionos build's config: the bridge's base and the parent's tokens.
vi.mock("../config.ts", () => ({
  apiBase: () => "https://bridge.example/api/whiteboard",
  apiTokens: () => (hosted ? tokens : null),
}));

const { deleteBoard, getBoard, ApiClientError } = await import("./client.ts");

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

// What nginx's `deny all` really sends: no envelope, and not JSON.
const htmlRefusal = (status: number) =>
  new Response(`<html>\r\n<head><title>${status}</title></head>\r\n</html>\r\n`, {
    status,
    headers: { "content-type": "text/html" },
  });

describe("an error the API did not write", () => {
  it("says deleting is turned off when the edge refuses with an HTML 403", async () => {
    hosted = false;
    const refusal = htmlRefusal(403);
    const parse = vi.spyOn(refusal, "json");
    fetchMock.mockResolvedValue(refusal);
    const failure = deleteBoard("abcdef");
    await expect(failure).rejects.toBeInstanceOf(ApiClientError);
    await expect(failure).rejects.toMatchObject({
      status: 403,
      message: "Deleting boards is turned off here",
    });
    expect(parse).not.toHaveBeenCalled();
  });

  it("gives any other refused call a plain message", async () => {
    hosted = false;
    fetchMock.mockResolvedValue(htmlRefusal(403));
    await expect(getBoard("abcdef")).rejects.toMatchObject({
      status: 403,
      message: "This action is turned off here",
    });
  });

  it("reports a proxy's HTML 502 by its status", async () => {
    hosted = false;
    fetchMock.mockResolvedValue(htmlRefusal(502));
    await expect(getBoard("abcdef")).rejects.toMatchObject({
      status: 502,
      message: "request failed with 502",
    });
  });

  it("survives a body labelled JSON that is not", async () => {
    hosted = false;
    fetchMock.mockResolvedValue(
      new Response("<html></html>", {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(deleteBoard("abcdef")).rejects.toMatchObject({
      message: "Deleting boards is turned off here",
    });
  });
});

describe("hydrawn standalone, where DELETE is allowed", () => {
  it("deletes on a 204", async () => {
    hosted = false;
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteBoard("abcdef")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("keeps the API's own code and message on a refusal", async () => {
    hosted = false;
    fetchMock.mockResolvedValue(
      json(403, { error: { code: "host_only", message: "only the host may" } }),
    );
    await expect(deleteBoard("abcdef")).rejects.toMatchObject({
      status: 403,
      code: "host_only",
      message: "only the host may",
    });
  });
});
