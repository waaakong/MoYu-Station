package com.studyroom.media;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Bounded structural pass before ImageIO allocates any pixels. Unknown rendering semantics fail closed. */
final class GifContainer {
  static final int MAX_BYTES = 5 * 1024 * 1024;
  record Frame(int x, int y, int width, int height, int disposal, int delay, boolean transparent) {}
  final int width, height, background, loops, durationMs;
  final List<Frame> frames;
  final byte[] clean;
  private GifContainer(int width, int height, int background, int loops, int duration, List<Frame> frames, byte[] clean) {
    this.width = width; this.height = height; this.background = background; this.loops = loops;
    this.durationMs = duration; this.frames = List.copyOf(frames); this.clean = clean;
  }
  static GifContainer inspect(byte[] bytes) {
    if (bytes == null || bytes.length == 0) throw new CandidateImageException("MEDIA_EMPTY", "请选择表情图片。");
    if (bytes.length > MAX_BYTES) throw new CandidateImageException("MEDIA_TOO_LARGE", "GIF 不得超过 5 MiB。");
    var p = new Cursor(bytes);
    String signature = new String(p.take(6), StandardCharsets.US_ASCII);
    require(signature.equals("GIF87a") || signature.equals("GIF89a"));
    int width = p.shortValue(), height = p.shortValue(), packed = p.byteValue(), bg = p.byteValue(), aspect = p.byteValue();
    if (width < 1 || height < 1 || width > 1024 || height > 1024) throw new CandidateImageException("MEDIA_DIMENSIONS", "GIF 源边长不得超过 1024。");
    if (aspect != 0) unsupported(); // Non-square pixels are not silently stretched.
    int background = 0;
    if ((packed & 128) != 0) {
      byte[] palette = p.take(3 * (1 << ((packed & 7) + 1)));
      require(bg * 3 + 2 < palette.length);
      background = 0xff000000 | ((palette[bg*3]&255)<<16) | ((palette[bg*3+1]&255)<<8) | (palette[bg*3+2]&255);
    }
    var clean = new ByteArrayOutputStream(); clean.write(bytes, 0, p.position);
    var frames = new ArrayList<Frame>();
    int disposal = 0, delay = 0, loops = -1, duration = 0; boolean transparent = false, gce = false, trailer = false;
    while (p.position < bytes.length) {
      int start = p.position, kind = p.byteValue();
      if (kind == 0x3b) { require(!gce && !frames.isEmpty() && p.position == bytes.length); clean.write(kind); trailer = true; break; }
      if (kind == 0x21) {
        int label = p.byteValue();
        if (label == 0xf9) {
          require(!gce && p.byteValue() == 4); int flags = p.byteValue();
          disposal = (flags >> 2) & 7; transparent = (flags & 1) != 0;
          if ((flags & 0xe2) != 0 || disposal > 3) unsupported();
          delay = p.shortValue(); p.byteValue(); require(p.byteValue() == 0); gce = true;
          clean.write(bytes, start, p.position - start);
        } else if (label == 0xfe) { p.blocks(); } // comments never reach stored resources
        else if (label == 0xff) {
          require(p.byteValue() == 11); String app = new String(p.take(11), StandardCharsets.US_ASCII);
          byte[] data = p.blocks();
          if (!app.equals("NETSCAPE2.0") && !app.equals("ANIMEXTS1.0")) unsupported();
          require(loops == -1 && frames.isEmpty() && data.length == 3 && data[0] == 1);
          loops = (data[1]&255) | ((data[2]&255)<<8); clean.write(bytes, start, p.position - start);
        } else unsupported();
      } else if (kind == 0x2c) {
        int x = p.shortValue(), y = p.shortValue(), w = p.shortValue(), h = p.shortValue(), flags = p.byteValue();
        require(w > 0 && h > 0 && x + w <= width && y + h <= height && (flags & 0x18) == 0);
        if ((flags & 128) != 0) p.take(3 * (1 << ((flags & 7) + 1)));
        else require((packed & 128) != 0);
        int codeSize = p.byteValue(); require(codeSize >= 2 && codeSize <= 8); require(p.blocks().length > 0);
        frames.add(new Frame(x,y,w,h,disposal,delay,transparent));
        // Browsers clamp 0/1 centisecond delays to 100ms; budget the actual visible timeline.
        duration += delay < 2 ? 100 : delay * 10;
        if (frames.size() > 120 || duration > 15_000 || (long) frames.size()*width*height > 32_000_000)
          throw new CandidateImageException("MEDIA_GIF_BUDGET", "GIF 超过 120 帧、15 秒或累计 3200 万源画布像素预算。");
        clean.write(bytes, start, p.position - start); disposal = 0; delay = 0; transparent = false; gce = false;
      } else throw CandidateImageException.invalid();
    }
    require(trailer);
    return new GifContainer(width,height,background,loops,duration,frames,clean.toByteArray());
  }
  private static void unsupported() { throw new CandidateImageException("MEDIA_GIF_UNSUPPORTED", "GIF 包含尚未验证的渲染或交互扩展，请换用普通 GIF。"); }
  private static void require(boolean condition) { if (!condition) throw CandidateImageException.invalid(); }
  private static final class Cursor {
    final byte[] bytes; int position;
    Cursor(byte[] bytes) { this.bytes = bytes; }
    int byteValue() { require(position < bytes.length); return bytes[position++] & 255; }
    int shortValue() { return byteValue() | (byteValue() << 8); }
    byte[] take(int count) { require(count <= bytes.length-position); var result = java.util.Arrays.copyOfRange(bytes,position,position+count); position += count; return result; }
    byte[] blocks() { var result = new ByteArrayOutputStream(); for (int length; (length=byteValue()) != 0;) result.writeBytes(take(length)); return result.toByteArray(); }
  }
}
