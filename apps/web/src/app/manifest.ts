import type { MetadataRoute } from "next";

/** Web app manifest: installable, with shortcuts to the ballot and to the cheat sheet that works offline. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "For The People",
    short_name: "For The People",
    description:
      "A free, nonpartisan guide to how the people on your ballot voted, with the official record behind every fact.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F6F7F9",
    theme_color: "#F6F7F9",
    categories: ["news", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My ballot cheat sheet", url: "/ballot/cheat-sheet" },
      { name: "My ballot", url: "/ballot" },
    ],
  };
}
