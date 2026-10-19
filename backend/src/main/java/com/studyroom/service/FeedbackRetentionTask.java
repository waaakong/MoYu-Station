package com.studyroom.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Explicit maintenance opt-in only. Reads must never trigger historical data deletion. */
@Component
@ConditionalOnProperty(name="studyroom.feedback.retention-enabled",havingValue="true",matchIfMissing=false)
public final class FeedbackRetentionTask {
  private static final Logger log=LoggerFactory.getLogger(FeedbackRetentionTask.class);
  private final JdbcTemplate jdbc;
  private final Clock clock;
  @org.springframework.beans.factory.annotation.Autowired
  public FeedbackRetentionTask(JdbcTemplate jdbc){this(jdbc,Clock.system(ZoneId.of("Asia/Shanghai")));}
  FeedbackRetentionTask(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}

  @Scheduled(initialDelayString="${studyroom.feedback.retention-interval-ms:3600000}",fixedDelayString="${studyroom.feedback.retention-interval-ms:3600000}")
  public void run(){
    // A single bounded statement rechecks status and timestamp while deleting; no stale selection list.
    int removed=jdbc.update("DELETE FROM sr_feedback WHERE status IN ('RECORDED','RESOLVED') AND updated_at <= ? ORDER BY updated_at,id LIMIT 100",
        LocalDateTime.now(clock).minusDays(7));
    if(removed>0)log.info("Feedback retention removed {} expired processed records",removed);
  }
}
