package com.studyroom.media;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Bounded, opt-in collection of new private assets only. Never scans historical/public files.
 * All reference writers must lock the same asset row and reject retired assets. */
public final class MediaAssetCollector {
  public static final long GRACE_MS = Duration.ofHours(24).toMillis();
  public enum Outcome { RETAINED, GRACE, COLLECTED, ALREADY_COLLECTED }
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transaction;
  private final PrivateImageStore store;
  private final Clock clock;

  public MediaAssetCollector(JdbcTemplate source, PrivateImageStore store, Clock clock) {
    var datasource = Objects.requireNonNull(source.getDataSource());
    jdbc = new JdbcTemplate(datasource); jdbc.setQueryTimeout(5);
    transaction = new TransactionTemplate(new DataSourceTransactionManager(datasource));
    transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    transaction.setTimeout(10);
    this.store = Objects.requireNonNull(store); this.clock = Objects.requireNonNull(clock);
  }

  public void verifySchema() {
    jdbc.queryForList("SELECT unreferenced_at_ms,collected_at_ms FROM sr_media_asset WHERE 1=0");
  }

  /** One keyset page, not an unbounded scan. Caller retains the cursor between scheduled runs. */
  public List<UUID> candidates(UUID after, int limit) {
    if (limit < 1 || limit > 100) throw new IllegalArgumentException("Collection batch must be 1..100");
    return jdbc.queryForList("SELECT asset_id FROM sr_media_asset WHERE collected_at_ms IS NULL AND state<>'PROCESSING' "
        + "AND asset_id>? AND (published_at_ms IS NOT NULL OR expires_at_ms<=?) ORDER BY asset_id LIMIT ?",
        String.class, after == null ? "" : after.toString(), clock.millis(), limit).stream().map(UUID::fromString).toList();
  }

  public Outcome collect(UUID id) throws IOException {
    Objects.requireNonNull(id);
    // Commit retirement before touching disk: a DB rollback after a partial delete cannot restore publication eligibility.
    Outcome decision = transaction.execute(status -> claim(id));
    if (decision != Outcome.COLLECTED) return decision;
    try {
      return transaction.execute(status -> {
        var rows = lock(id);
        if (rows.isEmpty()) return Outcome.RETAINED;
        var row = rows.get(0);
        if (row.get("collected_at_ms") != null) return Outcome.ALREADY_COLLECTED;
        if (row.get("retired_at_ms") == null || referenced(id)) return Outcome.RETAINED;
        try { store.deleteRetired(((Number) row.get("owner_id")).longValue(), id); }
        catch (IOException error) { throw new java.io.UncheckedIOException(error); }
        jdbc.update("UPDATE sr_media_asset SET collected_at_ms=? WHERE asset_id=?", clock.millis(), id.toString());
        return Outcome.COLLECTED;
      });
    } catch (java.io.UncheckedIOException error) { throw error.getCause(); }
  }

  private Outcome claim(UUID id) {
    var rows = lock(id);
    if (rows.isEmpty()) return Outcome.RETAINED;
    var row = rows.get(0);
    if (row.get("collected_at_ms") != null) return Outcome.ALREADY_COLLECTED;
    // New explicit post deletions detach references transactionally. Do not reinterpret
    // historical admin-hidden rows as deletion requests; one-sided chat hiding also retains references.
    for (var reference : jdbc.queryForList("SELECT post_id,message_id FROM sr_media_reference WHERE asset_id=?", id.toString())) {
      if (reference.get("post_id") != null) {
        var posts = jdbc.queryForList("SELECT deleted_by_user FROM sr_post WHERE id=? FOR SHARE", reference.get("post_id"));
        if (!posts.isEmpty() && ((Number) posts.get(0).get("deleted_by_user")).intValue() == 1) {
          jdbc.update("DELETE FROM sr_media_reference WHERE asset_id=? AND post_id=?", id.toString(), reference.get("post_id"));
        }
      } else if (reference.get("message_id") != null) {
        var messages = jdbc.queryForList("SELECT recalled_at FROM sr_chat_message WHERE id=? FOR SHARE", reference.get("message_id"));
        if (!messages.isEmpty() && messages.get(0).get("recalled_at") != null) {
          jdbc.update("DELETE FROM sr_media_reference WHERE asset_id=? AND message_id=?", id.toString(), reference.get("message_id"));
        }
      }
    }
    if (referenced(id)) {
      jdbc.update("UPDATE sr_media_asset SET unreferenced_at_ms=NULL WHERE asset_id=?", id.toString());
      return Outcome.RETAINED;
    }
    // Never race a live decoder/store write, even if its processing deadline has elapsed.
    if ("PROCESSING".equals(row.get("state"))) return Outcome.RETAINED;
    long now = clock.millis();
    long start;
    if (row.get("published_at_ms") == null) start = ((Number) row.get("expires_at_ms")).longValue();
    else if (row.get("unreferenced_at_ms") == null) {
      jdbc.update("UPDATE sr_media_asset SET unreferenced_at_ms=? WHERE asset_id=?", now, id.toString());
      return Outcome.GRACE;
    } else start = ((Number) row.get("unreferenced_at_ms")).longValue();
    if (now < start || now - start < GRACE_MS) return Outcome.GRACE;
    jdbc.update("UPDATE sr_media_asset SET retired_at_ms=COALESCE(retired_at_ms,?) WHERE asset_id=?", now, id.toString());
    return Outcome.COLLECTED;
  }

  private List<Map<String, Object>> lock(UUID id) {
    return jdbc.queryForList("SELECT owner_id,state,expires_at_ms,published_at_ms,retired_at_ms,unreferenced_at_ms,collected_at_ms "
        + "FROM sr_media_asset WHERE asset_id=? FOR UPDATE", id.toString());
  }
  private boolean referenced(UUID id) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_reference WHERE asset_id=?", Long.class, id.toString()) != 0;
  }
}
