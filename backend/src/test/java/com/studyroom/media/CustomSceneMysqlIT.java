package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.entity.User;
import com.studyroom.service.UploadQuotaService;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

class CustomSceneMysqlIT {
  @TempDir static Path root;@TempDir Path files;
  static EphemeralMysql mysql;static JdbcTemplate jdbc;
  PrivateImageStore store;MediaAssetService assets;CustomSceneService scenes;
  TestClock clock=new TestClock();AtomicInteger notifications=new AtomicInteger();
  @BeforeAll static void start()throws Exception{
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));mysql.verifyOwnership();
    var source=new DriverManagerDataSource(mysql.databaseUrl,"root","");jdbc=new JdbcTemplate(source);
    assertThat(Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate().migrationsExecuted).isEqualTo(15);
    for(int id=1;id<=3;id++)jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,login_version) VALUES(?,?,?,?,?)",id,"scene-fixture-"+id,"unused","fixture","epoch");
  }
  @AfterAll static void stop()throws Exception{if(mysql!=null)mysql.close();}
  @BeforeEach void setup()throws Exception{
    mysql.verifyOwnership();for(String table:List.of("sr_media_reference","sr_custom_scene_receipt","sr_custom_scene","sr_media_asset"))jdbc.update("DELETE FROM "+table);
    jdbc.update("UPDATE sr_user SET login_version='epoch',deleted=0,user_type='NORMAL'");
    store=new PrivateImageStore(new UploadQuotaService(files.resolve("uploads").toString(),256L*1024*1024,512L*1024*1024,0,files.resolve("private").toString()));
    assets=new MediaAssetService(new MediaAssetRepository(jdbc),store,new IsolatedImageProcessor(System.getProperty("surefire.test.class.path",System.getProperty("java.class.path"))),clock);
    scenes=new CustomSceneService(jdbc,new ObjectMapper(),clock,(owner,version)->notifications.incrementAndGet());
  }
  @Test void ownConfigIsVersionedIdempotentPrivateAndDeletedTombstonePreventsOldRecreation()throws Exception{
    UUID image=upload(1);var config=config(image);UUID request=UUID.randomUUID();
    assertThat(scenes.get(user(1)).version()).isZero();assertThat(scenes.get(user(1)).deleted()).isTrue();
    var first=scenes.save(user(1),0,request,config);assertThat(first.version()).isEqualTo(1);assertThat(first.current().media()).hasSize(1);
    assertThat(scenes.save(user(1),0,request,config)).isEqualTo(first);assertThat(notifications).hasValue(1);
    assertThat(scenes.lookup(user(2),request).status()).isEqualTo("missing");
    rejected(()->assets.read(2,image,PrivateImageStore.Variant.DISPLAY),404);
    rejected(()->scenes.save(user(2),0,UUID.randomUUID(),config),409);
    rejected(()->scenes.save(user(1),0,request,new CustomSceneService.Config("changed",config.defaultImage(),Map.of())),409);
    UUID deletion=UUID.randomUUID();assertThat(scenes.delete(user(1),1,deletion).version()).isEqualTo(2);
    assertThat(scenes.delete(user(1),1,deletion).version()).isEqualTo(2);assertThat(notifications).hasValue(2);
    rejected(()->scenes.save(user(1),0,UUID.randomUUID(),config),409);
    assertThat(scenes.lookup(user(1),request).version()).isEqualTo(1);assertThat(scenes.lookup(user(1),request).current().deleted()).isTrue();
    assertThat(scenes.save(user(1),2,UUID.randomUUID(),config).version()).isEqualTo(3);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_reference WHERE asset_id=?",Integer.class,image.toString())).isEqualTo(2);
  }
  @Test void concurrentSameVersionCommitsOnceAndRevokedAccountCannotWrite()throws Exception{
    var config=config(upload(1));var pool=Executors.newFixedThreadPool(2);var barrier=new CyclicBarrier(2);
    try{
      Callable<Boolean> update=()->{barrier.await(5,TimeUnit.SECONDS);try{scenes.save(user(1),0,UUID.randomUUID(),config);return true;}catch(MediaApiException conflict){assertThat(conflict.code()).isEqualTo("SCENE_VERSION_CONFLICT");return false;}};
      var a=pool.submit(update);var b=pool.submit(update);assertThat(List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
    }finally{pool.shutdownNow();}
    assertThat(notifications).hasValue(1);assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_custom_scene_receipt",Integer.class)).isEqualTo(1);
    jdbc.update("UPDATE sr_user SET login_version='changed' WHERE id=1");
    assertThatThrownBy(()->scenes.delete(user(1),1,UUID.randomUUID())).isInstanceOf(com.studyroom.common.AccountLoggedInElsewhereException.class);
  }
  @Test void replacementReleasesOnlyRemovedResourcesAndCollectorHonorsTwentyFourHourGrace()throws Exception{
    UUID a=upload(1),b=upload(1);scenes.save(user(1),0,UUID.randomUUID(),config(a));
    var collector=new MediaAssetCollector(jdbc,store,clock);clock.now+=MediaAssetCollector.GRACE_MS*2;
    assertThat(collector.collect(a)).isEqualTo(MediaAssetCollector.Outcome.RETAINED);
    // b is still staging: expired assets cannot be used even if not collected.
    UUID replacement=upload(1);scenes.save(user(1),1,UUID.randomUUID(),config(replacement));
    assertThat(collector.collect(a)).isEqualTo(MediaAssetCollector.Outcome.GRACE);
    clock.now+=MediaAssetCollector.GRACE_MS-1;assertThat(collector.collect(a)).isEqualTo(MediaAssetCollector.Outcome.GRACE);
    clock.now++;assertThat(collector.collect(a)).isEqualTo(MediaAssetCollector.Outcome.COLLECTED);
    assertThat(files.resolve("private/1/"+a)).doesNotExist();assets.read(1,replacement,PrivateImageStore.Variant.DISPLAY);
    assertThat(collector.collect(replacement)).isEqualTo(MediaAssetCollector.Outcome.RETAINED);
    rejected(()->scenes.save(user(1),2,UUID.randomUUID(),config(b)),409);
    assertThat(scenes.get(user(1)).version()).isEqualTo(2);
  }
  UUID upload(long owner)throws Exception{return UUID.fromString(assets.upload(owner,UUID.randomUUID(),ImageFixtures.png(96,160),"image/png","scene").asset().id());}
  static CustomSceneService.Config config(UUID id){var picture=new CustomSceneService.Picture(id,"contain",.25,.75,1.2,.2);return new CustomSceneService.Config("私人场景",picture,Map.of("night",picture));}
  static User user(long id){var user=new User();user.setId(id);user.setLoginVersion("epoch");return user;}
  static void rejected(Runnable action,int status){assertThatThrownBy(action::run).isInstanceOf(MediaApiException.class).satisfies(error->assertThat(((MediaApiException)error).status()).isEqualTo(status));}
  static final class TestClock extends Clock{long now=1_800_000_000_000L;@Override public ZoneId getZone(){return ZoneOffset.UTC;}@Override public Clock withZone(ZoneId zone){return this;}@Override public Instant instant(){return Instant.ofEpochMilli(now);}@Override public long millis(){return now;}}
}
