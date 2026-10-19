package com.studyroom.media;
import com.studyroom.activity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
class ActivityLedgerMysqlIT {
  @TempDir static Path root;static EphemeralMysql mysql;static com.zaxxer.hikari.HikariDataSource source;
  static JdbcTemplate jdbc;static TransactionTemplate tx;static ActivityLedger ledger;
  static final Instant NOW=Instant.parse("2026-10-09T16:00:20Z");static final long T=NOW.toEpochMilli()-20000;
  @BeforeAll static void start()throws Exception{
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));mysql.verifyOwnership();
    source=new com.zaxxer.hikari.HikariDataSource();source.setJdbcUrl(mysql.databaseUrl);source.setUsername("root");source.setPassword("");source.setMaximumPoolSize(4);source.setMinimumIdle(0);
    Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate();
    jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));ledger=new ActivityLedger(jdbc,new ObjectMapper(),Clock.fixed(NOW,ZoneOffset.UTC));
    for(long id=1;id<=2;id++)jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,user_type) VALUES(?,?,?,'test','NORMAL')",id,"activity-test-"+id,"test-only-hash");
  }
  @AfterAll static void stop()throws Exception{if(source!=null)source.close();if(mysql!=null)mysql.close();}
  @BeforeEach void reset()throws Exception{mysql.verifyOwnership();for(String table:List.of("sr_activity_focus_link","sr_activity_interval","sr_activity_receipt","sr_activity_stream","sr_activity_day","sr_activity_owner"))jdbc.update("DELETE FROM "+table);}
  static String id(){return UUID.randomUUID().toString();}
  ActivityBatch batch(long start,long end,String state){return new ActivityBatch(id(),id(),1,List.of(new ActivityBatch.Segment(start,end,state)),false);}
  void submit(long owner,ActivityBatch batch){tx.executeWithoutResult(s->ledger.submit(owner,batch));}
  @Test void idempotencyConflictAndOwnerIsolation(){
    var batch=batch(T,T+10000,"IDLE");submit(1,batch);submit(1,batch);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_activity_interval",Integer.class)).isEqualTo(1);
    assertThat(ledger.receipt(2,batch.requestId())).containsEntry("status","unconfirmed");
    assertThatThrownBy(()->submit(1,new ActivityBatch(batch.requestId(),batch.sessionId(),1,List.of(new ActivityBatch.Segment(T,T+10000,"FOCUS")),false))).isInstanceOf(BusinessException.class);
    submit(2,batch);assertThat(ledger.days(2).get(LocalDate.of(2026,10,10)).onlineMs()).isEqualTo(10000);
  }
  @Test void twoDevicesConcurrentUnionAcrossShanghaiMidnight()throws Exception{
    var a=batch(T-10000,T+10000,"IDLE");var b=batch(T-5000,T+15000,"FOCUS");
    var pool=Executors.newFixedThreadPool(2);var barrier=new CyclicBarrier(2);
    try{var one=pool.submit(()->{barrier.await();submit(1,a);return true;});var two=pool.submit(()->{barrier.await();submit(1,b);return true;});one.get(10,TimeUnit.SECONDS);two.get(10,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
    var before=ledger.days(1).get(LocalDate.of(2026,10,9));var after=ledger.days(1).get(LocalDate.of(2026,10,10));
    assertThat(before.onlineMs()).isEqualTo(10000);assertThat(before.focusMs()).isEqualTo(5000);assertThat(before.index()).isNull();
    assertThat(after.onlineMs()).isEqualTo(15000);assertThat(after.focusMs()).isEqualTo(15000);assertThat(after.index()).isEqualByComparingTo("1.00");
  }
  @Test void outOfOrderAndUnknownGapsAreNotAcceptedAsComplete(){
    var first=batch(T-15000,T-10000,"IDLE");submit(1,first);
    var next=new ActivityBatch(id(),first.sessionId(),3,List.of(new ActivityBatch.Segment(T,T+5000,"IDLE")),false);
    assertThatThrownBy(()->submit(1,next)).isInstanceOf(BusinessException.class);
    submit(1,new ActivityBatch(next.requestId(),first.sessionId(),2,next.segments(),false));
    assertThat(ledger.days(1).get(LocalDate.of(2026,10,10)).index()).isNull();
    assertThat(ledger.days(1).get(LocalDate.of(2026,10,10)).onlineMs()).isEqualTo(5000);
  }
  @Test void invalidClockAndNullSegmentRollBackWithoutReceipt(){
    for(var batch:List.of(batch(T,T+31000,"IDLE"),batch(T,T+1000,"UNKNOWN"),new ActivityBatch(id(),id(),1,Arrays.asList((ActivityBatch.Segment)null),false))){
      assertThatThrownBy(()->submit(1,batch)).isInstanceOf(BusinessException.class);assertThat(ledger.receipt(1,batch.requestId())).containsEntry("status","unconfirmed");
    }
  }
  @Test void incrementalAggregationMatchesFullUnionForOutOfOrderOverlappingDevices(){
    var random=new Random(29);var segments=new ArrayList<ActivityBatch.Segment>();
    for(int i=0;i<60;i++){
      long start=T-15000+random.nextInt(20000),end=start+1+random.nextInt(9000);
      var segment=new ActivityBatch.Segment(start,end,random.nextBoolean()?"FOCUS":"IDLE");segments.add(segment);
      submit(1,new ActivityBatch(id(),id(),1,List.of(segment),false));
    }
    for(var entry:ledger.days(1).entrySet()){
      long start=entry.getKey().atStartOfDay(ActivityLedger.ZONE).toInstant().toEpochMilli();
      var expected=ActivityMath.union(segments,start,start+86400000);
      assertThat(entry.getValue().onlineMs()).isEqualTo(expected.onlineMs());assertThat(entry.getValue().focusMs()).isEqualTo(expected.focusMs());
    }
  }
}
