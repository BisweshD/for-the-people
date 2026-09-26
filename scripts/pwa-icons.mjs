// Builds browser and installable-app icons from the supplied people-and-flag emblem.
// Usage: node scripts/pwa-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "apps/web/src/assets/brand/people-flag.png");
const symbol = await sharp(source).trim().png().toBuffer();

async function save(file, data) {
  const path = join(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  console.log(file);
}

function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

async function appIcon(size, padding = 0.1) {
  const inset = Math.round(size * padding);
  return sharp(symbol)
    .flatten({ background: "#ffffff" })
    .resize(size - 2 * inset, size - 2 * inset, { fit: "contain", background: "#ffffff" })
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background: "#ffffff" })
    .ensureAlpha()
    .png()
    .toBuffer();
}

await save(
  "apps/web/public/brand/symbol.png",
  await sharp(symbol).resize({ width: 320 }).png().toBuffer(),
);
await save("apps/web/src/app/icon.png", await appIcon(64, 0.04));
const favicons = [];
for (const size of [16, 32, 48]) favicons.push({ size, png: await appIcon(size, 0.04) });
await save("apps/web/src/app/favicon.ico", ico(favicons));
await save("apps/web/src/app/apple-icon.png", await appIcon(180));
for (const size of [192, 512])
  await save(`apps/web/public/icons/icon-${size}.png`, await appIcon(size));
await save("apps/web/public/icons/maskable-512.png", await appIcon(512, 0.2));
