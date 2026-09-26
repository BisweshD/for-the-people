import { describe, expect, test } from "vitest";
import { clientIp, readBodyText, rejectCrossSite } from "../src/server/request";

/** The checks every public POST route shares. */

const post = (headers: Record<string, string>, url = "https://for-the-people.example/api/ask") =>
  new Request(url, { method: "POST", headers, body: "{}" });

describe("clientIp", () => {
  test("never takes the client-controlled first X-Forwarded-For entry", () => {
    const spoofed = post({ "x-forwarded-for": "198.51.100.7, 203.0.113.9" });
    expect(clientIp(spoofed)).toBe("203.0.113.9");
    expect(clientIp(post({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(post({ "x-forwarded-for": " 198.51.100.7 ,203.0.113.9 , " }))).toBe(
      "203.0.113.9",
    );
  });

  test("prefers Vercel's header, then x-real-ip, then X-Forwarded-For", () => {
    const all = {
      "x-vercel-forwarded-for": "192.0.2.1",
      "x-real-ip": "192.0.2.2",
      "x-forwarded-for": "198.51.100.7, 192.0.2.3",
    };
    expect(clientIp(post(all))).toBe("192.0.2.1");
    const { "x-vercel-forwarded-for": _vercel, ...rest } = all;
    expect(clientIp(post(rest))).toBe("192.0.2.2");
    expect(clientIp(post({ "x-forwarded-for": all["x-forwarded-for"] }))).toBe("192.0.2.3");
    expect(clientIp(post({}))).toBe("unknown");
  });

  test("rotating the first X-Forwarded-For entry no longer changes the caller", () => {
    const callers = new Set(
      Array.from({ length: 12 }, (_, i) =>
        clientIp(post({ "x-forwarded-for": `198.51.100.${i}, 203.0.113.7` })),
      ),
    );
    expect([...callers]).toEqual(["203.0.113.7"]);
  });
});

describe("rejectCrossSite", () => {
  const json = { "content-type": "application/json" };

  test("allows a same-origin JSON request, with or without Origin", () => {
    expect(rejectCrossSite(post({ ...json, origin: "https://for-the-people.example" }))).toBeNull();
    expect(rejectCrossSite(post(json))).toBeNull();
    expect(
      rejectCrossSite(
        post({
          "content-type": "application/json; charset=utf-8",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBeNull();
    // Behind a proxy the request URL may be internal; the Host header names the site.
    expect(
      rejectCrossSite(
        post(
          { ...json, origin: "https://for-the-people.example", host: "for-the-people.example" },
          "http://localhost:3000/api/ask",
        ),
      ),
    ).toBeNull();
  });

  test("refuses the simple cross-site requests a form or no-cors fetch can send", async () => {
    for (const contentType of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      const refused = rejectCrossSite(post({ "content-type": contentType }));
      expect(refused?.status, contentType).toBe(415);
    }
    expect(rejectCrossSite(post({}))?.status).toBe(415);
    expect(rejectCrossSite(post({ "content-type": "application/jsonp" }))?.status).toBe(415);
  });

  test("refuses another site's Origin, a null Origin, and cross-site fetch metadata", async () => {
    const evil = rejectCrossSite(post({ ...json, origin: "https://evil.example" }));
    expect(evil?.status).toBe(403);
    expect(await evil?.json()).toEqual({ error: "Cross-site requests are not accepted." });
    expect(rejectCrossSite(post({ ...json, origin: "null" }))?.status).toBe(403);
    expect(
      rejectCrossSite(post({ ...json, origin: "https://for-the-people.example.evil.example" }))
        ?.status,
    ).toBe(403);
    expect(rejectCrossSite(post({ ...json, "sec-fetch-site": "cross-site" }))?.status).toBe(403);
  });
});

describe("readBodyText (round-1 L3)", () => {
  const streamed = (chunks: string[], headers: Record<string, string> = {}) => {
    let pulled = 0;
    // No eager buffering: a chunk is produced only when someone reads.
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks[pulled++];
          if (chunk === undefined) controller.close();
          else controller.enqueue(new TextEncoder().encode(chunk));
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request("https://for-the-people.example/api/ask", {
      method: "POST",
      headers,
      body,
      duplex: "half",
    } as RequestInit);
    return { request, pulled: () => pulled };
  };

  test("returns a body within the limit, as UTF-8 text", async () => {
    expect(await readBodyText(post({}), 10)).toBe("{}");
    const { request } = streamed(['{"q":', '"é"}']);
    expect(await readBodyText(request, 64)).toBe('{"q":"é"}');
  });

  test("refuses a declared Content-Length over the limit without reading the body", async () => {
    const { request, pulled } = streamed(["x".repeat(20)], { "content-length": "5000" });
    expect(await readBodyText(request, 1000)).toBeNull();
    expect(pulled()).toBe(0);
  });

  test("stops reading a body that grows past the limit, whatever it declared", async () => {
    const chunks = Array.from({ length: 100 }, () => "x".repeat(100));
    const { request, pulled } = streamed(chunks, { "content-length": "10" });
    expect(await readBodyText(request, 1000)).toBeNull();
    expect(pulled()).toBeLessThan(20);
  });

  test("counts bytes, not characters", async () => {
    const { request } = streamed(["é".repeat(6)]);
    expect(await readBodyText(request, 11)).toBeNull();
  });
});
