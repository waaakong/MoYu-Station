package com.studyroom.media;

import com.studyroom.common.BusinessException;
import com.studyroom.entity.User;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Post tombstones and receipt rows remain. Only references are released, never files or other owners' favorites. */
@Service
public class PostDeletionService {
  private final JdbcTemplate jdbc;
  private final boolean mediaEnabled;
  public PostDeletionService(JdbcTemplate jdbc,@Value("${studyroom.media.enabled:false}") boolean mediaEnabled){this.jdbc=jdbc;this.mediaEnabled=mediaEnabled;}

  @Transactional
  public boolean delete(User actor,long postId,boolean administrator,String reason){
    if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Post deletion requires a transaction");
    var accounts=jdbc.queryForList("SELECT deleted,user_type,login_version FROM sr_user WHERE id=? FOR UPDATE",actor.getId());
    if(accounts.isEmpty())throw forbidden();var account=accounts.get(0);
    if(((Number)account.get("deleted")).intValue()!=0 || "BANNED".equals(account.get("user_type")) || !Objects.equals(account.get("login_version"),actor.getLoginVersion()) || administrator&&!"ADMIN".equals(account.get("user_type")))throw forbidden();
    // Establish a committed-post snapshot before collecting asset keys. A guessed ID of
    // an in-flight publication must not wait for the new post and then detach unlocked assets.
    var visible=jdbc.queryForList("SELECT user_id FROM sr_post WHERE id=?",postId);
    if(visible.isEmpty())throw new BusinessException("RESOURCE_NOT_FOUND","动态不存在。");
    if(!administrator&&((Number)visible.get(0).get("user_id")).longValue()!=actor.getId())throw forbidden();
    // Publication never appends assets to an existing post. Asset -> post order matches the collector.
    List<String> assets=mediaEnabled?jdbc.queryForList("SELECT asset_id FROM sr_media_reference WHERE post_id=? ORDER BY asset_id",String.class,postId):List.of();
    for(String id:assets)jdbc.queryForList("SELECT asset_id FROM sr_media_asset WHERE asset_id=? FOR UPDATE",id);
    var posts=jdbc.queryForList("SELECT user_id,deleted_by_user,deleted_by_admin FROM sr_post WHERE id=? FOR UPDATE",postId);
    if(posts.isEmpty())throw new BusinessException("RESOURCE_NOT_FOUND","动态不存在。");var post=posts.get(0);
    if(!administrator&&((Number)post.get("user_id")).longValue()!=actor.getId())throw forbidden();
    boolean changed=((Number)post.get(administrator?"deleted_by_admin":"deleted_by_user")).intValue()==0;
    if(changed)jdbc.update("UPDATE sr_post SET "+(administrator?"deleted_by_admin":"deleted_by_user")+"=1,delete_reason=? WHERE id=?",reason,postId);
    if(mediaEnabled){
      jdbc.update("DELETE FROM sr_media_reference WHERE post_id=?",postId);
      for(String id:assets)jdbc.update("UPDATE sr_media_asset SET unreferenced_at_ms=COALESCE(unreferenced_at_ms,?) WHERE asset_id=? AND NOT EXISTS(SELECT 1 FROM sr_media_reference r WHERE r.asset_id=sr_media_asset.asset_id)",System.currentTimeMillis(),id);
    }
    return changed;
  }
  private static BusinessException forbidden(){return new BusinessException("AUTH_FORBIDDEN","无权删除此动态，或账号会话已失效。");}
}
