package com.studyroom.media;

import com.studyroom.service.MediaStorageRoots;
import com.studyroom.service.UploadQuotaService;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.util.*;
import java.util.function.Supplier;
import static java.nio.file.LinkOption.NOFOLLOW_LINKS;
import static java.nio.file.StandardOpenOption.*;

/** Single-service-instance local store, with atomic READY visibility for a pair of immutable files.
 * Callers must pass trusted processor results; a future API must authorize every read against DB references.
 * The root must be exclusively writable by the service account. This is not a hostile-local-writer sandbox.
 * Registered only by the opt-in media configuration; no historical-file deletion, public mapping or expiry job. */
public final class PrivateImageStore {
  private static final String READY = "ready.bin", PENDING = ".ready.pending";
  private final UploadQuotaService quota;
  private final MediaStorageRoots roots;
  private final Supplier<UUID> ids;
  private final WriteCheckpoint checkpoint;

  public enum Variant { CLEAR, THUMB, DISPLAY }
  enum Stage { CLEAR_WRITTEN, THUMB_WRITTEN, BEFORE_PUBLISH }
  @FunctionalInterface interface WriteCheckpoint { void after(Stage stage, Path directory) throws IOException; }

  public PrivateImageStore(UploadQuotaService quota) { this(quota, UUID::randomUUID, (stage, directory) -> { }); }

  PrivateImageStore(UploadQuotaService quota, Supplier<UUID> ids, WriteCheckpoint checkpoint) {
    this.quota = Objects.requireNonNull(quota);
    this.roots = quota.privateStorageRoots(); // Storage and quota cannot accidentally point at different private roots.
    this.ids = Objects.requireNonNull(ids); this.checkpoint = Objects.requireNonNull(checkpoint);
  }

  public record StoredAsset(long ownerId, UUID assetId, long storedBytes) { }

  public StoredAsset save(long ownerId, StaticImageCandidateProcessor.Result result) throws IOException {
    return save(ownerId, Objects.requireNonNull(ids.get()), result);
  }

  /** Only the asset service may supply its previously committed server-generated UUID. */
  StoredAsset save(long ownerId, UUID id, StaticImageCandidateProcessor.Result result) throws IOException {
    if (ownerId <= 0 || result == null) throw new IllegalArgumentException("Invalid private media request");
    Objects.requireNonNull(id);
    byte[] clear = result.clear().bytes(), thumb = result.thumb().bytes(), display = result.display() == null ? null : result.display().bytes();
    var manifest = new StoredImageManifest(ownerId, id, StoredImageManifest.describe(result.clear(), clear, display != null),
        StoredImageManifest.describe(result.thumb(), thumb), display == null ? null : StoredImageManifest.describe(result.display(), display, true));
    byte[] manifestBytes = manifest.encode();
    long total = (long) clear.length + thumb.length + (display == null ? 0 : display.length) + manifestBytes.length;
    // Serialize disk mutations with quota scans; image decoding is already finished outside this lock.
    synchronized (quota) {
      try (var reservation = quota.reservePrivate(ownerId, total)) {
        Path owner = roots.ownerDirectory(ownerId);
        Files.createDirectories(owner); roots.verifyPrivatePath(owner);
        Path directory = owner.resolve(id.toString());
        roots.verifyPrivatePath(directory);
        Files.createDirectory(directory); // Collision is a failure, never an overwrite or deletion target.
        Object directoryKey = identity(directory, true);
        Map<Path, Object> owned = new LinkedHashMap<>();
        try {
          writeNew(directory, directoryKey, directory.resolve("clear.bin"), clear, owned);
          checkpoint.after(Stage.CLEAR_WRITTEN, directory);
          writeNew(directory, directoryKey, directory.resolve("thumb.bin"), thumb, owned);
          checkpoint.after(Stage.THUMB_WRITTEN, directory);
          if (display != null) writeNew(directory, directoryKey, directory.resolve("display.bin"), display, owned);
          verifyBytes(readFile(directory, directoryKey, "clear.bin", clear.length), manifest.clear());
          verifyBytes(readFile(directory, directoryKey, "thumb.bin", thumb.length), manifest.thumb());
          if (display != null) verifyBytes(readFile(directory, directoryKey, "display.bin", display.length), manifest.display());
          Path pending = directory.resolve(PENDING), ready = directory.resolve(READY);
          writeNew(directory, directoryKey, pending, manifestBytes, owned);
          checkpoint.after(Stage.BEFORE_PUBLISH, directory);
          verifyDirectory(directory, directoryKey);
          if (Files.exists(ready, NOFOLLOW_LINKS)) throw new FileAlreadyExistsException("Ready marker already exists");
          Object markerKey = owned.get(pending);
          try {
            Files.move(pending, ready, StandardCopyOption.ATOMIC_MOVE);
          } finally {
            // Even an ambiguous move failure must not leave our own ready marker readable after rollback.
            if (Files.exists(ready, NOFOLLOW_LINKS) && markerKey.equals(identity(ready, false))) {
              owned.remove(pending); owned.put(ready, markerKey);
            }
          }
          // No non-atomic copy fallback: unsupported filesystems fail closed.
          verifyDirectory(directory, directoryKey);
          reservation.commit(total);
          return new StoredAsset(ownerId, id, total);
        } catch (IOException | RuntimeException failure) {
          rollback(directory, directoryKey, owned, failure);
          throw failure;
        } finally {
          quota.invalidatePrivateUsage(ownerId); // Include retained partial files; do not assume rollback succeeded.
        }
      }
    }
  }

  /** Internal read by trusted owner/id after the calling service has checked account/reference authorization. */
  public StaticImageCandidateProcessor.Variant read(long ownerId, UUID id, Variant variant) throws IOException {
    Objects.requireNonNull(id); Objects.requireNonNull(variant);
    Path directory = roots.ownerDirectory(ownerId).resolve(id.toString());
    Object key = identity(directory, true);
    var manifest = StoredImageManifest.decode(readFile(directory, key, READY, StoredImageManifest.MAX_BYTES));
    if (manifest.owner() != ownerId || !manifest.id().equals(id)) throw new IOException("Media manifest identity mismatch");
    byte[] clear = readFile(directory, key, "clear.bin", manifest.clear().size());
    byte[] thumb = readFile(directory, key, "thumb.bin", manifest.thumb().size());
    byte[] display = manifest.display() == null ? null : readFile(directory, key, "display.bin", manifest.display().size());
    verifyBytes(clear, manifest.clear()); verifyBytes(thumb, manifest.thumb());
    if (display != null) verifyBytes(display, manifest.display());
    verifyDirectory(directory, key);
    if (variant == Variant.DISPLAY && display == null) throw new NoSuchFileException("Display derivative unavailable");
    var details = variant == Variant.CLEAR ? manifest.clear() : variant == Variant.DISPLAY ? manifest.display() : manifest.thumb();
    return new StaticImageCandidateProcessor.Variant(variant == Variant.CLEAR ? clear : variant == Variant.DISPLAY ? display : thumb,
        details.mime(), details.width(), details.height());
  }

  /** Only the collector may call this, under a DB asset lock after committed retirement.
   * No recursion/globs: unexpected entries, links or invalid manifests fail closed.
   * Keep the manifest until payload deletion finishes so partial deletion is retryable. */
  void deleteRetired(long ownerId, UUID id) throws IOException {
    Objects.requireNonNull(id);
    synchronized (quota) {
      Path directory = roots.ownerDirectory(ownerId).resolve(id.toString());
      roots.verifyPrivatePath(directory);
      try {
        if (!Files.exists(directory, NOFOLLOW_LINKS)) return;
        Object key = identity(directory, true);
        Set<String> names = new HashSet<>();
        try (var entries = Files.newDirectoryStream(directory)) {
          for (Path file : entries) {
            identity(file, false);
            names.add(file.getFileName().toString());
          }
        }
        if (!Set.of(READY, "clear.bin", "thumb.bin", "display.bin").containsAll(names)) {
          throw new IOException("Unknown entry in retired media directory");
        }
        if (names.isEmpty()) {
          verifyDirectory(directory, key); Files.delete(directory); return;
        }
        var manifest = StoredImageManifest.decode(readFile(directory, key, READY, StoredImageManifest.MAX_BYTES));
        if (manifest.owner() != ownerId || !manifest.id().equals(id)) throw new IOException("Media manifest identity mismatch");
        if (names.contains("display.bin") && manifest.display() == null) throw new IOException("Unexpected display derivative");
        Map<Path, Object> targets = new LinkedHashMap<>();
        for (String name : List.of("clear.bin", "thumb.bin", "display.bin", READY)) {
          if (!names.contains(name)) continue;
          Path target = directory.resolve(name);
          targets.put(target, identity(target, false));
          if (!name.equals(READY)) {
            var details = name.equals("clear.bin") ? manifest.clear() : name.equals("display.bin") ? manifest.display() : manifest.thumb();
            verifyBytes(readFile(directory, key, name, details.size()), details);
          }
        }
        for (var entry : targets.entrySet()) {
          verifyDirectory(directory, key);
          if (!entry.getValue().equals(identity(entry.getKey(), false))) throw new IOException("Collection target identity changed");
          Files.delete(entry.getKey());
        }
        verifyDirectory(directory, key); Files.delete(directory); // Empty-only.
      } finally { quota.invalidatePrivateUsage(ownerId); }
    }
  }

  private void writeNew(Path directory, Object directoryKey, Path file, byte[] bytes, Map<Path, Object> owned) throws IOException {
    verifyDirectory(directory, directoryKey); roots.verifyPrivatePath(file);
    try (var channel = FileChannel.open(file, CREATE_NEW, WRITE, NOFOLLOW_LINKS)) {
      owned.put(file, identity(file, false));
      ByteBuffer buffer = ByteBuffer.wrap(bytes);
      while (buffer.hasRemaining()) channel.write(buffer);
      channel.force(true);
    }
    verifyDirectory(directory, directoryKey);
  }

  private byte[] readFile(Path directory, Object directoryKey, String name, int limit) throws IOException {
    verifyDirectory(directory, directoryKey);
    Path file = directory.resolve(name);
    Object fileKey = identity(file, false);
    byte[] bytes;
    try (var channel = FileChannel.open(file, READ, NOFOLLOW_LINKS)) {
      long size = channel.size();
      if (size <= 0 || size > limit) throw new IOException("Invalid private media file size");
      ByteBuffer buffer = ByteBuffer.allocate((int) size);
      while (buffer.hasRemaining()) if (channel.read(buffer) < 0) throw new IOException("Truncated private media file");
      if (channel.size() != size) throw new IOException("Private media changed while reading");
      bytes = buffer.array();
    }
    verifyDirectory(directory, directoryKey);
    if (!fileKey.equals(identity(file, false))) throw new IOException("Private media file identity changed");
    return bytes;
  }

  private static void verifyBytes(byte[] bytes, StoredImageManifest.Details details) throws IOException {
    if (bytes.length != details.size() || !StoredImageManifest.digest(bytes).equals(details.sha256())) {
      throw new IOException("Private media file failed integrity check");
    }
  }

  private Object identity(Path path, boolean directory) throws IOException {
    roots.verifyPrivatePath(path);
    var attributes = Files.readAttributes(path, BasicFileAttributes.class, NOFOLLOW_LINKS);
    if ((directory ? !attributes.isDirectory() : !attributes.isRegularFile())
        || attributes.fileKey() == null && attributes.creationTime().toMillis() <= 0) {
      throw new IOException("Storage path has unsupported type or identity");
    }
    // Java 17's Windows provider always returns null fileKey. Birth time detects ordinary
    // replacements there, but is not an unforgeable file ID. Exclusive service ownership of
    // this root is a required precondition, not a guarantee provided by these checks.
    return new EntryStamp(attributes.fileKey(), attributes.creationTime());
  }

  private record EntryStamp(Object fileKey, FileTime created) { }

  private void verifyDirectory(Path directory, Object key) throws IOException {
    if (!key.equals(identity(directory, true))) throw new IOException("Private media directory identity changed");
  }

  private void rollback(Path directory, Object key, Map<Path, Object> owned, Exception original) {
    try {
      verifyDirectory(directory, key);
      var files = new ArrayList<>(owned.entrySet());
      Collections.reverse(files); // Remove our ready marker before any payload.
      for (var entry : files) {
        verifyDirectory(directory, key);
        if (Files.exists(entry.getKey(), NOFOLLOW_LINKS)) {
          if (!entry.getValue().equals(identity(entry.getKey(), false))) throw new IOException("Rollback target identity changed");
          Files.delete(entry.getKey());
        }
      }
      verifyDirectory(directory, key);
      Files.delete(directory); // Empty-only. Unknown files are retained, never recursively erased.
    } catch (IOException cleanupFailure) { original.addSuppressed(cleanupFailure); }
  }
}
