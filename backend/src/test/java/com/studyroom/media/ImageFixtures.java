package com.studyroom.media;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;

final class ImageFixtures {
  static final byte[] WEBP_LOSSLESS = Base64.getDecoder().decode("UklGRioAAABXRUJQVlA4TB0AAAAvH8ADEA8wUAM/KPMf8BDTEPqXdpoGEf2fALpeGQA=");
  static final byte[] WEBP_LOSSY = Base64.getDecoder().decode("UklGRp4AAABXRUJQVlA4WAoAAAAQAAAAHwAADwAAQUxQSBUAAAABDzD/ERFCTEPoX9ppGkT0fwLoemUAVlA4IGIAAABwBACdASogABAAPlEUkkcjkRCMADgFBLUAOwBJgP4Bcf92Afqr2/4I3Ruw4AD+9nv//2Bxf/474hGaeSP//lrD6vO91Uav/+yzn6ZdBhcRuPQz/rUTKURzGD+MtyUkc34AAA==");

  static byte[] png(int width, int height) throws Exception {
    var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    image.setRGB(width / 2, height / 2, 0x80f05028);
    return encode(image, "png");
  }

  static byte[] encode(BufferedImage image, String format) throws Exception {
    var bytes = new ByteArrayOutputStream();
    if (!ImageIO.write(image, format, bytes)) throw new IllegalStateException("Missing writer");
    image.flush(); return bytes.toByteArray();
  }

  static byte[] concat(byte[]... parts) {
    var out = new ByteArrayOutputStream(); for (byte[] part : parts) out.writeBytes(part); return out.toByteArray();
  }

  static byte[] pngChunk(String type, byte[] data) {
    byte[] name = type.getBytes(StandardCharsets.US_ASCII);
    CRC32 crc = new CRC32(); crc.update(name); crc.update(data);
    return ByteBuffer.allocate(data.length + 12).putInt(data.length).put(name).put(data).putInt((int) crc.getValue()).array();
  }

  static byte[] withPngChunk(byte[] png, String name, byte[] data) {
    return concat(java.util.Arrays.copyOf(png, 33), pngChunk(name, data), java.util.Arrays.copyOfRange(png, 33, png.length));
  }

  static byte[] exif(int orientation, boolean little) {
    return ByteBuffer.allocate(26).order(little ? ByteOrder.LITTLE_ENDIAN : ByteOrder.BIG_ENDIAN)
        .put((byte) (little ? 'I' : 'M')).put((byte) (little ? 'I' : 'M')).putShort((short) 42).putInt(8)
        .putShort((short) 1).putShort((short) 0x112).putShort((short) 3).putInt(1)
        .putShort((short) orientation).putShort((short) 0).putInt(0).array();
  }

  static byte[] jpegSegment(int marker, byte[] data) {
    return ByteBuffer.allocate(data.length + 4).put((byte) 255).put((byte) marker)
        .putShort((short) (data.length + 2)).put(data).array();
  }

  static byte[] withJpegSegment(byte[] jpeg, int marker, byte[] data) {
    return concat(new byte[] {(byte) 255, (byte) 216}, jpegSegment(marker, data), java.util.Arrays.copyOfRange(jpeg, 2, jpeg.length));
  }

  static byte[] webpChunk(String type, byte[] data) {
    return ByteBuffer.allocate(8 + data.length + (data.length & 1)).order(ByteOrder.LITTLE_ENDIAN)
        .put(type.getBytes(StandardCharsets.US_ASCII)).putInt(data.length).put(data).array();
  }

  static byte[] appendWebp(byte[] webp, String type, byte[] data, int extraFlags) {
    byte[] result = concat(webp, webpChunk(type, data));
    result[20] |= (byte) extraFlags;
    ImageContainer.putLe32(result, 4, result.length - 8); return result;
  }
}
