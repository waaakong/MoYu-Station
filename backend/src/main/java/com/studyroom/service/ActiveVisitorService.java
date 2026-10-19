package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.studyroom.entity.User;
import com.studyroom.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.servlet.http.HttpSession;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ActiveVisitorService {
  private static final long ACTIVE_WINDOW_MILLIS = Duration.ofSeconds(35).toMillis();
  private static final List<String> ONLINE_STATUSES = List.of("FOCUSING", "PLAYING", "IDLE");
  private final Map<Long, ActiveUserSnapshot> activeUsers = new ConcurrentHashMap<>();
  private final UserMapper userMapper;

  public ActiveVisitorService(UserMapper userMapper) {
    this.userMapper = userMapper;
  }

  public void heartbeat(HttpSession session, String requestedStatus) {
    Long userId = readUserId(session.getAttribute(AuthService.SESSION_USER_ID));
    String loginVersion = session.getAttribute(AuthService.SESSION_LOGIN_VERSION) instanceof String text ? text : "";
    if (userId == null || !StringUtils.hasText(loginVersion)) {
      cleanup();
      return;
    }

    User user = userMapper.selectById(userId);
    if (user == null
        || Integer.valueOf(1).equals(user.getDeleted())
        || "BANNED".equalsIgnoreCase(user.getUserType())
        || !Objects.equals(user.getLoginVersion(), loginVersion)) {
      activeUsers.remove(userId);
      cleanup();
      return;
    }

    String onlineStatus = normalizeOnlineStatus(requestedStatus);
    long nowMillis = System.currentTimeMillis();
    LocalDateTime now = LocalDateTime.now();
    activeUsers.put(userId, new ActiveUserSnapshot(nowMillis, onlineStatus));
    userMapper.update(null, new LambdaUpdateWrapper<User>()
        .eq(User::getId, userId)
        .set(User::getOnlineStatus, onlineStatus)
        .set(User::getLastActiveAt, now));
    cleanup();
  }

  public long activeCount() {
    cleanup();
    return activeUsers.size();
  }

  public void markInactiveUsersOffline() {
    cleanup();
    LocalDateTime deadline = LocalDateTime.now().minus(Duration.ofMillis(ACTIVE_WINDOW_MILLIS));
    userMapper.update(null, new LambdaUpdateWrapper<User>()
        .ne(User::getOnlineStatus, "OFFLINE")
        .and(wrapper -> wrapper.isNull(User::getLastActiveAt).or().lt(User::getLastActiveAt, deadline))
        .set(User::getOnlineStatus, "OFFLINE"));
  }

  private void cleanup() {
    long deadline = System.currentTimeMillis() - ACTIVE_WINDOW_MILLIS;
    Iterator<Map.Entry<Long, ActiveUserSnapshot>> iterator = activeUsers.entrySet().iterator();
    while (iterator.hasNext()) {
      if (iterator.next().getValue().lastSeenAt() < deadline) {
        iterator.remove();
      }
    }
  }

  private String normalizeOnlineStatus(String status) {
    String value = StringUtils.hasText(status) ? status.trim().toUpperCase(Locale.ROOT) : "IDLE";
    return ONLINE_STATUSES.contains(value) ? value : "IDLE";
  }

  private Long readUserId(Object value) {
    if (value instanceof Long number) return number;
    if (value instanceof Integer number) return number.longValue();
    if (value instanceof String text) {
      try {
        return Long.parseLong(text);
      } catch (NumberFormatException ignored) {
        return null;
      }
    }
    return null;
  }

  private record ActiveUserSnapshot(long lastSeenAt, String onlineStatus) {
  }
}
