package com.studyroom.media;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.studyroom.common.BusinessException;
import com.studyroom.dto.*;
import com.studyroom.entity.User;
import com.studyroom.mapper.*;
import com.studyroom.service.ChatService;
import com.studyroom.service.ChatConversationService;
import com.studyroom.service.PrivateMessageDeletionService;
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

/** No supplied database: owned ephemeral MySQL, real MyBatis mappers and transactions. */
class ChatReliabilityMysqlIT {
  @TempDir static Path root;
  static EphemeralMysql mysql;
  static JdbcTemplate jdbc;
  static TransactionTemplate tx;
  static ChatService service;
  static UserMapper users;
  static PrivateMessageDeletionService deletion;
  static List<PrivateMessageDeletionService.Deleted> deletedEvents=Collections.synchronizedList(new ArrayList<>());

  @BeforeAll static void start() throws Exception {
    mysql = EphemeralMysql.start(root, Path.of(System.getProperty("media.mysql.binary")));
    var source = new DriverManagerDataSource(mysql.databaseUrl, "root", "");
    mysql.verifyOwnership();
    Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate();
    jdbc = new JdbcTemplate(source);
    var configuration = new MybatisConfiguration();
    configuration.setMapUnderscoreToCamelCase(true);
    for (var mapper : List.of(UserMapper.class, ChatMessageMapper.class, PrivateConversationMapper.class, ChatMessageVisibilityMapper.class)) configuration.addMapper(mapper);
    var factory = new MybatisSqlSessionFactoryBean();
    var global = new com.baomidou.mybatisplus.core.config.GlobalConfig();
    global.setDbConfig(new com.baomidou.mybatisplus.core.config.GlobalConfig.DbConfig().setIdType(com.baomidou.mybatisplus.annotation.IdType.AUTO));
    factory.setGlobalConfig(global);
    factory.setDataSource(source); factory.setConfiguration(configuration);
    var sessions = new SqlSessionTemplate(factory.getObject());
    users = sessions.getMapper(UserMapper.class);
    service = new ChatService(users, sessions.getMapper(ChatMessageMapper.class), sessions.getMapper(PrivateConversationMapper.class),
        sessions.getMapper(ChatMessageVisibilityMapper.class), null);
    deletion=new PrivateMessageDeletionService(jdbc,java.time.Clock.systemUTC(),deletedEvents::add);deletion.verifySchema();service.setPrivateDeletion(deletion);
    tx = new TransactionTemplate(new DataSourceTransactionManager(source)); tx.setTimeout(10);
    for (int id = 1; id <= 3; id++) jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname) VALUES(?,?,?,?)", id, "chat-fixture-"+id, "unused", "fixture");
  }
  @AfterAll static void stop() throws Exception { if (mysql != null) mysql.close(); }
  @BeforeEach void reset() throws Exception {
    deletedEvents.clear();
    mysql.verifyOwnership();
    for (String table : List.of("sr_media_reference","sr_sticker_favorite","sr_media_asset","sr_chat_deleted_receipt","sr_chat_message_visibility", "sr_chat_message", "sr_private_conversation")) jdbc.update("DELETE FROM " + table);
    jdbc.update("UPDATE sr_user SET user_type='NORMAL',deleted=0");
  }

  @Test void sameIdRetryUsesOriginalRowAndRejectsChangedContentTargetOrChannel() {
    var first = send(1, 2L, "stable", "hello");
    var retry = send(1, 2L, "stable", "hello");
    assertThat(first.isCreated()).isTrue(); assertThat(retry.isCreated()).isFalse();
    assertThat(retry.getMessage().getId()).isEqualTo(first.getMessage().getId());
    assertThat(retry.getMessage().getClientMessageId()).isEqualTo("stable");
    conflict(() -> send(1, 3L, "stable", "hello"));
    conflict(() -> send(1, 2L, "stable", "changed"));
    conflict(() -> send(1, null, "stable", "hello"));
    assertThat(count()).isEqualTo(1);
    assertThat(send(2, 1L, "stable", "hello").isCreated()).isTrue();
  }
  @Test void singleDeletionIsPrivateIdempotentAndOnlyBothParticipantsRemoveTheBody(){
    var message=send(1,2L,"delete-one","private body").getMessage();
    assertThatThrownBy(()->service.deletePrivateMessage(users.selectById(3),message.getId())).isInstanceOf(BusinessException.class);
    service.deletePrivateMessage(users.selectById(1),message.getId());
    service.deletePrivateMessage(users.selectById(1),message.getId());
    assertThat(deletedEvents).hasSize(1);assertThat(deletedEvents.get(0).owner()).isEqualTo(1);
    assertThat(deletion.visible(1,2,List.of(message.getId()))).isEmpty();
    assertThat(deletion.visible(2,1,List.of(message.getId()))).containsExactly(String.valueOf(message.getId()));
    assertThat(count()).isEqualTo(1);
    service.deletePrivateMessage(users.selectById(2),message.getId());service.deletePrivateMessage(users.selectById(2),message.getId());
    assertThat(count()).isZero();assertThat(deletedEvents).hasSize(2);
    var receipt=jdbc.queryForMap("SELECT * FROM sr_chat_deleted_receipt WHERE message_id=?",message.getId());
    assertThat(receipt.keySet()).containsExactlyInAnyOrder("message_id","sender_id","receiver_id","client_message_id","deleted_at_ms");
    assertThatThrownBy(()->send(1,2L,"delete-one","private body")).isInstanceOf(BusinessException.class);
    assertThat(count()).isZero();
    assertThatThrownBy(()->service.deletePrivateMessage(users.selectById(3),message.getId())).isInstanceOf(BusinessException.class);
  }
  @Test void concurrentParticipantDeletionLeavesOneReceiptAndNoContent()throws Exception{
    var message=send(1,2L,"concurrent-delete","private body").getMessage();
    var pool=Executors.newFixedThreadPool(2);var start=new CyclicBarrier(2);
    try{
      var a=pool.submit(()->{start.await();service.deletePrivateMessage(users.selectById(1),message.getId());return true;});
      var b=pool.submit(()->{start.await();service.deletePrivateMessage(users.selectById(2),message.getId());return true;});
      assertThat(a.get(15,TimeUnit.SECONDS)).isTrue();assertThat(b.get(15,TimeUnit.SECONDS)).isTrue();
      assertThat(count()).isZero();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_deleted_receipt",Integer.class)).isEqualTo(1);assertThat(deletedEvents).hasSize(2);
    }finally{pool.shutdownNow();}
  }
  @Test void bulkDeletionHonorsTheFrozenWatermark(){
    var old=send(1,2L,"watermark-old","old").getMessage();var newer=send(1,2L,"watermark-new","new").getMessage();
    tx.executeWithoutResult(s->service.deletePrivateMessages(users.selectById(2),1L,old.getId()));
    assertThat(service.privateMessages(users.selectById(2),1L,null)).extracting(ChatMessageResponse::getId).containsExactly(newer.getId());
  }
  @Test void deletingMediaReleasesOnlyMessageReferencesAndKeepsIndependentFavorites(){
    long now=System.currentTimeMillis();
    for(boolean favorite:List.of(false,true)){
      var message=send(1,2L,"image-"+favorite,"image").getMessage();String asset=UUID.randomUUID().toString();
      jdbc.update("INSERT INTO sr_media_asset(asset_id,owner_id,client_upload_id,candidate_sha256,candidate_mime,state,created_at_ms,processing_deadline_ms,expires_at_ms,clear_mime,width,height,clear_bytes,thumb_bytes,published_at_ms) VALUES(?,1,?,?,'image/png','READY',?,?,?,'image/png',1,1,80,80,?)",asset,UUID.randomUUID().toString(),"0".repeat(64),now,now+1000,now+86400000,now);
      jdbc.update("UPDATE sr_chat_message SET message_type='IMAGE',media_url=? WHERE id=?","/api/media/assets/"+asset+"/clear",message.getId());
      jdbc.update("INSERT INTO sr_media_reference(asset_id,message_id,position) VALUES(?,?,0)",asset,message.getId());
      if(favorite){String id=UUID.randomUUID().toString();jdbc.update("INSERT INTO sr_sticker_favorite(favorite_id,owner_id,asset_id,source_key,position) VALUES(?,1,?,'independent',0)",id,asset);jdbc.update("INSERT INTO sr_media_reference(asset_id,favorite_id,position) VALUES(?,?,0)",asset,id);}
      service.deletePrivateMessage(users.selectById(1),message.getId());
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_reference WHERE message_id=?",Integer.class,message.getId())).isEqualTo(1);
      service.deletePrivateMessage(users.selectById(2),message.getId());
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_reference WHERE message_id=?",Integer.class,message.getId())).isZero();
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_asset WHERE asset_id=?",Integer.class,asset)).isEqualTo(1);
      Long unreferenced=jdbc.queryForObject("SELECT unreferenced_at_ms FROM sr_media_asset WHERE asset_id=?",Long.class,asset);
      if(favorite){assertThat(unreferenced).isNull();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_media_reference WHERE asset_id=?",Integer.class,asset)).isEqualTo(1);}
      else assertThat(unreferenced).isGreaterThanOrEqualTo(now);
    }
  }
  @Test void messageWireIdNeverLosesPrecision() throws Exception {
    var message=new ChatMessageResponse();message.setId(2104509220480131074L);
    var json=new com.fasterxml.jackson.databind.ObjectMapper().readTree(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(message));
    assertThat(json.get("id").isTextual()).isTrue();assertThat(json.get("id").asText()).isEqualTo("2104509220480131074");
  }

  @Test void twoConcurrentClientsCreateOnlyOneMessage() throws Exception {
    var pool = Executors.newFixedThreadPool(2); var start = new CyclicBarrier(2);
    try {
      Callable<ChatMessageSaveResult> operation = () -> { start.await(5, TimeUnit.SECONDS); return send(1, 2L, "race", "one"); };
      var a = pool.submit(operation); var b = pool.submit(operation);
      var first = a.get(15, TimeUnit.SECONDS); var second = b.get(15, TimeUnit.SECONDS);
      assertThat(first.isCreated()).isNotEqualTo(second.isCreated());
      assertThat(first.getMessage().getId()).isEqualTo(second.getMessage().getId());
      assertThat(count()).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_private_conversation", Integer.class)).isEqualTo(1);
    } finally { pool.shutdownNow(); }
  }

  @Test void readWatermarkDoesNotReadNewerMessagesOrAnotherConversation() {
    var first = send(2, 1L, "read-first", "visible").getMessage();
    var later = send(2, 1L, "read-later", "below viewport").getMessage();
    var other = send(3, 1L, "read-other", "other person").getMessage();
    service.markPrivateRead(users.selectById(1), 2L, first.getId());
    assertThat(jdbc.queryForObject("SELECT read_at IS NOT NULL FROM sr_chat_message WHERE id=?", Boolean.class, first.getId())).isTrue();
    for (var id : List.of(later.getId(), other.getId())) assertThat(jdbc.queryForObject("SELECT read_at IS NULL FROM sr_chat_message WHERE id=?", Boolean.class, id)).isTrue();
    assertThatThrownBy(() -> service.markPrivateRead(users.selectById(1), 2L, -1L)).isInstanceOf(BusinessException.class);
  }

  @Test void hiddenOrRecalledMessagesCannotResurrectOnRetry() {
    var first = send(1, 2L, "removed", "hello").getMessage();
    tx.executeWithoutResult(s -> service.deletePrivateMessages(users.selectById(1), 2L));
    assertThat(service.privateMessages(users.selectById(1), 2L, null)).isEmpty();
    assertThat(service.privateMessages(users.selectById(2), 1L, null)).hasSize(1);
    tx.executeWithoutResult(s -> service.deletePrivateMessages(users.selectById(2), 1L));
    assertThatThrownBy(() -> send(1, 2L, "removed", "hello")).isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException)e).getCode()).isEqualTo("CHAT_MESSAGE_REMOVED");
    assertThat(count()).isEqualTo(0);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_deleted_receipt",Integer.class)).isEqualTo(1);
    assertThat(service.privateMessages(users.selectById(2), 1L, null)).isEmpty();
    var recall = send(1, 2L, "recalled", "old").getMessage();
    tx.executeWithoutResult(s -> service.recallPrivateMessage(users.selectById(1), recall.getId()));
    var retry = send(1, 2L, "recalled", "old");
    assertThat(retry.isCreated()).isFalse(); assertThat(retry.getMessage().getRecalled()).isTrue();
    assertThat(retry.getMessage().getContent()).isEmpty();
  }

  @Test void historyPagesAreOrderedByIdEvenWithEqualTimestampsAndExclusiveCursors() {
    for (int i = 0; i < 170; i++) jdbc.update("INSERT INTO sr_chat_message(sender_id,channel_type,message_type,content,created_at) VALUES(1,'HALL','TEXT',?,'2026-01-01 00:00:00')", "m"+i);
    User user = users.selectById(1);
    var newest = service.hallMessages(user, null, null);
    var middle = service.hallMessages(user, null, newest.get(0).getId());
    var oldest = service.hallMessages(user, null, middle.get(0).getId());
    assertThat(newest).hasSize(80); assertThat(middle).hasSize(80); assertThat(oldest).hasSize(10);
    var ids = new ArrayList<Long>(); for (var page : List.of(oldest, middle, newest)) page.forEach(m -> ids.add(m.getId()));
    assertThat(ids).isSorted().doesNotHaveDuplicates().hasSize(170);
    assertThat(service.hallMessages(user, oldest.get(9).getId(), null)).extracting(ChatMessageResponse::getId)
        .containsExactlyElementsOf(middle.stream().map(ChatMessageResponse::getId).toList());
    assertThatThrownBy(() -> service.hallMessages(user, 1L, 2L)).isInstanceOf(BusinessException.class);
    assertThatThrownBy(() -> service.privateMessages(user, 2L, null, -1L)).isInstanceOf(BusinessException.class);
  }

  @Test void privateHistoryDoesNotLeakThirdPartyOrHiddenRows() {
    var first = send(1, 2L, "a", "first").getMessage();
    tx.executeWithoutResult(s -> service.deletePrivateMessages(users.selectById(1), 2L));
    var second = send(2, 1L, "b", "second").getMessage();
    assertThat(service.privateMessages(users.selectById(1), 2L, null, null)).extracting(ChatMessageResponse::getId).containsExactly(second.getId());
    assertThat(service.privateMessages(users.selectById(1), 2L, null, second.getId())).isEmpty();
    assertThat(service.privateMessages(users.selectById(2), 1L, null, second.getId())).extracting(ChatMessageResponse::getId).containsExactly(first.getId());
    assertThat(service.privateMessages(users.selectById(3), 2L, null, null)).isEmpty();
  }

  @Test void summariesIncludeOfflinePeersWithSnapshotPaginationAndNoThirdPartyAccess() {
    for (int peer = 4; peer <= 38; peer++) {
      jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,online_status) VALUES(?,?,? ,?,'OFFLINE') ON DUPLICATE KEY UPDATE online_status='OFFLINE'", peer, "offline-"+peer, "unused", "peer"+peer);
      jdbc.update("INSERT INTO sr_private_conversation(user_a_id,user_b_id) VALUES(1,?)", peer);
      long conversation = jdbc.queryForObject("SELECT id FROM sr_private_conversation WHERE user_a_id=1 AND user_b_id=?", Long.class, peer);
      jdbc.update("INSERT INTO sr_chat_message(conversation_id,sender_id,receiver_id,channel_type,message_type,content) VALUES(?,?,1,'PRIVATE','TEXT',?)", conversation, peer, "from"+peer);
    }
    var summaries = new ChatConversationService(jdbc);
    var first = summaries.list(1, null);
    assertThat(first.items()).hasSize(30); assertThat(first.nextCursor()).isNotNull();
    assertThat(first.items()).allMatch(item -> item.onlineStatus().equals("OFFLINE") && item.unreadCount() == 1);
    // A new message must not make an unseen peer disappear from this pinned traversal.
    send(1, 4L, "new-during-page", "new content");
    var second = summaries.list(1, first.nextCursor());
    assertThat(second.items()).hasSize(5); assertThat(second.nextCursor()).isNull();
    var peers = new HashSet<Long>(); first.items().forEach(item -> peers.add(item.userId())); second.items().forEach(item -> peers.add(item.userId()));
    assertThat(peers).hasSize(35).contains(4L);
    assertThat(second.items().stream().filter(item -> item.userId() == 4).findFirst().orElseThrow().preview()).isEqualTo("from4");
    assertThat(summaries.list(1, null).items().get(0).userId()).isEqualTo(4L);
    assertThat(summaries.list(3, null).items()).isEmpty();
    tx.executeWithoutResult(s -> service.deletePrivateMessages(users.selectById(1), 4L));
    assertThat(summaries.list(1, null).items()).noneMatch(item -> item.userId() == 4L);
  }

  @Test void summaryAndUnreadRespectRecallAndOneSidedDeletion() {
    var message = send(2, 1L, "unread", "private").getMessage();
    var summaries = new ChatConversationService(jdbc);
    assertThat(summaries.list(1, null).items().get(0).unreadCount()).isEqualTo(1);
    tx.executeWithoutResult(s -> service.recallPrivateMessage(users.selectById(2), message.getId()));
    assertThat(summaries.list(1, null).items().get(0).preview()).isEqualTo("消息已撤回");
    assertThat(summaries.list(1, null).items().get(0).unreadCount()).isZero();
    assertThat(service.unread(users.selectById(1))).isEmpty();
    send(2, 1L, "hidden", "hide");
    tx.executeWithoutResult(s -> service.deletePrivateMessages(users.selectById(1), 2L));
    assertThat(service.unread(users.selectById(1))).isEmpty();
    assertThat(summaries.list(1, null).items()).isEmpty();
    assertThat(summaries.list(2, null).items()).hasSize(1);
    for (String bad : List.of("", "-1.2", "1.2", "1.1.1", "9999999999999999999.1"))
      assertThatThrownBy(() -> summaries.list(1, bad)).isInstanceOf(BusinessException.class);
  }

  @Test void invalidIdAndMutedAccountCannotWriteButLegacyRequestStillWorks() {
    assertThatThrownBy(() -> send(1, null, " ", "hello")).isInstanceOf(BusinessException.class);
    assertThatThrownBy(() -> send(1, null, "a".repeat(65), "hello")).isInstanceOf(BusinessException.class);
    jdbc.update("UPDATE sr_user SET user_type='MUTED' WHERE id=1");
    assertThatThrownBy(() -> send(1, null, "muted", "hello")).isInstanceOf(BusinessException.class);
    assertThat(count()).isZero();
    assertThat(send(2, null, null, "legacy").isCreated()).isTrue();
  }

  @Test void adjacentLargeAccountsKeepRecipientsHistoryAndReceiptsSeparate() throws Exception {
    long owner=2104509220480131073L,a=owner+1,b=owner+2;
    for(long id:List.of(owner,a,b))jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname) VALUES(?,?,?,?)",id,"exact-"+id,"fixture-only","精确账号");
    var first=send(owner,a,"exact-a","只发给甲");
    var second=send(owner,b,"exact-b","只发给乙");
    assertThat(first.getMessage().getReceiverId()).isEqualTo(a);
    assertThat(second.getMessage().getReceiverId()).isEqualTo(b);
    assertThat(first.getMessage().getConversationId()).isNotEqualTo(second.getMessage().getConversationId());
    assertThat(send(owner,a,"exact-a","只发给甲").isCreated()).isFalse();
    conflict(()->send(owner,b,"exact-a","只发给甲"));
    var summaries=new ChatConversationService(jdbc);
    assertThat(summaries.list(owner,null).items()).extracting(ChatConversationService.Summary::userId).containsExactly(b,a);
    assertThat(summaries.list(a,null).items()).extracting(ChatConversationService.Summary::preview).containsExactly("只发给甲");
    assertThat(summaries.list(b,null).items()).extracting(ChatConversationService.Summary::preview).containsExactly("只发给乙");
    var json=new com.fasterxml.jackson.databind.ObjectMapper();
    assertThat(json.readTree(json.writeValueAsString(first.getMessage())).get("receiverId").textValue()).isEqualTo(String.valueOf(a));
  }

  static ChatMessageSaveResult send(long sender, Long receiver, String id, String content) {
    return tx.execute(s -> {
      var request = new SendChatMessageRequest(); request.setClientMessageId(id); request.setContent(content); request.setMessageType("TEXT");
      var user = users.selectById(sender);
      return receiver == null ? service.saveHallMessageResult(user, request) : service.savePrivateMessageResult(user, receiver, request);
    });
  }
  static int count() { return jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_message", Integer.class); }
  static void conflict(Runnable action) {
    assertThatThrownBy(action::run).isInstanceOf(BusinessException.class).extracting(e -> ((BusinessException)e).getCode()).isEqualTo("CHAT_MESSAGE_ID_CONFLICT");
  }
}
