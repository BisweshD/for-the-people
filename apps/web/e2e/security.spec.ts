import { expect, test } from "./fixtures";

/** Security checks against the production server. */

const ADDRESS = "1234 Oak Ave, Tampa, FL 33606";

const askBody = (text: string) => ({
  messages: [{ id: "u1", role: "user", parts: [{ type: "text", text }] }],
});

test.describe("POST routes refuse cross-site requests (M2)", () => {
  const routes = [
    { path: "/api/ask", data: askBody("How did Ted Cruz vote on tariffs?") },
    { path: "/api/location", data: { address: "1100 Congress Ave, Austin, TX 78701" } },
    {
      path: "/api/corrections",
      data: { target: { kind: "person", id: "A000370" }, field: "party", report: "x".repeat(40) },
    },
  ];

  for (const { path, data } of routes) {
    test(`${path} refuses text/plain and another site's Origin`, async ({ request }) => {
      const plain = await request.post(path, {
        headers: { "content-type": "text/plain" },
        data: JSON.stringify(data),
      });
      expect(plain.status()).toBe(415);
      const form = await request.post(path, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        data: "address=1+Main+St",
      });
      expect(form.status()).toBe(415);
      const crossSite = await request.post(path, {
        headers: { origin: "https://evil.example" },
        data,
      });
      expect(crossSite.status()).toBe(403);
      const fetchMetadata = await request.post(path, {
        headers: { "sec-fetch-site": "cross-site" },
        data,
      });
      expect(fetchMetadata.status()).toBe(403);
    });
  }

  test("a same-origin page still asks, with JSON and its own Origin", async ({ page }) => {
    await page.goto("/ask");
    const status = await page.evaluate(async (body) => {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await response.text();
      return response.status;
    }, askBody("What did the SAVE Act do?"));
    expect(status).toBe(200);
  });
});

test.describe("rate limits key on the address the nearest proxy saw (M1)", () => {
  test("rotating the first X-Forwarded-For entry does not escape the Ask limit", async ({
    request,
  }) => {
    const statuses: number[] = [];
    // 22 distinct questions: at least 11 land in one fixed minute window, one over the limit of 10.
    for (let i = 0; i < 22; i++) {
      const response = await request.post("/api/ask", {
        headers: { "x-forwarded-for": `198.51.100.${i}, 203.0.113.77` },
        data: askBody(`How did Ted Cruz vote on tariffs, question ${i}?`),
      });
      await response.body();
      statuses.push(response.status());
    }
    expect(statuses).toContain(429);
  });
});

test.describe("addresses stay out of URLs and away from Ask (M4, M5)", () => {
  test("Ask answers an address with a pointer to the ballot, calls no model, and caches nothing", async ({
    request,
  }) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request.post("/api/ask", {
        data: askBody(`Who represents ${ADDRESS}?`),
      });
      expect(response.status()).toBe(200);
      expect(response.headers()["x-ask-cache"]).toBeUndefined();
      const text = await response.text();
      expect(text).toContain("Ask For The People does not read addresses");
      expect(text).not.toContain("tool-input");
      expect(text).not.toContain("Oak");
    }
  });

  test.describe("before JavaScript runs", () => {
    test.use({ javaScriptEnabled: false });

    test("the address form never puts the address in a URL", async ({ page }) => {
      const seen: string[] = [];
      page.on("request", (request) => seen.push(`${request.url()} ${request.postData() ?? ""}`));
      await page.goto("/ballot");
      const form = page.locator("form", { has: page.locator("#ballot-address") });
      await expect(form).toHaveAttribute("method", "post");
      await expect(page.locator("#ballot-address")).not.toHaveAttribute("name", /.*/);

      await page.locator("#ballot-address").fill(ADDRESS);
      await Promise.all([
        page.waitForRequest((request) => request.method() === "POST"),
        page.locator("#ballot-address").press("Enter"),
      ]);
      await page.waitForLoadState();
      expect(page.url()).not.toContain("?");
      for (const entry of seen) {
        expect(entry).not.toContain("Oak");
        expect(entry).not.toContain("33606");
      }
    });
  });
});

test.describe("smaller fixes", () => {
  test("receipt ids resolve own methods only (L1)", async ({ request }) => {
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const response = await request.get(`/api/receipts/${id}`);
      expect(response.status(), id).toBe(404);
    }
    expect((await request.get("/api/receipts/method-match")).status()).toBe(200);
  });

  test("a match card whose score contradicts its counts is refused (M7)", async ({ request }) => {
    const forged = await request.get("/api/share/match?personId=A000370&score=1&n=64&agreements=0");
    expect(forged.status()).toBe(400);
    const honest = await request.get(
      "/api/share/match?personId=A000370&score=0.015&n=64&agreements=0",
    );
    expect(honest.status()).toBe(200);
  });

  test("pages carry HSTS and a Content-Security-Policy (L2)", async ({ request }) => {
    const headers = (await request.get("/")).headers();
    expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    const csp = headers["content-security-policy"] ?? "";
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "connect-src 'self'",
    ])
      expect(csp).toContain(directive);
  });

  test("the app runs under that policy with no violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Content-Security-Policy/i.test(message.text()))
        violations.push(message.text());
    });
    for (const path of ["/", "/swipe", "/ask", "/ballot", "/matches", "/people/A000370"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
    }
    expect(violations).toEqual([]);
  });
});
