package com.studyroom.service;

import com.studyroom.common.BusinessException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Account-scoped visible conversations, including offline peers. No presence-dependent history. */
@Service
public class ChatConversationService {
  private final JdbcTemplate jdbc;
  public ChatConversationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  public record Summary(
      @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class) long conversationId,
      @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class) long userId,
      String username, String nickname, String avatarUrl, String onlineStatus, boolean available,
      @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class) long lastMessageId,
      String preview, String updatedAt, int unreadCount) {}
  public record Page(List<Summary> items, String nextCursor) {}

  public Page list(long owner, String cursor) {
    long snapshot = Long.MAX_VALUE, before = Long.MAX_VALUE;
    if (cursor != null) {
      if (!cursor.matches("[1-9][0-9]{0,18}\\.[1-9][0-9]{0,18}")) throw invalidCursor();
      try {
        String[] parts = cursor.split("\\."); snapshot = Long.parseLong(parts[0]); before = Long.parseLong(parts[1]);
        if (before > snapshot) throw invalidCursor();
      } catch (NumberFormatException error) { throw invalidCursor(); }
    }
    // Pin subsequent pages to a message high-watermark, so activity on another client cannot skip older peers.
    var rows = jdbc.query("""
        SELECT c.id conversation_id, u.id user_id, u.username, u.nickname, u.avatar_url, u.online_status,
               u.deleted, u.user_type, m.id message_id, m.message_type, m.content, m.recalled_at, m.created_at,
               (SELECT COUNT(*) FROM sr_chat_message unread
                WHERE unread.conversation_id=c.id AND unread.channel_type='PRIVATE' AND unread.receiver_id=?
                  AND unread.read_at IS NULL AND unread.recalled_at IS NULL
                  AND NOT EXISTS (SELECT 1 FROM sr_chat_message_visibility uv WHERE uv.message_id=unread.id AND uv.user_id=?)) unread_count
        FROM sr_private_conversation c
        JOIN sr_user u ON u.id=CASE WHEN c.user_a_id=? THEN c.user_b_id ELSE c.user_a_id END
        JOIN sr_chat_message m ON m.id=(
          SELECT MAX(candidate.id) FROM sr_chat_message candidate
          WHERE candidate.conversation_id=c.id AND candidate.channel_type='PRIVATE' AND candidate.id<=?
            AND ((candidate.sender_id=c.user_a_id AND candidate.receiver_id=c.user_b_id)
              OR (candidate.sender_id=c.user_b_id AND candidate.receiver_id=c.user_a_id))
            AND NOT EXISTS (SELECT 1 FROM sr_chat_message_visibility v WHERE v.message_id=candidate.id AND v.user_id=?))
        WHERE (c.user_a_id=? OR c.user_b_id=?) AND m.id<?
        ORDER BY m.id DESC LIMIT 31
        """, (row, number) -> {
          String content = row.getString("content");
          String preview = row.getTimestamp("recalled_at") != null ? "消息已撤回"
              : "IMAGE".equals(row.getString("message_type")) ? "[图片]" : content == null ? "" : content;
          if (preview.codePointCount(0, preview.length()) > 100) preview = preview.substring(0, preview.offsetByCodePoints(0, 100)) + "…";
          return new Summary(row.getLong("conversation_id"), row.getLong("user_id"), row.getString("username"), row.getString("nickname"),
              row.getString("avatar_url"), row.getString("online_status"), row.getInt("deleted") == 0 && !"BANNED".equals(row.getString("user_type")),
              row.getLong("message_id"), preview, row.getTimestamp("created_at").toLocalDateTime().toString(), row.getInt("unread_count"));
        }, owner, owner, owner, snapshot, owner, owner, owner, before);
    if (rows.isEmpty()) return new Page(List.of(), null);
    if (cursor == null) snapshot = rows.get(0).lastMessageId();
    boolean more = rows.size() > 30;
    var items = List.copyOf(rows.subList(0, Math.min(30, rows.size())));
    return new Page(items, more ? snapshot + "." + items.get(items.size() - 1).lastMessageId() : null);
  }
  private BusinessException invalidCursor() { return new BusinessException("CHAT_INVALID_CURSOR", "会话游标无效，请重新加载列表。"); }
}
