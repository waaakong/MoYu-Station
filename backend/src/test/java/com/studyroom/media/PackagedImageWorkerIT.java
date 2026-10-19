package com.studyroom.media;

import com.studyroom.service.UploadQuotaService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.jar.JarFile;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

/** Runs only after packaging via -Pmedia-worker-verification verify. No Spring context or database. */
class PackagedImageWorkerIT {
  @TempDir Path root;

  @Test void packagedWorkerLoadsWebpPluginAndSavesPrivatePairWithSpacesInJarPath() throws Exception {
    String configured = System.getProperty("media.worker.jar");
    assertThat(configured).as("Run the media-worker-verification Maven profile").isNotBlank();
    Path archive = Path.of(configured);
    try (var jar = new JarFile(archive.toFile())) {
      assertThat(jar.getManifest().getMainAttributes().getValue("Start-Class")).isEqualTo("com.studyroom.StudyRoomApplication");
    }
    Path copy = Files.copy(archive, root.resolve("candidate artifact with spaces.jar"));
    var processor = IsolatedImageProcessor.fromPackagedJar(copy);
    var processed = processor.process(ImageFixtures.WEBP_LOSSY, "image/webp");
    assertThat(processed.clear().bytes()).isEqualTo(ImageFixtures.WEBP_LOSSY);
    assertThat(processed.thumb().width()).isEqualTo(32);
    var quota = new UploadQuotaService(root.resolve("uploads").toString(), 100_000, 1_000_000, 0, root.resolve("private").toString());
    var store = new PrivateImageStore(quota);
    var saved = store.save(9, processed);
    assertThat(store.read(9, saved.assetId(), PrivateImageStore.Variant.CLEAR).bytes()).isEqualTo(processed.clear().bytes());
    assertThat(store.read(9, saved.assetId(), PrivateImageStore.Variant.THUMB).bytes()).isEqualTo(processed.thumb().bytes());
    assertThat(root.resolve("uploads")).doesNotExist();
    StaticImageCandidateProcessorTest.failure(() -> processor.process(ImageFixtures.WEBP_LOSSY, "image/png"), "MEDIA_MIME_MISMATCH");
    assertThat(processor.process(ImageFixtures.png(12, 6), "image/png").clear().width()).isEqualTo(12);
  }

  @Test void rejectsMissingOrIncompleteWorkerArtifacts() throws Exception {
    assertThatThrownBy(() -> IsolatedImageProcessor.fromPackagedJar(root.resolve("missing.jar"))).isInstanceOf(java.io.IOException.class);
    Path incomplete = root.resolve("incomplete.jar");
    try (var output = new java.util.jar.JarOutputStream(Files.newOutputStream(incomplete))) { /* empty generated jar */ }
    assertThatThrownBy(() -> IsolatedImageProcessor.fromPackagedJar(incomplete)).isInstanceOf(java.io.IOException.class).hasMessageContaining("incomplete");
  }
}
