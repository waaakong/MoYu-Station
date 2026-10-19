package com.studyroom.media;

import java.io.ByteArrayOutputStream;
import static com.studyroom.media.ImageContainer.*;

final class WebpContainer {
  private WebpContainer() { }

  static ImageContainer inspect(byte[] bytes) {
    require(uint(bytes, 4, 4, true) == bytes.length - 8L);
    ByteArrayOutputStream clean = new ByteArrayOutputStream(bytes.length);
    clean.write(bytes, 0, 12);
    int width = 0, height = 0, canvasW = 0, canvasH = 0, orientation = 1, flags = 0;
    boolean extended = false, pixels = false, alpha = false, exif = false, xmp = false;
    int p = 12;
    while (p < bytes.length) {
      require(p <= bytes.length - 8);
      String type = ascii(bytes, p, 4);
      long length = uint(bytes, p + 4, 4, true);
      require(length <= bytes.length - p - 8L);
      int n = (int) length, d = p + 8, end = d + n + (n & 1);
      require(end <= bytes.length && ((n & 1) == 0 || bytes[end - 1] == 0));
      boolean keep = false;
      switch (type) {
        case "VP8X" -> {
          require(p == 12 && !extended && n == 10);
          extended = true; flags = u8(bytes, d);
          if ((flags & 2) != 0) throw CandidateImageException.animated();
          if ((flags & 32) != 0) throw CandidateImageException.color();
          require((flags & 0xc1) == 0 && uint(bytes, d + 1, 3, true) == 0);
          canvasW = (int) uint(bytes, d + 4, 3, true) + 1;
          canvasH = (int) uint(bytes, d + 7, 3, true) + 1;
          byte[] header = java.util.Arrays.copyOfRange(bytes, p, end);
          header[8] &= 0x10; // Retain alpha; metadata and animation flags are not copied.
          clean.writeBytes(header);
        }
        case "ANIM", "ANMF" -> throw CandidateImageException.animated();
        case "ICCP" -> throw CandidateImageException.color();
        case "ALPH" -> { require(extended && !pixels && !alpha && n > 0); alpha = true; keep = true; }
        case "VP8 ", "VP8L" -> {
          require(!pixels);
          pixels = true; keep = true;
          if (type.equals("VP8L")) {
            require(!alpha && n >= 5 && u8(bytes, d) == 47);
            long bits = uint(bytes, d + 1, 4, true);
            require((bits >>> 29) == 0);
            width = (int) (bits & 0x3fff) + 1; height = (int) ((bits >>> 14) & 0x3fff) + 1;
            alpha = (bits & (1L << 28)) != 0;
          } else {
            require(n >= 10 && (u8(bytes, d) & 1) == 0 && u8(bytes, d + 3) == 0x9d
                && u8(bytes, d + 4) == 1 && u8(bytes, d + 5) == 0x2a);
            width = (int) uint(bytes, d + 6, 2, true) & 0x3fff;
            height = (int) uint(bytes, d + 8, 2, true) & 0x3fff;
          }
        }
        case "EXIF" -> { require(extended && pixels && !exif); exif = true; orientation = orientation(bytes, d, n); }
        case "XMP " -> { require(extended && pixels && !xmp); xmp = true; }
        default -> { } // Unknown chunks are not necessary to reconstruct this accepted static image.
      }
      if (keep) clean.write(bytes, p, end - p);
      p = end;
    }
    require(pixels && width > 0 && height > 0);
    if (extended) require(canvasW == width && canvasH == height && ((flags & 16) != 0) == alpha
        && ((flags & 8) != 0) == exif && ((flags & 4) != 0) == xmp);
    byte[] result = clean.toByteArray();
    putLe32(result, 4, result.length - 8);
    return new ImageContainer(result, "image/webp", width, height, orientation);
  }
}
