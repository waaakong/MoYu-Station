package com.studyroom.media;

import java.io.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

/** Internal immutable disk manifest, not an authorization or publication record. */
record StoredImageManifest(long owner, UUID id, Details clear, Details thumb, Details display) {
  static final int MAX_BYTES = 512;
  private static final int MAGIC = 0x4d495031; // MIP1, binary format version 1
  private static final int SCENE_MAGIC = 0x4d495032; // MIP2 adds the private-scene display derivative.

  StoredImageManifest(long owner, UUID id, Details clear, Details thumb) { this(owner, id, clear, thumb, null); }

  record Details(String mime, int width, int height, int size, String sha256) {
    Details {
      if (!java.util.Set.of("image/png", "image/jpeg", "image/webp", "image/gif").contains(mime)
          || size <= 0 || size > (mime.equals("image/gif") ? GifContainer.MAX_BYTES : SceneImageProcessor.MASTER_BYTES) || !sha256.matches("[0-9a-f]{64}")) {
        throw new IllegalArgumentException("Invalid stored media details");
      }
      if (width <= 0 || height <= 0 || Math.max(width,height)>4096) throw new IllegalArgumentException("Stored dimensions");
      if (mime.equals("image/gif") && Math.max(width,height)>512) throw new IllegalArgumentException("GIF output dimensions");
    }
  }

  StoredImageManifest {
    if (owner <= 0 || id == null || clear == null || thumb == null || !thumb.mime().equals("image/png")) {
      throw new IllegalArgumentException("Invalid stored media manifest");
    }
    if (display == null) {
      StaticImageCandidateProcessor.validateDimensions(clear.width(), clear.height());
      if (!clear.mime().equals("image/gif") && clear.size()>StaticImageCandidateProcessor.MAX_BYTES) throw new IllegalArgumentException("Social output budget");
    } else {
      if (!clear.mime().equals("image/png") || !display.mime().equals("image/png") || display.size()>SceneImageProcessor.DISPLAY_BYTES) throw new IllegalArgumentException("Scene output budget");
      double ratio = Math.min(1, 2560D / Math.max(clear.width(), clear.height()));
      if (display.width()!=Math.max(1,Math.round(clear.width()*ratio)) || display.height()!=Math.max(1,Math.round(clear.height()*ratio))) throw new IllegalArgumentException("Scene display dimensions");
    }
    if (thumb.size()>StaticImageCandidateProcessor.MAX_BYTES) throw new IllegalArgumentException("Thumbnail budget");
    double scale = Math.min(1, 512D / Math.max(clear.width(), clear.height()));
    if (thumb.width() != Math.max(1, Math.round(clear.width() * scale))
        || thumb.height() != Math.max(1, Math.round(clear.height() * scale))) {
      throw new IllegalArgumentException("Invalid thumbnail dimensions");
    }
  }

  static Details describe(StaticImageCandidateProcessor.Variant variant, byte[] bytes) {
    return describe(variant, bytes, false);
  }

  static Details describe(StaticImageCandidateProcessor.Variant variant, byte[] bytes, boolean scene) {
    if ("image/gif".equals(variant.mime())) {
      var gif=GifContainer.inspect(bytes);
      if (gif.width!=variant.width() || gif.height!=variant.height() || !java.util.Arrays.equals(bytes,gif.clean)) throw new IllegalArgumentException("Unsanitized GIF");
      return new Details("image/gif",gif.width,gif.height,bytes.length,digest(bytes));
    }
    // This checks the trusted processor-to-storage contract, not a replacement for full decoding.
    if (scene) {
      if (bytes.length == 0 || bytes.length > SceneImageProcessor.MASTER_BYTES || !variant.mime().equals("image/png")) throw new IllegalArgumentException("Scene budget/type");
    } else StaticImageCandidateProcessor.validateSize(bytes);
    ImageContainer container = ImageContainer.inspect(bytes);
    if (!container.mime().equals(variant.mime()) || container.width() != variant.width()
        || container.height() != variant.height() || container.orientation() != 1
        || !java.util.Arrays.equals(container.cleanBytes(), bytes)) {
      throw new IllegalArgumentException("Media must be sanitized processor output");
    }
    return new Details(variant.mime(), variant.width(), variant.height(), bytes.length, digest(bytes));
  }

  byte[] encode() throws IOException {
    var bytes = new ByteArrayOutputStream();
    try (var output = new DataOutputStream(bytes)) {
      output.writeInt(display == null ? MAGIC : SCENE_MAGIC); output.writeLong(owner);
      output.writeLong(id.getMostSignificantBits()); output.writeLong(id.getLeastSignificantBits());
      write(output, clear); write(output, thumb);
      if (display != null) write(output, display);
    }
    if (bytes.size() > MAX_BYTES) throw new IOException("Manifest budget exceeded");
    return bytes.toByteArray();
  }

  static StoredImageManifest decode(byte[] bytes) throws IOException {
    if (bytes.length > MAX_BYTES) throw new IOException("Manifest budget exceeded");
    try (var input = new DataInputStream(new ByteArrayInputStream(bytes))) {
      int magic = input.readInt();
      if (magic != MAGIC && magic != SCENE_MAGIC) throw new IOException("Unsupported media manifest");
      var result = new StoredImageManifest(input.readLong(), new UUID(input.readLong(), input.readLong()), read(input), read(input), magic == SCENE_MAGIC ? read(input) : null);
      if (input.read() != -1) throw new IOException("Trailing manifest data");
      return result;
    } catch (IllegalArgumentException | CandidateImageException exception) {
      throw new IOException("Invalid media manifest", exception);
    }
  }

  private static void write(DataOutputStream out, Details data) throws IOException {
    out.writeUTF(data.mime()); out.writeInt(data.width()); out.writeInt(data.height()); out.writeInt(data.size());
    out.write(HexFormat.of().parseHex(data.sha256()));
  }

  private static Details read(DataInputStream in) throws IOException {
    String mime = in.readUTF(); int width = in.readInt(), height = in.readInt(), size = in.readInt();
    byte[] hash = in.readNBytes(32);
    if (hash.length != 32) throw new EOFException("Truncated media digest");
    return new Details(mime, width, height, size, HexFormat.of().formatHex(hash));
  }

  static String digest(byte[] bytes) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
  }
}
