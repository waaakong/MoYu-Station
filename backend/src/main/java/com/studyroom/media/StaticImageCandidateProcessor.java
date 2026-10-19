package com.studyroom.media;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Locale;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/** Pure processing core. Run untrusted inputs through IsolatedImageProcessor, not in HTTP threads. */
public final class StaticImageCandidateProcessor {
  public static final int MAX_BYTES = 2 * 1024 * 1024;
  public static final int THUMB_EDGE = 512;

  public Result process(byte[] candidate, String declaredMime) {
    validateSize(candidate);
    ImageContainer container = ImageContainer.inspect(candidate);
    String mime = declaredMime == null ? "" : declaredMime.trim().toLowerCase(Locale.ROOT);
    if (mime.equals("image/jpg")) mime = "image/jpeg";
    if (!mime.equals(container.mime())) {
      throw new CandidateImageException("MEDIA_MIME_MISMATCH", "图片类型与实际内容不一致。");
    }
    validateDimensions(container.width(), container.height());
    BufferedImage decoded = null, upright = null, thumbnail = null;
    try {
      decoded = decode(container);
      upright = orient(decoded, container.orientation());
      byte[] clear = container.orientation() == 1 ? container.cleanBytes() : png(upright);
      String clearMime = container.orientation() == 1 ? container.mime() : "image/png";
      thumbnail = thumbnail(upright);
      return new Result(new Variant(clear, clearMime, upright.getWidth(), upright.getHeight()),
          new Variant(png(thumbnail), "image/png", thumbnail.getWidth(), thumbnail.getHeight()));
    } catch (IOException | IllegalArgumentException exception) {
      for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
        if (cause instanceof CandidateImageException failure) throw failure;
      }
      throw CandidateImageException.invalid();
    } finally {
      if (thumbnail != null) thumbnail.flush();
      if (upright != null && upright != decoded) upright.flush();
      if (decoded != null) decoded.flush();
    }
  }

  static void validateSize(byte[] bytes) {
    if (bytes == null || bytes.length == 0) throw new CandidateImageException("MEDIA_EMPTY", "请选择图片。");
    if (bytes.length > MAX_BYTES) {
      throw new CandidateImageException("MEDIA_TOO_LARGE", "清晰候选超过 2 MiB，请重新处理或分图。");
    }
  }

  static void validateDimensions(int width, int height) {
    int longest = Math.max(width, height), shortest = Math.min(width, height);
    int limit = longest >= 3L * shortest ? 4096 : 2560;
    if (shortest <= 0 || longest > limit || (long) width * height > 40_000_000) {
      throw new CandidateImageException("MEDIA_DIMENSIONS", "候选尺寸超限：普通图最长边 2560，长图或全景 4096。");
    }
  }

  static BufferedImage decode(ImageContainer container) throws IOException {
    try (var input = new MemoryCacheImageInputStream(new java.io.ByteArrayInputStream(container.cleanBytes()))) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw CandidateImageException.invalid();
      ImageReader reader = readers.next();
      try {
        // Recoverable decoder warnings (including truncated streams) must not become accepted uploads.
        reader.addIIOReadWarningListener((source, warning) -> { throw CandidateImageException.invalid(); });
        reader.setInput(input, false, false);
        ImageContainer.require(reader.getWidth(0) == container.width() && reader.getHeight(0) == container.height());
        BufferedImage image = reader.read(0);
        if (image == null) throw CandidateImageException.invalid();
        if (image.getWidth() != container.width() || image.getHeight() != container.height()) {
          image.flush(); throw CandidateImageException.invalid();
        }
        return image;
      } finally { reader.dispose(); }
    }
  }

  static BufferedImage orient(BufferedImage source, int orientation) {
    if (orientation == 1) return source;
    int w = source.getWidth(), h = source.getHeight();
    BufferedImage target = new BufferedImage(orientation >= 5 ? h : w, orientation >= 5 ? w : h,
        source.getColorModel().hasAlpha() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
    int[] row = new int[w];
    for (int y = 0; y < h; y++) {
      source.getRGB(0, y, w, 1, row, 0, w);
      for (int x = 0; x < w; x++) {
        int tx = x, ty = y;
        switch (orientation) {
          case 2 -> tx = w - 1 - x;
          case 3 -> { tx = w - 1 - x; ty = h - 1 - y; }
          case 4 -> ty = h - 1 - y;
          case 5 -> { tx = y; ty = x; }
          case 6 -> { tx = h - 1 - y; ty = x; }
          case 7 -> { tx = h - 1 - y; ty = w - 1 - x; }
          case 8 -> { tx = y; ty = w - 1 - x; }
          default -> throw CandidateImageException.invalid();
        }
        target.setRGB(tx, ty, row[x]);
      }
    }
    return target;
  }

  private BufferedImage thumbnail(BufferedImage source) {
    return resize(source, THUMB_EDGE);
  }

  static BufferedImage resize(BufferedImage source, int edge) {
    double scale = Math.min(1, (double) edge / Math.max(source.getWidth(), source.getHeight()));
    int w = Math.max(1, (int) Math.round(source.getWidth() * scale));
    int h = Math.max(1, (int) Math.round(source.getHeight() * scale));
    BufferedImage target = new BufferedImage(w, h, source.getColorModel().hasAlpha()
        ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
    Graphics2D graphics = target.createGraphics();
    try {
      graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
      graphics.drawImage(source, 0, 0, w, h, null);
    } finally { graphics.dispose(); }
    return target;
  }

  private byte[] png(BufferedImage image) throws IOException {
    return png(image, MAX_BYTES);
  }

  static byte[] png(BufferedImage image, int budget) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (var output = new MemoryCacheImageOutputStream(bytes) {
      @Override public void write(int value) throws IOException { check(1); super.write(value); }
      @Override public void write(byte[] value, int offset, int length) throws IOException {
        check(length); super.write(value, offset, length);
      }
      private void check(int length) throws IOException {
        if (length > budget - getStreamPosition()) {
          throw new CandidateImageException("MEDIA_OUTPUT_TOO_LARGE", "无损处理后的图片超出输出预算，请换图。");
        }
      }
    }) {
      if (!ImageIO.write(image, "png", output)) throw new IOException("PNG writer unavailable");
    }
    return bytes.toByteArray();
  }

  public record Variant(byte[] bytes, String mime, int width, int height) {
    public Variant { bytes = bytes.clone(); }
    @Override public byte[] bytes() { return bytes.clone(); }
  }
  public record Result(Variant clear, Variant thumb, Variant display) {
    public Result(Variant clear, Variant thumb) { this(clear, thumb, null); }
  }
}
