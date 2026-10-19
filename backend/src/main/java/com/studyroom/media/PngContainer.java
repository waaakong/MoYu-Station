package com.studyroom.media;

import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.CRC32;
import static com.studyroom.media.ImageContainer.*;

final class PngContainer {
  private PngContainer() { }

  static ImageContainer inspect(byte[] bytes) {
    ByteArrayOutputStream clean = new ByteArrayOutputStream(bytes.length);
    clean.write(bytes, 0, 8);
    Set<String> singleton = new HashSet<>();
    int width = 0, height = 0, orientation = 1, colorType = -1;
    boolean data = false, dataEnded = false, ended = false, palette = false;
    int p = 8;
    while (p < bytes.length) {
      require(!ended && p <= bytes.length - 12);
      long length = uint(bytes, p, 4, false);
      require(length <= bytes.length - p - 12);
      int n = (int) length, d = p + 8, end = d + n + 4;
      String type = ascii(bytes, p + 4, 4);
      require(type.matches("[A-Za-z]{2}[A-Z][A-Za-z]"));
      CRC32 crc = new CRC32();
      crc.update(bytes, p + 4, n + 4);
      require(crc.getValue() == uint(bytes, d + n, 4, false));
      if (p == 8) require(type.equals("IHDR"));
      if (!type.equals("IDAT")) require(singleton.add(type) || !Character.isUpperCase(type.charAt(0)));
      if (data && !type.equals("IDAT")) dataEnded = true;
      boolean keep = false;
      switch (type) {
        case "IHDR" -> {
          require(p == 8 && n == 13);
          long w = uint(bytes, d, 4, false), h = uint(bytes, d + 4, 4, false);
          require(w > 0 && w <= Integer.MAX_VALUE && h > 0 && h <= Integer.MAX_VALUE);
          width = (int) w; height = (int) h; colorType = u8(bytes, d + 9);
          int depth = u8(bytes, d + 8);
          if (depth == 16) throw CandidateImageException.color(); // Do not silently quantize high-bit-depth candidates.
          require((colorType == 0 || colorType == 3) && (depth == 1 || depth == 2 || depth == 4 || depth == 8)
              || (colorType == 2 || colorType == 4 || colorType == 6) && depth == 8);
          require(u8(bytes, d + 10) == 0 && u8(bytes, d + 11) == 0 && u8(bytes, d + 12) <= 1);
          keep = true;
        }
        case "PLTE" -> {
          require(!data && n > 0 && n <= 768 && n % 3 == 0 && colorType != 0 && colorType != 4);
          palette = true; keep = true;
        }
        case "tRNS" -> {
          require(!data && (colorType != 3 || palette) && singleton.add("transparency"));
          keep = true;
        }
        case "IDAT" -> {
          require(!dataEnded && (colorType != 3 || palette));
          data = true; keep = true;
        }
        case "IEND" -> { require(data && n == 0 && end == bytes.length); ended = true; keep = true; }
        case "acTL", "fcTL", "fdAT" -> throw CandidateImageException.animated();
        case "iCCP", "cICP", "mDCV", "cLLI" -> throw CandidateImageException.color();
        case "sRGB" -> { require(!data && n == 1 && u8(bytes, d) <= 3 && singleton.add("srgb")); }
        case "gAMA" -> {
          require(!data && n == 4 && singleton.add("gamma"));
          if (uint(bytes, d, 4, false) != 45455) throw CandidateImageException.color();
        }
        case "cHRM" -> {
          require(!data && n == 32 && singleton.add("chroma"));
          int[] srgb = {31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000};
          for (int i = 0; i < srgb.length; i++) if (uint(bytes, d + i * 4, 4, false) != srgb[i]) {
            throw CandidateImageException.color();
          }
        }
        case "eXIf" -> { require(singleton.add("exif")); orientation = orientation(bytes, d, n); }
        default -> require(Character.isLowerCase(type.charAt(0))); // Strip ancillary metadata; reject unknown critical chunks.
      }
      if (keep) clean.write(bytes, p, end - p);
      p = end;
    }
    require(ended);
    return new ImageContainer(clean.toByteArray(), "image/png", width, height, orientation);
  }
}
