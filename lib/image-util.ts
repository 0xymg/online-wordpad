// Downscale + re-encode images before inserting them into the document.
// Keeps localStorage (5MB quota) and per-save DB payloads from exploding.

const MAX_DIMENSION = 1600;
const SMALL_FILE_BYTES = 300_000;
const JPEG_QUALITY = 0.85;

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type PreparedImage = { src: string; widthPx: number };

/**
 * Returns a data URL for the image, downscaled to MAX_DIMENSION and re-encoded
 * (JPEG for photos, PNG preserved for transparency). Falls back to the raw
 * data URL if decoding fails (e.g. unsupported format).
 */
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }
  if (!bitmap) {
    return { src: await readAsDataURL(file), widthPx: 480 };
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const keepOriginal = scale === 1 && file.size <= SMALL_FILE_BYTES;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  if (keepOriginal) {
    const src = await readAsDataURL(file);
    bitmap.close();
    return { src, widthPx: width };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const src = await readAsDataURL(file);
    bitmap.close();
    return { src, widthPx: width };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const preserveAlpha = file.type === "image/png" || file.type === "image/gif" || file.type === "image/svg+xml";
  const src = preserveAlpha
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { src, widthPx: width };
}

/** Display width for a freshly inserted image: natural size, capped to the page column. */
export function insertWidth(widthPx: number): string {
  return `${Math.min(widthPx, 720)}px`;
}
