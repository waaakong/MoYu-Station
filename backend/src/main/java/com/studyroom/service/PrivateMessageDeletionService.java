package com.studyroom.service;

import com.studyroom.common.BusinessException;
import com.studyroom.entity.User;
import java.time.Clock;
import java.util.*;
import java.util.function.Consumer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.*;

/** Sender lock -> sorted asset locks -> message lock. Never deletes original files. */
public final class PrivateMessageDeletionService {
  public record Deleted(long owner, long peer, String messageId) {}
  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;
  private final Clock clock;
  private final Consumer<Deleted> changed;
  public PrivateMessageDeletionService(JdbcTemplate jdbc, Clock clock, Consumer<Deleted> changed) {
    this.jdbc=jdbc;this.clock=clock;this.changed=changed;
    tx=new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
    tx.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);tx.setTimeout(10);
  }
  public void verifySchema(){jdbc.queryForList("SELECT message_id,sender_id,receiver_id,client_message_id FROM sr_chat_deleted_receipt WHERE 1=0");}
  public boolean wasRemoved(long sender,String clientId){
    return clientId!=null && !jdbc.queryForList("SELECT message_id FROM sr_chat_deleted_receipt WHERE sender_id=? AND client_message_id=? FOR SHARE",Long.class,sender,clientId).isEmpty();
  }
  public List<String> visible(long owner,long peer,List<Long> ids){
    if(peer<=0 || peer==owner || ids==null || ids.isEmpty() || ids.size()>80 || ids.stream().anyMatch(id->id==null || id<=0))throw missing();
    var parameters=new ArrayList<Object>(ids);parameters.add(owner);parameters.add(peer);parameters.add(peer);parameters.add(owner);parameters.add(owner);
    return jdbc.queryForList("SELECT id FROM sr_chat_message m WHERE id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+") AND channel_type='PRIVATE' AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND NOT EXISTS(SELECT 1 FROM sr_chat_message_visibility v WHERE v.message_id=m.id AND v.user_id=?)",Long.class,parameters.toArray()).stream().map(String::valueOf).toList();
  }
  public void delete(User caller,long messageId){
    if(messageId<=0)throw missing();
    tx.executeWithoutResult(status->{
      var initial=jdbc.queryForList("SELECT sender_id,receiver_id,channel_type FROM sr_chat_message WHERE id=?",messageId);
      if(initial.isEmpty()){checkReceipt(caller.getId(),messageId);return;}
      var first=initial.get(0);requireParticipant(caller.getId(),first);
      long sender=((Number)first.get("sender_id")).longValue();
      // Same lock as reliable text sending, so a tombstone cannot race the old client ID.
      jdbc.queryForObject("SELECT id FROM sr_user WHERE id=? FOR UPDATE",Long.class,sender);
      var assets=jdbc.queryForList("SELECT asset_id FROM sr_media_reference WHERE message_id=? ORDER BY asset_id",String.class,messageId);
      for(String asset:assets)jdbc.queryForObject("SELECT asset_id FROM sr_media_asset WHERE asset_id=? FOR UPDATE",String.class,asset);
      var rows=jdbc.queryForList("SELECT sender_id,receiver_id,channel_type,client_message_id FROM sr_chat_message WHERE id=? FOR UPDATE",messageId);
      if(rows.isEmpty()){checkReceipt(caller.getId(),messageId);return;}
      var message=rows.get(0);requireParticipant(caller.getId(),message);
      long receiver=((Number)message.get("receiver_id")).longValue();
      if(jdbc.queryForObject("SELECT COUNT(*) FROM sr_chat_message_visibility WHERE message_id=? AND user_id=?",Long.class,messageId,caller.getId())>0)return;
      jdbc.update("INSERT INTO sr_chat_message_visibility(message_id,user_id,hidden_at) VALUES(?,?,CURRENT_TIMESTAMP)",messageId,caller.getId());
      boolean both=jdbc.queryForObject("SELECT COUNT(DISTINCT user_id) FROM sr_chat_message_visibility WHERE message_id=? AND user_id IN (?,?)",Long.class,messageId,sender,receiver)==2;
      if(both){
        jdbc.update("INSERT INTO sr_chat_deleted_receipt(message_id,sender_id,receiver_id,client_message_id,deleted_at_ms) VALUES(?,?,?,?,?)",
          messageId,sender,receiver,message.get("client_message_id"),clock.millis());
        jdbc.update("DELETE FROM sr_media_reference WHERE message_id=?",messageId);
        jdbc.update("DELETE FROM sr_chat_message_visibility WHERE message_id=?",messageId);
        jdbc.update("DELETE FROM sr_chat_message WHERE id=?",messageId);
        for(String asset:assets)jdbc.update("UPDATE sr_media_asset SET unreferenced_at_ms=? WHERE asset_id=? AND NOT EXISTS(SELECT 1 FROM sr_media_reference r WHERE r.asset_id=sr_media_asset.asset_id)",clock.millis(),asset);
      }
      long peer=caller.getId()==sender?receiver:sender;
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){
        try{changed.accept(new Deleted(caller.getId(),peer,String.valueOf(messageId)));}catch(RuntimeException ignored){/* Committed deletion remains authoritative. */}
      }});
    });
  }
  private void checkReceipt(long owner,long messageId){
    var rows=jdbc.queryForList("SELECT sender_id,receiver_id FROM sr_chat_deleted_receipt WHERE message_id=? FOR SHARE",messageId);
    if(rows.isEmpty() || !participant(owner,rows.get(0)))throw missing();
  }
  private static boolean participant(long owner,Map<String,Object> row){return row.get("sender_id") instanceof Number sender && row.get("receiver_id") instanceof Number receiver && (sender.longValue()==owner || receiver.longValue()==owner);}
  private static void requireParticipant(long owner,Map<String,Object> row){if(!"PRIVATE".equals(row.get("channel_type")) || !participant(owner,row))throw missing();}
  private static BusinessException missing(){return new BusinessException("CHAT_MESSAGE_NOT_FOUND","消息不存在或无权操作。");}
}
