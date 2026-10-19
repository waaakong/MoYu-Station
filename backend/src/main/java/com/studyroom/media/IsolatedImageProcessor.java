package com.studyroom.media;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.ArrayList;
import java.nio.file.Files;
import java.util.jar.JarFile;
import java.util.concurrent.*;

/** Local candidate runner. Not registered as a Spring bean or wired to any upload endpoint.
 * Heap/time isolation is NOT an OS permission sandbox or a total resident-memory limit.
 * All instances in one backend JVM share one permit; overload is explicit, never queued. */
public final class IsolatedImageProcessor {
  private static final Semaphore SLOT = new Semaphore(1);
  private final List<String> command;
  private final Duration timeout;
  private static final Set<String> MIMES = Set.of("image/jpeg", "image/png", "image/webp");

  public IsolatedImageProcessor(String workerClasspath) {
    this(classpathCommand(workerClasspath), Duration.ofSeconds(15));
  }

  private static List<String> classpathCommand(String workerClasspath) {
    if (workerClasspath == null || workerClasspath.isBlank()) throw new IllegalArgumentException("Worker classpath required");
    var command = baseCommand();
    command.addAll(List.of("-cp", workerClasspath, ImageWorker.class.getName()));
    return command;
  }

  /** Trusted deployment configuration only. Never accept a jar path from an upload request. */
  public static IsolatedImageProcessor fromPackagedJar(Path archive) throws IOException {
    Path jar = archive.toRealPath();
    if (!Files.isRegularFile(jar)) throw new IOException("Worker artifact is not a regular jar");
    try (var contents = new JarFile(jar.toFile())) {
      for (String entry : List.of("org/springframework/boot/loader/PropertiesLauncher.class",
          "BOOT-INF/classes/com/studyroom/media/ImageWorker.class", "BOOT-INF/classes/media-worker-loader.properties")) {
        if (contents.getJarEntry(entry) == null) throw new IOException("Worker artifact is incomplete");
      }
    }
    var command = baseCommand();
    command.addAll(List.of("-Dloader.main=" + ImageWorker.class.getName(),
        "-Dloader.config.location=jar:" + jar.toUri().toASCIIString() + "!/BOOT-INF/classes/media-worker-loader.properties",
        "-Dloader.path=", "-Dloader.args=", "-Dloader.system=false",
        "-cp", jar.toString(), "org.springframework.boot.loader.PropertiesLauncher"));
    return new IsolatedImageProcessor(command, Duration.ofSeconds(15));
  }

  private static ArrayList<String> baseCommand() {
    return new ArrayList<>(List.of(Path.of(System.getProperty("java.home"), "bin",
        System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString(),
        "-Xms32m", "-Xmx256m", "-XX:MaxDirectMemorySize=32m", "-XX:+ExitOnOutOfMemoryError", "-Djava.awt.headless=true"));
  }

  // Package-private injection for fault tests, never populated from user-supplied image metadata.
  IsolatedImageProcessor(List<String> command, Duration timeout) {
    if (command.isEmpty() || timeout.isZero() || timeout.isNegative() || timeout.toMillis() > 60_000) {
      throw new IllegalArgumentException("Invalid worker configuration");
    }
    this.command = List.copyOf(command); this.timeout = timeout;
  }

  public StaticImageCandidateProcessor.Result process(byte[] bytes, String mime) throws InterruptedException {
    StaticImageCandidateProcessor.validateSize(bytes);
    if ("image/gif".equals(mime)) throw new CandidateImageException("MEDIA_ANIMATED_UNSUPPORTED", "静态社交图片接口不接受 GIF。");
    return run(bytes, mime, false);
  }

  /** Separate sticker path, not exposed by the static social upload endpoint. */
  public StaticImageCandidateProcessor.Result processStickerGif(byte[] bytes) throws InterruptedException {
    if (bytes == null || bytes.length == 0) throw new CandidateImageException("MEDIA_EMPTY", "请选择 GIF。");
    if (bytes.length > GifContainer.MAX_BYTES) throw new CandidateImageException("MEDIA_TOO_LARGE", "GIF 不得超过 5 MiB。");
    return run(bytes, "image/gif", true);
  }

  public StaticImageCandidateProcessor.Result processScene(byte[] bytes, String mime) throws InterruptedException {
    SceneImageProcessor.validateInput(bytes);
    if (!MIMES.contains(mime)) throw new CandidateImageException("MEDIA_UNSUPPORTED_TYPE", "场景只支持验证过的静态图片。");
    return run(bytes, "scene:" + mime, false);
  }

  private StaticImageCandidateProcessor.Result run(byte[] bytes, String mime, boolean gif) throws InterruptedException {
    if (mime == null || mime.length() > 64) throw CandidateImageException.invalid();
    if (!SLOT.tryAcquire()) throw new CandidateImageException("MEDIA_BUSY", "图片处理繁忙，请稍后重试。");
    Process process = null;
    ExecutorService io = null;
    Future<?> writer = null;
    Future<StaticImageCandidateProcessor.Result> reader = null;
    boolean stopped = true;
    try {
      byte[] snapshot = bytes.clone();
      long deadline = System.nanoTime() + timeout.toNanos();
      var builder = new ProcessBuilder(command).redirectError(ProcessBuilder.Redirect.DISCARD);
      // Do not forward database passwords, session secrets or proxy credentials to a media decoder.
      builder.environment().keySet().removeIf(key -> !Set.of("SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL")
          .stream().anyMatch(allowed -> allowed.equalsIgnoreCase(key)));
      process = builder.start();
      Process worker = process;
      io = Executors.newFixedThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "private-image-worker-io"); thread.setDaemon(true); return thread;
      });
      writer = io.submit(() -> {
        try (var output = new DataOutputStream(worker.getOutputStream())) {
          output.writeUTF(mime); output.writeInt(snapshot.length); output.write(snapshot);
        }
        return null;
      });
      reader = io.submit(() -> read(worker, gif, mime.startsWith("scene:")));
      var result = reader.get(remaining(deadline), TimeUnit.NANOSECONDS);
      writer.get(remaining(deadline), TimeUnit.NANOSECONDS);
      if (!process.waitFor(remaining(deadline), TimeUnit.NANOSECONDS)) throw new TimeoutException();
      if (process.exitValue() != 0) throw new IOException("Image worker exited unsuccessfully");
      return result;
    } catch (TimeoutException exception) {
      throw new CandidateImageException("MEDIA_PROCESSING_TIMEOUT", "图片处理超时，请换图或稍后重试。");
    } catch (ExecutionException exception) {
      if (exception.getCause() instanceof CandidateImageException imageException) throw imageException;
      throw new CandidateImageException("MEDIA_PROCESSING_FAILED", "图片处理失败，请重新选择。");
    } catch (IOException exception) {
      throw new CandidateImageException("MEDIA_PROCESSING_FAILED", "图片处理进程不可用，请稍后重试。");
    } finally {
      if (process != null) {
        if (process.isAlive()) process.destroyForcibly();
        // Retain the permit unless physical termination is observed, including interrupted requests.
        boolean interrupted = Thread.interrupted();
        long stopDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (process.isAlive() && System.nanoTime() < stopDeadline) {
          try { process.waitFor(100, TimeUnit.MILLISECONDS); } catch (InterruptedException exception) { interrupted = true; }
        }
        stopped = !process.isAlive();
        if (interrupted) Thread.currentThread().interrupt();
      }
      if (writer != null) writer.cancel(true);
      if (reader != null) reader.cancel(true);
      if (io != null) io.shutdownNow();
      if (stopped) SLOT.release(); // Fail closed rather than let a stuck native decoder increase concurrency.
    }
  }

  private static long remaining(long deadline) throws TimeoutException {
    long left = deadline - System.nanoTime();
    if (left <= 0) throw new TimeoutException();
    return left;
  }

  private static StaticImageCandidateProcessor.Result read(Process worker, boolean gif, boolean scene) throws IOException {
    try (var input = new DataInputStream(worker.getInputStream())) {
      if (!input.readBoolean()) {
        String code = input.readUTF(), message = input.readUTF();
        if (!code.matches("MEDIA_[A-Z_]{1,40}") || message.length() > 256) throw new IOException("Invalid worker failure");
        throw new CandidateImageException(code, message);
      }
      var clear = readVariant(input, gif, scene ? SceneImageProcessor.MASTER_BYTES : gif ? GifContainer.MAX_BYTES : StaticImageCandidateProcessor.MAX_BYTES, scene ? 4096 : 0);
      var thumb = readVariant(input, false);
      if (!thumb.mime().equals("image/png") || Math.max(thumb.width(), thumb.height()) > 512) {
        throw new IOException("Invalid worker thumbnail");
      }
      var display = scene ? readVariant(input, false, SceneImageProcessor.DISPLAY_BYTES, 2560) : null;
      if (input.read() != -1) throw new IOException("Unexpected worker output");
      return new StaticImageCandidateProcessor.Result(clear, thumb, display);
    }
  }

  private static StaticImageCandidateProcessor.Variant readVariant(DataInputStream input, boolean gif) throws IOException {
    return readVariant(input, gif, gif ? GifContainer.MAX_BYTES : StaticImageCandidateProcessor.MAX_BYTES, 0);
  }

  private static StaticImageCandidateProcessor.Variant readVariant(DataInputStream input, boolean gif, int budget, int edge) throws IOException {
    String mime = input.readUTF(); int width = input.readInt(), height = input.readInt(), length = input.readInt();
    if (!(gif ? "image/gif".equals(mime) : MIMES.contains(mime)) || length <= 0 || length > budget) {
      throw new IOException("Invalid worker resource");
    }
    if (edge == 0) StaticImageCandidateProcessor.validateDimensions(width, height);
    else if (width <= 0 || height <= 0 || Math.max(width, height) > edge) throw new IOException("Invalid scene dimensions");
    if (gif && Math.max(width, height) > 512) throw new IOException("Invalid GIF dimensions");
    byte[] bytes = input.readNBytes(length);
    if (bytes.length != length) throw new IOException("Truncated worker resource");
    return new StaticImageCandidateProcessor.Variant(bytes, mime, width, height);
  }
}
