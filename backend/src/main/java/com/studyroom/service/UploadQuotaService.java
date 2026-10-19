package com.studyroom.service;

import com.studyroom.common.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

@Service
public class UploadQuotaService {
  private final Path uploadRoot;
  private final long userSoftLimit;
  private final long globalSoftLimit;
  private final long minimumFreeSpace;
  private final Map<Long, AtomicLong> inFlightByUser = new ConcurrentHashMap<>();
  private final AtomicLong globalInFlight = new AtomicLong();
  private final Map<Long, CachedUsage> userUsageCache = new ConcurrentHashMap<>();
  private CachedUsage globalUsageCache;
  private final MediaStorageRoots mediaRoots;

  @Autowired
  public UploadQuotaService(
      @Value("${studyroom.upload-dir:uploads}") String uploadDir,
      @Value("${studyroom.upload-quota.user-soft-limit:268435456}") long userSoftLimit,
      @Value("${studyroom.upload-quota.global-soft-limit:8589934592}") long globalSoftLimit,
      @Value("${studyroom.upload-quota.minimum-free-space:8589934592}") long minimumFreeSpace,
      @Value("${studyroom.media.private-root:}") String privateRoot
  ) {
    this.uploadRoot = Path.of(uploadDir).toAbsolutePath().normalize();
    this.userSoftLimit = userSoftLimit;
    this.globalSoftLimit = globalSoftLimit;
    this.minimumFreeSpace = minimumFreeSpace;
    if (userSoftLimit < 0 || globalSoftLimit < 0 || minimumFreeSpace < 0) {
      throw new IllegalArgumentException("Storage limits cannot be negative.");
    }
    try {
      this.mediaRoots = privateRoot == null || privateRoot.isBlank() ? null
          : new MediaStorageRoots(uploadRoot, Path.of(privateRoot));
    } catch (IOException exception) {
      throw new IllegalArgumentException("Cannot validate private media storage.", exception);
    }
  }

  public UploadQuotaService(String uploadDir, long userSoftLimit, long globalSoftLimit, long minimumFreeSpace) {
    this(uploadDir, userSoftLimit, globalSoftLimit, minimumFreeSpace, "");
  }

  public synchronized Reservation reserve(Long userId, long requestedBytes) throws IOException {
    return reserveAt(userId, requestedBytes, uploadRoot, false);
  }

  public synchronized Reservation reservePrivate(Long userId, long requestedBytes) throws IOException {
    privateStorageRoots();
    mediaRoots.verifyPrivatePath(mediaRoots.privateRoot());
    return reserveAt(userId, requestedBytes, mediaRoots.privateRoot(), true);
  }

  public MediaStorageRoots privateStorageRoots() {
    if (mediaRoots == null) throw new BusinessException("MEDIA_STORAGE_DISABLED", "私有图片存储尚未启用。");
    return mediaRoots;
  }

  /** Recount actual disk state after a private write/rollback, including any retained partial files. */
  public synchronized void invalidatePrivateUsage(long ownerId) {
    if (ownerId <= 0) throw new IllegalArgumentException("Invalid media owner");
    globalUsageCache = null;
    userUsageCache.remove(ownerId);
  }

  private Reservation reserveAt(Long userId, long requestedBytes, Path targetRoot, boolean strict) throws IOException {
    if (userId == null || userId <= 0 || requestedBytes <= 0) {
      throw new BusinessException("UPLOAD_INVALID", "上传请求无效。");
    }
    Files.createDirectories(targetRoot);
    FileStore store = Files.getFileStore(targetRoot);
    if (exceeds(store.getUsableSpace(), minimumFreeSpace, globalInFlight.get(), requestedBytes)) {
      throw new BusinessException("UPLOAD_DISK_LOW", "存储空间不足，图片上传已暂时停止。");
    }

    long now = System.currentTimeMillis();
    long globalUsage = cachedGlobalUsage(now);
    if (exceeds(globalSoftLimit, globalUsage, globalInFlight.get(), requestedBytes)) {
      throw new BusinessException("UPLOAD_GLOBAL_QUOTA", "图片存储已达到系统水位，请稍后再试。");
    }

    long userUsage = cachedUserUsage(userId, now);
    AtomicLong counter = inFlightByUser.get(userId);
    long userInFlight = counter == null ? 0 : counter.get();
    if (exceeds(userSoftLimit, userUsage, userInFlight, requestedBytes)) {
      throw new BusinessException("UPLOAD_USER_QUOTA", "你的图片存储已达到当前配额。");
    }

    globalInFlight.addAndGet(requestedBytes);
    inFlightByUser.computeIfAbsent(userId, ignored -> new AtomicLong()).addAndGet(requestedBytes);
    return new Reservation(this, userId, requestedBytes, strict);
  }

  private static boolean exceeds(long limit, long used, long pending, long requested) {
    return used > limit || pending > limit - used || requested > limit - used - pending;
  }

  private long cachedGlobalUsage(long now) throws IOException {
    if (globalUsageCache == null || globalUsageCache.expiresAt() <= now) {
      globalUsageCache = new CachedUsage(Math.addExact(directorySize(uploadRoot),
          mediaRoots == null ? 0 : privateDirectorySize(mediaRoots.privateRoot())), now + 30_000);
    }
    return globalUsageCache.bytes();
  }

  private long cachedUserUsage(Long userId, long now) throws IOException {
    CachedUsage cached = userUsageCache.get(userId);
    if (cached == null || cached.expiresAt() <= now) {
      cached = new CachedUsage(userDirectorySize(userId), now + 30_000);
      userUsageCache.put(userId, cached);
    }
    return cached.bytes();
  }

  private long userDirectorySize(Long userId) throws IOException {
    return directorySize(uploadRoot.resolve("chat").resolve(String.valueOf(userId)))
        + directorySize(uploadRoot.resolve("feed").resolve(String.valueOf(userId)))
        + directorySize(uploadRoot.resolve("avatars").resolve(String.valueOf(userId)))
        + (mediaRoots == null ? 0 : privateDirectorySize(mediaRoots.ownerDirectory(userId)));
  }

  private long privateDirectorySize(Path directory) throws IOException {
    mediaRoots.verifyPrivatePath(directory);
    if (!Files.exists(directory)) return 0;
    long size = 0;
    try (Stream<Path> paths = Files.walk(directory)) {
      var iterator = paths.iterator();
      while (iterator.hasNext()) {
        Path path = iterator.next();
        mediaRoots.verifyPrivatePath(path);
        var attributes = Files.readAttributes(path, java.nio.file.attribute.BasicFileAttributes.class,
            java.nio.file.LinkOption.NOFOLLOW_LINKS);
        if (attributes.isRegularFile()) size = Math.addExact(size, attributes.size());
        else if (!attributes.isDirectory()) throw new IOException("Unsupported private storage entry.");
      }
    }
    return size;
  }

  private long directorySize(Path directory) throws IOException {
    Path normalized = directory.toAbsolutePath().normalize();
    if (!normalized.startsWith(uploadRoot) || !Files.exists(normalized)) {
      return 0;
    }
    try (Stream<Path> paths = Files.walk(normalized)) {
      return paths.filter(Files::isRegularFile).mapToLong(path -> {
        try {
          return Files.size(path);
        } catch (IOException ignored) {
          return 0;
        }
      }).sum();
    }
  }

  private synchronized void release(Long userId, long bytes, long committedBytes) {
    globalInFlight.addAndGet(-bytes);
    AtomicLong counter = inFlightByUser.get(userId);
    if (counter != null && counter.addAndGet(-bytes) <= 0) {
      inFlightByUser.remove(userId, counter);
    }
    if (committedBytes > 0) {
      long now = System.currentTimeMillis();
      CachedUsage global = globalUsageCache;
      if (global != null) globalUsageCache = new CachedUsage(global.bytes() + committedBytes, Math.max(global.expiresAt(), now));
      CachedUsage user = userUsageCache.get(userId);
      if (user != null) userUsageCache.put(userId, new CachedUsage(user.bytes() + committedBytes, Math.max(user.expiresAt(), now)));
    }
  }

  public static final class Reservation implements AutoCloseable {
    private final UploadQuotaService owner;
    private final Long userId;
    private final long bytes;
    private boolean closed;
    private long committedBytes;
    private final boolean strict;

    private Reservation(UploadQuotaService owner, Long userId, long bytes, boolean strict) {
      this.owner = owner;
      this.userId = userId;
      this.bytes = bytes;
      this.strict = strict;
    }

    public synchronized void commit(long committedBytes) {
      if (closed) throw new IllegalStateException("Reservation is already closed.");
      if (strict && (committedBytes < 0 || committedBytes > bytes)) {
        throw new IllegalArgumentException("Private media bytes exceed their reservation.");
      }
      this.committedBytes = Math.max(0, committedBytes);
    }

    @Override
    public synchronized void close() {
      if (!closed) {
        closed = true;
        owner.release(userId, bytes, committedBytes);
      }
    }
  }

  private record CachedUsage(long bytes, long expiresAt) {
  }
}
