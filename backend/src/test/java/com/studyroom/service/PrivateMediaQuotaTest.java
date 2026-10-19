package com.studyroom.service;

import com.studyroom.common.BusinessException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class PrivateMediaQuotaTest {
  @TempDir Path root;

  @Test void disallowsPublicAndPrivateRootOverlapBeforeCreatingDirectories() {
    Path publicRoot = root.resolve("uploads");
    for (Path privateRoot : new Path[] { publicRoot, publicRoot.resolve("private"), root }) {
      assertThatThrownBy(() -> new MediaStorageRoots(publicRoot, privateRoot))
          .isInstanceOf(IllegalArgumentException.class);
    }
    assertThat(Files.exists(publicRoot)).isFalse();
  }

  @Test void acceptsSeparateRootAndRejectsTraversalAndInvalidOwners() throws Exception {
    MediaStorageRoots paths = new MediaStorageRoots(root.resolve("uploads"), root.resolve("private"));
    assertThat(paths.ownerDirectory(9)).isEqualTo(root.resolve("private/9"));
    assertThatThrownBy(() -> paths.ownerDirectory(0)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> paths.verifyPrivatePath(root.resolve("private/../uploads/image.png")))
        .isInstanceOf(java.io.IOException.class);
    assertThat(Files.exists(root.resolve("private"))).isFalse();
  }

  @Test void privateStorageIsDisabledByDefault() {
    UploadQuotaService quota = new UploadQuotaService(root.resolve("uploads").toString(), 100, 1000, 0);
    assertThatThrownBy(() -> quota.reservePrivate(9L, 1)).isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("MEDIA_STORAGE_DISABLED");
    assertThat(Files.exists(root.resolve("uploads"))).isFalse();
  }

  @Test void combinesLegacyClearThumbnailAndStagingBytesInUserQuota() throws Exception {
    write("uploads/chat/9/old.webp", 25);
    write("private/9/asset/clear.webp", 30);
    write("private/9/asset/thumb.png", 15);
    write("private/9/pending.tmp", 10);
    UploadQuotaService quota = quota(100, 1000);
    assertThatThrownBy(() -> quota.reservePrivate(9L, 21)).isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_USER_QUOTA");
    try (var reservation = quota.reservePrivate(9L, 20)) { reservation.commit(20); }
    assertThatThrownBy(() -> quota.reserve(9L, 1)).isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_USER_QUOTA");
  }

  @Test void combinesBothRootsForGlobalQuotaAcrossAccounts() throws Exception {
    write("uploads/feed/1/file.webp", 40);
    write("private/2/clear.webp", 40);
    UploadQuotaService quota = quota(1000, 100);
    assertThatThrownBy(() -> quota.reservePrivate(3L, 21)).isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_GLOBAL_QUOTA");
  }

  @Test void sharesInflightReservationsAndReleasesFailedPrivateWrites() throws Exception {
    UploadQuotaService quota = quota(100, 1000);
    try (var first = quota.reservePrivate(9L, 80)) {
      assertThatThrownBy(() -> quota.reserve(9L, 21)).isInstanceOf(BusinessException.class);
      assertThatThrownBy(() -> first.commit(81)).isInstanceOf(IllegalArgumentException.class);
    }
    try (var next = quota.reserve(9L, 100)) { /* full reservation available again */ }
  }

  @Test void hugeRequestedBytesCannotOverflowTheQuotaComparison() {
    UploadQuotaService quota = quota(100, 1000);
    assertThatThrownBy(() -> quota.reservePrivate(9L, Long.MAX_VALUE)).isInstanceOf(BusinessException.class);
  }

  @Test void concurrentCloseDoesNotReleaseTheSameReservationTwice() throws Exception {
    UploadQuotaService quota = quota(100, 1000);
    var reservation = quota.reservePrivate(9L, 80);
    var start = new java.util.concurrent.CountDownLatch(1);
    var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
    try {
      var a = executor.submit(() -> { start.await(); reservation.close(); return null; });
      var b = executor.submit(() -> { start.await(); reservation.close(); return null; });
      start.countDown(); a.get(); b.get();
      try (var occupied = quota.reservePrivate(9L, 100)) {
        assertThatThrownBy(() -> quota.reservePrivate(9L, 1)).isInstanceOf(BusinessException.class);
      }
    } finally { executor.shutdownNow(); }
  }

  @Test void missingPrivateRootDoesNotAlterLegacyPublicQuotaUse() throws Exception {
    UploadQuotaService quota = quota(100, 1000);
    try (var reservation = quota.reserve(9L, 100)) { reservation.commit(10); }
    assertThat(root.resolve("private")).doesNotExist();
    try (var next = quota.reserve(9L, 90)) { /* shared accounting still applies */ }
  }

  @Test void rejectsFilesystemAliasesIntoPublicStorage() throws Exception {
    Path publicRoot = Files.createDirectories(root.resolve("uploads"));
    Path target = Files.createDirectories(publicRoot.resolve("hidden"));
    Path alias = root.resolve("private-alias");
    createAlias(alias, target);
    try {
      assertThatThrownBy(() -> new MediaStorageRoots(publicRoot, alias))
          .isInstanceOf(IllegalArgumentException.class);
    } finally { Files.delete(alias); }
    assertThat(target).isDirectory();
  }

  @Test void rejectsOwnerDirectoryRedirectedAfterRootValidation() throws Exception {
    Path publicRoot = Files.createDirectories(root.resolve("uploads"));
    Path privateRoot = Files.createDirectories(root.resolve("private"));
    MediaStorageRoots paths = new MediaStorageRoots(publicRoot, privateRoot);
    Path alias = privateRoot.resolve("9");
    createAlias(alias, publicRoot);
    try {
      assertThatThrownBy(() -> paths.ownerDirectory(9)).isInstanceOf(java.io.IOException.class);
      assertThatThrownBy(() -> quota(100, 1000).reservePrivate(9L, 1)).isInstanceOf(java.io.IOException.class);
    } finally { Files.delete(alias); }
  }

  @Test void rejectsPublicRootRedirectedOntoPrivateRootAfterValidation() throws Exception {
    Path publicRoot = root.resolve("uploads");
    Path privateRoot = Files.createDirectories(root.resolve("private"));
    MediaStorageRoots paths = new MediaStorageRoots(publicRoot, privateRoot);
    createAlias(publicRoot, privateRoot);
    try {
      assertThatThrownBy(() -> paths.ownerDirectory(9)).isInstanceOf(java.io.IOException.class);
    } finally { Files.delete(publicRoot); }
  }

  private void createAlias(Path alias, Path target) throws Exception {
    assertThat(alias.normalize().startsWith(root)).isTrue();
    assertThat(target.normalize().startsWith(root)).isTrue();
    if (System.getProperty("os.name").toLowerCase().contains("win")) {
      Process process = new ProcessBuilder("cmd.exe", "/c", "mklink", "/J", alias.toString(), target.toString())
          .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
      assertThat(process.waitFor()).isZero();
    } else Files.createSymbolicLink(alias, target);
  }

  private UploadQuotaService quota(long user, long global) {
    return new UploadQuotaService(root.resolve("uploads").toString(), user, global, 0, root.resolve("private").toString());
  }
  private void write(String path, int bytes) throws Exception {
    Path target = root.resolve(path);
    Files.createDirectories(target.getParent());
    Files.write(target, new byte[bytes]);
  }
}
