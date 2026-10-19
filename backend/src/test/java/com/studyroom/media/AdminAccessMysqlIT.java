package com.studyroom.media;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.config.*;
import com.studyroom.dto.*;
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

class AdminAccessMysqlIT {
  @TempDir static Path root;static EphemeralMysql mysql;static com.zaxxer.hikari.HikariDataSource source;
  static JdbcTemplate jdbc;static TransactionTemplate tx;static SqlSessionTemplate mappers;static AdminAccessService access;static InvitationService invites;static ClientUpdateService updates;static ClientUpdateSocketHub hub;
  static final AdminAuditContext context=new AdminAuditContext("127.0.0.1","isolated-test","acceptance");
  @BeforeAll static void start() throws Exception {
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));mysql.verifyOwnership();
    source=new com.zaxxer.hikari.HikariDataSource();source.setJdbcUrl(mysql.databaseUrl);source.setUsername("root");source.setPassword("");source.setMaximumPoolSize(4);source.setMinimumIdle(0);
    Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate();jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
    var config=new MybatisConfiguration();config.setMapUnderscoreToCamelCase(true);
    for(var type:List.of(UserMapper.class,InvitationMapper.class,InvitationRedemptionMapper.class,AdminAuditMapper.class))config.addMapper(type);
    var factory=new MybatisSqlSessionFactoryBean();factory.setConfiguration(config);factory.setDataSource(source);mappers=new SqlSessionTemplate(factory.getObject());
    var json=new ObjectMapper().findAndRegisterModules();var audit=new AdminAuditService(mappers.getMapper(AdminAuditMapper.class),json);
    var properties=new InvitationProperties();properties.setPepper("test-only-generated-pepper-not-production-32bytes");
    var password=mock(PasswordService.class);when(password.encode(anyString())).thenReturn("fixture-password-hash");
    invites=new InvitationService(mappers.getMapper(InvitationMapper.class),mappers.getMapper(InvitationRedemptionMapper.class),mappers.getMapper(UserMapper.class),password,properties,audit);
    hub=mock(ClientUpdateSocketHub.class);updates=new ClientUpdateService(jdbc,mock(org.springframework.data.redis.core.StringRedisTemplate.class),json,new ClientUpdateProperties(),hub,audit);
    access=new AdminAccessService(jdbc,invites,updates,json,true);access.verifySchema();
  }
  @AfterAll static void stop() throws Exception {if(source!=null)source.close();if(mysql!=null)mysql.close();}
  @BeforeEach void reset() throws Exception {
    mysql.verifyOwnership();clearInvocations(hub);
    for(String table:List.of("sr_invitation_redemption","sr_invitation","sr_client_update_audit","sr_client_update_membership","sr_admin_audit","sr_user"))jdbc.update("DELETE FROM "+table);
    for(long id=1;id<=3;id++)user(id,id<=2?"ADMIN":"NORMAL");
  }
  static void user(long id,String role){jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,user_type,login_version) VALUES(?,?,?,'fixture',?,'session-v1')",id,"fixture-"+id,"fixture-hash",role);}
  User actor(long id){return mappers.getMapper(UserMapper.class).selectById(id);}
  ClientUpdateMembershipRequest request(String version,boolean enabled){var value=new ClientUpdateMembershipRequest();value.setChannel("stable");value.setEnabled(enabled);value.setReason("test change");value.setExpectedVersion(version);return value;}
  String outcome(Runnable job){try{tx.executeWithoutResult(s->job.run());return "saved";}catch(BusinessException e){return e.getCode();}}
  List<String> concurrent(Runnable a,Runnable b)throws Exception{var pool=Executors.newFixedThreadPool(2);var gate=new CyclicBarrier(2);try{var x=pool.submit(()->{gate.await();return outcome(a);});var y=pool.submit(()->{gate.await();return outcome(b);});return List.of(x.get(10,TimeUnit.SECONDS),y.get(10,TimeUnit.SECONDS));}finally{pool.shutdownNow();}}
  long invitation(){var request=new CreateInvitationRequest();request.setLabel("local test");request.setMaxUses(1);return tx.execute(s->invites.create(request,actor(1))).getId();}
  @Test void concurrentGrantOnlyWritesAndAuditsOnce() throws Exception {
    User a=actor(1),b=actor(2);
    assertThat(concurrent(()->access.changeMember(a,3,request("0",true),context),()->access.changeMember(b,3,request("0",true),context))).containsExactlyInAnyOrder("saved","ADMIN_VERSION_CONFLICT");
    assertThat(access.member(3,"stable")).containsEntry("adminVersion","1").containsEntry("enabled",true);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit",Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_client_update_audit",Integer.class)).isEqualTo(1);
  }
  @Test void noOpDoesNotAuditAndOldGrantCannotUndoRevocation(){
    User a=actor(1);tx.executeWithoutResult(s->access.changeMember(a,3,request("0",true),context));
    tx.executeWithoutResult(s->access.changeMember(a,3,request("1",true),context));
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit",Integer.class)).isEqualTo(1);
    tx.executeWithoutResult(s->access.changeMember(a,3,request("1",false),context));
    verify(hub,times(1)).disconnectUser(3L);
    assertThat(outcome(()->access.changeMember(a,3,request("1",true),context))).isEqualTo("ADMIN_VERSION_CONFLICT");
    assertThat(access.member(3,"stable")).containsEntry("enabled",false).containsEntry("adminVersion","2");
  }
  @Test void rollbackDoesNotDisconnectOrPersistAudit(){
    User a=actor(1);tx.executeWithoutResult(s->access.changeMember(a,3,request("0",true),context));
    assertThatThrownBy(()->tx.executeWithoutResult(s->{access.changeMember(a,3,request("1",false),context);throw new IllegalStateException("rollback");})).isInstanceOf(IllegalStateException.class);
    verifyNoInteractions(hub);assertThat(access.member(3,"stable")).containsEntry("enabled",true).containsEntry("adminVersion","1");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit",Integer.class)).isEqualTo(1);
  }
  @Test void disabledInvitationRetryDoesNotOverwriteRedemptionOrAuditTwice()throws Exception{
    long id=invitation();jdbc.update("UPDATE sr_invitation SET used_count=1,status='EXHAUSTED' WHERE id=?",id);User a=actor(1),b=actor(2);
    assertThat(concurrent(()->access.disable(a,id,"0",context),()->access.disable(b,id,"0",context))).containsOnly("saved");
    assertThat(access.invitation(id)).containsEntry("status","DISABLED").containsEntry("usedCount",1).containsEntry("adminVersion","1").doesNotContainKeys("code","codeDigest","code_digest");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_admin_audit",Integer.class)).isEqualTo(1);
  }
  @Test void disableRacesRegistrationWithoutLostUsage()throws Exception{
    var create=new CreateInvitationRequest();create.setLabel("race");create.setMaxUses(1);var invitation=tx.execute(s->invites.create(create,actor(1)));User a=actor(1);
    var signup=new RegisterRequest();signup.setUsername("new-fixture");signup.setPassword("fixture-password");signup.setInvitationCode(invitation.getCode());
    var result=concurrent(()->access.disable(a,invitation.getId(),"0",context),()->invites.register(signup));
    assertThat(result).allMatch(value->Set.of("saved","INVITATION_DISABLED").contains(value));
    int used=jdbc.queryForObject("SELECT used_count FROM sr_invitation WHERE id=?",Integer.class,invitation.getId());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_invitation_redemption",Integer.class)).isEqualTo(used);
    assertThat(access.invitation(invitation.getId())).containsEntry("status","DISABLED");
  }
  @Test void staleOrNonAdminActorAndDisabledCapabilityRejectWrites(){
    long id=invitation();User a=actor(1);jdbc.update("UPDATE sr_user SET user_type='NORMAL' WHERE id=1");
    assertThat(outcome(()->access.disable(a,id,"0",context))).isEqualTo("AUTH_SESSION_REVOKED");
    assertThat(outcome(()->access.changeMember(actor(3),2,request("0",true),context))).isEqualTo("AUTH_SESSION_REVOKED");
    var disabled=new AdminAccessService(jdbc,invites,updates,new ObjectMapper().findAndRegisterModules(),false);
    assertThat(disabled.invitation(id).get("adminVersion")).isNull();
    assertThat(outcome(()->disabled.changeMember(actor(2),3,request("0",true),context))).isEqualTo("ADMIN_VERSIONING_UNAVAILABLE");
  }
  @Test void keysetPagesCoverTiedDatesAndCompositeMembersWithoutLeaks(){
    for(int n=0;n<65;n++){long id=100+n;user(id,"NORMAL");jdbc.update("INSERT INTO sr_invitation(id,label,code_digest,code_hint,created_by,created_at) VALUES(?,? ,?,'test',1,'2026-09-29 10:00:00')",id,"page-"+id,String.format("%064d",id));jdbc.update("INSERT INTO sr_client_update_membership(user_id,channel,enabled) VALUES(?,'beta',1),(?,'stable',0)",id,id);}
    Set<Object> ids=new HashSet<>();String cursor=null;int pages=0;
    do{var page=access.invitationPage(cursor);assertThat(++pages).isLessThan(5);for(var row:page.items()){assertThat(ids.add(row.get("id"))).isTrue();assertThat(row).doesNotContainKeys("code","codeDigest","code_digest");}cursor=page.nextCursor();}while(cursor!=null);assertThat(ids).hasSize(65);
    ids.clear();pages=0;
    do{var page=access.memberPage(cursor);assertThat(++pages).isLessThan(7);for(var row:page.items())assertThat(ids.add(row.get("userId")+":"+row.get("channel"))).isTrue();cursor=page.nextCursor();}while(cursor!=null);assertThat(ids).hasSize(130);
    assertThatThrownBy(()->access.memberPage(access.invitationPage(null).nextCursor())).isInstanceOf(BusinessException.class);
  }
}
