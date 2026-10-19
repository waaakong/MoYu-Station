package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.config.AdminSecurityProperties;
import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.dto.AdminDashboardResponse;
import com.studyroom.dto.AdminFeedbackResponse;
import com.studyroom.dto.AdminPostResponse;
import com.studyroom.dto.AdminUserResponse;
import com.studyroom.dto.DatabaseMetrics;
import com.studyroom.dto.RedisMetrics;
import com.studyroom.dto.SystemMetrics;
import com.studyroom.entity.DailyStat;
import com.studyroom.entity.Feedback;
import com.studyroom.entity.Post;
import com.studyroom.entity.User;
import com.studyroom.mapper.DailyStatMapper;
import com.studyroom.mapper.FeedbackMapper;
import com.studyroom.mapper.PostMapper;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.PasswordService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class AdminService {
  @org.springframework.beans.factory.annotation.Autowired private com.studyroom.media.PostDeletionService postDeletion;
  private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
  private static final Set<String> USER_TYPES = Set.of("NORMAL", "MUTED", "BANNED", "ADMIN");
  private static final Set<String> FEEDBACK_STATUSES = Set.of("PENDING", "PROCESSING", "RECORDED", "RESOLVED");
  private static final Set<String> ONLINE_STATUSES = Set.of("FOCUSING", "PLAYING", "IDLE", "OFFLINE");

  private final UserMapper userMapper;
  private final DailyStatMapper dailyStatMapper;
  private final PostMapper postMapper;
  private final FeedbackMapper feedbackMapper;
  private final ActiveVisitorService activeVisitorService;
  private final RedisMonitorService redisMonitorService;
  private final SystemMetricsService systemMetricsService;
  private final DatabaseMetricsService databaseMetricsService;
  private final HttpMetricsService httpMetricsService;
  private final PasswordService passwordService;
  private final AdminAuditService adminAuditService;
  private final AdminSecurityProperties adminSecurityProperties;
  private final AuthSecurityProperties authSecurityProperties;
  private final long startedAt = System.currentTimeMillis();
  @org.springframework.beans.factory.annotation.Value("${studyroom.feedback.retention-enabled:false}")
  private boolean feedbackRetentionEnabled;

  public AdminService(
      UserMapper userMapper,
      DailyStatMapper dailyStatMapper,
      PostMapper postMapper,
      FeedbackMapper feedbackMapper,
      ActiveVisitorService activeVisitorService,
      RedisMonitorService redisMonitorService,
      SystemMetricsService systemMetricsService,
      DatabaseMetricsService databaseMetricsService,
      HttpMetricsService httpMetricsService,
      PasswordService passwordService,
      AdminAuditService adminAuditService,
      AdminSecurityProperties adminSecurityProperties,
      AuthSecurityProperties authSecurityProperties
  ) {
    this.userMapper = userMapper;
    this.dailyStatMapper = dailyStatMapper;
    this.postMapper = postMapper;
    this.feedbackMapper = feedbackMapper;
    this.activeVisitorService = activeVisitorService;
    this.redisMonitorService = redisMonitorService;
    this.systemMetricsService = systemMetricsService;
    this.databaseMetricsService = databaseMetricsService;
    this.httpMetricsService = httpMetricsService;
    this.passwordService = passwordService;
    this.adminAuditService = adminAuditService;
    this.adminSecurityProperties = adminSecurityProperties;
    this.authSecurityProperties = authSecurityProperties;
  }

  public AdminDashboardResponse dashboard() {
    long started = System.nanoTime();
    AdminDashboardResponse response = new AdminDashboardResponse();
    LocalDateTime todayStart = LocalDate.now().atStartOfDay();

    response.setOnlineUsers(activeVisitorService.activeCount());
    response.setTodayPosts(postMapper.selectCount(new LambdaQueryWrapper<Post>()
        .ge(Post::getCreatedAt, todayStart)
        .eq(Post::getDeletedByUser, 0)
        .eq(Post::getDeletedByAdmin, 0)));
    response.setPendingFeedback(feedbackMapper.selectCount(new LambdaQueryWrapper<Feedback>()
        .in(Feedback::getStatus, "PENDING", "PROCESSING")));
    response.setCpuUsage(cpuUsage());
    response.setJvmMemoryUsage(jvmMemoryUsage());
    response.setSystemMemoryUsage(systemMemoryUsage());
    response.setUptime(uptime());

    SystemMetrics systemMetrics = systemMetricsService.metrics();
    response.setDiskIoUsage(systemMetrics.getDiskIoUsage());
    response.setDiskReadRate(systemMetrics.getDiskReadRate());
    response.setDiskWriteRate(systemMetrics.getDiskWriteRate());
    response.setNetworkReceiveRate(systemMetrics.getNetworkReceiveRate());
    response.setNetworkTransmitRate(systemMetrics.getNetworkTransmitRate());
    response.setDiskFreeSpace(systemMetrics.getDiskFreeSpace());
    response.setDiskTotalSpace(systemMetrics.getDiskTotalSpace());
    response.setDiskUsage(systemMetrics.getDiskUsage());
    response.setProjectSize(systemMetrics.getProjectSize());
    response.setGcCount(systemMetrics.getGcCount());
    response.setGcTimeMs(systemMetrics.getGcTimeMs());
    response.setActiveThreads(systemMetrics.getActiveThreads());
    response.setPeakThreads(systemMetrics.getPeakThreads());

    DatabaseMetrics databaseMetrics = databaseMetricsService.metrics();
    response.setDbActiveConnections(databaseMetrics.getActiveConnections());
    response.setDbIdleConnections(databaseMetrics.getIdleConnections());
    response.setDbTotalConnections(databaseMetrics.getTotalConnections());
    response.setDbThreadsAwaitingConnection(databaseMetrics.getThreadsAwaitingConnection());
    response.setDbStatus(databaseMetrics.getStatus());

    response.setSlowQueryCount(httpMetricsService.getSlowQueryCount());
    response.setRecentSlowQueryCount(httpMetricsService.getRecentSlowQueryCount());
    response.setRequestCount(httpMetricsService.getRequestCount());
    response.setRequestsPerMinute(httpMetricsService.getRequestsPerMinute());
    response.setQps(httpMetricsService.getQps());
    response.setHttp4xxCount(httpMetricsService.getHttp4xxCount());
    response.setHttp5xxCount(httpMetricsService.getHttp5xxCount());
    response.setHttpErrorRate(httpMetricsService.getHttpErrorRate());

    RedisMetrics redisMetrics = redisMonitorService.metrics();
    response.setRedisHitRate(redisMetrics.getHitRate());
    response.setRedisHits(redisMetrics.getHits());
    response.setRedisMisses(redisMetrics.getMisses());
    response.setRedisLatencyMs(redisMetrics.getLatencyMs());
    response.setRedisStatus(redisMetrics.getStatus());
    response.setApiLatencyMs((int) Math.max(1, (System.nanoTime() - started) / 1_000_000));
    response.setSystemStatus(systemStatus(response));
    return response;
  }

  public List<AdminUserResponse> users() {
    activeVisitorService.markInactiveUsersOffline();
    List<User> users = userMapper.selectList(new LambdaQueryWrapper<User>()
        .eq(User::getDeleted, 0)
        .orderByDesc(User::getCreatedAt));
    return userResponses(users);
  }

  public List<AdminUserResponse> usersByIds(List<Long> ids) {
    return ids.isEmpty() ? List.of() : userResponses(userMapper.selectBatchIds(ids));
  }

  private List<AdminUserResponse> userResponses(List<User> users) {
    if (users.isEmpty()) return List.of();
    Map<Long, DailyStat> todayStats = dailyStatMapper.selectList(new LambdaQueryWrapper<DailyStat>()
            .in(DailyStat::getUserId, users.stream().map(User::getId).toList())
            .eq(DailyStat::getStatDate, LocalDate.now(java.time.ZoneId.of("Asia/Shanghai"))))
        .stream()
        .collect(Collectors.toMap(DailyStat::getUserId, Function.identity(), (left, right) -> left));

    List<AdminUserResponse> responses = new ArrayList<>();
    for (User user : users) {
      AdminUserResponse response = new AdminUserResponse();
      response.setId(user.getId());
      response.setUsername(user.getUsername());
      response.setNickname(user.getNickname());
      response.setUserType(user.getUserType());
      response.setOnlineStatus(normalizeOnlineStatus(user.getOnlineStatus()));
      DailyStat stat = todayStats.get(user.getId());
      response.setTodayFocusMinutes(stat == null || stat.getFocusMinutes() == null ? 0 : stat.getFocusMinutes());
      responses.add(response);
    }
    return responses;
  }

  @Transactional
  public void updateUserType(User actor, Long userId, String userType, AdminAuditContext auditContext) {
    String normalized = normalize(userType);
    if (!USER_TYPES.contains(normalized)) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, "用户类型不正确");
    }
    User user = userMapper.selectById(userId);
    if (user == null || Integer.valueOf(1).equals(user.getDeleted())) {
      throw new BusinessException("用户不存在");
    }
    if (actor.getId().equals(userId) && !"ADMIN".equals(normalized)) {
      throw new BusinessException(ErrorCode.ADMIN_FORBIDDEN, "管理员不能降级或封禁自己。");
    }
    if ("ADMIN".equalsIgnoreCase(user.getUserType()) && !"ADMIN".equals(normalized)
        && adminSecurityProperties.getProtectedAdminId() == null && authSecurityProperties.isProductionMode()) {
      throw new BusinessException(ErrorCode.ADMIN_FORBIDDEN, "生产环境尚未配置受保护管理员 ID。");
    }
    if (adminSecurityProperties.getProtectedAdminId() != null
        && adminSecurityProperties.getProtectedAdminId().equals(userId) && !"ADMIN".equals(normalized)) {
      throw new BusinessException(ErrorCode.ADMIN_FORBIDDEN, "受保护管理员不能降级或封禁。");
    }
    String previous = user.getUserType();
    String loginVersion = UUID.randomUUID().toString();
    userMapper.update(null, new LambdaUpdateWrapper<User>()
        .eq(User::getId, userId)
        .set(User::getUserType, normalized)
        .set(User::getLoginVersion, loginVersion));
    adminAuditService.success(actor.getId(), "USER_TYPE_UPDATED", "user", userId,
        Map.of("userType", previous), Map.of("userType", normalized), auditContext);
  }

  @Transactional
  public void updatePassword(User actor, Long userId, String password, AdminAuditContext auditContext) {
    User user = userMapper.selectById(userId);
    if (user == null || Integer.valueOf(1).equals(user.getDeleted())) {
      throw new BusinessException("用户不存在");
    }
    validatePassword(password);
    userMapper.update(null, new LambdaUpdateWrapper<User>().eq(User::getId,userId)
        .set(User::getPasswordHash,passwordService.encode(password)).set(User::getForcePasswordChange,1)
        .set(User::getPasswordChangedAt,LocalDateTime.now()).set(User::getLoginVersion,UUID.randomUUID().toString()));
    adminAuditService.success(actor.getId(), "USER_PASSWORD_RESET", "user", userId,
        Map.of(), Map.of("status", "PASSWORD_RESET_REQUIRED"), auditContext);
  }

  private void validatePassword(String password) {
    passwordService.validateNewPassword(password);
  }

  public List<AdminPostResponse> posts() {
    List<Post> posts = postMapper.selectList(new LambdaQueryWrapper<Post>()
        .eq(Post::getDeletedByUser, 0)
        .eq(Post::getDeletedByAdmin, 0)
        .orderByDesc(Post::getCreatedAt)
        .last("LIMIT 100"));
    Map<Long, User> users = userMap(posts.stream().map(Post::getUserId).collect(Collectors.toSet()));
    return posts.stream().map(post -> toPostResponse(post, users.get(post.getUserId()))).collect(Collectors.toList());
  }

  public List<AdminPostResponse> postsByIds(List<Long> ids) {
    if(ids.isEmpty())return List.of();
    List<Post> rows=postMapper.selectBatchIds(ids);
    Map<Long,User> users=userMap(rows.stream().map(Post::getUserId).collect(Collectors.toSet()));
    return rows.stream().map(row->toPostResponse(row,users.get(row.getUserId()))).toList();
  }

  public List<AdminFeedbackResponse> feedbackByIds(List<Long> ids) {
    if(ids.isEmpty())return List.of();
    List<Feedback> rows=feedbackMapper.selectBatchIds(ids);
    Map<Long,User> users=userMap(rows.stream().map(Feedback::getUserId).collect(Collectors.toSet()));
    return rows.stream().map(row->toFeedbackResponse(row,users.get(row.getUserId()))).toList();
  }

  @Transactional
  public void deletePost(User actor, Long postId, String reason, AdminAuditContext auditContext) {
    if(postDeletion!=null){
      if(postDeletion.delete(actor,postId,true,StringUtils.hasText(reason)?reason:"管理员强制删除"))
        adminAuditService.success(actor.getId(),"POST_FORCE_DELETED","post",postId,Map.of("status","NOT_ADMIN_DELETED"),Map.of("status","ADMIN_DELETED"),auditContext);
      return;
    }
    Post post = postMapper.selectById(postId);
    if (post == null) {
      throw new BusinessException("动态不存在");
    }
    postMapper.update(null, new LambdaUpdateWrapper<Post>()
        .eq(Post::getId, postId)
        .set(Post::getDeletedByAdmin, 1)
        .set(Post::getDeleteReason, StringUtils.hasText(reason) ? reason : "管理员强制删除"));
    adminAuditService.success(actor.getId(), "POST_FORCE_DELETED", "post", postId,
        Map.of("status", "VISIBLE"), Map.of("status", "ADMIN_DELETED"), auditContext);
  }

  public List<AdminFeedbackResponse> feedback() {
    List<Feedback> items = feedbackMapper.selectList(new LambdaQueryWrapper<Feedback>()
        .orderByAsc(Feedback::getStatus)
        .orderByDesc(Feedback::getCreatedAt)
        .last("LIMIT 100"));
    Map<Long, User> users = userMap(items.stream().map(Feedback::getUserId).collect(Collectors.toSet()));
    return items.stream().map(item -> toFeedbackResponse(item, users.get(item.getUserId()))).collect(Collectors.toList());
  }

  @Transactional
  public void updateFeedbackStatus(User actor, Long id, String status, AdminAuditContext auditContext) {
    String normalized = normalize(status);
    if (!FEEDBACK_STATUSES.contains(normalized)) {
      throw new BusinessException("反馈状态不正确");
    }
    Feedback feedback = feedbackMapper.selectById(id);
    if (feedback == null) {
      throw new BusinessException("反馈不存在");
    }
    feedbackMapper.update(null, new LambdaUpdateWrapper<Feedback>()
        .eq(Feedback::getId, id)
        .set(Feedback::getStatus, normalized)
        .set(Feedback::getUpdatedAt, LocalDateTime.now()));
    adminAuditService.success(actor.getId(), "FEEDBACK_STATUS_UPDATED", "feedback", id,
        Map.of("feedbackStatus", feedback.getStatus()), Map.of("feedbackStatus", normalized), auditContext);
  }

  @Transactional
  public void deleteFeedback(User actor, Long id, AdminAuditContext auditContext) {
    Feedback feedback = feedbackMapper.selectById(id);
    if (feedback == null) {
      throw new BusinessException("反馈不存在");
    }
    feedbackMapper.deleteById(id);
    adminAuditService.success(actor.getId(), "FEEDBACK_DELETED", "feedback", id,
        Map.of("feedbackStatus", feedback.getStatus()), Map.of("status", "DELETED"), auditContext);
  }

  private Map<Long, User> userMap(Set<Long> ids) {
    if (ids == null || ids.isEmpty()) {
      return Map.of();
    }
    return userMapper.selectList(new LambdaQueryWrapper<User>().in(User::getId, ids))
        .stream()
        .collect(Collectors.toMap(User::getId, Function.identity(), (left, right) -> left));
  }

  private AdminPostResponse toPostResponse(Post post, User user) {
    AdminPostResponse response = new AdminPostResponse();
    response.setId(post.getId());
    response.setAuthor(user == null ? "未知用户" : user.getNickname());
    response.setContent(post.getContent());
    response.setSceneName(sceneName(post.getSceneCode()));
    response.setLikeCount(zero(post.getLikeCount()));
    response.setCommentCount(zero(post.getCommentCount()));
    response.setCreatedAt(post.getCreatedAt() == null ? "" : post.getCreatedAt().format(DATE_TIME_FORMATTER));
    return response;
  }

  private AdminFeedbackResponse toFeedbackResponse(Feedback feedback, User user) {
    AdminFeedbackResponse response = new AdminFeedbackResponse();
    response.setId(feedback.getId());
    response.setAuthor(user == null ? "未知用户" : user.getNickname());
    response.setFeedbackType(feedback.getFeedbackType());
    response.setTitle(feedback.getTitle());
    response.setContent(feedback.getContent());
    response.setStatus(feedback.getStatus());
    response.setCreatedAt(feedback.getCreatedAt() == null ? "" : feedback.getCreatedAt().format(DATE_TIME_FORMATTER));
    response.setUpdatedAt(feedback.getUpdatedAt() == null ? "" : feedback.getUpdatedAt().format(DATE_TIME_FORMATTER));
    if (feedbackRetentionEnabled && Set.of("RECORDED", "RESOLVED").contains(normalize(feedback.getStatus())) && feedback.getUpdatedAt() != null) {
      response.setAutoDeleteAt(feedback.getUpdatedAt().plusDays(7).format(DATE_TIME_FORMATTER));
    } else {
      response.setAutoDeleteAt("");
    }
    return response;
  }

  private Integer cpuUsage() {
    java.lang.management.OperatingSystemMXBean bean = ManagementFactory.getOperatingSystemMXBean();
    if (bean instanceof com.sun.management.OperatingSystemMXBean) {
      double value = ((com.sun.management.OperatingSystemMXBean) bean).getSystemCpuLoad();
      if (value >= 0) return percent(value);
    }
    return 0;
  }

  private Integer systemMemoryUsage() {
    java.lang.management.OperatingSystemMXBean bean = ManagementFactory.getOperatingSystemMXBean();
    if (bean instanceof com.sun.management.OperatingSystemMXBean) {
      com.sun.management.OperatingSystemMXBean os = (com.sun.management.OperatingSystemMXBean) bean;
      long total = os.getTotalPhysicalMemorySize();
      long free = os.getFreePhysicalMemorySize();
      if (total > 0) return percent((double) (total - free) / total);
    }
    return 0;
  }

  private Integer jvmMemoryUsage() {
    Runtime runtime = Runtime.getRuntime();
    long max = runtime.maxMemory();
    long used = runtime.totalMemory() - runtime.freeMemory();
    if (max <= 0) return 0;
    return percent((double) used / max);
  }

  private String uptime() {
    Duration duration = Duration.ofMillis(System.currentTimeMillis() - startedAt);
    long days = duration.toDays();
    long hours = duration.minusDays(days).toHours();
    long minutes = duration.minusDays(days).minusHours(hours).toMinutes();
    if (days > 0) return days + " 天 " + hours + " 小时";
    if (hours > 0) return hours + " 小时 " + minutes + " 分钟";
    return Math.max(1, minutes) + " 分钟";
  }

  private String systemStatus(AdminDashboardResponse response) {
    boolean busy = atLeast(response.getCpuUsage(), 85)
        || atLeast(response.getSystemMemoryUsage(), 85)
        || atLeast(response.getDiskUsage(), 90)
        || atLeast(response.getHttpErrorRate(), 20)
        || !"CONNECTED".equalsIgnoreCase(response.getRedisStatus())
        || "WAITING".equalsIgnoreCase(response.getDbStatus());
    return busy ? "BUSY" : "STABLE";
  }

  private boolean atLeast(Integer value, int threshold) {
    return value != null && value >= threshold;
  }

  private int percent(double value) {
    return (int) Math.max(0, Math.min(100, Math.round(value * 100)));
  }

  private int zero(Integer value) {
    return value == null ? 0 : value;
  }

  private String normalize(String value) {
    return value == null ? "" : value.trim().toUpperCase();
  }

  private String normalizeOnlineStatus(String value) {
    String normalized = normalize(value);
    if ("ONLINE".equals(normalized)) return "IDLE";
    return ONLINE_STATUSES.contains(normalized) ? normalized : "OFFLINE";
  }

  private String sceneName(String code) {
    if (code == null) return "高山湖泊";
    switch (code) {
      case "beach":
        return "海边沙滩";
      case "forest":
        return "森林";
      case "library":
        return "图书馆";
      case "cafe":
        return "雨天咖啡馆";
      case "snow":
      case "snow-window":
        return "雪山窗边";
      case "custom":
        return "自定义";
      case "mountain":
      default:
        return "高山湖泊";
    }
  }
}

