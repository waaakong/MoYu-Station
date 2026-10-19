package com.studyroom.media;

import java.awt.image.BufferedImage;
import java.io.IOException;

/** Private scene pipeline. Originals are never persisted. Run only in the isolated worker. */
public final class SceneImageProcessor {
  public static final int INPUT_BYTES = 20 * 1024 * 1024;
  public static final int MASTER_BYTES = 8 * 1024 * 1024;
  public static final int DISPLAY_BYTES = 2 * 1024 * 1024;

  static void validateInput(byte[] bytes) {
    if (bytes == null || bytes.length == 0) throw new CandidateImageException("MEDIA_EMPTY", "请选择场景图片。");
    if (bytes.length > INPUT_BYTES) throw new CandidateImageException("MEDIA_TOO_LARGE", "场景原图不得超过 20 MiB。");
  }

  public StaticImageCandidateProcessor.Result process(byte[] bytes, String mime) {
    validateInput(bytes);
    var container = ImageContainer.inspect(bytes);
    if (!container.mime().equals(mime)) throw new CandidateImageException("MEDIA_MIME_MISMATCH", "图片类型与内容不一致。");
    if (Math.max(container.width(), container.height()) > 12000 || (long) container.width() * container.height() > 40_000_000) {
      throw new CandidateImageException("MEDIA_DIMENSIONS", "场景原图不得超过 4000 万像素或 12000 边长。");
    }
    BufferedImage decoded = null, reduced = null, master = null, display = null, thumb = null;
    try {
      decoded = StaticImageCandidateProcessor.decode(container);
      // Resize before EXIF rotation: do not allocate a second full 40 MP canvas.
      reduced = StaticImageCandidateProcessor.resize(decoded, 4096);
      decoded.flush(); decoded = null;
      master = StaticImageCandidateProcessor.orient(reduced, container.orientation());
      if (master != reduced) { reduced.flush(); reduced = null; }
      for (;;) {
        display = StaticImageCandidateProcessor.resize(master, 2560);
        thumb = StaticImageCandidateProcessor.resize(master, 512);
        try {
          return new StaticImageCandidateProcessor.Result(variant(master, MASTER_BYTES), variant(thumb, DISPLAY_BYTES), variant(display, DISPLAY_BYTES));
        } catch (IOException | CandidateImageException failure) {
          boolean overBudget = false;
          for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof CandidateImageException error && "MEDIA_OUTPUT_TOO_LARGE".equals(error.code())) overBudget = true;
          }
          int edge = Math.max(master.getWidth(), master.getHeight());
          if (!overBudget || edge <= 512) throw failure;
          // All variants must be derived from the same resized master for the storage contract.
          BufferedImage smaller = StaticImageCandidateProcessor.resize(master, Math.max(512, (int)(edge * 0.75)));
          display.flush(); thumb.flush(); master.flush();
          master = smaller;
        }
      }
    } catch (IOException | IllegalArgumentException failure) {
      for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
        if (cause instanceof CandidateImageException image) throw image;
      }
      throw CandidateImageException.invalid();
    } finally {
      for (BufferedImage image : new BufferedImage[]{decoded, reduced, master, display, thumb}) if (image != null) image.flush();
    }
  }

  private static StaticImageCandidateProcessor.Variant variant(BufferedImage image, int budget) throws IOException {
    return new StaticImageCandidateProcessor.Variant(StaticImageCandidateProcessor.png(image, budget), "image/png", image.getWidth(), image.getHeight());
  }
}
