package com.studyroom.service;

import com.studyroom.common.BusinessException;
import com.studyroom.dto.CompleteFocusRequest;
import com.studyroom.dto.FocusCheckinResponse;
import com.studyroom.dto.FocusSyncRecordRequest;
import com.studyroom.dto.FocusSyncRequest;
import com.studyroom.dto.StartFocusRequest;
import com.studyroom.entity.CheckinRecord;
import com.studyroom.entity.DailyStat;
import com.studyroom.entity.FocusRecord;
import com.studyroom.entity.User;
import com.studyroom.mapper.CheckinRecordMapper;
import com.studyroom.mapper.DailyStatMapper;
import com.studyroom.mapper.FocusRecordMapper;
import com.studyroom.mapper.UserAudioMapper;
import com.studyroom.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.springframework.dao.DuplicateKeyException;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FocusServiceTest {
  @Mock private UserMapper userMapper;
  @Mock private FocusRecordMapper focusRecordMapper;
  @Mock private CheckinRecordMapper checkinRecordMapper;
  @Mock private DailyStatMapper dailyStatMapper;
  @Mock private UserAudioMapper userAudioMapper;
  @Mock private AudioStorageService audioStorageService;

  @Test
  void startRejectsUnknownSceneBeforeWritingARecord() {
    FocusService service = service();
    StartFocusRequest request = new StartFocusRequest();
    request.setSceneCode("unknown");
    request.setTimeKey("morning");
    request.setPlannedMinutes(25);

    assertThatThrownBy(() -> service.start(user(), request))
        .isInstanceOf(BusinessException.class);

    verify(focusRecordMapper, never()).insert(any(FocusRecord.class));
  }

  @Test
  void finishRoundsActualSecondsUpAndAddsThemToTodayStats() {
    FocusService service = service();
    FocusRecord record = runningRecord();
    CompleteFocusRequest request = new CompleteFocusRequest();
    request.setRecordId(12L);
    request.setActualSeconds(125);

    when(focusRecordMapper.selectById(12L)).thenReturn(record);
    when(dailyStatMapper.selectOne(any())).thenReturn(null);

    service.finish(user(), request);

    ArgumentCaptor<DailyStat> statCaptor = ArgumentCaptor.forClass(DailyStat.class);
    verify(dailyStatMapper).insert(statCaptor.capture());
    assertThat(statCaptor.getValue().getFocusMinutes()).isEqualTo(3);
    assertThat(statCaptor.getValue().getFavoriteSceneCode()).isEqualTo("mountain");
    assertThat(record.getState()).isEqualTo("COMPLETED");
    assertThat(record.getActualMinutes()).isEqualTo(3);
  }

  @Test
  void repeatedCheckinReturnsExistingResultWithoutAddingExperienceAgain() {
    FocusService service = service();
    CheckinRecord existing = new CheckinRecord();
    existing.setId(5L);
    existing.setUserId(1L);
    existing.setCheckinDate(LocalDate.now());
    existing.setDrawType("FORTUNE");
    existing.setTitle("上上签");
    existing.setExplanation("今天适合稳稳推进。");
    existing.setExpAdded(1);
    existing.setLevelAfter(1);
    existing.setExpAfter(0);

    when(checkinRecordMapper.selectOne(any())).thenReturn(existing);

    FocusCheckinResponse response = service.checkin(user(), "TAROT");

    assertThat(response.getCheckedIn()).isTrue();
    assertThat(response.getTitle()).isEqualTo("上上签");
    verify(checkinRecordMapper, never()).insert(any(CheckinRecord.class));
    verify(userMapper, never()).updateById(any(User.class));
  }

  @Test
  void syncInsertsACompletedClientRecordAndCountsItOnce() {
    FocusService service = service();
    when(focusRecordMapper.selectOne(any())).thenReturn(null);
    when(dailyStatMapper.selectOne(any())).thenReturn(null);

    var response = service.sync(user(), syncRequest("00000000-0000-4000-8000-000000000001"));

    assertThat(response.getResults()).hasSize(1);
    assertThat(response.getResults().get(0).getStatus()).isEqualTo("accepted");
    verify(focusRecordMapper).insert(any(FocusRecord.class));
    verify(dailyStatMapper).insert(any(DailyStat.class));
  }

  @Test
  void syncReturnsDuplicateWithoutCountingTheRecordAgain() {
    FocusService service = service();
    FocusRecord existing = runningRecord();
    existing.setClientRecordId("00000000-0000-4000-8000-000000000001");
    when(focusRecordMapper.selectOne(any())).thenReturn(existing);

    var response = service.sync(user(), syncRequest(existing.getClientRecordId()));

    assertThat(response.getResults().get(0).getStatus()).isEqualTo("duplicate");
    verify(focusRecordMapper, never()).insert(any(FocusRecord.class));
    verify(dailyStatMapper, never()).insert(any(DailyStat.class));
  }

  @Test
  void concurrentSyncCollisionStillReturnsDuplicateWithoutDoubleCounting() {
    FocusService service = service();
    FocusRecord existing = runningRecord();
    existing.setClientRecordId("00000000-0000-4000-8000-000000000001");
    when(focusRecordMapper.selectOne(any())).thenReturn(null, existing);
    doThrow(new DuplicateKeyException("duplicate")).when(focusRecordMapper).insert(any(FocusRecord.class));

    var response = service.sync(user(), syncRequest(existing.getClientRecordId()));

    assertThat(response.getResults().get(0).getStatus()).isEqualTo("duplicate");
    verify(dailyStatMapper, never()).insert(any(DailyStat.class));
  }

  @Test
  void syncRejectsHistoryOlderThanTheImportWindow() {
    FocusService service = service();
    FocusSyncRequest request = syncRequest("00000000-0000-4000-8000-000000000003");
    request.getRecords().get(0).setStartedAt(Instant.now().minusSeconds(366L * 24 * 60 * 60));

    var response = service.sync(user(), request);

    assertThat(response.getResults().get(0).getStatus()).isEqualTo("rejected");
    verify(focusRecordMapper, never()).insert(any(FocusRecord.class));
  }

  private FocusService service() {
    return new FocusService(
        userMapper,
        focusRecordMapper,
        checkinRecordMapper,
        dailyStatMapper,
        userAudioMapper,
        audioStorageService
    );
  }

  private User user() {
    User user = new User();
    user.setId(1L);
    user.setUsername("reader");
    user.setLevel(0);
    user.setExp(0);
    return user;
  }

  private FocusRecord runningRecord() {
    FocusRecord record = new FocusRecord();
    record.setId(12L);
    record.setUserId(1L);
    record.setSceneCode("mountain");
    record.setTimeKey("morning");
    record.setPlannedMinutes(25);
    record.setActualMinutes(0);
    record.setState("RUNNING");
    record.setStartedAt(LocalDateTime.now().minusMinutes(3));
    return record;
  }

  private FocusSyncRequest syncRequest(String clientRecordId) {
    Instant endedAt = Instant.now().minusSeconds(60);
    FocusSyncRecordRequest item = new FocusSyncRecordRequest();
    item.setClientRecordId(clientRecordId);
    item.setSceneCode("mountain");
    item.setTimeKey("morning");
    item.setPlannedMinutes(25);
    item.setActualSeconds(1500);
    item.setStartedAt(endedAt.minusSeconds(1500));
    item.setEndedAt(endedAt);
    FocusSyncRequest request = new FocusSyncRequest();
    request.setRecords(List.of(item));
    return request;
  }
}
