import { expect, test } from "@playwright/test";

test("transparent PNG and WebP pixels remain transparent after upload processing", async ({ page }) => {
  await page.route("**/api/auth/me", route => route.fulfill({
    json: { success: true, data: null }
  }));
  await page.goto("/");

  const results = await page.evaluate(async () => {
    const { prepareUploadImage } = await import("/src/utils/imagePipeline.ts");
    const results = [];

    for (const inputType of ["image/png", "image/webp"] as const) {
      const source = document.createElement("canvas");
      source.width = 64;
      source.height = 64;
      const sourceContext = source.getContext("2d", { alpha: true });
      if (!sourceContext) throw new Error("source canvas unavailable");
      sourceContext.clearRect(0, 0, 64, 64);
      sourceContext.fillStyle = "#ff4d68";
      sourceContext.fillRect(16, 16, 32, 32);

      const sourceBlob = await new Promise<Blob>((resolve, reject) => {
        source.toBlob(blob => blob ? resolve(blob) : reject(new Error("source image creation failed")), inputType);
      });
      const extension = inputType === "image/png" ? "png" : "webp";
      const prepared = await prepareUploadImage(new File([sourceBlob], `transparent.${extension}`, { type: inputType }));
      const decoded = await createImageBitmap(prepared.file);
      const output = document.createElement("canvas");
      output.width = decoded.width;
      output.height = decoded.height;
      const outputContext = output.getContext("2d", { alpha: true });
      if (!outputContext) throw new Error("output canvas unavailable");
      outputContext.drawImage(decoded, 0, 0);
      const corner = [...outputContext.getImageData(0, 0, 1, 1).data];
      const center = [...outputContext.getImageData(32, 32, 1, 1).data];
      decoded.close();

      results.push({
        inputType,
        corner,
        center,
        outputType: prepared.file.type,
        outputName: prepared.file.name,
        outputBytes: prepared.outputBytes
      });
    }

    return results;
  });

  expect(results).toHaveLength(2);
  for (const result of results) {
    expect(result.outputType).toBe("image/webp");
    expect(result.outputName).toBe("transparent.webp");
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.corner[3]).toBe(0);
    expect(result.center[3]).toBe(255);
  }
});
