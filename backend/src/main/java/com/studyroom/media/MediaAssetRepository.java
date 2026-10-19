package com.studyroom.media;

import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.function.Supplier;

/** Each state transition is one committed statement; no transaction spans pixel decoding or disk IO. */
public class MediaAssetRepository {
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transaction;
  private static final String COLUMNS = "asset_id,owner_id,client_upload_id,candidate_sha256,candidate_mime,state,failure_code,"
      + "created_at_ms,processing_deadline_ms,expires_at_ms,clear_mime,width,height,clear_bytes,thumb_bytes,published_at_ms,retired_at_ms,purpose";

  public MediaAssetRepository(JdbcTemplate jdbc) {
    var datasource = java.util.Objects.requireNonNull(jdbc.getDataSource());
    this.jdbc = new JdbcTemplate(datasource); this.jdbc.setQueryTimeout(5);
    transaction = new TransactionTemplate(new DataSourceTransactionManager(datasource));
    transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    transaction.setTimeout(5);
  }
  public void verifySchema() { jdbc.queryForList("SELECT " + COLUMNS + ",display_bytes FROM sr_media_asset WHERE 1=0"); }

  Integer displayBytes(long owner, UUID asset) {
    return independently(() -> jdbc.queryForObject("SELECT display_bytes FROM sr_media_asset WHERE owner_id=? AND asset_id=?", Integer.class, owner, asset.toString()));
  }

  public record Row(UUID assetId, long ownerId, UUID uploadId, String hash, String candidateMime, String state,
                    String failureCode, long createdAt, long deadline, long expiresAt, String mime, int width,
                    int height, int clearBytes, int thumbBytes, Long publishedAt, Long retiredAt, String purpose) {
    public Row(UUID assetId,long ownerId,UUID uploadId,String hash,String candidateMime,String state,String failureCode,
        long createdAt,long deadline,long expiresAt,String mime,int width,int height,int clearBytes,int thumbBytes,Long publishedAt,Long retiredAt) {
      this(assetId,ownerId,uploadId,hash,candidateMime,state,failureCode,createdAt,deadline,expiresAt,mime,width,height,clearBytes,thumbBytes,publishedAt,retiredAt,"social");
    }
  }

  public boolean insert(Row row) {
    try {
      independently(() -> jdbc.update("INSERT INTO sr_media_asset (asset_id,owner_id,client_upload_id,candidate_sha256,candidate_mime,"
              + "state,created_at_ms,processing_deadline_ms,expires_at_ms,purpose) VALUES (?,?,?,?,?,'PROCESSING',?,?,?,?)",
          row.assetId().toString(), row.ownerId(), row.uploadId().toString(), row.hash(), row.candidateMime(),
          row.createdAt(), row.deadline(), row.expiresAt(), row.purpose()));
      return true;
    } catch (DuplicateKeyException conflict) {
      // Only the owner/request uniqueness collision is an idempotent replay. Other collisions remain errors.
      if (byUpload(row.ownerId(), row.uploadId()) == null) throw conflict;
      return false;
    }
  }

  public Row byUpload(long owner, UUID upload) { return one("owner_id=? AND client_upload_id=?", owner, upload.toString()); }
  public Row byAsset(long owner, UUID asset) { return one("owner_id=? AND asset_id=?", owner, asset.toString()); }

  /** Caller must already authenticate an active account. No owner/admin bypass for published media. */
  public Row readable(long viewer, UUID asset, long now) {
    if (viewer <= 0) return null;
    return one("asset_id=? AND state='READY' AND retired_at_ms IS NULL AND ((published_at_ms IS NULL "
        + "AND owner_id=? AND expires_at_ms>?) OR (published_at_ms IS NOT NULL AND ("
        + "EXISTS (SELECT 1 FROM sr_media_reference r JOIN sr_post p ON p.id=r.post_id "
        + "WHERE r.asset_id=sr_media_asset.asset_id AND p.user_id=sr_media_asset.owner_id AND p.deleted_by_user=0 AND p.deleted_by_admin=0) "
        + "OR EXISTS (SELECT 1 FROM sr_media_reference r JOIN sr_chat_message m ON m.id=r.message_id "
        + "WHERE r.asset_id=sr_media_asset.asset_id AND m.sender_id=sr_media_asset.owner_id AND m.recalled_at IS NULL "
        + "AND m.message_type='IMAGE' AND ((m.channel_type='HALL' AND m.receiver_id IS NULL AND m.conversation_id IS NULL) "
        + "OR (m.channel_type='PRIVATE' AND (m.sender_id=? OR m.receiver_id=?) "
        + "AND EXISTS (SELECT 1 FROM sr_private_conversation c WHERE c.id=m.conversation_id "
        + "AND ((c.user_a_id=m.sender_id AND c.user_b_id=m.receiver_id) OR (c.user_b_id=m.sender_id AND c.user_a_id=m.receiver_id))) "
        + "AND NOT EXISTS (SELECT 1 FROM sr_chat_message_visibility v WHERE v.message_id=m.id AND v.user_id=?)))) "
        + "OR EXISTS (SELECT 1 FROM sr_media_reference r JOIN sr_sticker_favorite f ON f.favorite_id=r.favorite_id "
        + "WHERE r.asset_id=sr_media_asset.asset_id AND f.owner_id=? AND f.deleted=0) "
        + "OR EXISTS (SELECT 1 FROM sr_media_reference r JOIN sr_custom_scene s ON s.owner_id=r.scene_owner_id "
        + "WHERE r.asset_id=sr_media_asset.asset_id AND s.owner_id=? AND s.deleted=0))))",
        asset.toString(), viewer, now, viewer, viewer, viewer, viewer, viewer);
  }

  private Row one(String predicate, Object... arguments) {
    List<Row> rows = independently(() -> jdbc.query("SELECT " + COLUMNS + " FROM sr_media_asset WHERE " + predicate, (r, n) ->
        new Row(UUID.fromString(r.getString("asset_id")), r.getLong("owner_id"), UUID.fromString(r.getString("client_upload_id")),
            r.getString("candidate_sha256"), r.getString("candidate_mime"), r.getString("state"), r.getString("failure_code"),
            r.getLong("created_at_ms"), r.getLong("processing_deadline_ms"), r.getLong("expires_at_ms"), r.getString("clear_mime"),
            r.getInt("width"), r.getInt("height"), r.getInt("clear_bytes"), r.getInt("thumb_bytes"),
            (Long) r.getObject("published_at_ms"), (Long) r.getObject("retired_at_ms"), r.getString("purpose")), arguments));
    return rows.isEmpty() ? null : rows.get(0);
  }

  public boolean retry(Row row, long now, long deadline) {
    return independently(() -> jdbc.update("UPDATE sr_media_asset SET state='PROCESSING',failure_code=NULL,processing_deadline_ms=? "
        + "WHERE asset_id=? AND owner_id=? AND state='RETRYABLE' AND published_at_ms IS NULL AND retired_at_ms IS NULL AND expires_at_ms>?", deadline, row.assetId().toString(), row.ownerId(), now)) == 1;
  }

  public boolean ready(Row row, StaticImageCandidateProcessor.Result result, long now) {
    return independently(() -> jdbc.update("UPDATE sr_media_asset SET state='READY',failure_code=NULL,clear_mime=?,width=?,height=?,clear_bytes=?,thumb_bytes=?,display_bytes=? "
            + "WHERE asset_id=? AND owner_id=? AND state='PROCESSING' AND published_at_ms IS NULL AND retired_at_ms IS NULL AND expires_at_ms>?",
        result.clear().mime(), result.clear().width(), result.clear().height(), result.clear().bytes().length,
        result.thumb().bytes().length, result.display() == null ? null : result.display().bytes().length, row.assetId().toString(), row.ownerId(), now)) == 1;
  }

  public void fail(Row row, String code, boolean retryable) {
    independently(() -> jdbc.update("UPDATE sr_media_asset SET state=?,failure_code=? WHERE asset_id=? AND owner_id=? AND state='PROCESSING'",
        retryable ? "RETRYABLE" : "FAILED", code, row.assetId().toString(), row.ownerId()));
  }

  private <T> T independently(Supplier<T> action) { return transaction.execute(status -> action.get()); }
}
