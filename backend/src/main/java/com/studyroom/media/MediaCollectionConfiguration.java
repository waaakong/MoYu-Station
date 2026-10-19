package com.studyroom.media;

import java.time.Clock;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;

/** Separate explicit opt-in; no default scheduler, HTTP endpoint or implicit migration. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "studyroom.media", name = {"enabled", "collection-enabled"}, havingValue = "true")
@EnableScheduling
public class MediaCollectionConfiguration {
  @Bean MediaAssetCollector mediaAssetCollector(JdbcTemplate jdbc, PrivateImageStore store) {
    var collector = new MediaAssetCollector(jdbc, store, Clock.systemUTC()); collector.verifySchema(); return collector;
  }
  @Bean CollectionJob mediaCollectionJob(MediaAssetCollector collector) { return new CollectionJob(collector); }

  static final class CollectionJob {
    private final MediaAssetCollector collector;
    private UUID cursor;
    CollectionJob(MediaAssetCollector collector) { this.collector = collector; }
    @Scheduled(initialDelayString = "${studyroom.media.collection-interval-ms:60000}",
        fixedDelayString = "${studyroom.media.collection-interval-ms:60000}")
    public synchronized void run() {
      try {
        var ids = collector.candidates(cursor, 50);
        for (UUID id : ids) {
          try { collector.collect(id); }
          catch (Exception failure) {
            org.slf4j.LoggerFactory.getLogger(CollectionJob.class).warn("Private asset collection failed; retained for a later pass");
          }
          cursor = id; // A poison asset must not starve other candidates.
        }
        if (ids.size() < 50) cursor = null;
      } catch (Exception failure) {
        org.slf4j.LoggerFactory.getLogger(CollectionJob.class).warn("Private asset collection unavailable; no completion assumed");
      }
    }
  }
}
