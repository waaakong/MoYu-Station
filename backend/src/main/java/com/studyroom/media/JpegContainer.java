package com.studyroom.media;

import java.io.ByteArrayOutputStream;
import static com.studyroom.media.ImageContainer.*;

final class JpegContainer {
  private JpegContainer() { }

  static ImageContainer inspect(byte[] bytes) {
    ByteArrayOutputStream clean = new ByteArrayOutputStream(bytes.length);
    clean.write(bytes, 0, 2);
    int p = 2, width = 0, height = 0, orientation = 1;
    boolean scan = false, exif = false, ended = false, jfif = false, adobe = false;
    while (p < bytes.length) {
      int markerStart = p;
      require(u8(bytes, p++) == 255);
      while (p < bytes.length && u8(bytes, p) == 255) p++;
      require(p < bytes.length);
      int marker = u8(bytes, p++);
      if (marker == 0xd9) {
        require(scan && p == bytes.length); clean.write(255); clean.write(marker); ended = true; break;
      }
      require(marker != 0 && marker != 0xd8 && marker != 1 && !(marker >= 0xd0 && marker <= 0xd7));
      int n = (int) uint(bytes, p, 2, false), d = p + 2;
      require(n >= 2 && n <= bytes.length - p);
      int end = p + n, length = n - 2;
      boolean keep = true;
      if (marker >= 0xe0 && marker <= 0xef || marker == 0xfe) {
        keep = false;
        if (marker == 0xe1 && length >= 6 && ascii(bytes, d, 6).equals("Exif\0\0")) {
          require(!exif); exif = true; orientation = orientation(bytes, d, length);
        } else if (marker == 0xe2 && length >= 12 && ascii(bytes, d, 12).equals("ICC_PROFILE\0")) {
          throw CandidateImageException.color();
        } else if (marker == 0xe0 && length >= 5 && ascii(bytes, d, 5).equals("JFIF\0")) {
          require(!jfif && !scan && length >= 14); jfif = true;
          require(length == 14 + 3 * u8(bytes, d + 12) * u8(bytes, d + 13));
          // Rebuild a minimal JFIF marker: no embedded thumbnail or source density metadata.
          clean.writeBytes(new byte[] {(byte) 255, (byte) 224, 0, 16, 74, 70, 73, 70, 0, 1, 2, 0, 0, 1, 0, 1, 0, 0});
        } else if (marker == 0xee && length >= 5 && ascii(bytes, d, 5).equals("Adobe")) {
          require(!adobe && !scan && length == 12); adobe = true;
          if (u8(bytes, d + 11) > 1) throw CandidateImageException.color();
          keep = true; // Necessary RGB/YCbCr interpretation; not user metadata.
        }
      } else if (marker == 0xc0 || marker == 0xc2) {
        require(width == 0 && length >= 6 && u8(bytes, d) == 8);
        height = (int) uint(bytes, d + 1, 2, false); width = (int) uint(bytes, d + 3, 2, false);
        int components = u8(bytes, d + 5);
        if (components != 1 && components != 3) throw CandidateImageException.color();
        require(length == 6 + components * 3);
      } else {
        // Restrict to baseline/progressive Huffman JPEG, not arithmetic/lossless/hierarchical variants.
        require(marker == 0xc4 || marker == 0xdb || marker == 0xdd || marker == 0xda);
      }
      if (keep) clean.write(bytes, markerStart, end - markerStart);
      p = end;
      if (marker == 0xda) {
        require(width > 0 && height > 0); scan = true;
        int entropyStart = p;
        while (p < bytes.length) {
          if (u8(bytes, p) != 255) { p++; continue; }
          int next = p + 1;
          while (next < bytes.length && u8(bytes, next) == 255) next++;
          require(next < bytes.length);
          int code = u8(bytes, next);
          if (code == 0 || code >= 0xd0 && code <= 0xd7) p = next + 1;
          else break;
        }
        clean.write(bytes, entropyStart, p - entropyStart);
      }
    }
    require(ended && width > 0 && height > 0);
    return new ImageContainer(clean.toByteArray(), "image/jpeg", width, height, orientation);
  }
}
