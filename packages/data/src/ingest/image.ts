import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import decodeJpeg, { init as initJpegDecode } from "@jsquash/jpeg/decode";
import encodeAvif, { init as initAvifEncode } from "@jsquash/avif/encode";
import resize, { initResize } from "@jsquash/resize";
import encodeWebp, { init as initWebpEncode } from "@jsquash/webp/encode";

/**
 * Image conversion with WebAssembly codecs (Squoosh's, via @jsquash). Native image libraries are
 * blocked by this machine's application-control policy, and WASM needs no native binaries.
 */

const require = createRequire(import.meta.url);

/** Node has no ImageData; the codecs only need this shape. */
class NodeImageData {
  readonly colorSpace = "srgb";
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}
(globalThis as { ImageData?: unknown }).ImageData ??= NodeImageData;

let ready: Promise<void> | null = null;

async function wasm(path: string): Promise<ArrayBuffer> {
  const buffer = await readFile(require.resolve(path));
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function initCodecs(): Promise<void> {
  ready ??= (async () => {
    await Promise.all([
      initJpegDecode({ wasmBinary: await wasm("@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm") }),
      initWebpEncode({ wasmBinary: await wasm("@jsquash/webp/codec/enc/webp_enc.wasm") }),
      initAvifEncode({ wasmBinary: await wasm("@jsquash/avif/codec/enc/avif_enc.wasm") }),
      initResize(await wasm("@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm")),
    ]);
  })();
  return ready;
}

/** Crops to the target aspect ratio, anchored at the top so faces stay in frame. */
function cropTo(image: ImageData, ratio: number): ImageData {
  const targetWidth = Math.min(image.width, Math.round(image.height * ratio));
  const targetHeight = Math.min(image.height, Math.round(targetWidth / ratio));
  const left = Math.floor((image.width - targetWidth) / 2);
  const data = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let row = 0; row < targetHeight; row++) {
    const from = (row * image.width + left) * 4;
    data.set(image.data.subarray(from, from + targetWidth * 4), row * targetWidth * 4);
  }
  return new NodeImageData(data, targetWidth, targetHeight) as unknown as ImageData;
}

export interface PortraitRenditions {
  sizes: Array<{ width: number; avif: Buffer; webp: Buffer }>;
  placeholder: Buffer;
}

export async function portraitRenditions(
  jpeg: Buffer,
  widths: readonly number[],
): Promise<PortraitRenditions> {
  await initCodecs();
  const decoded = await decodeJpeg(
    jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer,
  );
  const cropped = cropTo(decoded, 4 / 5);
  const sizes = [];
  for (const width of widths) {
    const scaled = await resize(cropped, {
      width,
      height: Math.round(width * 1.25),
      fitMethod: "stretch",
    });
    sizes.push({
      width,
      avif: Buffer.from(await encodeAvif(scaled, { quality: 55, speed: 6 })),
      webp: Buffer.from(await encodeWebp(scaled, { quality: 74 })),
    });
  }
  const tiny = await resize(cropped, { width: 12, height: 15, fitMethod: "stretch" });
  return { sizes, placeholder: Buffer.from(await encodeWebp(tiny, { quality: 40 })) };
}
