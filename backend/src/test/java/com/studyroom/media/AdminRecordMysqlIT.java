package com.studyroom.media;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.config.*;
import com.studyroom.entity.User;
import com.studyroom.mapper.*;
import com.studyroom.security.PasswordService;
import com.studyroom.service.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminRecordMysqlIT {
  @TempDir static Path root;static EphemeralMysql mysql;static com.zaxxer.hikari.HikariDataSource source;
  static JdbcTemplate jdbc;static TransactionTemplate tx;static SqlSessionTemplate mappers;static AdminRecordService records;static PasswordService password;
  static AdminSecurityProperties security;static AuthSecurityProperties authSecurity;
  static final AdminAuditContext context=new AdminAuditContext("127.0.0.1","isolated-test","acceptance");
  @BeforeAll static void start() throws Exception {
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));mysql.verifyOwnership();
    source=new com.zaxxer.hikari.HikariDataSource();source.setJdbcUrl(mysql.databaseUrl);source.setUsername("root");source.setPassword("");source.setMaximumPoolSize(4);source.setMinimumIdle(0);
    Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate();jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
    var config=new MybatisConfiguration();config.setMapUnderscoreToCamelCase(true);
    for(var type:List.of(UserMapper.class,DailyStatMapper.class,PostMapper.class,FeedbackMapper.class,AdminAuditMapper.class))config.addMapper(type);
    var factory=new MybatisSqlSessionFactoryBean();factory.setConfiguration(config);factory.setDataSource(source);mappers=new SqlSessionTemplate(factory.getObject());
    password=mock(PasswordService.class);security=new AdminSecurityProperties();authSecurity=new AuthSecurityProperties();
    records=new AdminRecordService(jdbc,service(new AdminAuditService(mappers.getMapper(AdminAuditMapper.class),new ObjectMapper())),new ObjectMapper(),true);records.verifySchema();
  }
  static AdminService service(AdminAuditService audit){return new AdminService(mappers.getMapper(UserMapper.class),mappers.getMapper(DailyStatMapper.class),mappers.getMapper(PostMapper.class),mappers.getMapper(FeedbackMapper.class),mock(ActiveVisitorService.class),mock(RedisMonitorService.class),mock(SystemMetricsService.class),mock(DatabaseMetricsService.class),mock(HttpMetricsService.class),password,audit,security,authSecurity);}
  @AfterAll static void stop() throws Exception {if(source!=null)source.close();if(mysql!=null)mysql.close();}
  @BeforeEach void reset() throws Exception {
    mysql.verifyOwnership();org.mockito.Mockito.reset(password);when(password.encode(anyString())).thenReturn("fixture-hash-new");security.setProtectedAdminId(null);authSecurity.setProductionMode(false);
    for(String table:List.of("sr_admin_audit","sr_daily_stat","sr_feedback","sr_post","sr_user"))jdbc.update("DELETE FROM "+table);
    for(long id=1;id<=3;id++)user(id,id<=2?"ADMIN":"NORMAL");
    jdbc.update("INSERT INTO sr_feedback(id,user_id,title,content,status,created_at) VALUES(1,3,'test','body','PENDING','2026-09-29 10:00:00')");
  }
  static void user(long id,String role){jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,user_type,created_at) VALUES(?,?,?,'原昵称',?,'2026-09-29 10:00:00')",id,"fixture-"+id,"fixture-old-hash",role);}
  User actor(long id){return mappers.getMapper(UserMapper.class).selectById(id);}
  String outcome(Runnable job){try{tx.executeWithoutResult(s->job.run());return "saved";}catch(BusinessException e){return e.getCode();}}
  List<String> concurrent(Runnable a,Runnable b) throws Exception {
    var pool=Executors.newFixedThreadPool(2);var gate=new CyclicBarrier(2);
    try{var x=pool.submit(()->{gate.await();return outcome(a);});var y=pool.submit(()->{gate.await();return outcome(b);});return List.of(x.get(10,TimeUnit.SECONDS),y.get(10,TimeUnit.SECONDS));}finally{pool.shutdownNow();}
  }
  @Test void concurrentRoleChangesHaveOneWriteOneAuditAndNewSessionGeneration() throws Exception {
    User a=actor(1),b=actor(2);
    assertThat(concurrent(()->records.role(a,3,"0","MUTED",context),()->records.role(b,3,"0","BANNED",context))).containsExactlyInAnyOrder("saved","ADMIN_VERSION_CONFLICT");
    assertThat(jdbc.queryForObject("SELECT admin_version FROM sr_user WHERE id=3",Long.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit",Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT login_version FROM sr_user WHERE id=3",String.class)).isNotBlank();
  }
  @Test void crossAdministratorEditsAreOrderedAndRecheckRevokedActor() throws Exception {
    User a=actor(1),b=actor(2);
    assertThat(concurrent(()->records.role(a,2,"0","ADMIN",context),()->records.role(b,1,"0","ADMIN",context))).containsExactlyInAnyOrder("saved","AUTH_SESSION_REVOKED");
  }
  @Test void feedbackUpdateAndDeleteCannotBothUseTheSameRevision() throws Exception {
    User a=actor(1),b=actor(2);var result=concurrent(()->records.feedback(a,1,"0","RESOLVED",context),()->records.deleteFeedback(b,1,"0",context));
    assertThat(result.stream().filter("saved"::equals).count()).isEqualTo(1);assertThat(result).allMatch(v->Set.of("saved","ADMIN_VERSION_CONFLICT","RESOURCE_NOT_FOUND").contains(v));
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit",Integer.class)).isEqualTo(1);
  }
  @Test void resetPasswordDoesNotOverwriteUnrelatedProfileAndRejectsAnOldRoleRevision(){
    User a=actor(1);tx.executeWithoutResult(s->records.role(a,3,"0","MUTED",context));
    assertThat(outcome(()->records.password(a,3,"0","ignored",context))).isEqualTo("ADMIN_VERSION_CONFLICT");
    jdbc.update("UPDATE sr_user SET nickname='新昵称' WHERE id=3");tx.executeWithoutResult(s->records.password(a,3,"1","fixture password",context));
    var row=jdbc.queryForMap("SELECT user_type,nickname,password_hash,admin_version,force_password_change FROM sr_user WHERE id=3");
    assertThat(row).containsEntry("user_type","MUTED").containsEntry("nickname","新昵称").containsEntry("password_hash","fixture-hash-new");assertThat(((Number)row.get("admin_version")).longValue()).isEqualTo(2);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit",Integer.class)).isEqualTo(2);
  }
  @Test void lateSelfPasswordChangeCannotUndoAnAdminBan(){
    User stale=actor(3),a=actor(1);tx.executeWithoutResult(s->records.role(a,3,"0","BANNED",context));
    when(password.matches(anyString(),anyString())).thenReturn(true);
    var profile=new ProfileService(mock(AuthService.class),mappers.getMapper(UserMapper.class),null,null,null,null,password);
    var request=new com.studyroom.dto.UpdateOwnPasswordRequest();request.setOldPassword("old");request.setNewPassword("new");var session=new org.springframework.mock.web.MockHttpSession();
    assertThatThrownBy(()->profile.updateOwnPassword(stale,request,session)).isInstanceOf(BusinessException.class);
    assertThat(jdbc.queryForObject("SELECT user_type FROM sr_user WHERE id=3",String.class)).isEqualTo("BANNED");assertThat(jdbc.queryForObject("SELECT password_hash FROM sr_user WHERE id=3",String.class)).isEqualTo("fixture-old-hash");assertThat(session.getAttribute(AuthService.SESSION_LOGIN_VERSION)).isNull();
  }
  @Test void singleSessionLoginCannotOverwriteAnAdminBanAfterPasswordVerification(){
    authSecurity.setConcurrentSessions(false);
    when(password.matches(anyString(),anyString())).thenAnswer(call->{tx.executeWithoutResult(s->records.role(actor(1),3,"0","BANNED",context));return true;});
    var login=new AuthService(mappers.getMapper(UserMapper.class),password,mock(InvitationService.class),authSecurity);
    var request=new com.studyroom.dto.LoginRequest();request.setUsername("fixture-3");request.setPassword("fixture password");var session=new org.springframework.mock.web.MockHttpSession();
    assertThatThrownBy(()->login.login(request,session)).isInstanceOf(BusinessException.class);
    assertThat(jdbc.queryForObject("SELECT user_type FROM sr_user WHERE id=3",String.class)).isEqualTo("BANNED");assertThat(session.getAttribute(AuthService.SESSION_USER_ID)).isNull();
  }
  @Test void auditFailureRollsBackBusinessMutationAndRevision(){
    var audit=mock(AdminAuditService.class);doThrow(new IllegalStateException("audit fixture failure")).when(audit).success(any(),any(),any(),any(),any(),any(),any());
    var failing=new AdminRecordService(jdbc,service(audit),new ObjectMapper(),true);User a=actor(1);
    assertThatThrownBy(()->tx.executeWithoutResult(s->failing.feedback(a,1,"0","RESOLVED",context))).isInstanceOf(IllegalStateException.class);
    assertThat(jdbc.queryForObject("SELECT status FROM sr_feedback WHERE id=1",String.class)).isEqualTo("PENDING");assertThat(jdbc.queryForObject("SELECT admin_version FROM sr_feedback WHERE id=1",Long.class)).isZero();
  }
  @Test void guardsSelfDemotionProtectedAdminAndDisabledCapability(){
    User a=actor(1);assertThat(outcome(()->records.role(a,1,"0","NORMAL",context))).isEqualTo("ADMIN_FORBIDDEN");security.setProtectedAdminId(2L);
    assertThat(outcome(()->records.role(a,2,"0","BANNED",context))).isEqualTo("ADMIN_FORBIDDEN");
    var disabled=new AdminRecordService(jdbc,service(mock(AdminAuditService.class)),new ObjectMapper(),false);
    assertThat(disabled.page("users",null,"ALL").items()).allSatisfy(row->assertThat(row.get("adminVersion")).isNull());
    assertThat(outcome(()->disabled.role(a,3,"0","MUTED",context))).isEqualTo("ADMIN_VERSIONING_UNAVAILABLE");
  }
  @Test void threeModulePagesHaveStableStringIdsAndNeverSerializePrivateUserFields(){
    for(long id=4;id<=65;id++)user(id,"NORMAL");long big=2104509220480131074L;user(big,"MUTED");
    for(long id=2;id<=65;id++)jdbc.update("INSERT INTO sr_feedback(id,user_id,title,content,created_at) VALUES(?,3,'title','body','2026-09-29 10:00:00')",id);
    for(long id=1;id<=65;id++)jdbc.update("INSERT INTO sr_post(id,user_id,content,created_at) VALUES(?,3,'post','2026-09-29 10:00:00')",id);
    for(String module:List.of("users","posts","feedback")){
      var page=records.page(module,null,null);List<String> ids=new ArrayList<>();int count=0;
      while(true){for(var row:page.items()){assertThat(row.get("id")).isInstanceOf(String.class);ids.add(row.get("id").toString());assertThat(row).doesNotContainKeys("passwordHash","loginVersion","password_hash","login_version");}
        if(page.nextCursor()==null)break;assertThat(count++).isLessThan(4);String cursor=page.nextCursor();page=records.page(module,cursor,null);assertThat(page.nextCursor()).isNotEqualTo(cursor);}
      assertThat(ids).doesNotHaveDuplicates().hasSize(module.equals("users")?66:65);
    }
    var filtered=records.page("users",null,"MUTED");assertThat(filtered.items()).hasSize(1);assertThat(filtered.items().get(0).get("id")).isEqualTo(String.valueOf(big));
    String cursor=records.page("users",null,"ALL").nextCursor();assertThatThrownBy(()->records.page("users",cursor,"NORMAL")).isInstanceOf(BusinessException.class);assertThatThrownBy(()->records.page("feedback",cursor,null)).isInstanceOf(BusinessException.class);
  }
}
