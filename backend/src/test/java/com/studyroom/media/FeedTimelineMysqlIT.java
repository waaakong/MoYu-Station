package com.studyroom.media;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.entity.User;
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
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class FeedTimelineMysqlIT {
  @TempDir static Path root;
  static EphemeralMysql mysql;
  static JdbcTemplate jdbc;
  static TransactionTemplate tx;
  static FeedService feed;
  static FeedTimelineService timeline;
  static UserMapper users;
  static ChatSocketHub sockets;

  @BeforeAll static void start() throws Exception {
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));
    var source=new DriverManagerDataSource(mysql.databaseUrl,"root","");mysql.verifyOwnership();
    assertThat(Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate().migrationsExecuted).isEqualTo(15);
    jdbc=new JdbcTemplate(source);var configuration=new MybatisConfiguration();configuration.setMapUnderscoreToCamelCase(true);
    for(var mapper:List.of(UserMapper.class,PostMapper.class,PostLikeMapper.class,PostCommentMapper.class))configuration.addMapper(mapper);
    var factory=new MybatisSqlSessionFactoryBean();var global=new com.baomidou.mybatisplus.core.config.GlobalConfig();
    global.setDbConfig(new com.baomidou.mybatisplus.core.config.GlobalConfig.DbConfig().setIdType(com.baomidou.mybatisplus.annotation.IdType.AUTO));
    factory.setGlobalConfig(global);factory.setDataSource(source);factory.setConfiguration(configuration);
    var sessions=new SqlSessionTemplate(factory.getObject());users=sessions.getMapper(UserMapper.class);
    feed=new FeedService(sessions.getMapper(PostMapper.class),sessions.getMapper(PostCommentMapper.class),sessions.getMapper(PostLikeMapper.class),users,new ObjectMapper(),null,mock(FeedNotificationSocketHub.class));
    sockets=mock(ChatSocketHub.class);timeline=new FeedTimelineService(jdbc,feed,sockets);
    tx=new TransactionTemplate(new DataSourceTransactionManager(source));tx.setTimeout(10);
    for(int id=1;id<=3;id++)jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,login_version) VALUES(?,?,?,?,?)",id,"feed-fixture-"+id,"unused","fixture","epoch");
  }
  @AfterAll static void stop() throws Exception{if(mysql!=null)mysql.close();}
  @BeforeEach void reset() throws Exception {mysql.verifyOwnership();for(String table:List.of("sr_post_like","sr_post_comment","sr_post","sr_user_follow","sr_follow_collection"))jdbc.update("DELETE FROM "+table);jdbc.update("UPDATE sr_user SET user_type='NORMAL',deleted=0,login_version='epoch'");clearInvocations(sockets);}
  User user(long id){return users.selectById(id);}
  FeedTimelineService.Relationship follow(long owner,long target,boolean desired){return tx.execute(s->timeline.follow(user(owner),target,desired));}
  FeedTimelineService.Page page(String stream,String cursor){return tx.execute(s->timeline.page(user(1),stream,cursor));}
  long post(long owner,String request,String text){return tx.execute(s->feed.createPost(user(owner),text,"forest",request,null)).getId();}

  @Test void desiredFollowIsIdempotentPrivateAndRejectsSelfOrRevokedIdentity(){
    assertThat(follow(1,2,true).version()).isEqualTo(1);assertThat(follow(1,2,true).version()).isEqualTo(1);
    verify(sockets,times(1)).sendToUser(eq(1L),eq("FOLLOWS_INVALIDATED"),any());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_user_follow WHERE owner_id=3",Integer.class)).isZero();
    assertThatThrownBy(()->follow(1,1,true)).isInstanceOf(BusinessException.class);
    User stale=user(1);jdbc.update("UPDATE sr_user SET login_version='revoked' WHERE id=1");
    assertThatThrownBy(()->tx.executeWithoutResult(s->timeline.follow(stale,3,true))).isInstanceOf(BusinessException.class);
    assertThat(follow(1,2,false).version()).isEqualTo(2);assertThat(follow(1,2,false).version()).isEqualTo(2);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_user_follow",Integer.class)).isZero();
  }
  @Test void timestampAndIdCursorDoesNotDuplicateOrIncludeNewerInsertAndFollowFilterIsServerSide(){
    for(int i=0;i<65;i++)post(i%2==0?2:3,"fixture-post-key-"+i,"post "+i);
    jdbc.update("UPDATE sr_post SET created_at='2026-09-20 12:00:00'");
    var first=page("square",null);assertThat(first.items()).hasSize(30);
    long newest=post(3,"fixture-new-insert","new");
    var second=page("square",first.nextCursor());var third=page("square",second.nextCursor());
    var ids=new ArrayList<Long>();for(var p:List.of(first,second,third))p.items().forEach(item->ids.add(item.getId()));
    assertThat(ids).hasSize(65).doesNotHaveDuplicates().doesNotContain(newest);assertThat(third.nextCursor()).isNull();
    follow(1,2,true);var followed=page("following",null);assertThat(followed.items()).hasSize(30).allMatch(item->item.getAuthorId()==2L);
    assertThat(page("following",followed.nextCursor()).items()).hasSize(3);
    follow(1,3,true);assertThatThrownBy(()->page("following",followed.nextCursor())).isInstanceOf(BusinessException.class).extracting("code").isEqualTo("FEED_RELATIONS_CHANGED");
    assertThatThrownBy(()->page("square","invalid!")).isInstanceOf(BusinessException.class);
  }
  @Test void concurrentTextPublicationReusesReceiptRejectsChangedPayloadAndKeepsDeletedReceipt() throws Exception{
    var pool=Executors.newFixedThreadPool(2);var gate=new CyclicBarrier(2);
    try{Callable<Long> send=()->{gate.await(5,TimeUnit.SECONDS);return post(1,"stable-post-request","one");};
      var a=pool.submit(send);var b=pool.submit(send);long id=a.get(15,TimeUnit.SECONDS);assertThat(b.get(15,TimeUnit.SECONDS)).isEqualTo(id);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_post",Integer.class)).isEqualTo(1);
      assertThatThrownBy(()->post(1,"stable-post-request","changed")).isInstanceOf(BusinessException.class).extracting("code").isEqualTo("FEED_REQUEST_ID_CONFLICT");
      assertThat(feed.publication(user(2),"stable-post-request")).containsEntry("status","missing");
      jdbc.update("UPDATE sr_post SET deleted_by_user=1 WHERE id=?",id);
      assertThat(feed.publication(user(1),"stable-post-request")).containsEntry("status","committed").containsEntry("targetId",id);
    }finally{pool.shutdownNow();}
  }
}
