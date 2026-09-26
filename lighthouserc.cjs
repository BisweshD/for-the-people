// Lighthouse CI (docs/BRIEF.md 10.7): mobile performance >= 90, accessibility >= 95, CLS <= 0.05.
const base = process.env.LHCI_BASE_URL ?? "http://localhost:3200";
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : undefined);

module.exports = {
  ci: {
    collect: {
      url: ["/", "/swipe", "/people/A000370", "/bills/119-hr-1", "/ballot"].map(
        (path) => `${base}${path}`,
      ),
      // Three runs, judged on the median run for performance (see scripts/lighthouse.mjs).
      numberOfRuns: 3,
      chromePath,
      settings: {
        formFactor: "mobile",
        screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9, aggregationMethod: "median-run" }],
        "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "pessimistic" }],
        "cumulative-layout-shift": [
          "error",
          { maxNumericValue: 0.05, aggregationMethod: "pessimistic" },
        ],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
