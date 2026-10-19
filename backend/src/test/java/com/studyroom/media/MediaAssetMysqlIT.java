package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.GlobalExceptionHandler;
import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.config.CorsOriginProperties;
import com.studyroom.entity.User;
import com.studyroom.mapper.UserMapper;
import com.studyroom.security.CsrfOriginInterceptor;
import com.studyroom.security.CsrfTokenService;
import com.studyroom.security.PasswordService;
import com.studyroom.security.SessionPolicyInterceptor;
import com.studyroom.service.AuthService;
import com.studyroom.service.InvitationService;
import com.studyroom.service.UploadQuotaService;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import javax.servlet.*;
import javax.servlet.http.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Explicit opt-in: real isolated MySQL + packaged decoder + filesystem. HTTP transport is MockMvc, not a deployed server. */
class MediaAssetMysqlIT {
  @TempDir static Path suiteRoot;
  @TempDir Path files;
  private static EphemeralMysql mysql;
  private static JdbcTemplate jdbc;
  private MediaAssetRepository repository;
  private PrivateImageStore store;
  private IsolatedImageProcessor processor;
  private MutableClock clock;
  private MediaAssetService assets;
  private final ObjectMapper json = new ObjectMapper();
  private final CsrfTokenService csrf = new CsrfTokenService();
  private MockMvc mvc;

  @BeforeAll static void startDatabase() throws Exception {
    String executable = System.getProperty("media.mysql.binary");
    assertThat(executable).as("Set the explicit mysqld binary for the isolated media verification profile").isNotBlank();
    mysql = EphemeralMysql.start(suiteRoot, Path.of(executable));
    var datasource = new DriverManagerDataSource(mysql.databaseUrl, "root", "");
    jdbc = new JdbcTemplate(datasource); jdbc.setQueryTimeout(5);
    mysql.verifyOwnership();
    var baseline = Flyway.configure().dataSource(datasource).locations("classpath:db/migration").cleanDisabled(true).load();
    assertThat(baseline.migrate().migrationsExecuted).isEqualTo(4);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='sr_media_asset'", Integer.class)).isZero();
    var media = Flyway.configure().dataSource(datasource).locations("classpath:db/migration", "classpath:db/media-migration").cleanDisabled(true).load();
    assertThat(media.migrate().migrationsExecuted).isEqualTo(11);
    assertThat(media.migrate().migrationsExecuted).isZero();
    for (int id : new int[] {1, 2}) jdbc.update("INSERT INTO sr_user (id,username,password_hash,nickname,login_version) VALUES (?,?,?,?,?)",
        id, "isolated-user-" + id, "unused-test-hash", "fixture", "test-session-version");
  }

  @AfterAll static void stopDatabase() throws Exception { if (mysql != null) mysql.close(); }

  @BeforeEach void setUp() throws Exception {
    mysql.verifyOwnership();
    jdbc.update("DELETE FROM sr_media_asset"); // Only this verified ephemeral schema, no historical/user data.
    jdbc.update("UPDATE sr_user SET user_type='NORMAL',deleted=0,login_version='test-session-version' WHERE id IN (1,2)");
    repository = new MediaAssetRepository(jdbc); repository.verifySchema();
    var quota = new UploadQuotaService(files.resolve("uploads").toString(), 10_000_000, 50_000_000, 0, files.resolve("private").toString());
    store = new PrivateImageStore(quota);
    processor = IsolatedImageProcessor.fromPackagedJar(Path.of(System.getProperty("media.worker.jar")));
    clock = new MutableClock(1_790_000_000_000L);
    assets = service(repository);
    mvc = mvc(false);
  }

  @Test void uploadReplayReturnsSameAssetAndChangedBytesConflict() throws Exception {
    UUID request = UUID.randomUUID();
    var first = assets.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp");
    var second = assets.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp");
    assertThat(first.status()).isEqualTo("ready");
    assertThat(second.asset()).isEqualTo(first.asset());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset", Integer.class)).isEqualTo(1);
    try (var directories = Files.list(files.resolve("private/1"))) { assertThat(directories.count()).isEqualTo(1); }
    apiFailure(() -> assets.upload(1, request, ImageFixtures.WEBP_LOSSLESS, "image/webp"), 409, "MEDIA_UPLOAD_CONFLICT");
    assertThat(assets.lookup(2, request).status()).isEqualTo("missing");
    var other = assets.upload(2, request, ImageFixtures.WEBP_LOSSY, "image/webp");
    assertThat(other.asset().id()).isNotEqualTo(first.asset().id());
  }

  @Test void inProgressUploadIsVisibleAndConcurrentReplayDoesNotDecodeAgain() throws Exception {
    var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var calls = new AtomicInteger();
    var slow = new MediaAssetService(repository, store, (bytes, mime) -> {
      calls.incrementAndGet(); entered.countDown();
      if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("Test did not release decoder");
      return processor.process(bytes, mime);
    }, clock);
    var executor = Executors.newSingleThreadExecutor(); UUID request = UUID.randomUUID();
    try {
      var first = executor.submit(() -> slow.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp"));
      assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(assets.lookup(1, request).status()).isEqualTo("pending");
      assertThat(assets.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp").status()).isEqualTo("pending");
      assertThat(calls.get()).isEqualTo(1);
      release.countDown();
      assertThat(first.get(10, TimeUnit.SECONDS).status()).isEqualTo("ready");
    } finally { release.countDown(); executor.shutdownNow(); }
  }

  @Test void databaseFailureAfterFilesAreSavedCanRecoverWithoutReuploading() throws Exception {
    for (boolean commitBeforeFailure : new boolean[] {false, true}) {
      var attempts = new AtomicInteger();
      var uncertain = new MediaAssetRepository(jdbc) {
        @Override public boolean ready(Row row, StaticImageCandidateProcessor.Result result, long now) {
          if (attempts.getAndIncrement() == 0) {
            if (commitBeforeFailure) super.ready(row, result, now);
            throw new TransientDataAccessResourceException("Injected uncertain DB acknowledgement");
          }
          return super.ready(row, result, now);
        }
      };
      UUID request = UUID.randomUUID();
      apiFailure(() -> service(uncertain).upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp"), 503, "MEDIA_UNAVAILABLE");
      var row = repository.byUpload(1, request);
      assertThat(files.resolve("private/1/" + row.assetId() + "/ready.bin")).exists();
      var recovered = assets.lookup(1, request);
      assertThat(recovered.status()).isEqualTo("ready");
      assertThat(recovered.asset().id()).isEqualTo(row.assetId().toString());
      assertThat(assets.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp").asset()).isEqualTo(recovered.asset());
    }
    try (var directories = Files.list(files.resolve("private/1"))) { assertThat(directories.count()).isEqualTo(2); }
  }

  @Test void processingClaimCommitsIndependentlyOfAnOuterTransaction() throws Exception {
    var transaction = new org.springframework.transaction.support.TransactionTemplate(
        new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
    UUID request = UUID.randomUUID(); long now = clock.millis();
    var row = new MediaAssetRepository.Row(UUID.randomUUID(), 1, request, "b".repeat(64), "image/png", "PROCESSING",
        null, now, now + 1000, now + MediaAssetService.TTL, null, 0, 0, 0, 0, null, null);
    var executor = Executors.newSingleThreadExecutor();
    try {
      transaction.execute(status -> {
        assertThat(repository.insert(row)).isTrue();
        try { assertThat(executor.submit(() -> repository.byUpload(1, request)).get(5, TimeUnit.SECONDS)).isEqualTo(row); }
        catch (Exception failure) { throw new AssertionError(failure); }
        status.setRollbackOnly(); return null;
      });
      assertThat(repository.byUpload(1, request)).isEqualTo(row);
    } finally { executor.shutdownNow(); }
  }

  @Test void simultaneousClaimsProduceOneRowAndOneDecoderInvocation() throws Exception {
    var barrier = new CyclicBarrier(2); var calls = new AtomicInteger();
    var competing = new MediaAssetRepository(jdbc) {
      @Override public boolean insert(Row row) {
        try { barrier.await(5, TimeUnit.SECONDS); }
        catch (Exception failure) { throw new AssertionError(failure); }
        return super.insert(row);
      }
    };
    var service = new MediaAssetService(competing, store, (bytes, mime) -> {
      calls.incrementAndGet(); return processor.process(bytes, mime);
    }, clock);
    UUID request = UUID.randomUUID(); var executor = Executors.newFixedThreadPool(2);
    try {
      var first = executor.submit(() -> service.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp"));
      var second = executor.submit(() -> service.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp"));
      assertThat(first.get(15, TimeUnit.SECONDS).status()).isIn("pending", "ready");
      assertThat(second.get(15, TimeUnit.SECONDS).status()).isIn("pending", "ready");
      assertThat(calls.get()).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset", Integer.class)).isEqualTo(1);
      assertThat(assets.lookup(1, request).status()).isEqualTo("ready");
    } finally { executor.shutdownNow(); }
  }

  @Test void queryDatabaseFailureNeverBecomesMissing() {
    for (var failure : List.of(new TransientDataAccessResourceException("Injected query failure"),
        new org.springframework.transaction.CannotCreateTransactionException("Injected connection failure"))) {
      var unavailable = new MediaAssetRepository(jdbc) {
        @Override public Row byUpload(long owner, UUID upload) { throw failure; }
        @Override public Row readable(long owner, UUID asset, long now) { throw failure; }
        @Override public boolean insert(Row row) { throw failure; }
      };
      apiFailure(() -> service(unavailable).lookup(1, UUID.randomUUID()), 503, "MEDIA_UNAVAILABLE");
      apiFailure(() -> service(unavailable).read(1, UUID.randomUUID(), PrivateImageStore.Variant.CLEAR), 503, "MEDIA_UNAVAILABLE");
      apiFailure(() -> service(unavailable).upload(1, UUID.randomUUID(), ImageFixtures.WEBP_LOSSY, "image/webp"), 503, "MEDIA_UNAVAILABLE");
    }
  }

  @Test void transientPreStorageFailureCanRetrySameIdButBadContentRemainsTerminal() throws Exception {
    var calls = new AtomicInteger();
    var busy = new MediaAssetService(repository, store, (bytes, mime) -> {
      if (calls.getAndIncrement() == 0) throw new CandidateImageException("MEDIA_BUSY", "busy");
      return processor.process(bytes, mime);
    }, clock);
    UUID request = UUID.randomUUID();
    apiFailure(() -> busy.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp"), 503, "MEDIA_BUSY");
    UUID originalAssetId = repository.byUpload(1, request).assetId();
    assertThat(assets.lookup(1, request).retryable()).isTrue();
    assertThat(busy.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp").asset().id()).isEqualTo(originalAssetId.toString());
    UUID invalid = UUID.randomUUID();
    apiFailure(() -> assets.upload(1, invalid, new byte[] {1, 2, 3}, "image/png"), 422, "MEDIA_UNSUPPORTED_TYPE");
    assertThat(assets.lookup(1, invalid).status()).isEqualTo("failed");
    assertThat(assets.lookup(1, invalid).retryable()).isFalse();
  }

  @Test void expiredAssetCannotBeReadOrRevivedByRetry() throws Exception {
    UUID request = UUID.randomUUID();
    var ready = assets.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp");
    clock.now = ready.asset().expiresAt();
    assertThat(assets.lookup(1, request).status()).isEqualTo("expired");
    apiFailure(() -> assets.read(1, UUID.fromString(ready.asset().id()), PrivateImageStore.Variant.CLEAR), 404, "MEDIA_NOT_FOUND");
    apiFailure(() -> assets.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp"), 410, "MEDIA_EXPIRED");
  }

  @Test void expiryBetweenFileSaveAndDatabaseCommitCannotProduceReady() {
    var expiring = new MediaAssetRepository(jdbc) {
      @Override public boolean ready(Row row, StaticImageCandidateProcessor.Result result, long now) {
        clock.now = row.expiresAt(); return super.ready(row, result, clock.now);
      }
    };
    UUID request = UUID.randomUUID();
    assertThat(service(expiring).upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp").status()).isEqualTo("expired");
    assertThat(repository.byUpload(1, request).state()).isEqualTo("PROCESSING");
  }

  @Test void staleUnstoredRequestBecomesTerminalAndCannotLaterBeMarkedReady() {
    UUID request = UUID.randomUUID(); long now = clock.millis();
    var row = new MediaAssetRepository.Row(UUID.randomUUID(), 1, request, StoredImageManifest.digest(ImageFixtures.WEBP_LOSSY),
        "image/webp", "PROCESSING", null, now, now + 1, now + MediaAssetService.TTL, null, 0, 0, 0, 0, null, null);
    assertThat(repository.insert(row)).isTrue(); clock.now += 2;
    var result = assets.lookup(1, request);
    assertThat(result.code()).isEqualTo("MEDIA_UPLOAD_INTERRUPTED");
    var processed = new StaticImageCandidateProcessor().process(ImageFixtures.WEBP_LOSSY, "image/webp");
    assertThat(repository.ready(row, processed, clock.millis())).isFalse();
    assertThat(assets.lookup(1, request).status()).isEqualTo("failed");
  }

  @Test void missingOrCorruptDiskFilesNeverReturnFalseReady() throws Exception {
    UUID request = UUID.randomUUID();
    var ready = assets.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp");
    Files.write(files.resolve("private/1/" + ready.asset().id() + "/thumb.bin"), new byte[] {1});
    apiFailure(() -> assets.lookup(1, request), 503, "MEDIA_UNAVAILABLE");
    apiFailure(() -> assets.read(1, UUID.fromString(ready.asset().id()), PrivateImageStore.Variant.CLEAR), 503, "MEDIA_UNAVAILABLE");
  }

  @Test void httpUploadReadAndCrossAccountAccessKeepPrivateHeaders() throws Exception {
    UUID request = UUID.randomUUID(); var session = session(1);
    String response = mvc.perform(post("/api/media/assets").param("clientUploadId", request.toString())
        .session(session).header("Origin", "http://127.0.0.1:49848").header(CsrfTokenService.HEADER_NAME, csrf.issue(session))
        .contentType("image/webp").content(ImageFixtures.WEBP_LOSSY))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("ready"))
        .andExpect(header().string("Cache-Control", "private, no-store")).andReturn().getResponse().getContentAsString();
    String id = json.readTree(response).at("/data/asset/id").asText();
    mvc.perform(get("/api/media/assets/" + id + "/clear").session(session))
        .andExpect(status().isOk()).andExpect(content().bytes(ImageFixtures.WEBP_LOSSY))
        .andExpect(content().contentType("image/webp")).andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andExpect(header().string("Cache-Control", "private, no-store"));
    mvc.perform(get("/api/media/assets/" + id + "/clear").param("ownerId", "1").session(session(2)))
        .andExpect(status().isNotFound()).andExpect(header().string("Cache-Control", "private, no-store"));
    mvc.perform(get("/api/media/uploads/" + request).session(session(2))).andExpect(status().isOk())
        .andExpect(jsonPath("$.data.status").value("missing"));
    mvc.perform(get("/api/media/assets/" + id + "/original").session(session)).andExpect(status().isNotFound());
    mvc.perform(get("/uploads/" + id + "/clear.bin").session(session)).andExpect(status().isNotFound());
  }

  @Test void httpRequiresActiveSessionCsrfAndAllowedOrigin() throws Exception {
    String upload = UUID.randomUUID().toString(); var session = session(1);
    mvc.perform(get("/api/media/uploads/" + upload)).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/media/assets").param("clientUploadId", upload).session(session)
        .contentType("image/webp").content(ImageFixtures.WEBP_LOSSY).header("Origin", "http://127.0.0.1:49848"))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/media/assets").param("clientUploadId", upload).session(session)
        .contentType("image/webp").content(ImageFixtures.WEBP_LOSSY).header("Origin", "https://untrusted.invalid")
        .header(CsrfTokenService.HEADER_NAME, csrf.issue(session))).andExpect(status().isForbidden());
    jdbc.update("UPDATE sr_user SET user_type='BANNED' WHERE id=1");
    mvc.perform(get("/api/media/uploads/" + upload).session(session(1))).andExpect(status().isForbidden());
    jdbc.update("UPDATE sr_user SET user_type='NORMAL',login_version='replaced-version' WHERE id=1");
    mvc.perform(get("/api/media/uploads/" + upload).session(session(1))).andExpect(status().isUnauthorized());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset", Integer.class)).isZero();
  }

  @Test void httpRejectsMultipartOversizeUnknownLengthAndInvalidIds() throws Exception {
    var session = session(1); String token = csrf.issue(session);
    mvc.perform(post("/api/media/assets").contentType("multipart/form-data; boundary=test").content(new byte[] {1}))
        .andExpect(status().isUnsupportedMediaType());
    mvc.perform(post("/api/media/assets").contentType("image/png").content(new byte[StaticImageCandidateProcessor.MAX_BYTES + 1]))
        .andExpect(status().isPayloadTooLarge());
    mvc(true).perform(post("/api/media/assets").session(session).param("clientUploadId", UUID.randomUUID().toString())
        .header("Origin", "http://127.0.0.1:49848").header(CsrfTokenService.HEADER_NAME, token)
        .contentType("image/png").content(new byte[StaticImageCandidateProcessor.MAX_BYTES + 10]))
        .andExpect(status().isPayloadTooLarge());
    mvc.perform(get("/api/media/uploads/not-a-uuid").session(session)).andExpect(status().isBadRequest());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset", Integer.class)).isZero();
  }

  @Test void mysqlEnforcesOwnerForeignKeyAndReadyMetadataCheck() {
    long now = clock.millis(); UUID request = UUID.randomUUID();
    var invalidOwner = new MediaAssetRepository.Row(UUID.randomUUID(), 9999, request, "a".repeat(64), "image/png", "PROCESSING",
        null, now, now + 100, now + 1000, null, 0, 0, 0, 0, null, null);
    assertThatThrownBy(() -> repository.insert(invalidOwner)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    var valid = new MediaAssetRepository.Row(UUID.randomUUID(), 1, request, "a".repeat(64), "image/png", "PROCESSING",
        null, now, now + 100, now + 1000, null, 0, 0, 0, 0, null, null);
    repository.insert(valid);
    assertThatThrownBy(() -> jdbc.update("UPDATE sr_media_asset SET state='READY' WHERE asset_id=?", valid.assetId().toString()))
        .isInstanceOfSatisfying(org.springframework.dao.DataAccessException.class, error ->
            assertThat(error.getMostSpecificCause()).isInstanceOfSatisfying(java.sql.SQLException.class,
                sql -> assertThat(sql.getErrorCode()).isEqualTo(3819)));
  }

  @Test void newConfigurationAndControllerAreDisabledByDefault() {
    new ApplicationContextRunner().withUserConfiguration(MediaAssetConfiguration.class, MediaAssetController.class, MediaPublicationController.class)
        .run(context -> { assertThat(context).doesNotHaveBean(MediaAssetService.class); assertThat(context).doesNotHaveBean(MediaAssetController.class);
          assertThat(context).doesNotHaveBean(MediaPublicationController.class); });
  }

  @Test void optInConfigurationWiresOnlyWithExplicitPrivateRootWorkerAndSchema() {
    var quota = new UploadQuotaService(files.resolve("uploads").toString(), 10_000_000, 50_000_000, 0, files.resolve("private").toString());
    var context = new ApplicationContextRunner().withUserConfiguration(MediaAssetConfiguration.class)
        .withBean(com.studyroom.service.ChatService.class, () -> mock(com.studyroom.service.ChatService.class))
        .withBean(com.studyroom.service.ChatSocketHub.class, () -> new com.studyroom.service.ChatSocketHub(json))
        .withBean(JdbcTemplate.class, () -> jdbc).withBean(UploadQuotaService.class, () -> quota)
        .withBean(ObjectMapper.class, ObjectMapper::new).withPropertyValues("studyroom.media.enabled=true");
    context.run(application -> assertThat(application).hasFailed());
    context.withPropertyValues("studyroom.media.worker-jar=" + System.getProperty("media.worker.jar"))
        .run(application -> {
          assertThat(application).hasNotFailed();
          assertThat(application).hasSingleBean(MediaAssetService.class);
          assertThat(application).hasSingleBean(PrivateImageStore.class);
        });
  }

  @Test void storageFailureIsTerminalAndNeverExposesRetainedUnknownFiles() throws Exception {
    var quota = new UploadQuotaService(files.resolve("uploads").toString(), 10_000_000, 50_000_000, 0, files.resolve("private").toString());
    var failingStore = new PrivateImageStore(quota, UUID::randomUUID, (stage, directory) -> {
      if (stage == PrivateImageStore.Stage.THUMB_WRITTEN) {
        Files.writeString(directory.resolve("unknown.txt"), "retain this test fixture", StandardOpenOption.CREATE_NEW);
        throw new java.io.IOException("Injected storage failure");
      }
    });
    var failing = new MediaAssetService(repository, failingStore, processor, clock); UUID request = UUID.randomUUID();
    apiFailure(() -> failing.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp"), 503, "MEDIA_UNAVAILABLE");
    var row = repository.byUpload(1, request);
    assertThat(row.state()).isEqualTo("FAILED");
    assertThat(assets.lookup(1, request).retryable()).isFalse();
    assertThat(assets.upload(1, request, ImageFixtures.WEBP_LOSSY, "image/webp").status()).isEqualTo("failed");
    apiFailure(() -> assets.read(1, row.assetId(), PrivateImageStore.Variant.CLEAR), 404, "MEDIA_NOT_FOUND");
    assertThat(files.resolve("private/1/" + row.assetId() + "/unknown.txt")).hasContent("retain this test fixture");
    assertThat(files.resolve("private/1/" + row.assetId() + "/ready.bin")).doesNotExist();
  }

  private MediaAssetService service(MediaAssetRepository repo) { return new MediaAssetService(repo, store, processor, clock); }
  private MockHttpSession session(long id) {
    var session = new MockHttpSession(); session.setAttribute(AuthService.SESSION_USER_ID, id);
    session.setAttribute(AuthService.SESSION_LOGIN_VERSION, "test-session-version"); return session;
  }
  private MockMvc mvc(boolean unknownLength) {
    UserMapper users = mock(UserMapper.class);
    when(users.selectById(any())).thenAnswer(invocation -> {
      long id = ((Number) invocation.getArgument(0)).longValue();
      var result = jdbc.query("SELECT id,user_type,deleted,login_version FROM sr_user WHERE id=?", (r, n) -> {
        var user = new User(); user.setId(r.getLong(1)); user.setUserType(r.getString(2));
        user.setDeleted(r.getInt(3)); user.setLoginVersion(r.getString(4)); return user;
      }, id);
      return result.isEmpty() ? null : result.get(0);
    });
    var security = new AuthSecurityProperties();
    var auth = new AuthService(users, mock(PasswordService.class), mock(InvitationService.class), security);
    var builder = MockMvcBuilders.standaloneSetup(new MediaAssetController(auth, assets))
        .setControllerAdvice(new MediaApiAdvice(), new GlobalExceptionHandler())
        .addInterceptors(new SessionPolicyInterceptor(security), new CsrfOriginInterceptor(csrf, new CorsOriginProperties()));
    if (unknownLength) builder.addFilters((Filter) (request, response, chain) -> chain.doFilter(new HttpServletRequestWrapper((HttpServletRequest) request) {
      @Override public int getContentLength() { return -1; }
      @Override public long getContentLengthLong() { return -1; }
    }, response));
    return builder.addFilter(new MediaBoundaryFilter(json), "/api/media/*").build();
  }
  private static void apiFailure(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, int status, String code) {
    assertThatThrownBy(action).isInstanceOfSatisfying(MediaApiException.class, error -> {
      assertThat(error.status()).isEqualTo(status); assertThat(error.code()).isEqualTo(code);
    });
  }
  private static final class MutableClock extends Clock {
    volatile long now;
    MutableClock(long now) { this.now = now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
    @Override public Instant instant() { return Instant.ofEpochMilli(now); }
    @Override public long millis() { return now; }
  }
}
