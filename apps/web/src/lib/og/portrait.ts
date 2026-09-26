import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const PORTRAIT_DIR = join(process.cwd(), "public", "portraits");
const ASSET = /^\/portraits\/([A-Za-z0-9_-]+)$/;

/**
 * An official portrait as a JPEG data URL for Satori, which cannot decode WebP or AVIF. Reads our own
 * self-hosted file (never a remote URL). Null when there is no portrait, so cards show initials instead.
 */
export async function portraitDataUrl(asset: string | null | undefined): Promise<string | null> {
  const name = asset ? ASSET.exec(asset)?.[1] : undefined;
  if (!name) return null;
  try {
    const webp = await readFile(join(PORTRAIT_DIR, `${name}-400.webp`));
    const jpeg = await sharp(webp).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}
