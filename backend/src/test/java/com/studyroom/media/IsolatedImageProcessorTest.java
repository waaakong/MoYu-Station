package com.studyroom.media;

import java.io.DataOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static com.studyroom.media.ImageFixtures.*;
import static com.studyroom.media.StaticImageCandidateProcessorTest.failure;
import static org.assertj.core.api.Assertions.*;

class IsolatedImageProcessorTest {
  @TempDir Path directory;

  @Test void runsActualWebpAndPngDecoderInChildJvm() throws Exception {
    var processor = realProcessor();
    var webp = processor.process(WEBP_LOSSY, "image/webp");
    assertThat(webp.clear().bytes()).isEqualTo(WEBP_LOSSY);
    assertThat(webp.thumb().mime()).isEqualTo("image/png");
    var png = processor.process(png(2560, 2560), "image/png");
    assertThat(png.clear().width()).isEqualTo(2560);
    assertThat(png.thumb().width()).isEqualTo(512);
  }

  @Test void returnsInputFailureAndReleasesPermit() throws Exception {
    var processor = realProcessor();
    failure(() -> processor.process(WEBP_LOSSY, "image/jpeg"), "MEDIA_MIME_MISMATCH");
    assertThat(processor.process(png(2, 2), "image/png").clear().width()).isEqualTo(2);
  }

  @Test void killsTimedOutWorkerAndRejectsConcurrentWorkAcrossInstances() throws Exception {
    Path marker = directory.resolve("timeout-worker.pid");
    var stuck = probe("hang", marker, Duration.ofSeconds(5));
    var executor = Executors.newSingleThreadExecutor();
    try {
      Future<?> pending = executor.submit(() -> {
        failure(() -> stuck.process(WEBP_LOSSY, "image/webp"), "MEDIA_PROCESSING_TIMEOUT");
      });
      long pid = awaitPid(marker);
      failure(() -> realProcessor().process(WEBP_LOSSY, "image/webp"), "MEDIA_BUSY");
      pending.get(8, TimeUnit.SECONDS);
      assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
      assertThat(realProcessor().process(WEBP_LOSSY, "image/webp").clear().width()).isEqualTo(32);
    } finally { executor.shutdownNow(); }
  }

  @Test void interruptedRequestTerminatesWorkerBeforeAnotherCanStart() throws Exception {
    Path marker = directory.resolve("interrupted-worker.pid");
    var processor = probe("hang", marker, Duration.ofSeconds(15));
    var failure = new java.util.concurrent.atomic.AtomicReference<Throwable>();
    Thread caller = new Thread(() -> {
      try { processor.process(WEBP_LOSSY, "image/webp"); }
      catch (Throwable exception) { failure.set(exception); }
    });
    caller.start();
    try {
      long pid = awaitPid(marker);
      caller.interrupt(); caller.join(5000);
      assertThat(caller.isAlive()).isFalse();
      assertThat(failure.get()).isInstanceOf(InterruptedException.class);
      assertThat(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
      assertThat(realProcessor().process(WEBP_LOSSY, "image/webp").clear().width()).isEqualTo(32);
    } finally { caller.interrupt(); caller.join(5000); }
  }

  @Test void handlesStartupFailureCrashAndOversizedProtocolWithoutLeakingPermit() throws Exception {
    var missing = new IsolatedImageProcessor(List.of(directory.resolve("absent-worker.exe").toString()), Duration.ofSeconds(2));
    failure(() -> missing.process(WEBP_LOSSY, "image/webp"), "MEDIA_PROCESSING_FAILED");
    for (String mode : new String[] {"crash", "oversize", "partial", "oom"}) {
      var worker = probe(mode, directory.resolve(mode + ".pid"), Duration.ofSeconds(5));
      failure(() -> worker.process(WEBP_LOSSY, "image/webp"), "MEDIA_PROCESSING_FAILED");
    }
    assertThat(realProcessor().process(WEBP_LOSSY, "image/webp").clear().width()).isEqualTo(32);
  }

  @Test void validatesSizeBeforeSpawningAWorker() {
    var missing = new IsolatedImageProcessor(List.of(directory.resolve("never-start.exe").toString()), Duration.ofSeconds(2));
    failure(() -> missing.process(new byte[StaticImageCandidateProcessor.MAX_BYTES + 1], "image/png"), "MEDIA_TOO_LARGE");
    failure(() -> missing.process(null, "image/png"), "MEDIA_EMPTY");
  }

  private static IsolatedImageProcessor realProcessor() { return new IsolatedImageProcessor(classpath()); }
  private static String classpath() { return System.getProperty("surefire.test.class.path", System.getProperty("java.class.path")); }

  private static IsolatedImageProcessor probe(String mode, Path marker, Duration timeout) {
    String java = Path.of(System.getProperty("java.home"), "bin",
        System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();
    return new IsolatedImageProcessor(List.of(java, "-Xmx64m", "-cp", classpath(), WorkerProbe.class.getName(), mode,
        marker.toString()), timeout);
  }

  private static long awaitPid(Path marker) throws Exception {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
    while (System.nanoTime() < deadline) {
      if (Files.exists(marker)) {
        String text = Files.readString(marker);
        if (!text.isEmpty()) return Long.parseLong(text);
      }
      Thread.sleep(10);
    }
    throw new AssertionError("Test worker never signalled startup");
  }

  public static final class WorkerProbe {
    public static void main(String[] args) throws Exception {
      Files.writeString(Path.of(args[1]), Long.toString(ProcessHandle.current().pid()));
      switch (args[0]) {
        case "hang" -> Thread.sleep(60_000);
        case "crash" -> System.exit(7);
        case "oom" -> { byte[] impossible = new byte[100_000_000]; System.out.write(impossible[0]); }
        case "oversize" -> {
          var out = new DataOutputStream(System.out);
          out.writeBoolean(true); out.writeUTF("image/png"); out.writeInt(1); out.writeInt(1);
          out.writeInt(Integer.MAX_VALUE); out.flush();
        }
        case "partial" -> { System.out.write(1); System.out.flush(); }
        default -> throw new IllegalArgumentException("Unknown test mode");
      }
    }
  }
}
