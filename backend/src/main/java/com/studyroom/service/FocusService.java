package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.studyroom.common.BusinessException;
import com.studyroom.dto.CompleteFocusRequest;
import com.studyroom.dto.FocusCheckinResponse;
import com.studyroom.dto.FocusOverviewResponse;
import com.studyroom.dto.FocusRecordResponse;
import com.studyroom.dto.FocusSyncItemResponse;
import com.studyroom.dto.FocusSyncRecordRequest;
import com.studyroom.dto.FocusSyncRequest;
import com.studyroom.dto.FocusSyncResponse;
import com.studyroom.dto.StartFocusRequest;
import com.studyroom.dto.UserAudioResponse;
import com.studyroom.entity.CheckinRecord;
import com.studyroom.entity.DailyStat;
import com.studyroom.entity.FocusRecord;
import com.studyroom.entity.User;
import com.studyroom.entity.UserAudio;
import com.studyroom.mapper.CheckinRecordMapper;
import com.studyroom.mapper.DailyStatMapper;
import com.studyroom.mapper.FocusRecordMapper;
import com.studyroom.mapper.UserAudioMapper;
import com.studyroom.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class FocusService {
  private com.studyroom.activity.ActivityLedger activity;
  @org.springframework.beans.factory.annotation.Autowired(required=false)
  public void setActivity(com.studyroom.activity.ActivityLedger value){activity=value;}
  private static final Set<String> SCENE_CODES = Set.of(
      "mountain", "beach", "forest", "library", "cafe", "snow", "custom"
  );
  private static final Set<String> TIME_KEYS = Set.of(
      "morning", "forenoon", "noon", "afternoon", "dusk", "night", "midnight"
  );
  private static final List<DrawResult> FORTUNES = List.of(
      new DrawResult("上上签 · 专注自明", "适合把最重要的一件事放在最前面，安静推进会比追赶速度更有效。"),
      new DrawResult("中吉 · 稳中有进", "今天的节奏不必很快。完成一轮，再决定下一轮，积累自然会出现。"),
      new DrawResult("小吉 · 静候花开", "先整理桌面与思绪，再开始手里的任务。清晰会替你省下很多力气。"),
      new DrawResult("平签 · 以恒为贵", "状态普通也没关系，守住约定的时间，本身就是今天的收获。")
  );
  private static final List<DrawResult> TAROTS = List.of(
      new DrawResult("隐者 · 向内聚焦", "减少外界噪声，给自己一段不被打断的时间，答案会在专注里变得清楚。"),
      new DrawResult("力量 · 温柔坚持", "真正的力量不是用力过猛，而是能把注意力一次次带回眼前。"),
      new DrawResult("星星 · 保持希望", "今天适合启动一个拖延已久的小目标，先完成最小的一步。"),
      new DrawResult("节制 · 找回节奏", "在专注和休息之间留出边界，稳定的节奏会让今天走得更远。")
  );

  private final UserMapper userMapper;
  private final FocusRecordMapper focusRecordMapper;
  private final CheckinRecordMapper checkinRecordMapper;
  private final DailyStatMapper dailyStatMapper;
  private final UserAudioMapper userAudioMapper;
  private final AudioStorageService audioStorageService;

  public FocusService(
      UserMapper userMapper,
      FocusRecordMapper focusRecordMapper,
      CheckinRecordMapper checkinRecordMapper,
      DailyStatMapper dailyStatMapper,
      UserAudioMapper userAudioMapper,
      AudioStorageService audioStorageService
  ) {
    this.userMapper = userMapper;
    this.focusRecordMapper = focusRecordMapper;
    this.checkinRecordMapper = checkinRecordMapper;
    this.dailyStatMapper = dailyStatMapper;
    this.userAudioMapper = userAudioMapper;
    this.audioStorageService = audioStorageService;
  }

  public FocusOverviewResponse overview(User user) {
    DailyStat today = dailyStatMapper.selectOne(new LambdaQueryWrapper<DailyStat>()
        .eq(DailyStat::getUserId, user.getId())
        .eq(DailyStat::getStatDate, LocalDate.now())
        .last("LIMIT 1"));
    FocusOverviewResponse response = new FocusOverviewResponse();
    response.setTodayFocusMinutes(today == null || today.getFocusMinutes() == null ? 0 : today.getFocusMinutes());
    applyLevel(response, user);
    response.setTodayCheckin(todayCheckin(user));
    response.setUserAudio(listAudio(user));
    return response;
  }

  @Transactional
  public FocusRecordResponse start(User user, StartFocusRequest request) {
    validateSceneAndTime(request.getSceneCode(), request.getTimeKey());
    int plannedMinutes = request.getPlannedMinutes() == null ? 25 : request.getPlannedMinutes();
    if (plannedMinutes < 1 || plannedMinutes > 180) {
      throw new BusinessException("专注时长需在 1 到 180 分钟之间。");
    }
    LocalDateTime now = LocalDateTime.now();
    FocusRecord record = new FocusRecord();
    record.setUserId(user.getId());
    record.setSceneCode(request.getSceneCode());
    record.setTimeKey(request.getTimeKey());
    record.setPlannedMinutes(plannedMinutes);
    record.setActualMinutes(0);
    record.setState("RUNNING");
    record.setStartedAt(now);
    record.setCreatedAt(now);
    record.setUpdatedAt(now);
    focusRecordMapper.insert(record);
    setOnlineStatus(user.getId(), "FOCUSING");
    return toRecordResponse(record);
  }

  @Transactional
  public FocusRecordResponse finish(User user, CompleteFocusRequest request) {
    FocusRecord record = ownedRecord(user, request.getRecordId());
    if ("COMPLETED".equalsIgnoreCase(record.getState())) {
      return toRecordResponse(record);
    }
    if ("CANCELED".equalsIgnoreCase(record.getState())) {
      throw new BusinessException("已取消的专注记录不能完成。");
    }
    int actualMinutes = minutesFromSeconds(request.getActualSeconds());
    LocalDateTime now = LocalDateTime.now();
    record.setActualMinutes(actualMinutes);
    record.setActualSeconds(Math.max(0, request.getActualSeconds() == null ? 0 : request.getActualSeconds()));
    record.setState("COMPLETED");
    record.setEndedAt(now);
    record.setUpdatedAt(now);
    focusRecordMapper.updateById(record);
    addDailyFocus(user.getId(), record.getSceneCode(), actualMinutes);
    setOnlineStatus(user.getId(), "IDLE");
    return toRecordResponse(record);
  }

  @Transactional
  public FocusRecordResponse cancel(User user, CompleteFocusRequest request) {
    FocusRecord record = ownedRecord(user, request.getRecordId());
    if (!"RUNNING".equalsIgnoreCase(record.getState()) && !"PAUSED".equalsIgnoreCase(record.getState())) {
      return toRecordResponse(record);
    }
    LocalDateTime now = LocalDateTime.now();
    record.setActualMinutes(minutesFromSeconds(request.getActualSeconds()));
    record.setActualSeconds(Math.max(0, request.getActualSeconds() == null ? 0 : request.getActualSeconds()));
    record.setState("CANCELED");
    record.setEndedAt(now);
    record.setUpdatedAt(now);
    focusRecordMapper.updateById(record);
    setOnlineStatus(user.getId(), "IDLE");
    return toRecordResponse(record);
  }

  @Transactional
  public FocusSyncResponse sync(User user, FocusSyncRequest request) {
    List<FocusSyncItemResponse> results = new ArrayList<>();
    for (FocusSyncRecordRequest item : request.getRecords()) {
      try {
        results.add(syncOne(user, item));
      } catch (BusinessException error) {
        results.add(FocusSyncItemResponse.of(item.getClientRecordId(), "rejected", null, error.getMessage()));
      }
    }
    return new FocusSyncResponse(results);
  }

  private FocusSyncItemResponse syncOne(User user, FocusSyncRecordRequest request) {
    validateSceneAndTime(request.getSceneCode(), request.getTimeKey());
    validateSyncTimes(request);
    FocusRecord existing = focusRecordMapper.selectOne(new LambdaQueryWrapper<FocusRecord>()
        .eq(FocusRecord::getUserId, user.getId())
        .eq(FocusRecord::getClientRecordId, request.getClientRecordId())
        .last("LIMIT 1"));
    if (existing != null) {
      return FocusSyncItemResponse.of(request.getClientRecordId(), "duplicate", existing.getId(), null);
    }
    if(request.getActivitySessionId()!=null && (activity==null || !activity.ownsStream(user.getId(),request.getActivitySessionId())))
      throw new BusinessException("活动账本尚未同步，请保留记录后重试。");

    int actualMinutes = minutesFromSeconds(request.getActualSeconds());
    FocusRecord record = new FocusRecord();
    record.setUserId(user.getId());
    record.setClientRecordId(request.getClientRecordId());
    record.setSceneCode(request.getSceneCode());
    record.setTimeKey(request.getTimeKey());
    record.setPlannedMinutes(request.getPlannedMinutes());
    record.setActualMinutes(actualMinutes);
    record.setActualSeconds(request.getActualSeconds());
    record.setState("COMPLETED");
    LocalDateTime startedAt = LocalDateTime.ofInstant(request.getStartedAt(), ZoneId.of("Asia/Shanghai"));
    LocalDateTime endedAt = LocalDateTime.ofInstant(request.getEndedAt(), ZoneId.of("Asia/Shanghai"));
    record.setStartedAt(startedAt);
    record.setEndedAt(endedAt);
    record.setCreatedAt(LocalDateTime.now());
    record.setUpdatedAt(LocalDateTime.now());
    try {
      focusRecordMapper.insert(record);
    } catch (DuplicateKeyException duplicate) {
      FocusRecord concurrent = focusRecordMapper.selectOne(new LambdaQueryWrapper<FocusRecord>()
          .eq(FocusRecord::getUserId, user.getId())
          .eq(FocusRecord::getClientRecordId, request.getClientRecordId())
          .last("LIMIT 1"));
      return FocusSyncItemResponse.of(request.getClientRecordId(), "duplicate", concurrent == null ? null : concurrent.getId(), null);
    }
    addDailyFocus(user.getId(), record.getSceneCode(), actualMinutes, startedAt.toLocalDate());
    if(request.getActivitySessionId()!=null)activity.linkFocus(user.getId(),request.getClientRecordId(),request.getActivitySessionId(),startedAt.toLocalDate(),actualMinutes);
    return FocusSyncItemResponse.of(request.getClientRecordId(), "accepted", record.getId(), null);
  }

  private void validateSyncTimes(FocusSyncRecordRequest request) {
    Instant now = Instant.now();
    if (request.getStartedAt().isAfter(now.plus(Duration.ofMinutes(5)))) {
      throw new BusinessException("开始时间不能晚于当前时间。");
    }
    if (request.getStartedAt().isBefore(now.minus(Duration.ofDays(365)))) {
      throw new BusinessException("仅支持导入最近 365 天的记录。");
    }
    if (request.getEndedAt().isBefore(request.getStartedAt())) {
      throw new BusinessException("结束时间不能早于开始时间。");
    }
    if (request.getActualSeconds() > request.getPlannedMinutes() * 60) {
      throw new BusinessException("实际专注时长不能超过计划时长。");
    }
    if (Duration.between(request.getStartedAt(), request.getEndedAt()).compareTo(Duration.ofDays(7)) > 0) {
      throw new BusinessException("单条记录的时间跨度不能超过 7 天。");
    }
  }

  public FocusCheckinResponse todayCheckin(User user) {
    CheckinRecord record = findTodayCheckin(user.getId());
    if (record == null) {
      FocusCheckinResponse response = new FocusCheckinResponse();
      response.setCheckedIn(false);
      response.setDate(LocalDate.now().toString());
      applyLevel(response, user);
      return response;
    }
    return toCheckinResponse(record);
  }

  @Transactional
  public FocusCheckinResponse checkin(User user, String drawType) {
    CheckinRecord existing = findTodayCheckin(user.getId());
    if (existing != null) {
      return toCheckinResponse(existing);
    }
    String normalizedType = String.valueOf(drawType).trim().toUpperCase(Locale.ROOT);
    List<DrawResult> source;
    if ("FORTUNE".equals(normalizedType)) {
      source = FORTUNES;
    } else if ("TAROT".equals(normalizedType)) {
      source = TAROTS;
    } else {
      throw new BusinessException("请选择抽签或塔罗牌签到。");
    }

    int index = Math.floorMod(user.getId() + LocalDate.now().toEpochDay() + normalizedType.hashCode(), source.size());
    DrawResult result = source.get(index);
    FocusLevelCalculator.LevelProgress progress =
        FocusLevelCalculator.addExperience(user.getLevel(), user.getExp(), 1);
    user.setLevel(progress.level());
    user.setExp(progress.exp());
    userMapper.updateById(user);

    CheckinRecord record = new CheckinRecord();
    record.setUserId(user.getId());
    record.setCheckinDate(LocalDate.now());
    record.setDrawType(normalizedType);
    record.setTitle(result.title());
    record.setExplanation(result.explanation());
    record.setExpAdded(1);
    record.setLevelAfter(progress.level());
    record.setExpAfter(progress.exp());
    record.setCreatedAt(LocalDateTime.now());
    checkinRecordMapper.insert(record);
    return toCheckinResponse(record);
  }

  public List<UserAudioResponse> listAudio(User user) {
    return userAudioMapper.selectList(new LambdaQueryWrapper<UserAudio>()
            .eq(UserAudio::getUserId, user.getId())
            .orderByDesc(UserAudio::getCreatedAt))
        .stream()
        .map(this::toAudioResponse)
        .toList();
  }

  @Transactional
  public UserAudioResponse uploadAudio(User user, String title, MultipartFile file) throws IOException {
    AudioStorageService.StoredAudio stored = audioStorageService.save(user.getId(), file);
    UserAudio audio = new UserAudio();
    audio.setUserId(user.getId());
    audio.setTitle(StringUtils.hasText(title) ? title.trim() : titleFromFilename(stored.originalName()));
    audio.setOriginalName(stored.originalName());
    audio.setFileUrl(stored.fileUrl());
    audio.setMimeType(stored.mimeType());
    audio.setFileSize(stored.fileSize());
    audio.setCreatedAt(LocalDateTime.now());
    audio.setUpdatedAt(LocalDateTime.now());
    userAudioMapper.insert(audio);
    return toAudioResponse(audio);
  }

  @Transactional
  public void deleteAudio(User user, Long audioId) {
    UserAudio audio = userAudioMapper.selectById(audioId);
    if (audio == null || !user.getId().equals(audio.getUserId())) {
      throw new BusinessException("音乐不存在或无权删除。");
    }
    userAudioMapper.deleteById(audioId);
    audioStorageService.delete(audio.getFileUrl());
  }

  private void validateSceneAndTime(String sceneCode, String timeKey) {
    if (!SCENE_CODES.contains(sceneCode)) {
      throw new BusinessException("场景不存在。");
    }
    if (!TIME_KEYS.contains(timeKey)) {
      throw new BusinessException("时间点不存在。");
    }
  }

  private FocusRecord ownedRecord(User user, Long recordId) {
    FocusRecord record = recordId == null ? null : focusRecordMapper.selectById(recordId);
    if (record == null || !user.getId().equals(record.getUserId())) {
      throw new BusinessException("专注记录不存在。");
    }
    return record;
  }

  private int minutesFromSeconds(Integer actualSeconds) {
    int seconds = Math.max(0, actualSeconds == null ? 0 : actualSeconds);
    return seconds == 0 ? 0 : Math.max(1, (int) Math.ceil(seconds / 60D));
  }

  private void addDailyFocus(Long userId, String sceneCode, int minutes) {
    addDailyFocus(userId, sceneCode, minutes, LocalDate.now(com.studyroom.activity.ActivityLedger.ZONE));
  }

  private void addDailyFocus(Long userId, String sceneCode, int minutes, LocalDate statDate) {
    if (minutes <= 0) return;
    DailyStat stat = dailyStatMapper.selectOne(new LambdaQueryWrapper<DailyStat>()
        .eq(DailyStat::getUserId, userId)
        .eq(DailyStat::getStatDate, statDate)
        .last("LIMIT 1"));
    if (stat == null) {
      stat = new DailyStat();
      stat.setUserId(userId);
      stat.setStatDate(statDate);
      stat.setFocusMinutes(minutes);
      stat.setFavoriteSceneCode(sceneCode);
      stat.setCreatedAt(LocalDateTime.now());
      stat.setUpdatedAt(LocalDateTime.now());
      dailyStatMapper.insert(stat);
      return;
    }
    stat.setFocusMinutes(value(stat.getFocusMinutes()) + minutes);
    stat.setFavoriteSceneCode(sceneCode);
    stat.setUpdatedAt(LocalDateTime.now());
    dailyStatMapper.updateById(stat);
  }

  private CheckinRecord findTodayCheckin(Long userId) {
    return checkinRecordMapper.selectOne(new LambdaQueryWrapper<CheckinRecord>()
        .eq(CheckinRecord::getUserId, userId)
        .eq(CheckinRecord::getCheckinDate, LocalDate.now())
        .last("LIMIT 1"));
  }

  private void setOnlineStatus(Long userId, String status) {
    User onlineState = new User();
    onlineState.setId(userId);
    onlineState.setOnlineStatus(status);
    onlineState.setLastActiveAt(LocalDateTime.now());
    userMapper.updateById(onlineState);
  }

  private FocusRecordResponse toRecordResponse(FocusRecord record) {
    FocusRecordResponse response = new FocusRecordResponse();
    response.setId(record.getId());
    response.setSceneCode(record.getSceneCode());
    response.setTimeKey(record.getTimeKey());
    response.setPlannedMinutes(record.getPlannedMinutes());
    response.setActualMinutes(record.getActualMinutes());
    response.setState(record.getState());
    response.setStartedAt(record.getStartedAt() == null ? "" : record.getStartedAt().toString());
    response.setEndedAt(record.getEndedAt() == null ? "" : record.getEndedAt().toString());
    return response;
  }

  private FocusCheckinResponse toCheckinResponse(CheckinRecord record) {
    FocusCheckinResponse response = new FocusCheckinResponse();
    response.setCheckedIn(true);
    response.setDate(record.getCheckinDate().toString());
    response.setDrawType(record.getDrawType());
    response.setTitle(record.getTitle());
    response.setExplanation(record.getExplanation());
    response.setExpAdded(record.getExpAdded());
    response.setLevel(record.getLevelAfter());
    response.setExp(record.getExpAfter());
    int needed = FocusLevelCalculator.nextLevelExp(record.getLevelAfter());
    response.setNextLevelExp(needed);
    response.setLevelProgress(progress(record.getExpAfter(), needed));
    return response;
  }

  private UserAudioResponse toAudioResponse(UserAudio audio) {
    UserAudioResponse response = new UserAudioResponse();
    response.setId(audio.getId());
    response.setTitle(audio.getTitle());
    response.setUrl(audio.getFileUrl());
    response.setMimeType(audio.getMimeType());
    response.setFileSize(audio.getFileSize());
    response.setCreatedAt(audio.getCreatedAt() == null ? "" : audio.getCreatedAt().toString());
    return response;
  }

  private void applyLevel(FocusOverviewResponse response, User user) {
    int level = value(user.getLevel());
    int exp = value(user.getExp());
    int needed = FocusLevelCalculator.nextLevelExp(level);
    response.setLevel(level);
    response.setExp(exp);
    response.setNextLevelExp(needed);
    response.setLevelProgress(progress(exp, needed));
  }

  private void applyLevel(FocusCheckinResponse response, User user) {
    int level = value(user.getLevel());
    int exp = value(user.getExp());
    int needed = FocusLevelCalculator.nextLevelExp(level);
    response.setLevel(level);
    response.setExp(exp);
    response.setNextLevelExp(needed);
    response.setLevelProgress(progress(exp, needed));
  }

  private int progress(Integer exp, int needed) {
    return needed <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(value(exp) * 100F / needed)));
  }

  private int value(Integer number) {
    return number == null ? 0 : number;
  }

  private String titleFromFilename(String filename) {
    int dot = filename.lastIndexOf('.');
    String title = dot > 0 ? filename.substring(0, dot) : filename;
    return title.length() > 80 ? title.substring(0, 80) : title;
  }

  private record DrawResult(String title, String explanation) {
  }
}
