package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import com.studyroom.common.GlobalExceptionHandler;
import com.studyroom.config.*;
import com.studyroom.entity.User;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.*;
import com.studyroom.service.*;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import javax.servlet.*;
import javax.servlet.http.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

/** Real business rows in an owned ephemeral MySQL; not a browser, websocket or deployed API test. */
class MediaPublicationMysqlIT {
  @TempDir static Path suiteRoot;
  @TempDir Path files;
  private static EphemeralMysql mysql;
  private static JdbcTemplate jdbc;
  private static com.zaxxer.hikari.HikariDataSource source;
  private PrivateImageStore store;
  private MediaAssetService assets;
  private MediaPublicationService publications;
  private MutableClock clock;
  private final CsrfTokenService csrf = new CsrfTokenService();

  @BeforeAll static void database() throws Exception {
    mysql = EphemeralMysql.start(suiteRoot, Path.of(System.getProperty("media.mysql.binary")));
    source=new com.zaxxer.hikari.HikariDataSource();source.setJdbcUrl(mysql.databaseUrl);source.setUsername("root");source.setPassword("");source.setMaximumPoolSize(4);source.setMinimumIdle(0);
    var datasource = source;
    jdbc = new JdbcTemplate(datasource); jdbc.setQueryTimeout(5); mysql.verifyOwnership();
    var flyway = Flyway.configure().dataSource(datasource).locations("classpath:db/migration", "classpath:db/media-migration").cleanDisabled(true).load();
    assertThat(flyway.migrate().migrationsExecuted).isEqualTo(15);
    assertThat(flyway.migrate().migrationsExecuted).isZero();
    for (int id : new int[] {1, 2, 3}) jdbc.update("INSERT INTO sr_user (id,username,password_hash,nickname) VALUES (?,?,?,?)",
        id, "publication-fixture-" + id, "unused-test-hash", "fixture");
  }
  @AfterAll static void shutdown() throws Exception {if(source!=null)source.close(); if (mysql != null) mysql.close(); }
  @BeforeEach void setup() throws Exception {
    mysql.verifyOwnership();
    // Every row here belongs to this new isolated suite, never a supplied/existing database.
    for (String table : List.of("sr_media_reference", "sr_media_publication", "sr_media_asset", "sr_chat_message_visibility",
        "sr_chat_message", "sr_private_conversation", "sr_post")) jdbc.update("DELETE FROM " + table);
    jdbc.update("UPDATE sr_user SET deleted=0,user_type='NORMAL',login_version='publication-test-version'");
    clock = new MutableClock(1_790_000_000_000L);
    var quota = new UploadQuotaService(files.resolve("uploads").toString(), 10_000_000, 50_000_000, 0, files.resolve("private").toString());
    store = new PrivateImageStore(quota);
    var repository = new MediaAssetRepository(jdbc); repository.verifySchema();
    assets = new MediaAssetService(repository, store, IsolatedImageProcessor.fromPackagedJar(Path.of(System.getProperty("media.worker.jar"))), clock);
    publications = new MediaPublicationService(jdbc, store, clock); publications.verifySchema();
  }

  @Test void postBindsOrderedImagesAndSurvivesTemporaryExpiry() throws Exception {
    UUID first = upload(1), second = upload(1);
    var command = command(MediaPublicationService.Kind.POST, null, List.of(second, first));
    var published = publications.publish(1, command);
    assertThat(ordered(published.targetId())).containsExactly(second.toString(), first.toString());
    var urls = new ObjectMapper().readTree(jdbc.queryForObject("SELECT image_urls_json FROM sr_post WHERE id=?", String.class, published.targetId()));
    assertThat(urls.get(0).asText()).isEqualTo("/api/media/assets/" + second + "/clear");
    clock.now += MediaAssetService.TTL + 1;
    readable(1, first); readable(2, first); readable(3, second);
    assertThat(publications.retireExpired(first)).isFalse();
    String uploadId = jdbc.queryForObject("SELECT client_upload_id FROM sr_media_asset WHERE asset_id=?", String.class, first.toString());
    assertThat(assets.lookup(1, UUID.fromString(uploadId)).status()).isEqualTo("bound");
    assertThat(publications.publish(1, command)).isEqualTo(published);
    assertThat(count("sr_post")).isEqualTo(1);
  }

  private User deletionActor(long id){var user=new User();user.setId(id);user.setLoginVersion("publication-test-version");return user;}
  @Test void explicitPostDeletionReleasesReferencesAtomicallyKeepsGraceAndReceipt()throws Exception{
    UUID a=upload(1),b=upload(1);var command=command(MediaPublicationService.Kind.POST,null,List.of(a,b));var post=publications.publish(1,command);
    var deletion=new PostDeletionService(jdbc,true);var tx=new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    assertThatThrownBy(()->tx.executeWithoutResult(s->deletion.delete(deletionActor(2),post.targetId(),false,"foreign"))).isInstanceOf(com.studyroom.common.BusinessException.class);
    assertThat(count("sr_media_reference")).isEqualTo(2);
    assertThatThrownBy(()->tx.executeWithoutResult(s->{deletion.delete(deletionActor(1),post.targetId(),false,"own");throw new IllegalStateException("audit failure");})).isInstanceOf(IllegalStateException.class);
    assertThat(count("sr_media_reference")).isEqualTo(2);assertThat(jdbc.queryForObject("SELECT deleted_by_user FROM sr_post WHERE id=?",Integer.class,post.targetId())).isZero();
    assertThat(tx.<Boolean>execute(s->deletion.delete(deletionActor(1),post.targetId(),false,"own"))).isTrue();
    long unreferenced=jdbc.queryForObject("SELECT unreferenced_at_ms FROM sr_media_asset WHERE asset_id=?",Long.class,a.toString());
    assertThat(tx.<Boolean>execute(s->deletion.delete(deletionActor(1),post.targetId(),false,"retry"))).isFalse();
    assertThat(jdbc.queryForObject("SELECT unreferenced_at_ms FROM sr_media_asset WHERE asset_id=?",Long.class,a.toString())).isEqualTo(unreferenced);
    assertThat(count("sr_media_reference")).isZero();assertThat(publications.publish(1,command)).isEqualTo(post);assertThat(count("sr_post")).isEqualTo(1);
    clock.now=unreferenced+MediaAssetCollector.GRACE_MS-1;var collector=new MediaAssetCollector(jdbc,store,clock);
    assertThat(collector.collect(a)).isEqualTo(MediaAssetCollector.Outcome.GRACE);assertThat(files.resolve("private/1/"+a+"/ready.bin")).exists();
    clock.now++;assertThat(collector.collect(a)).isEqualTo(MediaAssetCollector.Outcome.COLLECTED);
  }
  @Test void adminDeletionDoesNotReleaseAnotherLegalReference()throws Exception{
    UUID asset=upload(1);var first=publications.publish(1,command(MediaPublicationService.Kind.POST,null,List.of(asset)));
    // Isolated legacy shared-reference fixture: deletion must not assume exclusive ownership of an asset.
    jdbc.update("INSERT INTO sr_post(id,user_id,content) VALUES(900000,1,'other legitimate reference')");
    jdbc.update("INSERT INTO sr_media_reference(asset_id,post_id,position) VALUES(?,900000,0)",asset.toString());
    jdbc.update("UPDATE sr_user SET user_type='ADMIN' WHERE id=2");var tx=new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));var deletion=new PostDeletionService(jdbc,true);
    tx.executeWithoutResult(s->deletion.delete(deletionActor(2),first.targetId(),true,"moderation"));
    assertThat(count("sr_media_reference")).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT unreferenced_at_ms FROM sr_media_asset WHERE asset_id=?",Long.class,asset.toString())).isNull();
    assertThat(new MediaAssetCollector(jdbc,store,clock).collect(asset)).isEqualTo(MediaAssetCollector.Outcome.RETAINED);
  }
  @Test void collectorAndConcurrentOwnerAdminDeleteFinishWithoutPrematureCollection()throws Exception{
    UUID a=upload(1),b=upload(1);var post=publications.publish(1,command(MediaPublicationService.Kind.POST,null,List.of(b,a)));
    jdbc.update("UPDATE sr_user SET user_type='ADMIN' WHERE id=2");var deletion=new PostDeletionService(jdbc,true);var pool=Executors.newFixedThreadPool(3);var gate=new CyclicBarrier(3);
    try{
      var own=pool.submit(()->{gate.await();return new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())).execute(s->deletion.delete(deletionActor(1),post.targetId(),false,"own"));});
      var admin=pool.submit(()->{gate.await();return new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())).execute(s->deletion.delete(deletionActor(2),post.targetId(),true,"admin"));});
      var collect=pool.submit(()->{gate.await();return new MediaAssetCollector(jdbc,store,clock).collect(a);});
      assertThat(own.get(15,TimeUnit.SECONDS)).isTrue();assertThat(admin.get(15,TimeUnit.SECONDS)).isTrue();assertThat(collect.get(15,TimeUnit.SECONDS)).isIn(MediaAssetCollector.Outcome.RETAINED,MediaAssetCollector.Outcome.GRACE);
      assertThat(count("sr_media_reference")).isZero();assertThat(files.resolve("private/1/"+a+"/ready.bin")).exists();assertThat(files.resolve("private/1/"+b+"/ready.bin")).exists();
    }finally{pool.shutdownNow();}
  }
  @Test void guessedUncommittedPostCannotDetachAssetsWithoutLockingThem()throws Exception{
    jdbc.update("UPDATE sr_user SET user_type='ADMIN' WHERE id=2");var inserted=new CountDownLatch(1);var finish=new CountDownLatch(1);var pool=Executors.newSingleThreadExecutor();
    try{
      var publishing=pool.submit(()->new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())).execute(s->{jdbc.update("INSERT INTO sr_post(id,user_id,content) VALUES(900001,1,'not committed')");inserted.countDown();try{if(!finish.await(10,TimeUnit.SECONDS))throw new IllegalStateException("fixture deadline");}catch(InterruptedException e){throw new IllegalStateException(e);}return true;}));
      assertThat(inserted.await(5,TimeUnit.SECONDS)).isTrue();
      assertThatThrownBy(()->new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())).executeWithoutResult(s->new PostDeletionService(jdbc,true).delete(deletionActor(2),900001,true,"guessed"))).isInstanceOf(com.studyroom.common.BusinessException.class);
      finish.countDown();assertThat(publishing.get(10,TimeUnit.SECONDS)).isTrue();assertThat(jdbc.queryForObject("SELECT deleted_by_admin FROM sr_post WHERE id=900001",Integer.class)).isZero();
    }finally{finish.countDown();pool.shutdownNow();}
  }

  @Test void privateImageRequiresActualParticipantsAndRecallRevokesOwnerToo() {
    UUID image = upload(1);
    var published = publications.publish(1, command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(image)));
    readable(1, image); readable(2, image); denied(3, image);
    jdbc.update("UPDATE sr_chat_message SET recalled_at=CURRENT_TIMESTAMP,recalled_by_id=1 WHERE id=?", published.targetId());
    denied(1, image); denied(2, image); denied(3, image);
    assertThat(jdbc.queryForObject("SELECT published_at_ms FROM sr_media_asset WHERE asset_id=?", Long.class, image.toString())).isNotNull();
  }

  @Test void hidingIsPerViewerAndHardDeletionCannotRestoreStagingAccess() {
    UUID image = upload(1);
    var command = command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(image));
    var published = publications.publish(1, command);
    jdbc.update("INSERT INTO sr_chat_message_visibility (message_id,user_id) VALUES (?,2)", published.targetId());
    readable(1, image); denied(2, image);
    jdbc.update("DELETE FROM sr_chat_message WHERE id=?", published.targetId());
    assertThat(count("sr_media_reference")).isZero();
    denied(1, image); denied(2, image);
    assertThat(publications.publish(1, command)).isEqualTo(published);
    assertThat(count("sr_chat_message")).isZero();
  }

  @Test void conversationMembershipMustAgreeWithMessageParticipants() {
    UUID image = upload(1);
    var published = publications.publish(1, command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(image)));
    jdbc.update("UPDATE sr_private_conversation SET user_b_id=3");
    denied(1, image); denied(2, image); denied(3, image);
    assertThat(count("sr_chat_message")).isEqualTo(1);
  }

  @Test void hallAndPostDeletionRulesApplyWithoutOwnerBypass() {
    UUID hall = upload(1), post = upload(1);
    var hallTarget = publications.publish(1, command(MediaPublicationService.Kind.HALL, null, List.of(hall)));
    var postTarget = publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(post)));
    readable(2, hall); readable(3, post);
    jdbc.update("UPDATE sr_chat_message SET recalled_at=CURRENT_TIMESTAMP WHERE id=?", hallTarget.targetId());
    denied(1, hall); denied(2, hall);
    jdbc.update("UPDATE sr_post SET deleted_by_admin=1 WHERE id=?", postTarget.targetId());
    denied(1, post); denied(2, post);
    jdbc.update("UPDATE sr_post SET deleted_by_admin=0,deleted_by_user=1 WHERE id=?", postTarget.targetId());
    denied(1, post); denied(3, post);
  }

  @Test void mixedForeignMissingAndDuplicateAssetsNeverPublishPartialPost() {
    UUID own = upload(1), foreign = upload(2);
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(own, foreign))), 409);
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(own, UUID.randomUUID()))), 409);
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(own, own))), 400);
    assertThat(count("sr_post")).isZero(); assertThat(count("sr_media_publication")).isZero();
    assertThat(count("sr_media_reference")).isZero(); readable(1, own); denied(2, own);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset WHERE published_at_ms IS NOT NULL", Integer.class)).isZero();
  }

  @Test void publicationFingerprintIncludesContentRecipientKindSceneAndImageOrder() {
    UUID a = upload(1), b = upload(1);
    var original = command(MediaPublicationService.Kind.POST, null, List.of(a, b));
    publications.publish(1, original);
    failure(() -> publications.publish(1, new MediaPublicationService.Command(original.requestId(), original.kind(), null, "changed", "default", original.assets())), 409);
    failure(() -> publications.publish(1, new MediaPublicationService.Command(original.requestId(), original.kind(), null, original.content(), "forest", original.assets())), 409);
    failure(() -> publications.publish(1, new MediaPublicationService.Command(original.requestId(), original.kind(), null, original.content(), original.scene(), List.of(b, a))), 409);
    UUID c = upload(1);
    var chat = command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(c)); publications.publish(1, chat);
    failure(() -> publications.publish(1, new MediaPublicationService.Command(chat.requestId(), chat.kind(), 3L, chat.content(), null, chat.assets())), 409);
    failure(() -> publications.publish(1, new MediaPublicationService.Command(chat.requestId(), MediaPublicationService.Kind.HALL, null, chat.content(), null, chat.assets())), 409);
    assertThat(count("sr_post")).isEqualTo(1); assertThat(count("sr_chat_message")).isEqualTo(1);
  }

  @Test void simultaneousSameRequestCreatesOneBusinessRow() throws Exception {
    UUID image = upload(1); var command = command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(image));
    var executor = Executors.newFixedThreadPool(2); var barrier = new CyclicBarrier(2);
    try {
      Callable<MediaPublicationService.Published> task = () -> { barrier.await(5, TimeUnit.SECONDS); return publications.publish(1, command); };
      var first = executor.submit(task); var second = executor.submit(task);
      assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(second.get(10, TimeUnit.SECONDS));
      assertThat(count("sr_chat_message")).isEqualTo(1); assertThat(count("sr_media_reference")).isEqualTo(1);
      assertThat(count("sr_private_conversation")).isEqualTo(1);
    } finally { executor.shutdownNow(); }
  }

  @Test void simultaneousDifferentRequestsCannotRebindSameAsset() throws Exception {
    UUID image = upload(1); var executor = Executors.newFixedThreadPool(2); var barrier = new CyclicBarrier(2);
    try {
      Callable<Integer> task = () -> { barrier.await(5, TimeUnit.SECONDS);
        try { publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image))); return 200; }
        catch (MediaApiException conflict) { return conflict.status(); }
      };
      var first = executor.submit(task); var second = executor.submit(task);
      assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(200, 409);
      assertThat(count("sr_post")).isEqualTo(1); assertThat(count("sr_media_publication")).isEqualTo(1);
    } finally { executor.shutdownNow(); }
  }

  @Test void outerTransactionRollbackRemovesBusinessReferenceAndPublicationTogether() {
    UUID image = upload(1); var command = command(MediaPublicationService.Kind.HALL, null, List.of(image));
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    transaction.execute(status -> { publications.publish(1, command); status.setRollbackOnly(); return null; });
    assertThat(count("sr_chat_message")).isZero(); assertThat(count("sr_media_reference")).isZero();
    assertThat(count("sr_media_publication")).isZero(); readable(1, image); denied(2, image);
    publications.publish(1, command); readable(2, image);
  }

  @Test void expiryAfterTargetCreationRollsBackEverything() {
    UUID image = upload(1); long start = clock.now;
    var reads = new AtomicInteger();
    Clock changing = new MutableClock(start) {
      @Override public long millis() { return reads.getAndIncrement() == 0 ? start : start + MediaAssetService.TTL; }
    };
    var expiring = new MediaPublicationService(jdbc, store, changing);
    failure(() -> expiring.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image))), 409);
    assertThat(count("sr_post")).isZero(); assertThat(count("sr_media_reference")).isZero();
    assertThat(count("sr_media_publication")).isZero();
  }

  @Test void expiredRetirementPreventsPublishingAndKeepsPrivateFiles() {
    UUID image = upload(1); clock.now += MediaAssetService.TTL;
    assertThat(publications.retireExpired(image)).isTrue(); assertThat(publications.retireExpired(image)).isFalse();
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image))), 409);
    denied(1, image); denied(2, image);
    assertThat(files.resolve("private/1/" + image + "/ready.bin")).exists();
    assertThat(count("sr_post")).isZero();
  }

  @Test void collectorKeepsFullExpiryGraceThenDeletesOnlyRetiredUnreferencedFiles() throws Exception {
    UUID image = upload(1);
    var collector = new MediaAssetCollector(jdbc, store, clock); collector.verifySchema();
    clock.now += MediaAssetService.TTL;
    assertThat(publications.retireExpired(image)).isTrue();
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.GRACE);
    clock.now += MediaAssetCollector.GRACE_MS - 1;
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.GRACE);
    assertThat(files.resolve("private/1/" + image + "/ready.bin")).exists();
    clock.now++;
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.COLLECTED);
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.ALREADY_COLLECTED);
    assertThat(files.resolve("private/1/" + image)).doesNotExist();
    assertThat(count("sr_media_asset")).isEqualTo(1); // Idempotency tombstone survives.
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image))), 409);
  }

  @Test void descriptorsFollowBoundOrderAndExcludeStagedRecalledAndDeletedAssets() {
    UUID first = upload(1), second = upload(1), staged = upload(1);
    var post = publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(second, first)));
    var descriptions = new MediaDescriptorService(jdbc);
    var items = descriptions.posts(List.of(post.targetId())).get(post.targetId());
    assertThat(items).extracting(com.studyroom.dto.MediaDescriptor::assetId).containsExactly(second.toString(), first.toString());
    assertThat(items.get(0).width()).isEqualTo(32);
    assertThat(items.get(0).thumbnailUrl()).isEqualTo("/api/media/assets/" + second + "/thumb");
    assertThat(items.get(0).animated()).isFalse();
    assertThat(items).extracting(com.studyroom.dto.MediaDescriptor::assetId).doesNotContain(staged.toString());
    var chat = publications.publish(1, command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(staged)));
    assertThat(descriptions.messages(List.of(chat.targetId())).get(chat.targetId())).hasSize(1);
    jdbc.update("UPDATE sr_chat_message SET recalled_at=CURRENT_TIMESTAMP WHERE id=?", chat.targetId());
    jdbc.update("UPDATE sr_post SET deleted_by_user=1 WHERE id=?", post.targetId());
    assertThat(descriptions.messages(List.of(chat.targetId()))).isEmpty();
    assertThat(descriptions.posts(List.of(post.targetId()))).isEmpty();
  }

  @Test void publishedAssetHasFreshGraceAfterFinalReferenceDisappears() throws Exception {
    UUID image = upload(1);
    var command = command(MediaPublicationService.Kind.POST, null, List.of(image));
    var target = publications.publish(1, command);
    var collector = new MediaAssetCollector(jdbc, store, clock);
    clock.now += MediaAssetService.TTL + MediaAssetCollector.GRACE_MS * 3;
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.RETAINED);
    jdbc.update("UPDATE sr_post SET deleted_by_admin=1 WHERE id=?", target.targetId());
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.RETAINED);
    jdbc.update("UPDATE sr_post SET deleted_by_user=1 WHERE id=?", target.targetId());
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.GRACE);
    assertThat(count("sr_media_reference")).isZero();
    clock.now += MediaAssetCollector.GRACE_MS - 1;
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.GRACE);
    clock.now++;
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.COLLECTED);
    assertThat(publications.publish(1, command)).isEqualTo(target);
    assertThat(count("sr_post")).isEqualTo(1);
  }

  @Test void collectionFailureIsRetiredRetryableAndDoesNotDeleteUnknownFiles() throws Exception {
    UUID image = upload(1);
    Path unknown = files.resolve("private/1/" + image + "/unknown.bin");
    Files.write(unknown, new byte[] {42});
    clock.now += MediaAssetService.TTL + MediaAssetCollector.GRACE_MS;
    var collector = new MediaAssetCollector(jdbc, store, clock);
    assertThatThrownBy(() -> collector.collect(image)).isInstanceOf(java.io.IOException.class);
    assertThat(unknown).exists();
    assertThat(files.resolve("private/1/" + image + "/ready.bin")).exists();
    assertThat(jdbc.queryForObject("SELECT retired_at_ms FROM sr_media_asset WHERE asset_id=?", Long.class, image.toString())).isNotNull();
    assertThat(jdbc.queryForObject("SELECT collected_at_ms FROM sr_media_asset WHERE asset_id=?", Long.class, image.toString())).isNull();
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image))), 409);
    Files.delete(unknown); // Only our deliberately generated obstruction, inside @TempDir.
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.COLLECTED);
  }

  @Test void recallReleasesButOneSidedHistoryDeletionKeepsPrivateReference() throws Exception {
    UUID image = upload(1);
    var target = publications.publish(1, command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(image)));
    var collector = new MediaAssetCollector(jdbc, store, clock);
    jdbc.update("INSERT INTO sr_chat_message_visibility (message_id,user_id) VALUES (?,2)", target.targetId());
    clock.now += MediaAssetService.TTL + MediaAssetCollector.GRACE_MS;
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.RETAINED);
    readable(1, image);
    jdbc.update("UPDATE sr_chat_message SET recalled_at=CURRENT_TIMESTAMP WHERE id=?", target.targetId());
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.GRACE);
    clock.now += MediaAssetCollector.GRACE_MS;
    assertThat(collector.collect(image)).isEqualTo(MediaAssetCollector.Outcome.COLLECTED);
  }

  @Test void realPublisherLockPreventsCollectorFromRemovingPublishedFiles() throws Exception {
    UUID image = upload(1); var executor = Executors.newSingleThreadExecutor();
    var tx = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    var collector = new MediaAssetCollector(jdbc, store, clock);
    var pending = new java.util.concurrent.atomic.AtomicReference<Future<MediaAssetCollector.Outcome>>();
    try {
      tx.execute(status -> {
        publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image)));
        clock.now += MediaAssetService.TTL + MediaAssetCollector.GRACE_MS;
        pending.set(executor.submit(() -> collector.collect(image)));
        try { awaitAssetLockWait(); } catch (InterruptedException error) { throw new AssertionError(error); }
        return null;
      });
      assertThat(pending.get().get(8, TimeUnit.SECONDS)).isEqualTo(MediaAssetCollector.Outcome.RETAINED);
      readable(2, image);
    } finally { executor.shutdownNow(); }
  }

  @Test void lockWaitCannotUseAnOutdatedPreLockExpiryTime() throws Exception {
    UUID image = upload(1); var executor = Executors.newFixedThreadPool(2);
    var locked = new CountDownLatch(1); var release = new CountDownLatch(1); var started = new CountDownLatch(1);
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    try {
      var blocker = executor.submit(() -> transaction.execute(status -> {
        jdbc.queryForList("SELECT asset_id FROM sr_media_asset WHERE asset_id=? FOR UPDATE", image.toString()); locked.countDown();
        try { if (!release.await(4, TimeUnit.SECONDS)) throw new AssertionError("lock not released"); }
        catch (InterruptedException error) { throw new AssertionError(error); } return null;
      }));
      assertThat(locked.await(4, TimeUnit.SECONDS)).isTrue();
      var publisher = executor.submit(() -> { started.countDown(); return publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image))); });
      assertThat(started.await(4, TimeUnit.SECONDS)).isTrue(); awaitAssetLockWait();
      clock.now += MediaAssetService.TTL; release.countDown(); blocker.get(5, TimeUnit.SECONDS);
      assertThatThrownBy(() -> publisher.get(8, TimeUnit.SECONDS)).hasCauseInstanceOf(MediaApiException.class);
      assertThat(publications.retireExpired(image)).isTrue(); assertThat(count("sr_post")).isZero();
    } finally { release.countDown(); executor.shutdownNow(); }
  }

  @Test void publisherAndRetirementSerializeOnTheSameAssetRow() throws Exception {
    UUID image = upload(1); var executor = Executors.newSingleThreadExecutor();
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    var started = new CountDownLatch(1);
    try {
      var pending = new java.util.concurrent.atomic.AtomicReference<Future<Boolean>>();
      transaction.execute(status -> {
        publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image)));
        clock.now += MediaAssetService.TTL;
        pending.set(executor.submit(() -> { started.countDown(); return publications.retireExpired(image); }));
        try { assertThat(started.await(4, TimeUnit.SECONDS)).isTrue(); awaitAssetLockWait(); }
        catch (InterruptedException error) { throw new AssertionError(error); }
        return null;
      });
      assertThat(pending.get().get(8, TimeUnit.SECONDS)).isFalse(); readable(2, image);
    } finally { executor.shutdownNow(); }
  }

  @Test void invalidAccountsTargetsCountsAndCorruptFilesNeverPublish() throws Exception {
    UUID image = upload(1);
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.PRIVATE, 1L, List.of(image))), 400);
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.PRIVATE, 999L, List.of(image))), 403);
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of())), 400);
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, java.util.stream.IntStream.range(0, 10).mapToObj(i -> UUID.randomUUID()).toList())), 400);
    for (String type : List.of("MUTED", "BANNED")) {
      jdbc.update("UPDATE sr_user SET user_type=? WHERE id=1", type);
      failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image))), 403);
    }
    jdbc.update("UPDATE sr_user SET user_type='NORMAL' WHERE id=1");
    Files.write(files.resolve("private/1/" + image + "/thumb.bin"), new byte[] {1});
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(image))), 503);
    assertThat(count("sr_post")).isZero(); assertThat(count("sr_media_publication")).isZero();
  }

  @Test void recallBetweenAuthorizationAndFinalReadCheckDoesNotReturnBytes() {
    UUID image = upload(1);
    var target = publications.publish(1, command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(image)));
    var checks = new AtomicInteger();
    var racing = new MediaAssetRepository(jdbc) {
      @Override public Row readable(long viewer, UUID id, long now) {
        Row row = super.readable(viewer, id, now);
        if (checks.getAndIncrement() == 0) jdbc.update("UPDATE sr_chat_message SET recalled_at=CURRENT_TIMESTAMP WHERE id=?", target.targetId());
        return row;
      }
    };
    var reading = new MediaAssetService(racing, store, (bytes, mime) -> { throw new AssertionError("Read must not decode"); }, clock);
    failure(() -> reading.read(2, image, PrivateImageStore.Variant.CLEAR), 404);
    assertThat(checks.get()).isEqualTo(2);
  }

  @Test void nineImagesKeepOrderAndAnAlreadyBoundImageCannotMoveToAnotherPost() {
    List<UUID> images = new ArrayList<>(); for (int i = 0; i < 9; i++) images.add(upload(1));
    Collections.reverse(images);
    var target = publications.publish(1, command(MediaPublicationService.Kind.POST, null, images));
    assertThat(ordered(target.targetId())).isEqualTo(images.stream().map(UUID::toString).toList());
    failure(() -> publications.publish(1, command(MediaPublicationService.Kind.POST, null, List.of(images.get(0)))), 409);
    denied(0, images.get(0)); assertThat(count("sr_post")).isEqualTo(1);
  }

  @Test void oppositeImageOrdersDoNotDeadlockOrProducePartialReferences() throws Exception {
    UUID a = upload(1), b = upload(1); var executor = Executors.newFixedThreadPool(2); var barrier = new CyclicBarrier(2);
    try {
      java.util.function.Function<List<UUID>, Integer> publish = order -> {
        try { barrier.await(5, TimeUnit.SECONDS); publications.publish(1, command(MediaPublicationService.Kind.POST, null, order)); return 200; }
        catch (MediaApiException conflict) { return conflict.status(); }
        catch (Exception failure) { throw new AssertionError(failure); }
      };
      var first = executor.submit(() -> publish.apply(List.of(a, b))); var second = executor.submit(() -> publish.apply(List.of(b, a)));
      assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(200, 409);
      assertThat(count("sr_post")).isEqualTo(1); assertThat(count("sr_media_reference")).isEqualTo(2);
    } finally { executor.shutdownNow(); }
  }

  private UUID upload(long owner) {
    return UUID.fromString(assets.upload(owner, UUID.randomUUID(), ImageFixtures.WEBP_LOSSY, "image/webp").asset().id());
  }

  @Test void notificationRunsOnlyAfterCommitAndNotOnRollbackOrReplay() {
    UUID image = upload(1); var command = command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(image));
    var events = new ArrayList<MediaPublicationService.Committed>();
    var notifying = new MediaPublicationService(jdbc, store, clock, event -> {
      assertThat(publications.lookup(1, command.requestId()).status()).isEqualTo("committed"); events.add(event);
    });
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    transaction.execute(status -> { notifying.publish(1, command); assertThat(events).isEmpty(); status.setRollbackOnly(); return null; });
    assertThat(events).isEmpty(); assertThat(publications.lookup(1, command.requestId()).status()).isEqualTo("unconfirmed");
    transaction.execute(status -> { notifying.publish(1, command); assertThat(events).isEmpty(); return null; });
    assertThat(events).hasSize(1); assertThat(events.get(0).recipient()).isEqualTo(2L);
    notifying.publish(1, command); assertThat(events).hasSize(1);
  }

  @Test void notificationFailureCannotTurnCommittedPublicationIntoFailedRequest() {
    UUID image = upload(1); var command = command(MediaPublicationService.Kind.HALL, null, List.of(image)); var calls = new AtomicInteger();
    var notifying = new MediaPublicationService(jdbc, store, clock, event -> { calls.incrementAndGet(); throw new IllegalStateException("Injected failure"); });
    var result = notifying.publish(1, command);
    assertThat(notifying.lookup(1, command.requestId()).publication()).isEqualTo(result);
    assertThat(notifying.publish(1, command)).isEqualTo(result); assertThat(calls.get()).isEqualTo(1);
  }

  @Test void lookupDoesNotPretendUncommittedRequestIsAbsentOrLeakOtherOwnerResult() {
    UUID image = upload(1); var command = command(MediaPublicationService.Kind.POST, null, List.of(image));
    var transaction = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    transaction.execute(status -> {
      publications.publish(1, command);
      assertThat(publications.lookup(1, command.requestId()).status()).isEqualTo("unconfirmed"); return null;
    });
    assertThat(publications.lookup(1, command.requestId()).status()).isEqualTo("committed");
    assertThat(publications.lookup(2, command.requestId()).status()).isEqualTo("unconfirmed");
  }

  @Test void lookupDatabaseFailureIs503NotUnconfirmed() {
    var unavailable = new AbstractDataSource() {
      @Override public java.sql.Connection getConnection() throws java.sql.SQLException { throw new java.sql.SQLException("Injected outage"); }
      @Override public java.sql.Connection getConnection(String user, String password) throws java.sql.SQLException { return getConnection(); }
    };
    failure(() -> new MediaPublicationService(new JdbcTemplate(unavailable), store, clock).lookup(1, UUID.randomUUID()), 503);
  }

  @Test void httpPublishesQueriesAndReplaysWithFrozenRecipient() throws Exception {
    UUID image = upload(1); var command = command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(image));
    var session = session(1); MockMvc mvc = mvc(false); String body = new ObjectMapper().writeValueAsString(command);
    for (int i = 0; i < 2; i++) mvc.perform(post("/api/media/publications").session(session).contentType("application/json")
        .header("Origin", "http://127.0.0.1:49848").header(CsrfTokenService.HEADER_NAME, csrf.issue(session)).content(body))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.kind").value("PRIVATE"))
        .andExpect(header().string("Cache-Control", "private, no-store"));
    mvc.perform(get("/api/media/publications/" + command.requestId()).session(session)).andExpect(status().isOk())
        .andExpect(jsonPath("$.data.status").value("committed"));
    mvc.perform(get("/api/media/publications/" + command.requestId()).session(session(2))).andExpect(status().isOk())
        .andExpect(jsonPath("$.data.status").value("unconfirmed"));
    mvc.perform(post("/api/media/publications").session(session).contentType("application/json")
        .header("Origin", "http://127.0.0.1:49848").header(CsrfTokenService.HEADER_NAME, csrf.issue(session))
        .content(body.replace("\"recipient\":2", "\"recipient\":3"))).andExpect(status().isConflict());
    assertThat(count("sr_chat_message")).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT receiver_id FROM sr_chat_message", Long.class)).isEqualTo(2);
  }

  @Test void httpRequiresActiveLoginCsrfAndAllowedOrigin() throws Exception {
    var mvc = mvc(false); var session = session(1); String path = "/api/media/publications/" + UUID.randomUUID();
    mvc.perform(get(path)).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/media/publications").session(session).contentType("application/json").content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/media/publications").session(session).contentType("application/json").content("{}")
        .header("Origin", "https://untrusted.invalid").header(CsrfTokenService.HEADER_NAME, csrf.issue(session))).andExpect(status().isForbidden());
    jdbc.update("UPDATE sr_user SET user_type='BANNED' WHERE id=1");
    mvc.perform(get(path).session(session)).andExpect(status().isForbidden());
    jdbc.update("UPDATE sr_user SET user_type='NORMAL',login_version='replaced' WHERE id=1");
    mvc.perform(get(path).session(session)).andExpect(status().isUnauthorized());
    assertThat(count("sr_media_publication")).isZero();
  }

  @Test void httpRejectsOversizeBothLengthModesAndMultipart() throws Exception {
    var session = session(1);
    for (boolean unknown : List.of(false, true)) mvc(unknown).perform(post("/api/media/publications").session(session)
        .contentType("application/json").header("Origin", "http://127.0.0.1:49848")
        .header(CsrfTokenService.HEADER_NAME, csrf.issue(session)).content(new byte[MediaPublicationController.MAX_BODY + 1]))
        .andExpect(status().isPayloadTooLarge());
    mvc(false).perform(post("/api/media/publications").contentType("multipart/form-data; boundary=test").content("bad"))
        .andExpect(status().isUnsupportedMediaType());
    assertThat(count("sr_media_publication")).isZero();
  }

  @Test void httpRejectsExtraDuplicateNestedCoercedAndTrailingJson() throws Exception {
    var session = session(1); var mvc = mvc(false);
    String body = new ObjectMapper().writeValueAsString(command(MediaPublicationService.Kind.PRIVATE, 2L, List.of(UUID.randomUUID())));
    for (String invalid : List.of(body.substring(0, body.length()-1) + ",\"ownerId\":2}", body + "{}",
        body.replace("\"recipient\":2", "\"recipient\":2,\"recipient\":3"), body.replace("\"recipient\":2", "\"recipient\":\"2\""),
        "{\"content\":" + "[".repeat(1000), body.replace("\"PRIVATE\"", "\"UNSUPPORTED\""), "{", "null")) {
      mvc.perform(post("/api/media/publications").session(session).contentType("application/json").content(invalid)
          .header("Origin", "http://127.0.0.1:49848").header(CsrfTokenService.HEADER_NAME, csrf.issue(session))).andExpect(status().isBadRequest());
    }
    mvc.perform(get("/api/media/publications/1-1-1-1-1").session(session)).andExpect(status().isBadRequest());
    assertThat(count("sr_media_publication")).isZero();
  }

  private MockHttpSession session(long id) {
    var session = new MockHttpSession(); session.setAttribute(AuthService.SESSION_USER_ID, id);
    session.setAttribute(AuthService.SESSION_LOGIN_VERSION, "publication-test-version"); return session;
  }
  private MockMvc mvc(boolean unknownLength) {
    UserMapper users = mock(UserMapper.class);
    when(users.selectById(any())).thenAnswer(invocation -> {
      long id = ((Number) invocation.getArgument(0)).longValue();
      var rows = jdbc.query("SELECT id,user_type,deleted,login_version FROM sr_user WHERE id=?", (r, n) -> {
        var user = new User(); user.setId(r.getLong(1)); user.setUserType(r.getString(2)); user.setDeleted(r.getInt(3)); user.setLoginVersion(r.getString(4)); return user;
      }, id); return rows.isEmpty() ? null : rows.get(0);
    });
    var security = new AuthSecurityProperties();
    var auth = new AuthService(users, mock(PasswordService.class), mock(InvitationService.class), security);
    var builder = MockMvcBuilders.standaloneSetup(new MediaPublicationController(auth, publications))
        .setControllerAdvice(new MediaApiAdvice(), new GlobalExceptionHandler())
        .addInterceptors(new SessionPolicyInterceptor(security), new CsrfOriginInterceptor(csrf, new CorsOriginProperties()));
    if (unknownLength) builder.addFilters((Filter) (request, response, chain) -> chain.doFilter(new HttpServletRequestWrapper((HttpServletRequest) request) {
      @Override public int getContentLength() { return -1; }
      @Override public long getContentLengthLong() { return -1; }
    }, response));
    return builder.addFilter(new MediaBoundaryFilter(new ObjectMapper()), "/api/media/*").build();
  }
  private void awaitAssetLockWait() throws InterruptedException {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
    do {
      Integer waiting = jdbc.queryForObject("SELECT COUNT(*) FROM performance_schema.data_lock_waits w "
          + "JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID "
          + "WHERE l.OBJECT_SCHEMA=DATABASE() AND l.OBJECT_NAME='sr_media_asset'", Integer.class);
      if (waiting != null && waiting > 0) return;
      Thread.sleep(20);
    } while (System.nanoTime() < deadline);
    throw new AssertionError("Expected a real MySQL asset row lock wait");
  }
  private MediaPublicationService.Command command(MediaPublicationService.Kind kind, Long recipient, List<UUID> images) {
    return new MediaPublicationService.Command(UUID.randomUUID(), kind, recipient, "test publication", null, images);
  }
  private void readable(long viewer, UUID id) { assertThat(assets.read(viewer, id, PrivateImageStore.Variant.CLEAR).bytes()).isEqualTo(ImageFixtures.WEBP_LOSSY); }
  private void denied(long viewer, UUID id) { failure(() -> assets.read(viewer, id, PrivateImageStore.Variant.CLEAR), 404); }
  private List<String> ordered(long post) { return jdbc.queryForList("SELECT asset_id FROM sr_media_reference WHERE post_id=? ORDER BY position", String.class, post); }
  private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
  private static void failure(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, int status) {
    assertThatThrownBy(action).isInstanceOfSatisfying(MediaApiException.class, error -> assertThat(error.status()).isEqualTo(status));
  }
  private static class MutableClock extends Clock {
    volatile long now;
    MutableClock(long now) { this.now = now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
    @Override public Instant instant() { return Instant.ofEpochMilli(millis()); }
    @Override public long millis() { return now; }
  }
}
