package com.studyroom.service;

import com.studyroom.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImageStorageServiceTest {
  @TempDir
  Path temporaryDirectory;

  @Test
  void verifiesContentAndStoresOnlyReencodedDisplayImage() throws Exception {
    ImageStorageService service = service(256 * 1024 * 1024L, 8L * 1024 * 1024 * 1024);
    MockMultipartFile image = new MockMultipartFile(
        "file", "../profile.png", "image/png", png(2400, 1200));

    ImageStorageService.StoredImage stored = service.saveDisplayImage(
        image, 7L, Path.of("chat", "7"), "/uploads/chat/7", "safe", 1600, 1600, 0.82F);

    Path output = temporaryDirectory.resolve("chat/7/safe.jpg");
    assertThat(output).exists();
    assertThat(ImageIO.read(output.toFile()).getWidth()).isEqualTo(1600);
    assertThat(stored.displayUrl()).isEqualTo("/uploads/chat/7/safe.jpg");
    assertThat(stored.originalUrl()).isNull();
    assertThat(temporaryDirectory.resolve("chat/7/original")).doesNotExist();
  }

  @Test
  void rejectsForgedMimeAndInvalidImageBytes() throws Exception {
    ImageStorageService service = service(256 * 1024 * 1024L, 8L * 1024 * 1024 * 1024);
    MockMultipartFile forged = new MockMultipartFile("file", "photo.png", "image/webp", png(10, 10));
    MockMultipartFile invalid = new MockMultipartFile("file", "photo.png", "image/png", "not-an-image".getBytes());

    assertThatThrownBy(() -> service.saveDisplayImage(
        forged, 7L, Path.of("chat", "7"), "/uploads/chat/7", "forged", 1600, 1600, 0.82F))
        .isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_MIME_MISMATCH");
    assertThatThrownBy(() -> service.saveDisplayImage(
        invalid, 7L, Path.of("chat", "7"), "/uploads/chat/7", "invalid", 1600, 1600, 0.82F))
        .isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_INVALID_IMAGE");
  }

  @Test
  void rejectsPathTraversalBeforeWriting() throws Exception {
    ImageStorageService service = service(256 * 1024 * 1024L, 8L * 1024 * 1024 * 1024);
    MockMultipartFile image = new MockMultipartFile("file", "photo.png", "image/png", png(10, 10));

    assertThatThrownBy(() -> service.saveDisplayImage(
        image, 7L, Path.of("..", "escape"), "/uploads/chat/7", "escape", 1600, 1600, 0.82F))
        .isInstanceOf(BusinessException.class)
        .hasMessageContaining("Invalid image save path");
  }

  private ImageStorageService service(long userLimit, long globalLimit) {
    UploadQuotaService quota = new UploadQuotaService(temporaryDirectory.toString(), userLimit, globalLimit, 0);
    return new ImageStorageService(temporaryDirectory.toString(), quota);
  }

  private byte[] png(int width, int height) throws Exception {
    BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    var graphics = image.createGraphics();
    graphics.setColor(Color.BLUE);
    graphics.fillRect(0, 0, width, height);
    graphics.dispose();
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    ImageIO.write(image, "png", output);
    return output.toByteArray();
  }
}
