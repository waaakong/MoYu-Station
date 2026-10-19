export const IMAGE_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_INPUT_LIMIT = 20 * 1024 * 1024;
export const IMAGE_OUTPUT_TARGET = 1024 * 1024;
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_MAX_PIXELS = 40_000_000;
export const IMAGE_MAX_SOURCE_EDGE = 12_000;

export type PreparedUploadImage = {
  file: File;
  width: number;
  height: number;
  originalBytes: number;
  outputBytes: number;
};

type ImagePipelineOptions = {
  maxEdge?: number;
  targetBytes?: number;
  createBitmap?: (file: File) => Promise<ImageBitmap>;
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
};

export function validateImageCandidate(file: File): void {
  if (!IMAGE_INPUT_TYPES.includes(file.type as (typeof IMAGE_INPUT_TYPES)[number])) {
    throw new Error("图片仅支持 JPG、PNG 或 WebP。");
  }
  if (file.size <= 0 || file.size > IMAGE_INPUT_LIMIT) {
    throw new Error("原始图片不能超过 20MB。");
  }
}

export function fitWithin(width: number, height: number, maxEdge = IMAGE_MAX_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("无法确认图片尺寸。");
  }
  if (width > IMAGE_MAX_SOURCE_EDGE || height > IMAGE_MAX_SOURCE_EDGE || width * height > IMAGE_MAX_PIXELS) {
    throw new Error("图片像素或尺寸超过安全限制。");
  }
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

export async function prepareUploadImage(
  file: File,
  options: ImagePipelineOptions = {}
): Promise<PreparedUploadImage> {
  validateImageCandidate(file);
  const bitmapFactory = options.createBitmap ?? defaultCreateBitmap;
  const bitmap = await bitmapFactory(file);
  try {
    const dimensions = fitWithin(bitmap.width, bitmap.height, options.maxEdge ?? IMAGE_MAX_EDGE);
    const targetBytes = options.targetBytes ?? IMAGE_OUTPUT_TARGET;
    const canvasFactory = options.createCanvas ?? defaultCreateCanvas;
    let width = dimensions.width;
    let height = dimensions.height;
    let quality = 0.8;
    let blob: Blob | null = null;
    const preserveTransparency = file.type !== "image/jpeg";

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = canvasFactory(width, height);
      const context = canvas.getContext("2d", { alpha: preserveTransparency });
      if (!context) throw new Error("当前设备无法处理图片。");
      if (preserveTransparency) context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvasToBlob(canvas, "image/webp", quality);
      if (blob.size <= targetBytes) break;
      if (quality > 0.56) {
        quality -= 0.08;
      } else {
        width = Math.max(1, Math.round(width * 0.86));
        height = Math.max(1, Math.round(height * 0.86));
      }
    }

    if (!blob || blob.type !== "image/webp") {
      throw new Error("当前设备不支持安全的 WebP 图片处理。");
    }
    if (blob.size > targetBytes) {
      throw new Error("图片压缩后仍超过 1MB，请换一张图片。");
    }

    const stem = file.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "-") || "image";
    return {
      file: new File([blob], `${stem}.webp`, { type: "image/webp", lastModified: Date.now() }),
      width,
      height,
      originalBytes: file.size,
      outputBytes: blob.size
    };
  } finally {
    bitmap.close?.();
  }
}

async function defaultCreateBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("当前设备不支持安全的图片处理。");
  }
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function defaultCreateCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片压缩失败，请重新选择。"));
    }, type, quality);
  });
}
