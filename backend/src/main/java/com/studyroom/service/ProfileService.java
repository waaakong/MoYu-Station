package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.studyroom.common.BusinessException;
import com.studyroom.common.ErrorCode;
import com.studyroom.dto.FeedbackRequest;
import com.studyroom.dto.ProfileCalendarDayResponse;
import com.studyroom.dto.ProfilePostResponse;
import com.studyroom.dto.ProfileStatsResponse;
import com.studyroom.dto.ShareCardResponse;
import com.studyroom.dto.UpdateNicknameRequest;
import com.studyroom.dto.UpdateOwnPasswordRequest;
import com.studyroom.dto.UserProfileResponse;
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
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpSession;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ProfileService {
  private com.studyroom.activity.ActivityLedger activity;
  @org.springframework.beans.factory.annotation.Autowired(required=false)
  public void setActivity(com.studyroom.activity.ActivityLedger value){activity=value;}
  private static final java.time.ZoneId STAT_ZONE=java.time.ZoneId.of("Asia/Shanghai");
  private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
  private static final long MAX_AVATAR_SIZE = 2 * 1024 * 1024;

  private final AuthService authService;
  private final UserMapper userMapper;
  private final DailyStatMapper dailyStatMapper;
  private final PostMapper postMapper;
  private final FeedbackMapper feedbackMapper;
  private final ImageStorageService imageStorageService;
  private final PasswordService passwordService;

  public ProfileService(
      AuthService authService,
      UserMapper userMapper,
      DailyStatMapper dailyStatMapper,
      PostMapper postMapper,
      FeedbackMapper feedbackMapper,
      ImageStorageService imageStorageService,
      PasswordService passwordService
  ) {
    this.authService = authService;
    this.userMapper = userMapper;
    this.dailyStatMapper = dailyStatMapper;
    this.postMapper = postMapper;
    this.feedbackMapper = feedbackMapper;
    this.imageStorageService = imageStorageService;
    this.passwordService = passwordService;
  }

  public UserProfileResponse profile(User user) {
    return authService.toProfileResponse(user);
  }

  public UserProfileResponse updateNickname(User user, UpdateNicknameRequest request) {
    String nickname = request.getNickname() == null ? "" : request.getNickname().trim();
    if (nickname.length() < 2 || nickname.length() > 20) {
      throw new BusinessException("昵称长度需要在 2 到 20 个字符之间");
    }
    userMapper.update(null, new LambdaUpdateWrapper<User>()
        .eq(User::getId, user.getId())
        .set(User::getNickname, nickname));
    user.setNickname(nickname);
    return authService.toProfileResponse(user);
  }

  public UserProfileResponse updateAvatar(User user, MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new BusinessException("???????");
    }
    if (file.getSize() > MAX_AVATAR_SIZE) {
      throw new BusinessException("???????? 2MB");
    }
    avatarExtension(file);
    String oldAvatarUrl = user.getAvatarUrl();
    try {
      ImageStorageService.StoredImage storedImage = imageStorageService.saveDisplayImage(
          file,
          user.getId(),
          Path.of("avatars", String.valueOf(user.getId())),
          "/uploads/avatars/" + user.getId(),
          "avatar-" + System.currentTimeMillis(),
          320,
          320,
          0.86F
      );
      String avatarUrl = storedImage.displayUrl();
      userMapper.update(null, new LambdaUpdateWrapper<User>()
          .eq(User::getId, user.getId())
          .set(User::getAvatarUrl, avatarUrl));
      user.setAvatarUrl(avatarUrl);
      deleteOldAvatar(oldAvatarUrl, avatarUrl);
      return authService.toProfileResponse(user);
    } catch (IOException exception) {
      throw new BusinessException("????????????");
    }
  }

  public void updateOwnPassword(User user, UpdateOwnPasswordRequest request, HttpSession session) {
    String oldPassword = request.getOldPassword();
    String newPassword = request.getNewPassword();
    if (!StringUtils.hasText(oldPassword)) {
      throw new BusinessException(ErrorCode.PASSWORD_CURRENT_INVALID, "当前密码不正确");
    }
    passwordService.validateNewPassword(newPassword);
    if (oldPassword.equals(newPassword)) {
      throw new BusinessException(ErrorCode.PASSWORD_REUSE_FORBIDDEN, "新密码不能和当前密码相同");
    }
    if (!passwordService.matches(oldPassword, user.getPasswordHash())) {
      throw new BusinessException(ErrorCode.PASSWORD_CURRENT_INVALID, "当前密码不正确");
    }
    String loginVersion = UUID.randomUUID().toString();
    String encoded = passwordService.encode(newPassword);
    LocalDateTime changedAt = LocalDateTime.now();
    var condition = new LambdaUpdateWrapper<User>().eq(User::getId,user.getId()).eq(User::getDeleted,0)
        .eq(User::getPasswordHash,user.getPasswordHash());
    if(user.getLoginVersion()==null)condition.isNull(User::getLoginVersion);else condition.eq(User::getLoginVersion,user.getLoginVersion());
    condition.set(User::getPasswordHash,encoded).set(User::getForcePasswordChange,0)
        .set(User::getPasswordChangedAt,changedAt).set(User::getLoginVersion,loginVersion);
    if(userMapper.update(null,condition)!=1)throw new BusinessException(ErrorCode.AUTH_SESSION_EXPIRED,"账号状态已变化，本次未修改密码，请重新登录。");
    user.setPasswordHash(encoded);
    user.setForcePasswordChange(0);
    user.setPasswordChangedAt(changedAt);
    user.setLoginVersion(loginVersion);
    session.setAttribute(AuthService.SESSION_LOGIN_VERSION, loginVersion);
  }

  public ProfileStatsResponse stats(User user) {
    return stats(user,LocalDate.now(STAT_ZONE));
  }
  private ProfileStatsResponse stats(User user,LocalDate today) {
    List<DailyStat> records = dailyStatMapper.selectList(new LambdaQueryWrapper<DailyStat>()
        .eq(DailyStat::getUserId, user.getId())
        .orderByDesc(DailyStat::getStatDate));

    DailyStat todayRecord = records.stream()
        .filter(record -> today.equals(record.getStatDate()))
        .findFirst()
        .orElse(null);

    var ledger=activity==null?Map.<LocalDate,com.studyroom.activity.ActivityLedger.Day>of():activity.days(user.getId());
    var linked=activity==null?Map.<LocalDate,Integer>of():activity.linkedFocus(user.getId());
    var dates=new java.util.TreeSet<LocalDate>(ledger.keySet());records.forEach(record->dates.add(record.getStatDate()));
    Map<LocalDate,DailyStat> legacy=records.stream().collect(Collectors.toMap(DailyStat::getStatDate,r->r,(a,b)->a));
    int totalFocusMinutes=dates.stream().filter(date->!date.isAfter(today)).mapToInt(date->{var record=legacy.get(date);return zero(com.studyroom.activity.ActivityView.of(record==null?null:record.getFocusMinutes(),linked.getOrDefault(date,0),ledger.get(date)).focusMinutes());}).sum();
    var metrics=com.studyroom.activity.ActivityView.of(todayRecord==null?null:todayRecord.getFocusMinutes(),linked.getOrDefault(today,0),ledger.get(today));

    ProfileStatsResponse response = new ProfileStatsResponse();
    response.setTodayFocusMinutes(metrics.focusMinutes());
    response.setFishMinutes(metrics.fishMinutes());
    response.setOnlineMinutes(metrics.onlineMinutes());
    response.setCoverage(metrics.coverage());
    response.setFishTimingBasis(metrics.fishTimingBasis());
    int streak=0;
    for(LocalDate day=today;dates.contains(day);day=day.minusDays(1)){
      var record=legacy.get(day);
      var daily=com.studyroom.activity.ActivityView.of(record==null?null:record.getFocusMinutes(),linked.getOrDefault(day,0),ledger.get(day));
      if(zero(daily.focusMinutes())<=0)break;
      streak++;
    }
    response.setStreakDays(streak);
    response.setFavoriteScene(sceneName(favoriteSceneCode(records,today)));
    response.setTotalFocusHours(BigDecimal.valueOf(totalFocusMinutes)
        .divide(BigDecimal.valueOf(60), 1, RoundingMode.HALF_UP));
    response.setFakeEffortIndex(metrics.index());
    return response;
  }

  public List<ProfileCalendarDayResponse> calendar(User user, String month) {
    YearMonth yearMonth = parseMonth(month);
    LocalDate start = yearMonth.atDay(1);
    LocalDate end = yearMonth.atEndOfMonth();
    List<DailyStat> records = dailyStatMapper.selectList(new LambdaQueryWrapper<DailyStat>()
        .eq(DailyStat::getUserId, user.getId())
        .between(DailyStat::getStatDate, start, end));
    Map<LocalDate, DailyStat> byDate = records.stream()
        .collect(Collectors.toMap(DailyStat::getStatDate, record -> record));

    List<ProfileCalendarDayResponse> days = new ArrayList<>();
    var ledger=activity==null?Map.<LocalDate,com.studyroom.activity.ActivityLedger.Day>of():activity.days(user.getId());
    var linked=activity==null?Map.<LocalDate,Integer>of():activity.linkedFocus(user.getId());
    for (int day = 1; day <= end.getDayOfMonth(); day++) {
      LocalDate date = yearMonth.atDay(day);
      DailyStat record = byDate.get(date);
      ProfileCalendarDayResponse response = new ProfileCalendarDayResponse();
      response.setDate(date.toString());
      var metrics=com.studyroom.activity.ActivityView.of(record==null?null:record.getFocusMinutes(),linked.getOrDefault(date,0),ledger.get(date));
      if(date.isAfter(LocalDate.now(STAT_ZONE)))metrics=com.studyroom.activity.ActivityView.of(null,0,null);
      response.setFocusMinutes(metrics.focusMinutes());response.setOnlineMinutes(metrics.onlineMinutes());response.setFishMinutes(metrics.fishMinutes());
      response.setFakeEffortIndex(metrics.index());response.setCoverage(metrics.coverage());
      response.setFishTimingBasis(metrics.fishTimingBasis());
      response.setStatus(zero(metrics.focusMinutes())>0?"FOCUS":zero(metrics.fishMinutes())>0?"FISH":"EMPTY");
      days.add(response);
    }
    return days;
  }

  public List<ProfilePostResponse> posts(User user) {
    return postMapper.selectList(new LambdaQueryWrapper<Post>()
            .eq(Post::getUserId, user.getId())
            .eq(Post::getDeletedByUser, 0)
            .eq(Post::getDeletedByAdmin, 0)
            .orderByDesc(Post::getCreatedAt)
            .last("LIMIT 50"))
        .stream()
        .map(this::toPostResponse)
        .collect(Collectors.toList());
  }

  public void deleteOwnPost(User user, Long postId) {
    Post post = postMapper.selectById(postId);
    if (post == null || !user.getId().equals(post.getUserId())) {
      throw new BusinessException("动态不存在或无权删除");
    }
    postMapper.update(null, new LambdaUpdateWrapper<Post>()
        .eq(Post::getId, postId)
        .eq(Post::getUserId, user.getId())
        .set(Post::getDeletedByUser, 1)
        .set(Post::getDeleteReason, "用户自行删除"));
  }

  public ShareCardResponse shareCard(User user) {
    return shareCard(user,null);
  }
  public ShareCardResponse shareCard(User user,String selectedDate) {
    LocalDate today=LocalDate.now(STAT_ZONE);
    if(selectedDate!=null){
      try{if(!selectedDate.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))throw new IllegalArgumentException();
        LocalDate date=LocalDate.parse(selectedDate);if(date.isAfter(today)||date.isBefore(LocalDate.of(2000,1,1)))throw new IllegalArgumentException();today=date;
      }catch(RuntimeException error){throw new BusinessException("请选择有效且不晚于今天的日期。");}
    }
    ProfileStatsResponse stats = stats(user,today);
    ShareCardResponse response = new ShareCardResponse();
    response.setTitle(today.equals(LocalDate.now(STAT_ZONE))?"今日学习报告":"学习报告");
    response.setCoverage(stats.getCoverage());
    response.setStatDate(today.toString());
    response.setTimeZone(STAT_ZONE.getId());
    response.setFocusMinutes(stats.getTodayFocusMinutes());
    response.setFishMinutes(stats.getFishMinutes());
    response.setFakeEffortIndex(stats.getFakeEffortIndex());
    response.setFishTimingBasis(stats.getFishTimingBasis());
    response.setFavoriteScene(stats.getFavoriteScene());
    response.setQuote("把时间调成适合自己的样子。");
    return response;
  }

  public Long submitFeedback(User user, FeedbackRequest request) {
    Feedback feedback = new Feedback();
    feedback.setUserId(user.getId());
    feedback.setFeedbackType(StringUtils.hasText(request.getFeedbackType()) ? request.getFeedbackType() : "SUGGESTION");
    feedback.setTitle(request.getTitle());
    feedback.setContent(request.getContent());
    feedback.setStatus("PENDING");
    feedbackMapper.insert(feedback);
    return feedback.getId();
  }

  private ProfilePostResponse toPostResponse(Post post) {
    ProfilePostResponse response = new ProfilePostResponse();
    response.setId(post.getId());
    response.setContent(post.getContent());
    response.setSceneName(sceneName(post.getSceneCode()));
    response.setLikeCount(zero(post.getLikeCount()));
    response.setCommentCount(zero(post.getCommentCount()));
    response.setCreatedAt(post.getCreatedAt() == null ? "" : post.getCreatedAt().format(DATE_TIME_FORMATTER));
    return response;
  }

  private int streakDays(List<DailyStat> records, LocalDate today) {
    Map<LocalDate, DailyStat> byDate = records.stream()
        .collect(Collectors.toMap(DailyStat::getStatDate, record -> record, (left, right) -> left));
    int streak = 0;
    LocalDate cursor = today;
    while (true) {
      DailyStat record = byDate.get(cursor);
      if (record == null || zero(record.getFocusMinutes()) <= 0) break;
      streak++;
      cursor = cursor.minusDays(1);
    }
    return streak;
  }

  private String favoriteSceneCode(List<DailyStat> records,LocalDate today) {
    LocalDate since = today.minusDays(6);
    Map<String, Integer> weights = new LinkedHashMap<>();
    records.stream()
        .filter(record -> record.getStatDate() != null && !record.getStatDate().isBefore(since) && !record.getStatDate().isAfter(today))
        .filter(record -> StringUtils.hasText(record.getFavoriteSceneCode()))
        .forEach(record -> weights.merge(record.getFavoriteSceneCode(), zero(record.getFocusMinutes()), Integer::sum));
    return weights.entrySet().stream()
        .max(Comparator.comparingInt(Map.Entry::getValue))
        .map(Map.Entry::getKey)
        .orElse(null);
  }

  private String dayStatus(DailyStat record) {
    if (record == null) return "EMPTY";
    if (zero(record.getFocusMinutes()) > 0) return "FOCUS";
    if (zero(record.getSlackMinutes()) > 0) return "FISH";
    return "EMPTY";
  }

  private String sceneName(String code) {
    if (!StringUtils.hasText(code)) return null;
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
        return "高山湖泊";
      default:
        return "未知场景";
    }
  }

  private int zero(Integer value) {
    return value == null ? 0 : value;
  }

  private YearMonth parseMonth(String month) {
    if (!StringUtils.hasText(month)) {
      return YearMonth.now(STAT_ZONE);
    }
    try {
      return YearMonth.parse(month);
    } catch (RuntimeException exception) {
      throw new BusinessException("月份格式无效，请使用 YYYY-MM。");
    }
  }

  private String avatarExtension(MultipartFile file) {
    return imageExtension(file, "头像仅支持 JPG、PNG 或 WebP 图片");
  }

  private void deleteOldAvatar(String oldAvatarUrl, String newAvatarUrl) {
    if (!StringUtils.hasText(oldAvatarUrl) || oldAvatarUrl.equals(newAvatarUrl)) {
      return;
    }
    imageStorageService.deleteDisplayAndOriginal(oldAvatarUrl);
  }

  private String imageExtension(MultipartFile file, String errorMessage) {
    String contentType = file.getContentType();
    if ("image/jpeg".equalsIgnoreCase(contentType) || "image/jpg".equalsIgnoreCase(contentType)) {
      return "jpg";
    }
    if ("image/png".equalsIgnoreCase(contentType)) {
      return "png";
    }
    if ("image/webp".equalsIgnoreCase(contentType)) {
      return "webp";
    }
    throw new BusinessException(errorMessage);
  }
}
