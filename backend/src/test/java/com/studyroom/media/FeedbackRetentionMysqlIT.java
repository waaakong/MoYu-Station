package com.studyroom.media;

import java.nio.file.Path;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.studyroom.service.FeedbackRetentionTask;
import static org.assertj.core.api.Assertions.*;

class FeedbackRetentionMysqlIT {
  @TempDir Path root;
  @Test void boundedCleanupNeverRemovesPendingRecentOrUnprocessedFeedback() throws Exception {
    try(var mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")))){
      var source=new DriverManagerDataSource(mysql.databaseUrl,"root","");
      Flyway.configure().dataSource(source).locations("classpath:db/migration").cleanDisabled(true).load().migrate();mysql.verifyOwnership();
      var jdbc=new JdbcTemplate(source);jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname) VALUES(1,'retention-fixture','unused','fixture')");
      for(int i=0;i<105;i++)jdbc.update("INSERT INTO sr_feedback(user_id,title,content,status,updated_at) VALUES(1,'expired','fixture','RESOLVED','2020-01-01')");
      for(String status:java.util.List.of("PENDING","PROCESSING"))jdbc.update("INSERT INTO sr_feedback(user_id,title,content,status,updated_at) VALUES(1,'keep','fixture',?,'2020-01-01')",status);
      jdbc.update("INSERT INTO sr_feedback(user_id,title,content,status,updated_at) VALUES(1,'keep','fixture','RESOLVED','2099-01-01')");
      var task=new FeedbackRetentionTask(jdbc);task.run();
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_feedback WHERE title='expired'",Integer.class)).isEqualTo(5);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_feedback WHERE title='keep'",Integer.class)).isEqualTo(3);
      task.run();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_feedback",Integer.class)).isEqualTo(3);
      task.run();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_feedback",Integer.class)).isEqualTo(3);
    }
  }
}
