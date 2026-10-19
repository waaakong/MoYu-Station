package com.studyroom.media;

import com.studyroom.common.BusinessException;
import java.io.IOException;
import java.nio.file.NoSuchFileException;
import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.TransactionException;

/** Staging uploads and reference-authorized reads. No file deletion or implicit publishing. */
public final class MediaAssetService {
  static final long TTL = Duration.ofHours(24).toMillis();
  static final long PROCESSING_WINDOW = Duration.ofMinutes(2).toMillis();
  private static final Set<String> TRANSIENT_PROCESSING = Set.of("MEDIA_BUSY", "MEDIA_PROCESSING_TIMEOUT", "MEDIA_PROCESSING_FAILED");
  @FunctionalInterface interface Processor { StaticImageCandidateProcessor.Result process(byte[] bytes, String mime) throws InterruptedException; }
  private final MediaAssetRepository repository;
  private final PrivateImageStore store;
  private final Processor processor;
  private Processor stickerProcessor;
  private Processor sceneProcessor;
  private final Clock clock;

  public MediaAssetService(MediaAssetRepository repository, PrivateImageStore store, IsolatedImageProcessor processor, Clock clock) {
    this(repository, store, processor::process, clock);
    this.sceneProcessor = processor::processScene;
    this.stickerProcessor = (bytes,mime) -> {
      if (mime.equals("image/gif")) return processor.processStickerGif(bytes);
      var image=processor.process(bytes,mime);
      return new StaticImageCandidateProcessor.Result(image.thumb(),image.thumb());
    };
  }
  MediaAssetService(MediaAssetRepository repository, PrivateImageStore store, Processor processor, Clock clock) {
    this.repository = repository; this.store = store; this.processor = processor; this.clock = clock;
  }

  public record Asset(String id, long expiresAt, int width, int height, String mime, int bytes, String clearUrl, String thumbUrl, String displayUrl, String purpose) { }
  public record UploadView(String status, Asset asset, String code, boolean retryable) { }

  public UploadView upload(long owner, UUID uploadId, byte[] bytes, String declaredMime) {
    return upload(owner, uploadId, bytes, declaredMime, "social");
  }

  public UploadView upload(long owner, UUID uploadId, byte[] bytes, String declaredMime, String purpose) {
    if (!Set.of("social","sticker","scene").contains(purpose)) throw new MediaApiException(422,"MEDIA_PURPOSE_UNAVAILABLE","该图片用途尚未启用。");
    if (purpose.equals("sticker") && stickerProcessor==null) throw MediaApiException.unavailable();
    if (purpose.equals("scene") && sceneProcessor==null) throw MediaApiException.unavailable();
    return uploadWith(owner,uploadId,bytes,declaredMime,purpose,purpose.equals("scene")?sceneProcessor:purpose.equals("sticker")?stickerProcessor:processor);
  }

  // Only called with files read from the private store after message ACL verification.
  UploadView copySticker(long owner, UUID request, StaticImageCandidateProcessor.Result trusted) {
    return uploadWith(owner,request,trusted.clear().bytes(),trusted.clear().mime(),"sticker",(bytes,mime)->trusted);
  }

  private UploadView uploadWith(long owner, UUID uploadId, byte[] bytes, String declaredMime, String purpose, Processor selected) {
    if (owner <= 0 || uploadId == null) throw new IllegalArgumentException("Invalid authenticated owner/upload id");
    String mime = normalizedMime(declaredMime,purpose);
    if (purpose.equals("scene")) SceneImageProcessor.validateInput(bytes);
    else if (mime.equals("image/gif")) {
      if (bytes==null || bytes.length==0 || bytes.length>GifContainer.MAX_BYTES) throw new MediaApiException(413,"MEDIA_TOO_LARGE","GIF 不得超过 5 MiB。");
    } else StaticImageCandidateProcessor.validateSize(bytes);
    String hash = StoredImageManifest.digest(bytes);
    long now = clock.millis();
    var claim = new MediaAssetRepository.Row(UUID.randomUUID(), owner, uploadId, hash, mime, "PROCESSING", null,
        now, now + PROCESSING_WINDOW, now + TTL, null, 0, 0, 0, 0, null, null,purpose);
    try {
      boolean acquired = repository.insert(claim);
      if (!acquired) {
        claim = repository.byUpload(owner, uploadId);
        if (claim == null) throw MediaApiException.unavailable();
        if (!hash.equals(claim.hash()) || !mime.equals(claim.candidateMime()) || !purpose.equals(claim.purpose())) {
          throw new MediaApiException(409, "MEDIA_UPLOAD_CONFLICT", "同一上传 ID 已绑定其他内容，请移除后重新添加。");
        }
        if (claim.publishedAt() != null) return new UploadView("bound", null, "MEDIA_ALREADY_BOUND", false);
        if (claim.retiredAt() != null || claim.expiresAt() <= now) throw MediaApiException.expired();
        if (claim.state().equals("RETRYABLE")) acquired = repository.retry(claim, now, now + PROCESSING_WINDOW);
        if (!acquired) return resolve(repository.byUpload(owner, uploadId));
      }
      StaticImageCandidateProcessor.Result processed;
      try { processed = selected.process(bytes, mime); }
      catch (CandidateImageException error) {
        boolean retryable = TRANSIENT_PROCESSING.contains(error.code());
        repository.fail(claim, error.code(), retryable);
        throw new MediaApiException(retryable ? 503 : 422, error.code(), error.getMessage());
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        repository.fail(claim, "MEDIA_PROCESSING_FAILED", true);
        throw MediaApiException.unavailable();
      }
      if (clock.millis() >= claim.expiresAt()) throw MediaApiException.expired();
      try { store.save(owner, claim.assetId(), processed); }
      catch (BusinessException error) {
        // Reservation rejects before writing; retrying the same candidate is safe once quota is available.
        repository.fail(claim, error.getCode(), true);
        throw new MediaApiException(429, error.getCode(), error.getMessage());
      } catch (IOException error) {
        repository.fail(claim, "MEDIA_STORAGE_FAILED", false);
        throw MediaApiException.unavailable();
      }
      // Do NOT delete on an uncertain DB outcome: it may have committed. resolve() can roll forward from disk.
      repository.ready(claim, processed, clock.millis());
      return resolve(repository.byUpload(owner, uploadId));
    } catch (DataAccessException | TransactionException databaseFailure) { throw MediaApiException.unavailable(); }
  }

  public UploadView lookup(long owner, UUID uploadId) {
    try {
      var row = repository.byUpload(owner, uploadId);
      return row == null ? new UploadView("missing", null, null, false) : resolve(row);
    } catch (DataAccessException | TransactionException error) { throw MediaApiException.unavailable(); }
  }

  private UploadView resolve(MediaAssetRepository.Row row) {
    if (row == null) throw MediaApiException.unavailable();
    if (row.publishedAt() != null) return new UploadView("bound", null, "MEDIA_ALREADY_BOUND", false);
    if (row.retiredAt() != null || row.expiresAt() <= clock.millis()) return new UploadView("expired", null, "MEDIA_EXPIRED", false);
    if (row.state().equals("PROCESSING")) {
      try {
        var pair = new StaticImageCandidateProcessor.Result(store.read(row.ownerId(), row.assetId(), PrivateImageStore.Variant.CLEAR),
            store.read(row.ownerId(), row.assetId(), PrivateImageStore.Variant.THUMB),
            row.purpose().equals("scene") ? store.read(row.ownerId(), row.assetId(), PrivateImageStore.Variant.DISPLAY) : null);
        repository.ready(row, pair, clock.millis());
        row = repository.byUpload(row.ownerId(), row.uploadId());
        if (row == null) throw MediaApiException.unavailable();
      } catch (NoSuchFileException notYetStored) {
        if (row.deadline() > clock.millis()) return new UploadView("pending", null, null, false);
        repository.fail(row, "MEDIA_UPLOAD_INTERRUPTED", false);
        return resolve(repository.byUpload(row.ownerId(), row.uploadId()));
      } catch (IOException invalidStorage) { throw MediaApiException.unavailable(); }
    }
    if (row.expiresAt() <= clock.millis()) return new UploadView("expired", null, "MEDIA_EXPIRED", false);
    if (row.state().equals("READY")) {
      // A ready response must not rely solely on metadata if its files are gone/corrupt.
      readChecked(row, PrivateImageStore.Variant.CLEAR);
      String base = "/api/media/assets/" + row.assetId();
      return new UploadView("ready", new Asset(row.assetId().toString(), row.expiresAt(), row.width(), row.height(),
          row.mime(), row.clearBytes(), base + "/clear", base + "/thumb", row.purpose().equals("scene") ? base + "/display" : null, row.purpose()), null, false);
    }
    if (row.state().equals("PROCESSING")) return new UploadView("pending", null, null, false);
    return new UploadView("failed", null, row.failureCode(), row.state().equals("RETRYABLE"));
  }

  public StaticImageCandidateProcessor.Variant read(long owner, UUID assetId, PrivateImageStore.Variant variant) {
    try {
      var row = repository.readable(owner, assetId, clock.millis());
      if (row == null) throw MediaApiException.notFound();
      var result = readChecked(row, variant);
      if (repository.readable(owner, assetId, clock.millis()) == null) throw MediaApiException.notFound();
      return result;
    } catch (DataAccessException | TransactionException error) { throw MediaApiException.unavailable(); }
  }

  private StaticImageCandidateProcessor.Variant readChecked(MediaAssetRepository.Row row, PrivateImageStore.Variant variant) {
    try {
      var result = store.read(row.ownerId(), row.assetId(), variant);
      if (variant == PrivateImageStore.Variant.CLEAR && (!result.mime().equals(row.mime())
          || result.width() != row.width() || result.height() != row.height() || result.bytes().length != row.clearBytes())
          || variant == PrivateImageStore.Variant.THUMB && result.bytes().length != row.thumbBytes()
          || variant == PrivateImageStore.Variant.DISPLAY && (!row.purpose().equals("scene") || !java.util.Objects.equals(result.bytes().length, repository.displayBytes(row.ownerId(), row.assetId())))) {
        throw MediaApiException.unavailable();
      }
      return result;
    } catch (IOException error) { throw MediaApiException.unavailable(); }
  }

  static String normalizedMime(String declared) {
    return normalizedMime(declared,"social");
  }
  static String normalizedMime(String declared,String purpose) {
    String mime = declared == null ? "" : declared.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
    if (mime.equals("image/jpg")) mime = "image/jpeg";
    if (!Set.of("image/png", "image/jpeg", "image/webp").contains(mime) && !(purpose.equals("sticker") && mime.equals("image/gif"))) {
      throw new MediaApiException(415, "MEDIA_UNSUPPORTED_TYPE", "请发送 JPEG、PNG 或静态 WebP 的图片二进制内容。");
    }
    return mime;
  }
}
