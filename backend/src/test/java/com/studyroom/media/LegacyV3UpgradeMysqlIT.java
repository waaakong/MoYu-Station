package com.studyroom.media;

import java.nio.file.Path;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

/** Synthetic V3 fixture, never a supplied database or production backup. */
class LegacyV3UpgradeMysqlIT {
  @TempDir Path scratch;
  @Test void upgradesV3ThroughV15WithoutRewritingLegacyRecordsAndDoesNotReplay() throws Exception {
    try(var mysql=EphemeralMysql.start(scratch,Path.of(System.getProperty("media.mysql.binary")));var source=new com.zaxxer.hikari.HikariDataSource()) {
      mysql.verifyOwnership();
      source.setJdbcUrl(mysql.databaseUrl);source.setUsername("root");source.setPassword("");source.setMaximumPoolSize(2);source.setMinimumIdle(0);
      var old=Flyway.configure().dataSource(source).locations("classpath:db/migration").target("3").cleanDisabled(true).load();
      assertThat(old.migrate().migrationsExecuted).isEqualTo(3);
      var jdbc=new JdbcTemplate(source);
      long a=2104509220480131074L,b=a+1;
      jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname) VALUES(?,?,?,?),(?,?,?,?)",a,"legacy-a","fixture-only","甲",b,"legacy-b","fixture-only","乙");
      jdbc.update("INSERT INTO sr_private_conversation(id,user_a_id,user_b_id) VALUES(?,?,?)",31,a,b);
      jdbc.update("INSERT INTO sr_chat_message(id,conversation_id,sender_id,receiver_id,channel_type,message_type,content,media_url) VALUES(?,?,?,?,?,?,?,?)",41,31,a,b,"PRIVATE","IMAGE","历史图片","/uploads/chat/legacy.png");
      jdbc.update("INSERT INTO sr_chat_message_visibility(message_id,user_id) VALUES(?,?)",41,a);
      jdbc.update("INSERT INTO sr_post(id,user_id,content,image_urls_json) VALUES(?,?,?,?)",51,a,"历史动态","[\"/uploads/feed/old.png\"]");
      jdbc.update("INSERT INTO sr_focus_record(id,user_id,scene_code,time_key,planned_minutes,actual_minutes,started_at) VALUES(?,?,?,?,?,?,?)",61,a,"mountain","morning",25,17,"2026-09-01 10:00:00");
      var before=new LinkedHashMap<String,List<Map<String,Object>>>();
      for(String table:List.of("sr_user","sr_private_conversation","sr_chat_message","sr_chat_message_visibility","sr_post","sr_focus_record")) before.put(table,jdbc.queryForList("SELECT * FROM "+table+" ORDER BY id"));
      mysql.verifyOwnership();
      var upgrade=Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load();
      assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(12);upgrade.validate();
      assertThat(upgrade.info().current().getVersion().getVersion()).isEqualTo("15");
      for(var entry:before.entrySet()) {
        var after=jdbc.queryForList("SELECT * FROM "+entry.getKey()+" ORDER BY id");
        assertThat(after).hasSize(entry.getValue().size());
        for(int index=0;index<after.size();index++)assertThat(after.get(index)).containsAllEntriesOf(entry.getValue().get(index));
      }
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset",Integer.class)).isZero();
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_deleted_receipt",Integer.class)).isZero();
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success=1",Integer.class)).isEqualTo(15);
      assertThat(upgrade.migrate().migrationsExecuted).isZero();
      // Limited SQL compatibility proof only: old inserts can omit the added nullable request ID.
      jdbc.update("INSERT INTO sr_chat_message(conversation_id,sender_id,receiver_id,channel_type,content) VALUES(?,?,?,?,?)",31,b,a,"PRIVATE","旧调用仍可写入");
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_message WHERE client_message_id IS NULL",Integer.class)).isEqualTo(2);
      assertThat(jdbc.queryForObject("SELECT media_url FROM sr_chat_message WHERE id=41",String.class)).isEqualTo("/uploads/chat/legacy.png");
    }
  }
}
