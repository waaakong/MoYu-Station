package com.studyroom.media;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Bounded container inspection, before any pixel decoder is invoked. */
record ImageContainer(byte[] cleanBytes, String mime, int width, int height, int orientation) {
  static ImageContainer inspect(byte[] bytes) {
    if (bytes.length >= 8 && Arrays.equals(Arrays.copyOf(bytes, 8),
        new byte[] {(byte) 137, 80, 78, 71, 13, 10, 26, 10})) return PngContainer.inspect(bytes);
    if (bytes.length >= 3 && u8(bytes, 0) == 255 && u8(bytes, 1) == 216 && u8(bytes, 2) == 255) {
      return JpegContainer.inspect(bytes);
    }
    if (bytes.length >= 12 && ascii(bytes, 0, 4).equals("RIFF") && ascii(bytes, 8, 4).equals("WEBP")) {
      return WebpContainer.inspect(bytes);
    }
    throw new CandidateImageException("MEDIA_UNSUPPORTED_TYPE", "仅支持 JPEG、PNG 和静态 WebP。");
  }

  static void require(boolean condition) { if (!condition) throw CandidateImageException.invalid(); }
  static int u8(byte[] b, int p) { return b[p] & 255; }
  static long uint(byte[] b, int p, int length, boolean little) {
    require(p >= 0 && length >= 0 && p <= b.length - length);
    long result = 0;
    for (int i = 0; i < length; i++) result = (result << 8) | u8(b, p + (little ? length - i - 1 : i));
    return result;
  }
  static String ascii(byte[] b, int p, int n) {
    require(p >= 0 && n >= 0 && p <= b.length - n);
    return new String(b, p, n, StandardCharsets.US_ASCII);
  }
  static void putLe32(byte[] b, int p, int value) {
    for (int i = 0; i < 4; i++) b[p + i] = (byte) (value >>> (8 * i));
  }

  /** Reads only IFD0 orientation. GPS/sub-IFD pointers are never followed or retained. */
  static int orientation(byte[] bytes, int start, int length) {
    require(start >= 0 && length >= 8 && start <= bytes.length - length);
    byte[] tiff = Arrays.copyOfRange(bytes, start, start + length);
    if (length >= 6 && ascii(tiff, 0, 6).equals("Exif\0\0")) tiff = Arrays.copyOfRange(tiff, 6, length);
    require(tiff.length >= 8);
    String order = ascii(tiff, 0, 2);
    require(order.equals("II") || order.equals("MM"));
    boolean little = order.equals("II");
    require(uint(tiff, 2, 2, little) == 42);
    long offset = uint(tiff, 4, 4, little);
    require(offset >= 8 && offset <= tiff.length - 2);
    int p = (int) offset;
    int count = (int) uint(tiff, p, 2, little);
    require((long) p + 2 + 12L * count + 4 <= tiff.length);
    int result = 1;
    boolean found = false;
    for (int i = 0; i < count; i++) {
      int entry = p + 2 + i * 12;
      if (uint(tiff, entry, 2, little) == 0x112) {
        require(!found && uint(tiff, entry + 2, 2, little) == 3 && uint(tiff, entry + 4, 4, little) == 1);
        result = (int) uint(tiff, entry + 8, 2, little);
        require(result >= 1 && result <= 8);
        found = true;
      }
    }
    return result;
  }
}
