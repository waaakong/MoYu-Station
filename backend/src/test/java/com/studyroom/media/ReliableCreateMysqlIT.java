package com.studyroom.media;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.config.InvitationProperties;
import com.studyroom.controller.*;
import com.studyroom.dto.*;
import com.studyroom.mapper.*;
import com.studyroom.service.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real inserts, locks, transaction rollback, counters and audit rows in a newly owned MySQL only. */
class ReliableCreateMysqlIT {
  @TempDir static Path root;
  static EphemeralMysql mysql;
  static JdbcTemplate jdbc;
  static ReliableCreateService reliable;
  static TransactionTemplate tx;
  static FeedController feed;
  static ProfileController profile;
  static AdminInvitationController invitations;
  static UserMapper users;
  static FeedNotificationSocketHub notifications;
  static AuthService auth;
  static MockHttpSession session=new MockHttpSession();
  @BeforeAll static void start() throws Exception {
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));mysql.verifyOwnership();
    var source=new DriverManagerDataSource(mysql.databaseUrl,"root","");
    Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate();
    jdbc=new JdbcTemplate(source);var manager=new DataSourceTransactionManager(source);tx=new TransactionTemplate(manager);
    reliable=new ReliableCreateService(jdbc,manager,new ObjectMapper());reliable.verifySchema();
    var config=new MybatisConfiguration();config.setMapUnderscoreToCamelCase(true);
    for(var mapper:List.of(UserMapper.class,PostMapper.class,PostCommentMapper.class,PostLikeMapper.class,FeedbackMapper.class,InvitationMapper.class,InvitationRedemptionMapper.class,AdminAuditMapper.class))config.addMapper(mapper);
    var factory=new MybatisSqlSessionFactoryBean();
    var global=new com.baomidou.mybatisplus.core.config.GlobalConfig();global.setDbConfig(new com.baomidou.mybatisplus.core.config.GlobalConfig.DbConfig().setIdType(com.baomidou.mybatisplus.annotation.IdType.AUTO));
    factory.setGlobalConfig(global);factory.setConfiguration(config);factory.setDataSource(source);
    var mappers=new SqlSessionTemplate(factory.getObject());users=mappers.getMapper(UserMapper.class);
    notifications=mock(FeedNotificationSocketHub.class);auth=mock(AuthService.class);
    var feedService=new FeedService(mappers.getMapper(PostMapper.class),mappers.getMapper(PostCommentMapper.class),mappers.getMapper(PostLikeMapper.class),users,new ObjectMapper(),null,notifications);
    feed=new FeedController(auth,feedService);feed.setReliable(reliable);
    profile=new ProfileController(auth,new ProfileService(auth,users,null,null,mappers.getMapper(FeedbackMapper.class),null,null));profile.setReliable(reliable);
    var properties=new InvitationProperties();properties.setPepper("isolated-create-fixture-pepper-not-production");
    var audit=new AdminAuditService(mappers.getMapper(AdminAuditMapper.class),new ObjectMapper());
    invitations=new AdminInvitationController(auth,new InvitationService(mappers.getMapper(InvitationMapper.class),mappers.getMapper(InvitationRedemptionMapper.class),users,null,properties,audit));invitations.setReliable(reliable);
    for(int id=1;id<=3;id++)jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,user_type) VALUES(?,?,?,'测试','ADMIN')",id,"reliable-fixture-"+id,"unused");
  }
  @AfterAll static void stop() throws Exception {if(mysql!=null)mysql.close();}
  @BeforeEach void reset() throws Exception {
    mysql.verifyOwnership();org.mockito.Mockito.reset(notifications,auth);
    for(String table:List.of("sr_create_receipt","sr_post_comment","sr_post","sr_feedback","sr_admin_audit","sr_invitation"))jdbc.update("DELETE FROM "+table);
    jdbc.update("UPDATE sr_user SET login_version=NULL,user_type='ADMIN',deleted=0");
    jdbc.update("INSERT INTO sr_post(id,user_id,content) VALUES(11,2,'test post'),(12,2,'other post')");
    when(auth.requireActiveUser(session)).thenReturn(users.selectById(1));when(auth.requireAdmin(session)).thenReturn(users.selectById(1));
  }
  CreateCommentRequest comment(String id){var r=new CreateCommentRequest();r.setClientRequestId(id);r.setContent("只有一条评论");return r;}
  FeedbackRequest feedback(String id){var r=new FeedbackRequest();r.setClientRequestId(id);r.setTitle("测试反馈");r.setContent("不重复保存");return r;}
  int count(String table){return jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class);}
  @Test void commentRetryCountsAndNotifiesOnceAndRejectsChangedTargetOrBody(){
    String id=UUID.randomUUID().toString();var request=comment(id);
    var first=feed.createComment(11L,request,session).getData();
    assertThat(feed.createComment(11L,request,session).getData().getId()).isEqualTo(first.getId());
    assertThat(count("sr_post_comment")).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT comment_count FROM sr_post WHERE id=11",Integer.class)).isEqualTo(1);
    verify(notifications,times(1)).sendToUser(eq(2L),eq("FEED_NOTIFICATION_RECEIVE"),any());
    assertThatThrownBy(()->feed.createComment(12L,request,session)).isInstanceOf(BusinessException.class);
    request.setContent("changed");assertThatThrownBy(()->feed.createComment(11L,request,session)).isInstanceOf(BusinessException.class);
    assertThat(count("sr_post_comment")).isEqualTo(1);
  }
  @Test void concurrentFeedbackReturnsOneDatabaseRow()throws Exception{
    String id=UUID.randomUUID().toString();var pool=Executors.newFixedThreadPool(2);var start=new CyclicBarrier(2);
    try {
      Callable<String> send=()->{start.await();return profile.feedback(feedback(id),session).getData().get("id");};
      var a=pool.submit(send);var b=pool.submit(send);
      assertThat(a.get(15,TimeUnit.SECONDS)).isEqualTo(b.get(15,TimeUnit.SECONDS));
      assertThat(count("sr_feedback")).isEqualTo(1);assertThat(count("sr_create_receipt")).isEqualTo(1);
    }finally{pool.shutdownNow();}
  }
  @Test void receiptsAreAccountAndOperationScopedAndContainNoBody(){
    String id=UUID.randomUUID().toString();profile.feedback(feedback(id),session);
    assertThat(reliable.result(2,ReliableCreateService.Kind.FEEDBACK,id).get("status")).isEqualTo("missing");
    assertThat(reliable.result(1,ReliableCreateService.Kind.COMMENT,id).get("status")).isEqualTo("missing");
    when(auth.requireActiveUser(session)).thenReturn(users.selectById(2));profile.feedback(feedback(id),session);
    assertThat(count("sr_feedback")).isEqualTo(2);
    var columns=jdbc.queryForMap("SELECT * FROM sr_create_receipt WHERE owner_id=1");
    assertThat(columns.keySet()).containsExactlyInAnyOrder("owner_id","operation_kind","request_id","payload_hash","target_id","created_at");
    assertThat(columns.toString()).doesNotContain("不重复保存","测试反馈");
  }
  @Test void rollbackRemovesBusinessReceiptCounterAndNotificationThenSameIdCanRetry(){
    String id=UUID.randomUUID().toString();
    tx.executeWithoutResult(status->{feed.createComment(11L,comment(id),session);verifyNoInteractions(notifications);status.setRollbackOnly();});
    assertThat(count("sr_post_comment")).isZero();assertThat(count("sr_create_receipt")).isZero();verifyNoInteractions(notifications);
    assertThat(jdbc.queryForObject("SELECT comment_count FROM sr_post WHERE id=11",Integer.class)).isZero();
    feed.createComment(11L,comment(id),session);assertThat(count("sr_post_comment")).isEqualTo(1);
    verify(notifications,times(1)).sendToUser(eq(2L),anyString(),any());
  }
  @Test void invitationRetryHasOneCodeOneAuditAndNeverRevealsRawCodeAgain(){
    String id=UUID.randomUUID().toString();var request=new CreateInvitationRequest();request.setClientRequestId(id);request.setLabel("隔离邀请码");
    var original=invitations.create(request,session,new MockHttpServletRequest()).getData();
    var repeat=invitations.create(request,session,new MockHttpServletRequest()).getData();
    assertThat(original.getCode()).isNotBlank();assertThat(repeat.getId()).isEqualTo(original.getId());assertThat(repeat.getCode()).isNull();
    assertThat(count("sr_invitation")).isEqualTo(1);assertThat(count("sr_admin_audit")).isEqualTo(1);
    assertThat(jdbc.queryForList("SELECT * FROM sr_create_receipt").toString()).doesNotContain(original.getCode());
    assertThat(jdbc.queryForList("SELECT * FROM sr_invitation").toString()).doesNotContain(original.getCode());
    assertThat(jdbc.queryForList("SELECT * FROM sr_admin_audit").toString()).doesNotContain(original.getCode());
  }
  @Test void deletedBodyDoesNotResurrectAndQueryRetainsOnlyOriginalIdentity(){
    String id=UUID.randomUUID().toString();var created=feed.createComment(11L,comment(id),session).getData();
    jdbc.update("DELETE FROM sr_post_comment WHERE id=?",created.getId());
    assertThatThrownBy(()->feed.createComment(11L,comment(id),session)).isInstanceOf(BusinessException.class);
    assertThat(count("sr_post_comment")).isZero();
    assertThat(reliable.result(1,ReliableCreateService.Kind.COMMENT,id)).containsEntry("status","committed").containsEntry("targetId",created.getId().toString());
  }
  @Test void disabledCapabilityDoesNotSilentlyDowngradeAndLegacyCallsRemainCompatible(){
    var controller=new ProfileController(auth,mock(ProfileService.class));
    assertThatThrownBy(()->controller.feedback(feedback(UUID.randomUUID().toString()),session)).isInstanceOf(BusinessException.class);
    assertThat(count("sr_feedback")).isZero();
    profile.feedback(feedback(null),session);assertThat(count("sr_feedback")).isEqualTo(1);assertThat(count("sr_create_receipt")).isZero();
  }
  @Test void invalidIdentifiersAreRejectedBeforeWriting(){
    for(String id:List.of("","../other","A".repeat(36),"1".repeat(100)))assertThatThrownBy(()->profile.feedback(feedback(id),session)).isInstanceOf(BusinessException.class);
    assertThat(count("sr_feedback")).isZero();
  }
  @Test void revocationOrRoleChangeAfterControllerAuthenticationIsRejected(){
    jdbc.update("UPDATE sr_user SET login_version='revoked' WHERE id=1");
    assertThatThrownBy(()->profile.feedback(feedback(UUID.randomUUID().toString()),session)).isInstanceOf(BusinessException.class);
    jdbc.update("UPDATE sr_user SET login_version=NULL,user_type='MUTED' WHERE id=1");
    assertThatThrownBy(()->feed.createComment(11L,comment(UUID.randomUUID().toString()),session)).isInstanceOf(BusinessException.class);
    assertThat(count("sr_feedback")).isZero();assertThat(count("sr_post_comment")).isZero();assertThat(count("sr_create_receipt")).isZero();
  }
  @Test void uncommittedResultIsNotReportedAsSuccessAndLaterSameIdRetryReplays()throws Exception{
    String id=UUID.randomUUID().toString();var ready=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newSingleThreadExecutor();
    try {
      var pending=pool.submit(()->tx.execute(status->{var response=profile.feedback(feedback(id),session);ready.countDown();try{if(!release.await(8,TimeUnit.SECONDS))throw new IllegalStateException("test timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}return response;}));
      assertThat(ready.await(8,TimeUnit.SECONDS)).isTrue();assertThat(reliable.result(1,ReliableCreateService.Kind.FEEDBACK,id).get("status")).isEqualTo("missing");
      release.countDown();String target=pending.get(8,TimeUnit.SECONDS).getData().get("id");
      assertThat(profile.feedback(feedback(id),session).getData().get("id")).isEqualTo(target);assertThat(count("sr_feedback")).isEqualTo(1);
    }finally{release.countDown();pool.shutdownNow();}
  }
}
