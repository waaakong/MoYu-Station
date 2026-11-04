package com.studyroom.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.studyroom.entity.*;
import com.studyroom.mapper.*;
import com.studyroom.security.PasswordService;
import java.time.*;
import java.util.*;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ProfileStatsSemanticsTest {
  @Test void historicalCardIncludesSixMetricsWithoutBorrowingLaterDays(){
    var daily=mock(DailyStatMapper.class);TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(),"card-history"),DailyStat.class);
    var first=new DailyStat();first.setStatDate(LocalDate.of(2020,1,1));first.setFocusMinutes(60);
    var second=new DailyStat();second.setStatDate(LocalDate.of(2020,1,2));second.setFocusMinutes(30);
    var later=new DailyStat();later.setStatDate(LocalDate.of(2020,1,3));later.setFocusMinutes(120);
    when(daily.selectList(any())).thenReturn(List.of(later,second,first));
    var service=new ProfileService(mock(AuthService.class),mock(UserMapper.class),daily,mock(PostMapper.class),mock(FeedbackMapper.class),mock(ImageStorageService.class),mock(PasswordService.class));var user=new User();user.setId(1L);
    var card=service.shareCard(user,"2020-01-02");assertThat(card.getFocusMinutes()).isEqualTo(30);assertThat(card.getStreakDays()).isEqualTo(2);assertThat(card.getTotalFocusHours()).isEqualByComparingTo("1.5");assertThat(card.getOnlineMinutes()).isNull();assertThat(card.getFishMinutes()).isNull();assertThat(card.getFakeEffortIndex()).isNull();
  }
  @Test void missingStatisticsAndScenesAreNotInventedAndReportUsesShanghaiDate(){
    var daily=mock(DailyStatMapper.class);TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(),"stats"),DailyStat.class);
    when(daily.selectList(any())).thenReturn(List.of());
    var service=new ProfileService(mock(AuthService.class),mock(UserMapper.class),daily,mock(PostMapper.class),mock(FeedbackMapper.class),mock(ImageStorageService.class),mock(PasswordService.class));
    var user=new User();user.setId(1L);var report=service.shareCard(user);
    assertThat(report.getStatDate()).isEqualTo(LocalDate.now(ZoneId.of("Asia/Shanghai")).toString());assertThat(report.getTimeZone()).isEqualTo("Asia/Shanghai");
    assertThat(report.getFocusMinutes()).isNull();assertThat(report.getFishMinutes()).isNull();assertThat(report.getFakeEffortIndex()).isNull();assertThat(report.getFavoriteScene()).isNull();
    assertThat(service.calendar(user,"2026-02")).hasSize(28).allMatch(day->day.getFocusMinutes()==null && day.getFakeEffortIndex()==null);
    assertThatThrownBy(()->service.calendar(user,"invalid")).isInstanceOf(com.studyroom.common.BusinessException.class);
  }
  @Test void legacyFocusZeroStaysZeroButDerivedSlackAndIndexAreUnavailable(){
    var daily=mock(DailyStatMapper.class);TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(),"stats-zero"),DailyStat.class);
    var record=new DailyStat();record.setStatDate(LocalDate.now(ZoneId.of("Asia/Shanghai")));record.setFocusMinutes(0);record.setSlackMinutes(0);record.setFakeEffortIndex(java.math.BigDecimal.ZERO);record.setFavoriteSceneCode("not-a-real-scene");
    when(daily.selectList(any())).thenReturn(List.of(record));
    var service=new ProfileService(mock(AuthService.class),mock(UserMapper.class),daily,mock(PostMapper.class),mock(FeedbackMapper.class),mock(ImageStorageService.class),mock(PasswordService.class));var user=new User();user.setId(1L);
    var report=service.shareCard(user);assertThat(report.getFocusMinutes()).isZero();assertThat(report.getFishMinutes()).isNull();assertThat(report.getFakeEffortIndex()).isNull();assertThat(report.getFavoriteScene()).isEqualTo("未知场景");
    assertThat(service.shareCard(user,"2020-02-29").getFocusMinutes()).isNull();
    assertThatThrownBy(()->service.shareCard(user,"2026-02-30")).isInstanceOf(com.studyroom.common.BusinessException.class);
    assertThatThrownBy(()->service.shareCard(user,LocalDate.now(ZoneId.of("Asia/Shanghai")).plusDays(1).toString())).isInstanceOf(com.studyroom.common.BusinessException.class);
  }
}
