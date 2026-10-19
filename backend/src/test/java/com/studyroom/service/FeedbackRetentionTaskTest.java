package com.studyroom.service;

import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class FeedbackRetentionTaskTest {
  @Test void disabledByDefaultAndConstructedOnlyWithExplicitOptIn(){
    JdbcTemplate jdbc=mock(JdbcTemplate.class);
    var runner=new ApplicationContextRunner().withBean(JdbcTemplate.class,()->jdbc).withUserConfiguration(FeedbackRetentionTask.class);
    runner.run(context->assertThat(context).doesNotHaveBean(FeedbackRetentionTask.class));
    runner.withPropertyValues("studyroom.feedback.retention-enabled=false").run(context->assertThat(context).doesNotHaveBean(FeedbackRetentionTask.class));
    runner.withPropertyValues("studyroom.feedback.retention-enabled=true").run(context->assertThat(context).hasSingleBean(FeedbackRetentionTask.class));
    verify(jdbc,never()).update(anyString(),any(Object.class));
  }
  @Test void deletionIsBoundedAndUsesShanghaiCutoff(){
    JdbcTemplate jdbc=mock(JdbcTemplate.class);
    var clock=Clock.fixed(Instant.parse("2026-09-28T17:00:00Z"),ZoneId.of("Asia/Shanghai"));
    new FeedbackRetentionTask(jdbc,clock).run();
    verify(jdbc).update(eq("DELETE FROM sr_feedback WHERE status IN ('RECORDED','RESOLVED') AND updated_at <= ? ORDER BY updated_at,id LIMIT 100"),eq(LocalDateTime.of(2026,9,22,1,0)));
  }
}
