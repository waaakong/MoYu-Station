package com.studyroom.service;

import com.studyroom.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UploadQuotaServiceTest {
  @TempDir
  Path temporaryDirectory;

  @Test
  void appliesUserQuotaAcrossChatFeedAndAvatarDirectories() throws Exception {
    Path chat = temporaryDirectory.resolve("chat/9");
    Path feed = temporaryDirectory.resolve("feed/9/1");
    Files.createDirectories(chat);
    Files.createDirectories(feed);
    Files.write(chat.resolve("a.jpg"), new byte[40]);
    Files.write(feed.resolve("b.jpg"), new byte[40]);
    UploadQuotaService service = new UploadQuotaService(temporaryDirectory.toString(), 100, 1000, 0);

    assertThatThrownBy(() -> service.reserve(9L, 21))
        .isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_USER_QUOTA");
  }

  @Test
  void releasesInFlightReservation() throws Exception {
    UploadQuotaService service = new UploadQuotaService(temporaryDirectory.toString(), 100, 1000, 0);
    try (UploadQuotaService.Reservation ignored = service.reserve(9L, 80)) {
      assertThatThrownBy(() -> service.reserve(9L, 21))
          .isInstanceOf(BusinessException.class);
    }
    service.reserve(9L, 80).close();
  }
}
