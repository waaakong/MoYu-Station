package com.studyroom.media;

import com.studyroom.service.UploadQuotaService;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

/** Real MySQL and owned private files, no supplied database or user media. */
class StickerFavoriteMysqlIT {
  @TempDir static Path root; @TempDir Path files;
  static EphemeralMysql mysql;static JdbcTemplate jdbc;
  PrivateImageStore store;MediaAssetService assets;MediaPublicationService publications;StickerFavoriteService favorites;
  final AtomicInteger notifications=new AtomicInteger();final TestClock clock=new TestClock();
  @BeforeAll static void start()throws Exception{
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));mysql.verifyOwnership();
    var source=new DriverManagerDataSource(mysql.databaseUrl,"root","");jdbc=new JdbcTemplate(source);
    var flyway=Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load();
    assertThat(flyway.migrate().migrationsExecuted).isEqualTo(15);assertThat(flyway.migrate().migrationsExecuted).isZero();
    for(int id=1;id<=3;id++)jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname) VALUES(?,?,?,?)",id,"sticker-fixture-"+id,"unused","fixture");
  }
  @AfterAll static void stop()throws Exception{if(mysql!=null)mysql.close();}
  @BeforeEach void setup()throws Exception{
    mysql.verifyOwnership();for(String table:List.of("sr_media_reference","sr_sticker_favorite","sr_sticker_collection","sr_media_publication","sr_media_asset","sr_chat_message_visibility","sr_chat_message","sr_private_conversation","sr_post"))jdbc.update("DELETE FROM "+table);
    var quota=new UploadQuotaService(files.resolve("uploads").toString(),10_000_000,50_000_000,0,files.resolve("private").toString());store=new PrivateImageStore(quota);
    assets=new MediaAssetService(new MediaAssetRepository(jdbc),store,(bytes,mime)->new StaticImageCandidateProcessor().process(bytes,mime),clock);
    publications=new MediaPublicationService(jdbc,store,clock);favorites=new StickerFavoriteService(jdbc,store,assets,clock,(owner,version)->notifications.incrementAndGet());
  }
  @Test void privateCopyIsIndependentAndDeletionNeverBreaksSentMessages()throws Exception{
    UUID original=social(1);long message=publish(1,2L,original).targetId();UUID favorite=UUID.randomUUID();
    denied(()->favorites.add(3,favorite,new StickerFavoriteService.Add(null,message)),404);
    var collection=favorites.add(2,favorite,new StickerFavoriteService.Add(null,message));var item=collection.items().get(0);UUID copy=UUID.fromString(item.assetId());
    assertThat(copy).isNotEqualTo(original);assertThat(jdbc.queryForObject("SELECT owner_id FROM sr_media_asset WHERE asset_id=?",Long.class,copy.toString())).isEqualTo(2);
    assertThat(favorites.add(2,favorite,new StickerFavoriteService.Add(null,message))).isEqualTo(collection);assertThat(notifications).hasValue(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset",Integer.class)).isEqualTo(2);
    assets.read(2,copy,PrivateImageStore.Variant.CLEAR);denied(()->assets.read(3,copy,PrivateImageStore.Variant.CLEAR),404);
    jdbc.update("UPDATE sr_chat_message SET recalled_at=CURRENT_TIMESTAMP WHERE id=?",message);
    denied(()->assets.read(2,original,PrivateImageStore.Variant.CLEAR),404);assets.read(2,copy,PrivateImageStore.Variant.CLEAR);
    var sent=publish(2,3L,copy);publish(2,3L,copy);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_reference WHERE asset_id=?",Integer.class,copy.toString())).isEqualTo(3);
    favorites.delete(2,favorite);favorites.delete(2,favorite);assertThat(notifications).hasValue(2);
    assets.read(3,copy,PrivateImageStore.Variant.CLEAR);
    denied(()->favorites.add(2,favorite,new StickerFavoriteService.Add(null,message)),409);
    var collector=new MediaAssetCollector(jdbc,store,clock);clock.now+=MediaAssetCollector.GRACE_MS*3;assertThat(collector.collect(copy)).isEqualTo(MediaAssetCollector.Outcome.RETAINED);
    assertThat(sent.targetId()).isPositive();
  }
  @Test void orderingUsesCollectionVersionAndCancelledIdsCannotBeResurrected()throws Exception{
    UUID a=UUID.randomUUID(),b=UUID.randomUUID(),cancelled=UUID.randomUUID();
    favorites.add(1,a,new StickerFavoriteService.Add(sticker(1),null));var before=favorites.add(1,b,new StickerFavoriteService.Add(sticker(1),null));
    denied(()->favorites.order(1,before.version()-1,List.of(b,a)),409);
    var sorted=favorites.order(1,before.version(),List.of(b,a));assertThat(sorted.items().stream().map(StickerFavoriteService.Item::id)).containsExactly(b.toString(),a.toString());
    assertThat(favorites.order(1,before.version(),List.of(b,a))).isEqualTo(sorted);assertThat(notifications).hasValue(3);
    favorites.delete(1,cancelled);UUID staged=sticker(1);denied(()->favorites.add(1,cancelled,new StickerFavoriteService.Add(staged,null)),409);
    denied(()->favorites.delete(2,a),404);denied(()->favorites.add(2,UUID.randomUUID(),new StickerFavoriteService.Add(staged,null)),409);
    assertThat(favorites.list(2).items()).isEmpty();
  }
  @Test void deletingLastReferenceStartsGraceAndStickersCannotBypassPostPurpose()throws Exception{
    UUID id=UUID.randomUUID(),asset=sticker(1);favorites.add(1,id,new StickerFavoriteService.Add(asset,null));
    denied(()->publications.publish(1,new MediaPublicationService.Command(UUID.randomUUID(),MediaPublicationService.Kind.POST,null,"invalid",null,List.of(asset))),409);
    favorites.delete(1,id);var collector=new MediaAssetCollector(jdbc,store,clock);assertThat(collector.collect(asset)).isEqualTo(MediaAssetCollector.Outcome.GRACE);
    clock.now+=MediaAssetCollector.GRACE_MS+1;assertThat(collector.collect(asset)).isEqualTo(MediaAssetCollector.Outcome.COLLECTED);assertThat(collector.collect(asset)).isEqualTo(MediaAssetCollector.Outcome.ALREADY_COLLECTED);
  }
  @Test void limitCountsActiveFavoritesAndRejectsThe201stWithoutBinding()throws Exception{
    for(int i=0;i<200;i++)favorites.add(1,UUID.randomUUID(),new StickerFavoriteService.Add(sticker(1),null));
    UUID extra=sticker(1);denied(()->favorites.add(1,UUID.randomUUID(),new StickerFavoriteService.Add(extra,null)),409);
    assertThat(favorites.list(1).items()).hasSize(200);assertThat(notifications).hasValue(200);
    assertThat(jdbc.queryForObject("SELECT published_at_ms IS NULL FROM sr_media_asset WHERE asset_id=?",Boolean.class,extra.toString())).isTrue();
  }
  @Test void revokedAccountGenerationCannotModifyFavoritesAfterAuthentication(){
    var user=new com.studyroom.entity.User();user.setId(1L);user.setLoginVersion("revoked");
    assertThatThrownBy(()->favorites.forUser(user,()->favorites.delete(1,UUID.randomUUID()))).isInstanceOf(com.studyroom.common.AccountLoggedInElsewhereException.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_sticker_favorite",Integer.class)).isZero();
  }
  UUID social(long owner)throws Exception{return UUID.fromString(assets.upload(owner,UUID.randomUUID(),ImageFixtures.png(4,4),"image/png").asset().id());}
  UUID sticker(long owner)throws Exception{var image=new StaticImageCandidateProcessor().process(ImageFixtures.png(4,4),"image/png");return UUID.fromString(assets.copySticker(owner,UUID.randomUUID(),image).asset().id());}
  MediaPublicationService.Published publish(long owner,Long recipient,UUID asset){return publications.publish(owner,new MediaPublicationService.Command(UUID.randomUUID(),MediaPublicationService.Kind.PRIVATE,recipient,"fixture",null,List.of(asset)));}
  static void denied(org.assertj.core.api.ThrowableAssert.ThrowingCallable action,int status){assertThatThrownBy(action).isInstanceOf(MediaApiException.class).extracting(e->((MediaApiException)e).status()).isEqualTo(status);}
  static class TestClock extends Clock{long now=1_790_000_000_000L;public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return Instant.ofEpochMilli(now);}public long millis(){return now;}}
}
