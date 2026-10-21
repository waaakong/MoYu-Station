package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.config.ClientUpdateProperties;
import com.studyroom.dto.ClientReleasePolicyRequest;
import com.studyroom.entity.User;
import com.studyroom.service.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Owned disposable database only. Real row locks, audit inserts and transaction synchronizations. */
class ClientReleaseMysqlIT {
  @TempDir static Path root;
  static EphemeralMysql mysql; static JdbcTemplate jdbc; static TransactionTemplate tx;
  static com.zaxxer.hikari.HikariDataSource source;
  static ClientUpdateService service; static ClientUpdateProperties properties;
  static ClientUpdateSocketHub hub; static AdminAuditService audit;
  @BeforeAll static void start() throws Exception {
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));mysql.verifyOwnership();
    source=new com.zaxxer.hikari.HikariDataSource();source.setJdbcUrl(mysql.databaseUrl);source.setUsername("root");source.setPassword("");source.setMaximumPoolSize(4);source.setMinimumIdle(0);
    Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate();
    jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
    properties=new ClientUpdateProperties();properties.setVersionedPolicyEnabled(true);
    hub=mock(ClientUpdateSocketHub.class);audit=mock(AdminAuditService.class);
    service=new ClientUpdateService(jdbc,mock(StringRedisTemplate.class),new ObjectMapper(),properties,hub,audit);service.verifyPolicySchema();
    jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,user_type) VALUES(1,'release-admin-a','unused','甲','ADMIN'),(2,'release-admin-b','unused','乙','ADMIN')");
  }
  @AfterAll static void stop() throws Exception {if(source!=null)source.close();if(mysql!=null)mysql.close();}
  @BeforeEach void reset() throws Exception {
    mysql.verifyOwnership();org.mockito.Mockito.reset(hub,audit);properties.setVersionedPolicyEnabled(true);
    jdbc.update("DELETE FROM sr_client_update_audit");jdbc.update("DELETE FROM sr_client_release");
    jdbc.update("UPDATE sr_user SET user_type='ADMIN',login_version=NULL,deleted=0");seed(1,"DRAFT");
  }
  static void seed(long id,String status) {
    jdbc.update("INSERT INTO sr_client_release(id,release_id,channel,version,platform,arch,app_id,artifact_key,manifest_json,manifest_signature,manifest_key_id,status,release_salt,created_at) VALUES(?,?,'stable',?,'win32','x64','xyz.moyustation.studyroom',?,'{}','fixture','fixture',?,'fixture','2026-09-29 10:00:00')",id,"stable-0.3."+id,"0.3."+id,"stable/0.3."+id,status);
  }
  User actor(long id){User u=new User();u.setId(id);u.setUserType("ADMIN");return u;}
  ClientReleasePolicyRequest request(String status,String version){var r=new ClientReleasePolicyRequest();r.setStatus(status);r.setExpectedVersion(version);r.setRolloutPercentage("FULL".equals(status)?100:0);r.setMandatory(false);r.setReason("isolated acceptance");return r;}
  ClientUpdateService.ReleaseView update(long actor,String status,String version){return tx.execute(s->service.updateReleasePolicy(actor(actor),1L,request(status,version),"127.0.0.1"));}
  int audits(){return jdbc.queryForObject("SELECT COUNT(*) FROM sr_client_update_audit",Integer.class);}
  @Test void commitBumpsVersionWritesOneAuditAndNotifiesOnlyAfterCommit(){
    tx.executeWithoutResult(s->{var value=service.updateReleasePolicy(actor(1),1L,request("PILOT","0"),"127.0.0.1");assertThat(value.policyVersion()).isEqualTo("1");verifyNoInteractions(hub);});
    assertThat(audits()).isEqualTo(1);verify(hub,times(1)).broadcast("stable","stable-0.3.1","0.3.1");
    verify(hub).broadcastPolicyChanged("stable","stable-0.3.1","0.3.1","1");
    assertThatThrownBy(()->update(1,"PILOT","0")).isInstanceOf(BusinessException.class).hasMessageContaining("已被其他操作修改");
    assertThat(audits()).isEqualTo(1);verifyNoMoreInteractions(hub);
  }
  @Test void withdrawnIsTerminalForEveryStatusIncludingItself(){
    update(1,"WITHDRAWN","0");
    for(String target:ClientUpdateService.RELEASE_STATUSES){
      var r=request(target,"1");if(target.equals("ROLLING"))r.setRolloutPercentage(10);
      assertThatThrownBy(()->tx.execute(s->service.updateReleasePolicy(actor(1),1L,r,"local"))).isInstanceOf(BusinessException.class).hasMessageContaining("已撤回");
    }
    assertThat(service.getRelease(1L).status()).isEqualTo("WITHDRAWN");assertThat(audits()).isEqualTo(1);
    verify(hub).broadcastPolicyChanged("stable","stable-0.3.1","0.3.1","1");verifyNoMoreInteractions(hub);
  }
  @Test void pauseAndResumeNotifyDistinctRevisionsOnlyAfterCommit(){
    update(1,"PILOT","0");org.mockito.Mockito.reset(hub);
    tx.executeWithoutResult(s->{
      service.updateReleasePolicy(actor(1),1L,request("PAUSED","1"),"local");
      verifyNoInteractions(hub);
    });
    verify(hub).broadcastPolicyChanged("stable","stable-0.3.1","0.3.1","2");verifyNoMoreInteractions(hub);
    org.mockito.Mockito.reset(hub);update(1,"PILOT","2");
    verify(hub).broadcastPolicyChanged("stable","stable-0.3.1","0.3.1","3");
    verify(hub).broadcast("stable","stable-0.3.1","0.3.1");verifyNoMoreInteractions(hub);
  }
  @Test void concurrentAdministratorsHaveExactlyOneWinner() throws Exception {
    var pool=Executors.newFixedThreadPool(2);var barrier=new CyclicBarrier(2);
    try {
      List<Future<String>> jobs=new ArrayList<>();
      for(long id=1;id<=2;id++){long owner=id;jobs.add(pool.submit(()->{barrier.await();try{update(owner,"PILOT","0");return "saved";}catch(BusinessException e){return e.getCode();}}));}
      assertThat(List.of(jobs.get(0).get(10,TimeUnit.SECONDS),jobs.get(1).get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder("saved","RELEASE_VERSION_CONFLICT");
    }finally{pool.shutdownNow();}
    assertThat(service.getRelease(1L).policyVersion()).isEqualTo("1");assertThat(audits()).isEqualTo(1);verify(hub,times(1)).broadcast(anyString(),anyString(),anyString());
  }
  @Test void rollbackRestoresPolicyAndAuditAndDoesNotNotify(){
    tx.executeWithoutResult(s->{service.updateReleasePolicy(actor(1),1L,request("PILOT","0"),"local");s.setRollbackOnly();});
    assertThat(service.getRelease(1L).policyVersion()).isEqualTo("0");assertThat(audits()).isZero();verifyNoInteractions(hub);
  }
  @Test void centralAuditFailureRollsBackTheWholeWrite(){
    doThrow(new IllegalStateException("isolated audit failure")).when(audit).success(any(),any(),any(),any(),any(),any(),any());
    assertThatThrownBy(()->tx.execute(s->service.updateReleasePolicy(actor(1),1L,request("PILOT","0"),new AdminAuditContext("local","fixture","fixture")))).isInstanceOf(IllegalStateException.class);
    assertThat(service.getRelease(1L).policyVersion()).isEqualTo("0");assertThat(audits()).isZero();verifyNoInteractions(hub);
  }
  @Test void notificationFailureCannotMisreportCommittedPolicy(){
    doThrow(new IllegalStateException("isolated disconnected socket")).when(hub).broadcast(anyString(),anyString(),anyString());
    assertThat(update(1,"PILOT","0").policyVersion()).isEqualTo("1");assertThat(audits()).isEqualTo(1);
  }
  @Test void revokedAdministratorAndOldGenerationCannotWrite(){
    jdbc.update("UPDATE sr_user SET user_type='NORMAL' WHERE id=1");assertThatThrownBy(()->update(1,"PILOT","0")).isInstanceOf(BusinessException.class);
    jdbc.update("UPDATE sr_user SET user_type='ADMIN',login_version='new-generation' WHERE id=1");assertThatThrownBy(()->update(1,"PILOT","0")).isInstanceOf(BusinessException.class);
    assertThat(audits()).isZero();assertThat(service.getRelease(1L).policyVersion()).isEqualTo("0");
  }
  @Test void disabledAndMissingOrOverflowVersionFailClosed(){
    properties.setVersionedPolicyEnabled(false);assertThat(service.getRelease(1L).policyVersion()).isNull();assertThat(service.releasePage(null).versionedPolicyEnabled()).isFalse();
    assertThatThrownBy(()->update(1,"PILOT","0")).isInstanceOf(BusinessException.class);
    properties.setVersionedPolicyEnabled(true);
    for(String version:Arrays.asList(null,"-1","01","9223372036854775807","9999999999999999999"))assertThatThrownBy(()->update(1,"PILOT",version)).isInstanceOf(BusinessException.class);
    assertThat(audits()).isZero();verifyNoInteractions(hub);
  }
  @Test void stableTuplePagesSurviveInsertAndDeletedAnchorAndPreserveBigIds(){
    for(long id=2;id<=65;id++)seed(id,"DRAFT");
    long big=2104509220480131074L;seed(big,"DRAFT");
    var page=service.releasePage(null);assertThat(page.items()).hasSize(30);assertThat(page.items().get(0).id()).isEqualTo(big);
    assertThat(page.items().get(0).createdAt()).isEqualTo("2026-09-29T10:00");
    long anchor=page.items().get(29).id();seed(big+1,"DRAFT");jdbc.update("DELETE FROM sr_client_release WHERE id=?",anchor);
    List<Long> ids=new ArrayList<>();page.items().forEach(r->ids.add(r.id()));
    for(int pages=0;page.nextCursor()!=null;pages++){
      assertThat(pages).as("cursor must advance, never loop").isLessThan(4);
      String previous=page.nextCursor();page=service.releasePage(previous);assertThat(page.nextCursor()).isNotEqualTo(previous);page.items().forEach(r->ids.add(r.id()));
    }
    assertThat(ids).hasSize(66).doesNotHaveDuplicates().doesNotContain(big+1);
    String json;try{json=new ObjectMapper().writeValueAsString(service.getRelease(big));}catch(Exception e){throw new RuntimeException(e);}
    assertThat(json).contains("\"id\":\""+big+"\"");
    for(String cursor:List.of("bad!", "a".repeat(161),Base64.getUrlEncoder().withoutPadding().encodeToString("users-v1|2026-09-29T10:00|1".getBytes())))assertThatThrownBy(()->service.releasePage(cursor)).isInstanceOf(BusinessException.class);
  }
}
