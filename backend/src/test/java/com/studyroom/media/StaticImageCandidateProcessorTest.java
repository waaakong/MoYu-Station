package com.studyroom.media;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static com.studyroom.media.ImageFixtures.*;
import static org.assertj.core.api.Assertions.*;

class StaticImageCandidateProcessorTest {
  private final StaticImageCandidateProcessor processor = new StaticImageCandidateProcessor();

  @Test void preservesPngPixelsAlphaAndDoesNotEnlargeSmallImages() throws Exception {
    byte[] source = png(40, 20);
    var result = processor.process(source, "image/png");
    assertThat(result.clear().bytes()).isEqualTo(source);
    assertThat(result.clear().width()).isEqualTo(40);
    assertThat(result.thumb().height()).isEqualTo(20);
    BufferedImage thumb = decode(result.thumb());
    assertThat(thumb.getRGB(0, 0) >>> 24).isZero();
    assertThat(thumb.getRGB(20, 10) >>> 24).isEqualTo(128);
    assertThat((thumb.getRGB(20, 10) >>> 16) & 255).isBetween(239, 241);
  }

  @Test void retainsPaletteTransparency() throws Exception {
    var image = new BufferedImage(16, 8, BufferedImage.TYPE_BYTE_BINARY,
        new java.awt.image.IndexColorModel(1, 2, new byte[] {0, (byte) 255}, new byte[] {0, 0},
            new byte[] {0, 0}, new byte[] {0, (byte) 255}));
    image.setRGB(8, 4, 0xffff0000);
    var result = processor.process(encode(image, "png"), "image/png");
    assertThat(decode(result.clear()).getRGB(0, 0) >>> 24).isZero();
    assertThat(decode(result.thumb()).getRGB(8, 4)).isEqualTo(0xffff0000);
  }

  @Test void preservesWebpCompressionAndTransparentThumbnail() throws Exception {
    for (byte[] source : new byte[][] {WEBP_LOSSLESS, WEBP_LOSSY}) {
      var result = processor.process(source, "image/webp");
      assertThat(result.clear().bytes()).isEqualTo(source);
      assertThat(result.clear().mime()).isEqualTo("image/webp");
      assertThat(decode(result.thumb()).getRGB(0, 0) >>> 24).isZero();
      assertThat(decode(result.thumb()).getRGB(16, 8) >>> 24).isEqualTo(255);
    }
  }

  @Test void removesJpegCommentAndExifWithoutSecondLossyEncoding() throws Exception {
    byte[] source = jpeg();
    byte[] tagged = withJpegSegment(withJpegSegment(source, 0xfe, "PRIVATE-LOCATION".getBytes(StandardCharsets.UTF_8)),
        0xe1, concat("Exif\0\0".getBytes(StandardCharsets.US_ASCII), exif(1, true)));
    var result = processor.process(tagged, "IMAGE/JPG");
    assertThat(result.clear().mime()).isEqualTo("image/jpeg");
    assertThat(new String(result.clear().bytes(), StandardCharsets.ISO_8859_1)).doesNotContain("PRIVATE-LOCATION", "Exif");
    BufferedImage before = ImageIO.read(new ByteArrayInputStream(source)), after = decode(result.clear());
    assertThat(after.getRGB(0, 0, 32, 16, null, 0, 32)).isEqualTo(before.getRGB(0, 0, 32, 16, null, 0, 32));
  }

  @ParameterizedTest @ValueSource(ints = {1, 2, 3, 4, 5, 6, 7, 8})
  void appliesAllEightExifOrientationsWithoutInterpolation(int orientation) throws Exception {
    int[] pixels = {0xffff0000, 0xff00ff00, 0xff0000ff, 0xffffff00, 0xff00ffff, 0x80ff00ff};
    int[][] maps = {{0,1,2,3,4,5}, {2,1,0,5,4,3}, {5,4,3,2,1,0}, {3,4,5,0,1,2},
        {0,3,1,4,2,5}, {3,0,4,1,5,2}, {5,2,4,1,3,0}, {2,5,1,4,0,3}};
    var image = new BufferedImage(3, 2, BufferedImage.TYPE_INT_ARGB);
    image.setRGB(0, 0, 3, 2, pixels, 0, 3);
    byte[] tagged = withPngChunk(encode(image, "png"), "eXIf", exif(orientation, orientation % 2 == 0));
    var result = processor.process(tagged, "image/png");
    int w = orientation >= 5 ? 2 : 3, h = orientation >= 5 ? 3 : 2;
    int[] expected = Arrays.stream(maps[orientation - 1]).map(i -> pixels[i]).toArray();
    assertThat(result.clear().width()).isEqualTo(w);
    assertThat(result.clear().height()).isEqualTo(h);
    assertThat(decode(result.clear()).getRGB(0, 0, w, h, null, 0, w)).isEqualTo(expected);
    assertThat(new String(result.clear().bytes(), StandardCharsets.ISO_8859_1)).doesNotContain("eXIf");
  }

  @Test void rotatesJpegAndWebpIntoLosslessPng() throws Exception {
    byte[] jpeg = withJpegSegment(jpeg(), 0xe1, concat("Exif\0\0".getBytes(StandardCharsets.US_ASCII), exif(6, true)));
    byte[] webp = appendWebp(WEBP_LOSSY, "EXIF", exif(6, false), 8);
    for (var candidate : new Object[][] {{jpeg, "image/jpeg"}, {webp, "image/webp"}}) {
      var result = processor.process((byte[]) candidate[0], (String) candidate[1]);
      assertThat(result.clear().mime()).isEqualTo("image/png");
      assertThat(result.clear().width()).isEqualTo(16);
      assertThat(result.clear().height()).isEqualTo(32);
    }
  }

  @Test void stripsPngTextAndWebpXmpAndRebuildsRiffLength() throws Exception {
    byte[] png = withPngChunk(png(12, 12), "tEXt", "Location\0PRIVATE-METADATA".getBytes(StandardCharsets.US_ASCII));
    var clean = processor.process(png, "image/png");
    assertThat(new String(clean.clear().bytes(), StandardCharsets.ISO_8859_1)).doesNotContain("PRIVATE-METADATA");
    byte[] webp = appendWebp(WEBP_LOSSY, "XMP ", "PRIVATE-METADATA".getBytes(StandardCharsets.US_ASCII), 4);
    assertThat(processor.process(webp, "image/webp").clear().bytes()).isEqualTo(WEBP_LOSSY);
  }

  @Test void validatesLongImageThresholdAndThumbnailAspectRatio() throws Exception {
    var panoramic = processor.process(png(4096, 1024), "image/png");
    assertThat(panoramic.thumb().width()).isEqualTo(512);
    assertThat(panoramic.thumb().height()).isEqualTo(128);
    var portrait = processor.process(png(512, 4096), "image/png");
    assertThat(portrait.thumb().width()).isEqualTo(64);
    assertThat(portrait.thumb().height()).isEqualTo(512);
    assertThatCode(() -> processor.process(png(2560, 2560), "image/png")).doesNotThrowAnyException();
    assertThatCode(() -> processor.process(png(3000, 1000), "image/png")).doesNotThrowAnyException();
    failure(() -> processor.process(png(3000, 1001), "image/png"), "MEDIA_DIMENSIONS");
    failure(() -> processor.process(png(4097, 10), "image/png"), "MEDIA_DIMENSIONS");
  }

  @Test void rejectsOversizeHeadersBeforeTryingToDecodePixels() throws Exception {
    byte[] source = png(1, 1);
    byte[] header = Arrays.copyOfRange(source, 16, 29);
    ByteBuffer.wrap(header).putInt(12001).putInt(12001);
    byte[] bomb = concat(Arrays.copyOf(source, 8), pngChunk("IHDR", header), Arrays.copyOfRange(source, 33, source.length));
    failure(() -> processor.process(bomb, "image/png"), "MEDIA_DIMENSIONS");
  }

  @Test void rejectsUnsupportedEmptyOversizeAndSpoofedMime() throws Exception {
    failure(() -> processor.process(null, "image/png"), "MEDIA_EMPTY");
    failure(() -> processor.process(new byte[StaticImageCandidateProcessor.MAX_BYTES + 1], "image/png"), "MEDIA_TOO_LARGE");
    failure(() -> processor.process("<svg/>".getBytes(), "image/png"), "MEDIA_UNSUPPORTED_TYPE");
    failure(() -> processor.process(png(2, 2), "image/jpeg"), "MEDIA_MIME_MISMATCH");
  }

  @Test void rejectsAnimationInsteadOfTakingFirstFrame() throws Exception {
    failure(() -> processor.process(withPngChunk(png(2, 2), "acTL", new byte[8]), "image/png"), "MEDIA_ANIMATED");
    byte[] animated = WEBP_LOSSY.clone(); animated[20] |= 2;
    failure(() -> processor.process(animated, "image/webp"), "MEDIA_ANIMATED");
    failure(() -> processor.process(appendWebp(WEBP_LOSSY, "ANMF", new byte[16], 0), "image/webp"), "MEDIA_ANIMATED");
  }

  @Test void rejectsUnsupportedColorRatherThanDiscardingItsMeaning() throws Exception {
    failure(() -> processor.process(withPngChunk(png(2, 2), "iCCP", new byte[2]), "image/png"), "MEDIA_COLOR_PROFILE");
    failure(() -> processor.process(withPngChunk(png(2, 2), "gAMA", ByteBuffer.allocate(4).putInt(100000).array()), "image/png"), "MEDIA_COLOR_PROFILE");
    failure(() -> processor.process(appendWebp(WEBP_LOSSY, "ICCP", new byte[2], 32), "image/webp"), "MEDIA_COLOR_PROFILE");
    failure(() -> processor.process(withJpegSegment(jpeg(), 0xe2, "ICC_PROFILE\0".getBytes(StandardCharsets.US_ASCII)), "image/jpeg"), "MEDIA_COLOR_PROFILE");
    byte[] srgb = withPngChunk(withPngChunk(png(2, 2), "sRGB", new byte[] {0}), "gAMA", ByteBuffer.allocate(4).putInt(45455).array());
    assertThatCode(() -> processor.process(srgb, "image/png")).doesNotThrowAnyException();
  }

  @Test void rejectsTruncationTrailingContentBadCrcAndDuplicatePayloads() throws Exception {
    byte[] source = png(4, 4);
    byte[] badCrc = source.clone(); badCrc[29] ^= 1;
    failure(() -> processor.process(badCrc, "image/png"), "MEDIA_INVALID_IMAGE");
    failure(() -> processor.process(Arrays.copyOf(source, source.length - 1), "image/png"), "MEDIA_INVALID_IMAGE");
    failure(() -> processor.process(concat(source, new byte[] {1}), "image/png"), "MEDIA_INVALID_IMAGE");
    failure(() -> processor.process(Arrays.copyOf(jpeg(), jpeg().length - 2), "image/jpeg"), "MEDIA_INVALID_IMAGE");
    byte[] shortWebp = Arrays.copyOf(WEBP_LOSSLESS, 26); ImageContainer.putLe32(shortWebp, 4, 18); ImageContainer.putLe32(shortWebp, 16, 6);
    failure(() -> processor.process(shortWebp, "image/webp"), "MEDIA_INVALID_IMAGE");
    byte[] duplicate = concat(WEBP_LOSSLESS, Arrays.copyOfRange(WEBP_LOSSLESS, 12, WEBP_LOSSLESS.length));
    ImageContainer.putLe32(duplicate, 4, duplicate.length - 8);
    failure(() -> processor.process(duplicate, "image/webp"), "MEDIA_INVALID_IMAGE");
  }

  @Test void rejectsMalformedExifAndDuplicateOrientationSources() throws Exception {
    failure(() -> processor.process(withPngChunk(png(2, 2), "eXIf", exif(9, true)), "image/png"), "MEDIA_INVALID_IMAGE");
    byte[] invalid = exif(1, true); Arrays.fill(invalid, 4, 8, (byte) 255);
    failure(() -> processor.process(withPngChunk(png(2, 2), "eXIf", invalid), "image/png"), "MEDIA_INVALID_IMAGE");
    byte[] duplicate = withPngChunk(withPngChunk(png(2, 2), "eXIf", exif(1, true)), "eXIf", exif(6, true));
    failure(() -> processor.process(duplicate, "image/png"), "MEDIA_INVALID_IMAGE");
  }

  @Test void resultBytesAreDefensivelyCopied() throws Exception {
    var result = processor.process(png(2, 2), "image/png");
    byte[] first = result.clear().bytes(); first[0] = 0;
    assertThat(result.clear().bytes()[0]).isEqualTo((byte) 137);
  }

  @Test void rejectsRotatedHighDetailImageIfLosslessResultExceedsBudget() throws Exception {
    var image = new BufferedImage(1024, 1024, BufferedImage.TYPE_INT_RGB);
    var random = new java.util.Random(20260921);
    int[] row = new int[1024];
    for (int y = 0; y < 1024; y++) {
      for (int x = 0; x < row.length; x++) row[x] = random.nextInt(0x1000000);
      image.setRGB(0, y, 1024, 1, row, 0, 1024);
    }
    byte[] candidate = withJpegSegment(encode(image, "jpeg"), 0xe1,
        concat("Exif\0\0".getBytes(StandardCharsets.US_ASCII), exif(6, true)));
    assertThat(candidate.length).isLessThan(StaticImageCandidateProcessor.MAX_BYTES);
    failure(() -> processor.process(candidate, "image/jpeg"), "MEDIA_OUTPUT_TOO_LARGE");
  }

  @Test void acceptsExactTwoMiBInputAndStripsItsNonImageMetadata() throws Exception {
    byte[] source = png(2, 2);
    byte[] atLimit = withPngChunk(source, "tEXt", new byte[StaticImageCandidateProcessor.MAX_BYTES - source.length - 12]);
    assertThat(atLimit.length).isEqualTo(StaticImageCandidateProcessor.MAX_BYTES);
    assertThat(processor.process(atLimit, "image/png").clear().bytes()).isEqualTo(source);
  }

  @Test void acceptsProgressiveJpegWithoutChangingDecodedPixels() throws Exception {
    var image = new BufferedImage(20, 10, BufferedImage.TYPE_INT_RGB);
    image.setRGB(10, 5, 0xff00ff00);
    var bytes = new java.io.ByteArrayOutputStream();
    var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
    try (var output = new javax.imageio.stream.MemoryCacheImageOutputStream(bytes)) {
      writer.setOutput(output);
      var params = writer.getDefaultWriteParam();
      params.setProgressiveMode(javax.imageio.ImageWriteParam.MODE_DEFAULT);
      writer.write(null, new javax.imageio.IIOImage(image, null, null), params);
    } finally { writer.dispose(); image.flush(); }
    byte[] candidate = bytes.toByteArray();
    var result = processor.process(candidate, "image/jpeg");
    assertThat(decode(result.clear()).getRGB(0, 0, 20, 10, null, 0, 20))
        .isEqualTo(ImageIO.read(new ByteArrayInputStream(candidate)).getRGB(0, 0, 20, 10, null, 0, 20));
  }

  @Test void everyTruncatedContainerPrefixFailsWithControlledError() throws Exception {
    for (byte[] source : new byte[][] {png(2, 2), jpeg(), WEBP_LOSSLESS, WEBP_LOSSY}) {
      String mime = ImageContainer.inspect(source).mime();
      for (int length = 0; length < source.length; length++) {
        byte[] truncated = Arrays.copyOf(source, length);
        assertThatThrownBy(() -> processor.process(truncated, mime)).isInstanceOf(CandidateImageException.class);
      }
    }
  }

  @Test void rejectsDamagedPngPixelStreamEvenWhenChunkCrcMatches() throws Exception {
    byte[] source = png(10, 10);
    int p = 33;
    while (!ImageContainer.ascii(source, p + 4, 4).equals("IDAT")) p += 12 + (int) ImageContainer.uint(source, p, 4, false);
    int size = (int) ImageContainer.uint(source, p, 4, false);
    byte[] shortened = Arrays.copyOfRange(source, p + 8, p + 8 + size / 2);
    byte[] corrupt = concat(Arrays.copyOf(source, p), pngChunk("IDAT", shortened), Arrays.copyOfRange(source, p + size + 12, source.length));
    failure(() -> processor.process(corrupt, "image/png"), "MEDIA_INVALID_IMAGE");
  }

  static void failure(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, String code) {
    assertThatThrownBy(action).isInstanceOf(CandidateImageException.class).extracting("code").isEqualTo(code);
  }

  private static byte[] jpeg() throws Exception {
    var image = new BufferedImage(32, 16, BufferedImage.TYPE_INT_RGB);
    var graphics = image.createGraphics();
    graphics.setColor(Color.ORANGE); graphics.fillRect(0, 0, 16, 16);
    graphics.setColor(Color.BLUE); graphics.fillRect(16, 0, 16, 16); graphics.dispose();
    return encode(image, "jpeg");
  }

  private static BufferedImage decode(StaticImageCandidateProcessor.Variant variant) throws Exception {
    return ImageIO.read(new ByteArrayInputStream(variant.bytes()));
  }
}
