package com.studyroom.service;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import java.util.Base64;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** Generated 32x16 RGBA fixtures: orange rectangle on a transparent canvas.
 * Created locally with the existing sharp dependency; no third-party photos.
 * This qualifies the decoder only, NOT a complete trusted upload pipeline. */
class WebpCodecQualificationTest {
  private static final String LOSSLESS = "UklGRioAAABXRUJQVlA4TB0AAAAvH8ADEA8wUAM/KPMf8BDTEPqXdpoGEf2fALpeGQA=";
  private static final String LOSSY = "UklGRp4AAABXRUJQVlA4WAoAAAAQAAAAHwAADwAAQUxQSBUAAAABDzD/ERFCTEPoX9ppGkT0fwLoemUAVlA4IGIAAABwBACdASogABAAPlEUkkcjkRCMADgFBLUAOwBJgP4Bcf92Afqr2/4I3Ruw4AD+9nv//2Bxf/474hGaeSP//lrD6vO91Uav/+yzn6ZdBhcRuPQz/rUTKURzGD+MtyUkc34AAA==";

  @Test void decodesLosslessWebpPixelsAndAlpha() throws Exception {
    BufferedImage image = decode(Base64.getDecoder().decode(LOSSLESS));
    try {
      assertThat(image.getWidth()).isEqualTo(32);
      assertThat(image.getHeight()).isEqualTo(16);
      assertThat(image.getRGB(0, 0) >>> 24).isZero();
      assertThat(image.getRGB(16, 8)).isEqualTo(0xfff05028);
    } finally { image.flush(); }
  }

  @Test void decodesLossyWebpWithSeparateAlphaPlane() throws Exception {
    BufferedImage image = decode(Base64.getDecoder().decode(LOSSY));
    try {
      assertThat(image.getRGB(0, 0) >>> 24).isZero();
      assertThat(image.getRGB(16, 8) >>> 24).isEqualTo(255);
      assertThat((image.getRGB(16, 8) >>> 16) & 255).isBetween(225, 255);
      assertThat((image.getRGB(16, 8) >>> 8) & 255).isBetween(65, 95);
      assertThat(image.getRGB(16, 8) & 255).isBetween(25, 55);
    } finally { image.flush(); }
  }

  @Test void canWriteTransparentPngThumbnailWithoutSourceMetadata() throws Exception {
    BufferedImage image = decode(Base64.getDecoder().decode(LOSSLESS));
    BufferedImage thumbnail = new BufferedImage(16, 8, BufferedImage.TYPE_INT_ARGB);
    try {
      Graphics2D graphics = thumbnail.createGraphics();
      try { graphics.drawImage(image, 0, 0, 16, 8, null); } finally { graphics.dispose(); }
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      assertThat(ImageIO.write(thumbnail, "png", output)).isTrue();
      BufferedImage roundTrip = ImageIO.read(new ByteArrayInputStream(output.toByteArray()));
      try {
        assertThat(roundTrip.getWidth()).isEqualTo(16);
        assertThat(roundTrip.getHeight()).isEqualTo(8);
        assertThat(roundTrip.getRGB(0, 0) >>> 24).isZero();
        assertThat(roundTrip.getRGB(8, 4)).isEqualTo(0xfff05028);
      } finally { roundTrip.flush(); }
    } finally { image.flush(); thumbnail.flush(); }
  }

  @Test void rejectsTruncatedPayloadEvenWithPlausibleDimensionsAndRiffLength() {
    byte[] truncated = Arrays.copyOf(Base64.getDecoder().decode(LOSSLESS), 26);
    truncated[4] = 18; // RIFF size agrees with the short file.
    truncated[16] = 6; // VP8L dimensions exist; actual pixel stream does not.
    assertThatThrownBy(() -> decode(truncated)).isInstanceOf(java.io.IOException.class);
  }

  private BufferedImage decode(byte[] bytes) throws Exception {
    try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers = ImageIO.getImageReaders(input);
      assertThat(readers.hasNext()).isTrue();
      ImageReader reader = readers.next();
      try {
        assertThat(reader.getClass().getName()).startsWith("com.twelvemonkeys.imageio.plugins.webp.");
        reader.setInput(input, false, false);
        assertThat(reader.getWidth(0)).isEqualTo(32);
        assertThat(reader.getHeight(0)).isEqualTo(16);
        return reader.read(0);
      } finally { reader.dispose(); }
    }
  }
}
