package com.studyroom.media;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.*;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.function.Consumer;

/** Publication boundary. All business rows and references commit together.
 * New drafts use new assets; a successful request is replayed, never rebound to a different target.
 * Collection references, durable delivery and physical expiry deletion are separate work. */
public final class MediaPublicationService {
  public enum Kind { POST, HALL, PRIVATE }
  public record Command(UUID requestId, Kind kind, Long recipient, String content, String scene, List<UUID> assets) { }
  public record Published(Kind kind,
      @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class) long targetId) { }
  public record Committed(long owner, Long recipient, Published publication) { }
  public record Lookup(String status, Published publication) { }
  private static final Set<String> SCENES = Set.of("default", "mountain", "beach", "forest", "library", "cafe", "snow");
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transaction;
  private final PrivateImageStore store;
  private final Clock clock;
  private final Consumer<Committed> notifications;
  private final ObjectMapper json = new ObjectMapper();

  public MediaPublicationService(JdbcTemplate source, PrivateImageStore store, Clock clock) {
    this(source, store, clock, event -> { });
  }
  public MediaPublicationService(JdbcTemplate source, PrivateImageStore store, Clock clock, Consumer<Committed> notifications) {
    var datasource = Objects.requireNonNull(source.getDataSource());
    jdbc = new JdbcTemplate(datasource); jdbc.setQueryTimeout(5);
    transaction = new TransactionTemplate(new DataSourceTransactionManager(datasource));
    transaction.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);
    transaction.setTimeout(5);
    this.store = store; this.clock = clock;
    this.notifications = Objects.requireNonNull(notifications);
  }

  public void verifySchema() {
    jdbc.queryForList("SELECT owner_id,request_id,payload_sha256,kind,target_id FROM sr_media_publication WHERE 1=0");
    jdbc.queryForList("SELECT asset_id,post_id,message_id,position FROM sr_media_reference WHERE 1=0");
  }

  /** owner is supplied by trusted authenticated server code, never by a client payload. */
  public Published publish(long owner, Command input) {
    Command command = normalize(owner, input);
    String fingerprint = StoredImageManifest.digest(encode(command).getBytes(StandardCharsets.UTF_8));
    try {
      return transaction.execute(status -> {
        requireAccount(owner, true);
        if (command.kind() == Kind.PRIVATE) requireAccount(command.recipient(), false);
        jdbc.update("INSERT INTO sr_media_publication (owner_id,request_id,payload_sha256,kind) VALUES (?,?,?,?) "
                + "ON DUPLICATE KEY UPDATE request_id=request_id", owner, command.requestId().toString(), fingerprint, command.kind().name());
        var existing = jdbc.queryForMap("SELECT payload_sha256,kind,target_id FROM sr_media_publication WHERE owner_id=? AND request_id=? FOR UPDATE",
            owner, command.requestId().toString());
        if (!fingerprint.equals(existing.get("payload_sha256"))) throw conflict("MEDIA_PUBLICATION_CONFLICT", "同一发布 ID 已绑定其他内容或目标。");
        if (existing.get("target_id") != null) return new Published(command.kind(), ((Number) existing.get("target_id")).longValue());

        // Sorted locking prevents differently ordered image lists from taking asset locks in opposite orders.
        for (UUID id : command.assets().stream().sorted(Comparator.comparing(UUID::toString)).toList()) {
          var rows = jdbc.queryForList("SELECT owner_id,state,expires_at_ms,published_at_ms,retired_at_ms,clear_mime,width,height,clear_bytes,thumb_bytes,purpose "
              + "FROM sr_media_asset WHERE asset_id=? FOR UPDATE", id.toString());
          if (rows.isEmpty()) throw invalidAsset();
          var row = rows.get(0);
          boolean favorite = command.kind()!=Kind.POST && "sticker".equals(row.get("purpose")) && jdbc.queryForObject(
              "SELECT COUNT(*) FROM sr_sticker_favorite WHERE owner_id=? AND asset_id=? AND deleted=0",Integer.class,owner,id.toString())>0;
          if (((Number) row.get("owner_id")).longValue() != owner || !"READY".equals(row.get("state"))
              || (!favorite && (!"social".equals(row.get("purpose")) || row.get("published_at_ms") != null)) || row.get("retired_at_ms") != null
              || (!favorite && ((Number) row.get("expires_at_ms")).longValue() <= clock.millis())) throw invalidAsset();
          verifyFiles(owner, id, row);
        }
        long target = createTarget(owner, command);
        // Sample the clock after acquiring locks and performing bounded IO, not before waiting for a lock.
        long now = clock.millis();
        for (int position = 0; position < command.assets().size(); position++) {
          UUID id = command.assets().get(position);
          if (jdbc.update("UPDATE sr_media_asset SET published_at_ms=COALESCE(published_at_ms,?),unreferenced_at_ms=NULL WHERE asset_id=? AND owner_id=? AND state='READY' "
                  + "AND retired_at_ms IS NULL AND ((purpose='social' AND published_at_ms IS NULL AND expires_at_ms>?) OR purpose='sticker')", now, id.toString(), owner, now) != 1) throw invalidAsset();
          jdbc.update("INSERT INTO sr_media_reference (asset_id,post_id,message_id,position) VALUES (?,?,?,?)",
              id.toString(), command.kind() == Kind.POST ? target : null, command.kind() == Kind.POST ? null : target, position);
        }
        jdbc.update("UPDATE sr_media_publication SET target_id=? WHERE owner_id=? AND request_id=?", target, owner, command.requestId().toString());
        var published = new Published(command.kind(), target);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
          @Override public void afterCommit() {
            try { notifications.accept(new Committed(owner, command.recipient(), published)); }
            catch (RuntimeException notificationFailure) {
              // Commit is authoritative. No payload/credentials in logs, and no retry that might duplicate delivery.
              org.slf4j.LoggerFactory.getLogger(MediaPublicationService.class).warn("Media publication committed; live refresh notification failed");
            }
          }
        });
        return published;
      });
    } catch (DataAccessException | TransactionException error) { throw MediaApiException.unavailable(); }
  }

  public Lookup lookup(long owner, UUID requestId) {
    if (owner <= 0 || requestId == null) throw badRequest();
    var read = new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
    read.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    read.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);
    read.setTimeout(5); read.setReadOnly(true);
    try {
      return read.execute(status -> {
        var rows = jdbc.queryForList("SELECT kind,target_id FROM sr_media_publication WHERE owner_id=? AND request_id=?", owner, requestId.toString());
        if (rows.isEmpty() || rows.get(0).get("target_id") == null) return new Lookup("unconfirmed", null);
        var row = rows.get(0);
        return new Lookup("committed", new Published(Kind.valueOf((String) row.get("kind")), ((Number) row.get("target_id")).longValue()));
      });
    } catch (DataAccessException | TransactionException error) { throw MediaApiException.unavailable(); }
  }

  /** DB-only expiry claim, deliberately no scheduler or filesystem deletion. A publisher holds the same row lock. */
  public boolean retireExpired(UUID id) {
    Objects.requireNonNull(id);
    try {
      return Boolean.TRUE.equals(transaction.execute(status -> {
        var rows = jdbc.queryForList("SELECT asset_id FROM sr_media_asset WHERE asset_id=? FOR UPDATE", id.toString());
        if (rows.isEmpty()) return false;
        long now = clock.millis();
        return jdbc.update("UPDATE sr_media_asset SET retired_at_ms=? WHERE asset_id=? AND published_at_ms IS NULL "
            + "AND retired_at_ms IS NULL AND expires_at_ms<=? AND NOT EXISTS "
            + "(SELECT 1 FROM sr_media_reference r WHERE r.asset_id=sr_media_asset.asset_id)", now, id.toString(), now) == 1;
      }));
    } catch (DataAccessException | TransactionException error) { throw MediaApiException.unavailable(); }
  }

  private void requireAccount(long id, boolean sending) {
    var users = jdbc.queryForList("SELECT user_type,deleted FROM sr_user WHERE id=? FOR SHARE", id);
    if (users.isEmpty() || ((Number) users.get(0).get("deleted")).intValue() != 0
        || "BANNED".equalsIgnoreCase((String) users.get(0).get("user_type"))
        || sending && "MUTED".equalsIgnoreCase((String) users.get(0).get("user_type"))) {
      throw new MediaApiException(403, "MEDIA_PUBLICATION_FORBIDDEN", "账号或接收对象当前不可发布图片。");
    }
  }

  private long createTarget(long owner, Command command) {
    var urls = command.assets().stream().map(id -> "/api/media/assets/" + id + "/clear").toList();
    // Namespaced IDs avoid colliding with legacy client IDs; publication fingerprint is authoritative here.
    String legacyRequest = "media-" + command.requestId();
    if (command.kind() == Kind.POST) {
      jdbc.update("INSERT INTO sr_post (user_id,client_request_id,content,scene_code,image_urls_json) VALUES (?,?,?,?,?)",
          owner, legacyRequest, command.content(), command.scene(), encode(urls));
      return jdbc.queryForObject("SELECT id FROM sr_post WHERE user_id=? AND client_request_id=?", Long.class, owner, legacyRequest);
    }
    Long conversation = null;
    if (command.kind() == Kind.PRIVATE) {
      long low = Math.min(owner, command.recipient()), high = Math.max(owner, command.recipient());
      jdbc.update("INSERT INTO sr_private_conversation (user_a_id,user_b_id) VALUES (?,?) ON DUPLICATE KEY UPDATE id=id", low, high);
      conversation = jdbc.queryForObject("SELECT id FROM sr_private_conversation WHERE user_a_id=? AND user_b_id=?", Long.class, low, high);
    }
    jdbc.update("INSERT INTO sr_chat_message (conversation_id,sender_id,client_message_id,receiver_id,channel_type,message_type,content,media_url) "
        + "VALUES (?,?,?,?,?,'IMAGE',?,?)", conversation, owner, legacyRequest, command.recipient(), command.kind().name(), command.content(), urls.get(0));
    long message = jdbc.queryForObject("SELECT id FROM sr_chat_message WHERE sender_id=? AND client_message_id=?", Long.class, owner, legacyRequest);
    if (conversation != null) jdbc.update("UPDATE sr_private_conversation SET last_message_at=CURRENT_TIMESTAMP WHERE id=?", conversation);
    return message;
  }

  private void verifyFiles(long owner, UUID id, Map<String, Object> row) {
    try {
      var clear = store.read(owner, id, PrivateImageStore.Variant.CLEAR);
      var thumb = store.read(owner, id, PrivateImageStore.Variant.THUMB);
      if (!clear.mime().equals(row.get("clear_mime")) || clear.width() != ((Number) row.get("width")).intValue()
          || clear.height() != ((Number) row.get("height")).intValue() || clear.bytes().length != ((Number) row.get("clear_bytes")).intValue()
          || thumb.bytes().length != ((Number) row.get("thumb_bytes")).intValue()) throw MediaApiException.unavailable();
    } catch (IOException error) { throw MediaApiException.unavailable(); }
  }

  private static Command normalize(long owner, Command input) {
    if (owner <= 0 || input == null || input.requestId() == null || input.kind() == null || input.assets() == null
        || input.assets().isEmpty() || input.assets().size() > (input.kind() == Kind.POST ? 9 : 1)
        || input.assets().stream().anyMatch(Objects::isNull) || new HashSet<>(input.assets()).size() != input.assets().size()) throw badRequest();
    if (input.kind() == Kind.PRIVATE ? input.recipient() == null || input.recipient() <= 0 || input.recipient() == owner : input.recipient() != null) throw badRequest();
    String content = input.content() == null ? "" : input.content().trim();
    if (content.length() > (input.kind() == Kind.POST ? 500 : 1000)) throw badRequest();
    String scene = input.scene() == null || input.scene().isBlank() ? "default" : input.scene().trim().toLowerCase(Locale.ROOT);
    if (!SCENES.contains(scene) || input.kind() != Kind.POST && !scene.equals("default")) throw badRequest();
    return new Command(input.requestId(), input.kind(), input.recipient(), content, scene, List.copyOf(input.assets()));
  }

  private String encode(Object value) {
    try { return json.writeValueAsString(value); }
    catch (JsonProcessingException impossible) { throw new IllegalStateException("Cannot encode internal media publication", impossible); }
  }
  private static MediaApiException badRequest() { return new MediaApiException(400, "MEDIA_PUBLICATION_INVALID", "发布内容、图片顺序或接收对象无效。"); }
  private static MediaApiException invalidAsset() { return conflict("MEDIA_ASSET_NOT_STAGED", "图片未就绪、已使用、已过期或不属于当前账号。"); }
  private static MediaApiException conflict(String code, String message) { return new MediaApiException(409, code, message); }
}
