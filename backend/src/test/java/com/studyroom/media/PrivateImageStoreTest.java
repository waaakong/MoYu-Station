package com.studyroom.media;

import com.studyroom.common.BusinessException;
import com.studyroom.service.UploadQuotaService;
import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import static org.assertj.core.api.Assertions.*;

class PrivateImageStoreTest {
  @TempDir Path root;
  private static final UUID ID = UUID.fromString("974ce6b6-5710-47af-918b-ac0dfd2ee7ab");

  @Test void savesOnlyThePairAndManifestAndReadsBothVariants() throws Exception {
    var result = result(); var quota = quota(5000);
    var store = new PrivateImageStore(quota);
    var saved = store.save(9, result);
    assertThat(saved.ownerId()).isEqualTo(9);
    assertThat(store.read(9, saved.assetId(), PrivateImageStore.Variant.CLEAR).bytes()).isEqualTo(result.clear().bytes());
    assertThat(store.read(9, saved.assetId(), PrivateImageStore.Variant.THUMB).bytes()).isEqualTo(result.thumb().bytes());
    Path directory = root.resolve("private/9/" + saved.assetId());
    try (var files = Files.list(directory)) { assertThat(files.map(p -> p.getFileName().toString())).containsExactlyInAnyOrder("clear.bin", "thumb.bin", "ready.bin"); }
    try (var files = Files.list(directory)) { assertThat(files.mapToLong(this::size).sum()).isEqualTo(saved.storedBytes()); }
    assertThat(root.resolve("uploads")).doesNotExist();
  }

  @Test void reservesClearThumbAndManifestAtTheExactQuotaBoundary() throws Exception {
    var result = result();
    long total = footprint(result);
    var tooSmall = quota(total - 1);
    assertThatThrownBy(() -> new PrivateImageStore(tooSmall).save(9, result)).isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_USER_QUOTA");
    var exact = quota(total);
    var saved = new PrivateImageStore(exact, () -> ID, (stage, directory) -> { }).save(9, result);
    assertThat(saved.storedBytes()).isEqualTo(total);
    assertThatThrownBy(() -> exact.reserve(9L, 1)).isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_USER_QUOTA");
  }

  @Test void disabledStorageAndInvalidProcessorOutputDoNotWriteFiles() throws Exception {
    var disabled = new UploadQuotaService(root.resolve("uploads").toString(), 1000, 10000, 0);
    assertThatThrownBy(() -> new PrivateImageStore(disabled)).isInstanceOf(BusinessException.class);
    var valid = result();
    var invalid = new StaticImageCandidateProcessor.Result(valid.clear(),
        new StaticImageCandidateProcessor.Variant(valid.thumb().bytes(), "image/png", 99, 99));
    assertThatThrownBy(() -> new PrivateImageStore(quota(5000)).save(9, invalid)).isInstanceOf(IllegalArgumentException.class);
    assertThat(root.resolve("private")).doesNotExist();
  }

  @ParameterizedTest @EnumSource(PrivateImageStore.Stage.class)
  void rollsBackOnlyThisAttemptAndRestoresQuotaAfterEachFailure(PrivateImageStore.Stage failAt) throws Exception {
    var quota = quota(5000); var result = result();
    var store = new PrivateImageStore(quota, () -> ID, (stage, directory) -> {
      if (stage == failAt) throw new IOException("Injected write/publish failure");
    });
    assertThatThrownBy(() -> store.save(9, result)).isInstanceOf(IOException.class).hasMessageContaining("Injected");
    assertThat(root.resolve("private/9/" + ID)).doesNotExist();
    try (var unused = quota.reservePrivate(9L, 5000)) { /* full quota is usable, not leaked in flight */ }
    assertThat(new PrivateImageStore(quota, () -> ID, (stage, directory) -> { }).save(9, result).assetId()).isEqualTo(ID);
  }

  @Test void existingAssetCollisionDoesNotOverwriteOrCleanOldFiles() throws Exception {
    var store = new PrivateImageStore(quota(5000), () -> ID, (stage, directory) -> { });
    var result = result(); store.save(9, result);
    byte[] original = Files.readAllBytes(root.resolve("private/9/" + ID + "/ready.bin"));
    assertThatThrownBy(() -> store.save(9, result)).isInstanceOf(FileAlreadyExistsException.class);
    assertThat(Files.readAllBytes(root.resolve("private/9/" + ID + "/ready.bin"))).isEqualTo(original);
    assertThat(store.read(9, ID, PrivateImageStore.Variant.CLEAR).bytes()).isEqualTo(result.clear().bytes());
  }

  @Test void foreignSecondFileIsNotOverwrittenOrDeletedWhenCreateNewFails() throws Exception {
    byte[] foreign = {11, 22, 33};
    var store = new PrivateImageStore(quota(5000), () -> ID, (stage, directory) -> {
      if (stage == PrivateImageStore.Stage.CLEAR_WRITTEN) Files.write(directory.resolve("thumb.bin"), foreign, StandardOpenOption.CREATE_NEW);
    });
    var result = result();
    assertThatThrownBy(() -> store.save(9, result)).isInstanceOf(FileAlreadyExistsException.class);
    Path directory = root.resolve("private/9/" + ID);
    assertThat(Files.readAllBytes(directory.resolve("thumb.bin"))).isEqualTo(foreign);
    assertThat(directory.resolve("clear.bin")).doesNotExist();
    assertThat(directory.resolve("ready.bin")).doesNotExist();
  }

  @Test void rollbackPreservesUnknownFilesAndImmediatelyCountsRetainedBytes() throws Exception {
    var quota = quota(5000);
    var store = new PrivateImageStore(quota, () -> ID, (stage, directory) -> {
      if (stage == PrivateImageStore.Stage.BEFORE_PUBLISH) {
        Files.write(directory.resolve("foreign.bin"), new byte[5000], StandardOpenOption.CREATE_NEW);
        throw new IOException("Injected failure with foreign residual");
      }
    });
    var result = result();
    assertThatThrownBy(() -> store.save(9, result)).isInstanceOf(IOException.class)
        .satisfies(error -> assertThat(error.getSuppressed()).hasSize(1));
    Path directory = root.resolve("private/9/" + ID);
    try (var files = Files.list(directory)) { assertThat(files.map(p -> p.getFileName().toString())).containsExactly("foreign.bin"); }
    assertThatThrownBy(() -> quota.reservePrivate(9L, 1)).isInstanceOf(BusinessException.class)
        .extracting("code").isEqualTo("UPLOAD_USER_QUOTA");
  }

  @Test void pairIsUnreadableUntilReadyAndMissingEitherFileRejectsBothVariants() throws Exception {
    var quota = quota(5000);
    var reader = new PrivateImageStore(quota);
    var store = new PrivateImageStore(quota, () -> ID, (stage, directory) -> {
      assertThatThrownBy(() -> reader.read(9, ID, PrivateImageStore.Variant.CLEAR)).isInstanceOf(IOException.class);
    });
    store.save(9, result());
    assertThat(reader.read(9, ID, PrivateImageStore.Variant.CLEAR).width()).isEqualTo(32);
    Files.delete(root.resolve("private/9/" + ID + "/thumb.bin")); // This test's own asset only.
    assertThatThrownBy(() -> reader.read(9, ID, PrivateImageStore.Variant.CLEAR)).isInstanceOf(IOException.class);
  }

  @Test void corruptPayloadAndWrongManifestIdentityAreRejected() throws Exception {
    var store = new PrivateImageStore(quota(5000), () -> ID, (stage, directory) -> { });
    store.save(9, result());
    Path directory = root.resolve("private/9/" + ID);
    byte[] original = Files.readAllBytes(directory.resolve("clear.bin"));
    byte[] corrupt = original.clone(); corrupt[corrupt.length - 1] ^= 1;
    Files.write(directory.resolve("clear.bin"), corrupt);
    assertThatThrownBy(() -> store.read(9, ID, PrivateImageStore.Variant.THUMB)).isInstanceOf(IOException.class).hasMessageContaining("integrity");
    Files.write(directory.resolve("clear.bin"), original);
    assertThatThrownBy(() -> store.read(10, ID, PrivateImageStore.Variant.CLEAR)).isInstanceOf(IOException.class);
    Path other = Files.createDirectories(root.resolve("private/10/" + ID));
    Files.copy(directory.resolve("ready.bin"), other.resolve("ready.bin"));
    assertThatThrownBy(() -> store.read(10, ID, PrivateImageStore.Variant.CLEAR)).isInstanceOf(IOException.class).hasMessageContaining("identity");
  }

  @Test void corruptOrOversizedReadyMarkerFailsClosed() throws Exception {
    var store = new PrivateImageStore(quota(5000), () -> ID, (stage, directory) -> { });
    store.save(9, result());
    Path ready = root.resolve("private/9/" + ID + "/ready.bin");
    for (byte[] corrupt : new byte[][] {new byte[1], new byte[513], new byte[50]}) {
      Files.write(ready, corrupt);
      assertThatThrownBy(() -> store.read(9, ID, PrivateImageStore.Variant.CLEAR)).isInstanceOf(IOException.class);
    }
  }

  @Test void redirectedOwnerIsRejectedBeforeAnyPublicFileIsWritten() throws Exception {
    var store = new PrivateImageStore(quota(5000));
    Files.createDirectories(root.resolve("private"));
    Path publicRoot = Files.createDirectories(root.resolve("uploads"));
    Path alias = root.resolve("private/9"); createAlias(alias, publicRoot);
    try {
      var result = result();
      assertThatThrownBy(() -> store.save(9, result)).isInstanceOf(IOException.class);
      try (var files = Files.list(publicRoot)) { assertThat(files).isEmpty(); }
    } finally { Files.delete(alias); }
  }

  @Test void directoryRedirectDuringWriteNeverCleansTheAliasTarget() throws Exception {
    var quota = quota(5000);
    Path publicRoot = Files.createDirectories(root.resolve("uploads"));
    Path sentinel = publicRoot.resolve("keep.bin"); Files.write(sentinel, new byte[] {42});
    Path directory = root.resolve("private/9/" + ID);
    var store = new PrivateImageStore(quota, () -> ID, (stage, current) -> {
      if (stage == PrivateImageStore.Stage.CLEAR_WRITTEN) {
        Files.move(current, current.resolveSibling("retained-original"));
        createAlias(current, publicRoot);
      }
    });
    try {
      var result = result();
      assertThatThrownBy(() -> store.save(9, result)).isInstanceOf(IOException.class);
      assertThat(Files.readAllBytes(sentinel)).containsExactly((byte) 42);
      assertThat(root.resolve("private/9/retained-original/clear.bin")).exists();
    } finally { if (Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) Files.delete(directory); }
  }

  @Test void aForeignReadyMarkerIsNeverOverwrittenOrDeleted() throws Exception {
    byte[] foreign = {7, 8, 9};
    var store = new PrivateImageStore(quota(5000), () -> ID, (stage, directory) -> {
      if (stage == PrivateImageStore.Stage.BEFORE_PUBLISH) Files.write(directory.resolve("ready.bin"), foreign, StandardOpenOption.CREATE_NEW);
    });
    var result = result();
    assertThatThrownBy(() -> store.save(9, result)).isInstanceOf(FileAlreadyExistsException.class);
    Path directory = root.resolve("private/9/" + ID);
    assertThat(Files.readAllBytes(directory.resolve("ready.bin"))).isEqualTo(foreign);
    try (var files = Files.list(directory)) { assertThat(files.map(p -> p.getFileName().toString())).containsExactly("ready.bin"); }
  }

  @Test void aReplacedOrdinaryDirectoryIsNotUsedOrCleaned() throws Exception {
    var store = new PrivateImageStore(quota(5000), () -> ID, (stage, directory) -> {
      if (stage == PrivateImageStore.Stage.CLEAR_WRITTEN) {
        Files.move(directory, directory.resolveSibling("original-retained"));
        Files.createDirectory(directory);
        // Make the fallback birth-time change explicit on Windows, whose Java fileKey is null.
        if (System.getProperty("os.name").startsWith("Windows")) {
          Files.setAttribute(directory, "basic:creationTime", java.nio.file.attribute.FileTime.fromMillis(System.currentTimeMillis() + 2000));
        }
        Files.write(directory.resolve("foreign.bin"), new byte[] {42});
      }
    });
    var result = result();
    assertThatThrownBy(() -> store.save(9, result)).isInstanceOf(IOException.class).hasMessageContaining("identity");
    assertThat(root.resolve("private/9/original-retained/clear.bin")).exists();
    Path directory = root.resolve("private/9/" + ID);
    assertThat(Files.readAllBytes(directory.resolve("foreign.bin"))).containsExactly((byte) 42);
    assertThat(directory.resolve("thumb.bin")).doesNotExist();
  }

  @Test void concurrentStoreInstancesCannotBothSpendTheLastQuota() throws Exception {
    var result = result(); var quota = quota(footprint(result));
    var a = new PrivateImageStore(quota); var b = new PrivateImageStore(quota);
    var start = new java.util.concurrent.CountDownLatch(1);
    var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
    try {
      java.util.concurrent.Callable<Boolean> first = () -> { start.await(); return trySave(a, result); };
      java.util.concurrent.Callable<Boolean> second = () -> { start.await(); return trySave(b, result); };
      var savedA = executor.submit(first); var savedB = executor.submit(second); start.countDown();
      assertThat(java.util.List.of(savedA.get(5, java.util.concurrent.TimeUnit.SECONDS), savedB.get(5, java.util.concurrent.TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
      try (var directories = Files.list(root.resolve("private/9"))) { assertThat(directories.count()).isEqualTo(1); }
    } finally { executor.shutdownNow(); }
  }

  private static boolean trySave(PrivateImageStore store, StaticImageCandidateProcessor.Result result) throws IOException {
    try { store.save(9, result); return true; }
    catch (BusinessException rejected) {
      assertThat(rejected.getCode()).isEqualTo("UPLOAD_USER_QUOTA"); return false;
    }
  }

  @Test void retiredDeleteIsIdempotentAndResumesAfterPartialPayloadDeletion() throws Exception {
    var quota = quota(5000);
    var store = new PrivateImageStore(quota, () -> ID, (stage, directory) -> { });
    store.save(9, result());
    Files.delete(root.resolve("private/9/" + ID + "/clear.bin"));
    store.deleteRetired(9, ID); store.deleteRetired(9, ID);
    assertThat(root.resolve("private/9/" + ID)).doesNotExist();
    try (var unused = quota.reservePrivate(9L, 5000)) { }
  }

  @Test void retiredDeleteRejectsUnknownFilesAndWrongOwnerBeforeDeletingAnything() throws Exception {
    var store = new PrivateImageStore(quota(5000), () -> ID, (stage, directory) -> { });
    store.save(9, result());
    Path directory = root.resolve("private/9/" + ID);
    Path unknown = directory.resolve("keep.bin"); Files.write(unknown, new byte[] {42});
    assertThatThrownBy(() -> store.deleteRetired(9, ID)).isInstanceOf(IOException.class);
    assertThat(directory.resolve("clear.bin")).exists(); assertThat(unknown).exists();
    Path other = Files.createDirectories(root.resolve("private/10/" + ID));
    Files.copy(directory.resolve("ready.bin"), other.resolve("ready.bin"));
    assertThatThrownBy(() -> store.deleteRetired(10, ID)).isInstanceOf(IOException.class).hasMessageContaining("identity");
    assertThat(other.resolve("ready.bin")).exists();
  }

  @Test void retiredDeleteRejectsJunctionAndPreservesItsTarget() throws Exception {
    var store = new PrivateImageStore(quota(5000));
    Path publicRoot = Files.createDirectories(root.resolve("uploads"));
    Path sentinel = publicRoot.resolve("clear.bin"); Files.write(sentinel, new byte[] {42});
    Path owner = Files.createDirectories(root.resolve("private/9"));
    Path alias = owner.resolve(ID.toString()); createAlias(alias, publicRoot);
    try {
      assertThatThrownBy(() -> store.deleteRetired(9, ID)).isInstanceOf(IOException.class);
      assertThat(Files.readAllBytes(sentinel)).containsExactly((byte) 42);
    } finally { Files.delete(alias); }
  }

  private static StaticImageCandidateProcessor.Result result() {
    return new StaticImageCandidateProcessor().process(ImageFixtures.WEBP_LOSSY, "image/webp");
  }
  private static long footprint(StaticImageCandidateProcessor.Result result) throws IOException {
    byte[] clear = result.clear().bytes(), thumb = result.thumb().bytes();
    return (long) clear.length + thumb.length + new StoredImageManifest(9, ID,
        StoredImageManifest.describe(result.clear(), clear), StoredImageManifest.describe(result.thumb(), thumb)).encode().length;
  }
  private UploadQuotaService quota(long userLimit) {
    return new UploadQuotaService(root.resolve("uploads").toString(), userLimit, 100_000, 0, root.resolve("private").toString());
  }
  private long size(Path path) { try { return Files.size(path); } catch (IOException error) { throw new java.io.UncheckedIOException(error); } }
  private void createAlias(Path alias, Path target) throws IOException {
    assertThat(alias.toAbsolutePath().normalize().startsWith(root.toAbsolutePath().normalize())).isTrue();
    assertThat(target.toAbsolutePath().normalize().startsWith(root.toAbsolutePath().normalize())).isTrue();
    if (System.getProperty("os.name").startsWith("Windows")) {
      try {
        int result = new ProcessBuilder("cmd.exe", "/c", "mklink", "/J", alias.toString(), target.toString())
            .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start().waitFor();
        if (result != 0) throw new IOException("Test directory junction could not be created");
      } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IOException(error); }
    } else Files.createSymbolicLink(alias, target);
  }
}
