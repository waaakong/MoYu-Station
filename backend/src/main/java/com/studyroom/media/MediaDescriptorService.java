package com.studyroom.media;

import com.studyroom.dto.MediaDescriptor;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

/** Metadata enrichment for already-authorized business DTOs, never a public asset lookup.
 * One query per history/feed page; binary reads still independently enforce current ACL. */
public final class MediaDescriptorService {
  private final JdbcTemplate jdbc;
  public MediaDescriptorService(JdbcTemplate source) {
    jdbc = new JdbcTemplate(Objects.requireNonNull(source.getDataSource())); jdbc.setQueryTimeout(5);
  }
  public Map<Long, List<MediaDescriptor>> posts(List<Long> ids) { return load(ids, true); }
  public Map<Long, List<MediaDescriptor>> messages(List<Long> ids) { return load(ids, false); }

  private Map<Long, List<MediaDescriptor>> load(List<Long> ids, boolean posts) {
    if (ids.isEmpty()) return Map.of();
    if (ids.size() > 200 || ids.stream().anyMatch(Objects::isNull)) throw new IllegalArgumentException("Unbounded media metadata query");
    String column = posts ? "post_id" : "message_id";
    String join = posts ? "JOIN sr_post b ON b.id=r.post_id AND b.user_id=a.owner_id AND b.deleted_by_user=0 AND b.deleted_by_admin=0 "
        : "JOIN sr_chat_message b ON b.id=r.message_id AND b.sender_id=a.owner_id AND b.recalled_at IS NULL AND b.message_type='IMAGE' ";
    String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
    Map<Long, List<MediaDescriptor>> results = new HashMap<>();
    jdbc.query("SELECT r." + column + " AS target_id,a.asset_id,a.width,a.height,a.clear_mime,a.purpose FROM sr_media_reference r "
        + "JOIN sr_media_asset a ON a.asset_id=r.asset_id " + join
        + "WHERE r." + column + " IN (" + placeholders + ") AND a.state='READY' AND a.retired_at_ms IS NULL "
        + "AND a.published_at_ms IS NOT NULL ORDER BY r." + column + ",r.position", result -> {
          String id = result.getString("asset_id"), base = "/api/media/assets/" + id;
          results.computeIfAbsent(result.getLong("target_id"), ignored -> new ArrayList<>()).add(new MediaDescriptor(
              id, result.getString("purpose"), result.getInt("width"), result.getInt("height"), base + "/thumb", base + "/clear",
              result.getString("clear_mime"), "image/gif".equals(result.getString("clear_mime")), "image/gif".equals(result.getString("clear_mime"))?base+"/thumb":null));
        }, ids.toArray());
    return results;
  }
}
