package com.studyroom.media;

import java.io.IOException;
import java.time.Clock;
import java.util.*;
import java.util.function.BiConsumer;
import java.util.function.Supplier;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.*;

/** Account collection lock -> sorted asset locks -> message lock. All mutations retain request tombstones. */
public final class StickerFavoriteService {
  public record Add(UUID assetId,Long messageId) {}
  public record Item(String id,String assetId,String clearUrl,String thumbUrl,String mime,int width,int height) {}
  public record Collection(long version,List<Item> items) {}
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transaction;
  private final PrivateImageStore store;
  private final MediaAssetService assets;
  private final Clock clock;
  private final BiConsumer<Long,Long> changed;
  public StickerFavoriteService(JdbcTemplate jdbc,PrivateImageStore store,MediaAssetService assets,Clock clock,BiConsumer<Long,Long> changed) {
    this.jdbc=new JdbcTemplate(Objects.requireNonNull(jdbc.getDataSource()));this.jdbc.setQueryTimeout(5);
    transaction=new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    transaction.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);transaction.setTimeout(15);
    this.store=store;this.assets=assets;this.clock=clock;this.changed=changed;
  }
  public Collection list(long owner) { return run(()->{lockCollection(owner);return snapshot(owner);}); }
  /** Bind public HTTP mutations to the account generation observed during authentication. */
  public <T>T forUser(com.studyroom.entity.User user,Supplier<T> action){
    return run(()->{
      var rows=jdbc.queryForList("SELECT login_version,deleted,user_type FROM sr_user WHERE id=? FOR SHARE",user.getId());
      if(rows.isEmpty() || ((Number)rows.get(0).get("deleted")).intValue()!=0 || "BANNED".equals(rows.get(0).get("user_type")))throw MediaApiException.notFound();
      if(!Objects.equals(user.getLoginVersion(),rows.get(0).get("login_version")))throw new com.studyroom.common.AccountLoggedInElsewhereException();
      return action.get();
    });
  }
  public Collection add(long owner,UUID id,Add command) {
    if(id==null || command==null || (command.assetId()==null)==(command.messageId()==null) || command.messageId()!=null && command.messageId()<=0)throw invalid();
    String source=command.assetId()!=null?"asset:"+command.assetId():"message:"+command.messageId();
    return run(()->{
      lockCollection(owner);
      var previous=jdbc.queryForList("SELECT owner_id,source_key,deleted FROM sr_sticker_favorite WHERE favorite_id=?",id.toString());
      if(!previous.isEmpty()) {
        var row=previous.get(0);
        if(((Number)row.get("owner_id")).longValue()!=owner)throw MediaApiException.notFound();
        if(((Number)row.get("deleted")).intValue()!=0)throw conflict("STICKER_REMOVED","该收藏操作已被删除，请使用新的操作 ID。");
        if(!source.equals(row.get("source_key")))throw conflict("STICKER_ID_CONFLICT","同一收藏 ID 已绑定其他来源。");
        return snapshot(owner);
      }
      if(jdbc.queryForObject("SELECT COUNT(*) FROM sr_sticker_favorite WHERE owner_id=? AND deleted=0",Integer.class,owner)>=200)
        throw new MediaApiException(409,"STICKER_LIMIT","最多收藏 200 个表情，请先删除一个。");
      UUID asset=command.assetId();
      if(asset==null) asset=copyMessage(owner,id,command.messageId());
      var row=lockAsset(asset);
      if(((Number)row.get("owner_id")).longValue()!=owner || !"sticker".equals(row.get("purpose")) || !"READY".equals(row.get("state"))
        || row.get("retired_at_ms")!=null || row.get("published_at_ms")!=null || ((Number)row.get("expires_at_ms")).longValue()<=clock.millis())
        throw conflict("STICKER_ASSET_INVALID","请选择当前账号已就绪且未使用的表情资产。");
      int position=jdbc.queryForObject("SELECT COALESCE(MAX(position),-1)+1 FROM sr_sticker_favorite WHERE owner_id=? AND deleted=0",Integer.class,owner);
      jdbc.update("INSERT INTO sr_sticker_favorite(favorite_id,owner_id,asset_id,source_key,position) VALUES(?,?,?,?,?)",id.toString(),owner,asset.toString(),source,position);
      jdbc.update("INSERT INTO sr_media_reference(asset_id,favorite_id,position) VALUES(?,?,0)",asset.toString(),id.toString());
      jdbc.update("UPDATE sr_media_asset SET published_at_ms=?,unreferenced_at_ms=NULL WHERE asset_id=?",clock.millis(),asset.toString());
      increment(owner);return snapshot(owner);
    });
  }
  public Collection delete(long owner,UUID id) {
    if(id==null)throw invalid();
    return run(()->{
      lockCollection(owner);
      var rows=jdbc.queryForList("SELECT owner_id,asset_id,deleted FROM sr_sticker_favorite WHERE favorite_id=?",id.toString());
      if(rows.isEmpty()) {
        // A cancelled upload's late PUT cannot resurrect a removed favorite.
        jdbc.update("INSERT INTO sr_sticker_favorite(favorite_id,owner_id,source_key,position,deleted) VALUES(?,?,'cancelled',0,1)",id.toString(),owner);
        return snapshot(owner);
      }
      var row=rows.get(0);if(((Number)row.get("owner_id")).longValue()!=owner)throw MediaApiException.notFound();
      if(((Number)row.get("deleted")).intValue()==1)return snapshot(owner);
      UUID asset=UUID.fromString((String)row.get("asset_id"));lockAsset(asset);
      jdbc.update("UPDATE sr_sticker_favorite SET deleted=1 WHERE favorite_id=?",id.toString());
      jdbc.update("DELETE FROM sr_media_reference WHERE favorite_id=?",id.toString());
      jdbc.update("UPDATE sr_media_asset SET unreferenced_at_ms=? WHERE asset_id=? AND NOT EXISTS(SELECT 1 FROM sr_media_reference r WHERE r.asset_id=sr_media_asset.asset_id)",clock.millis(),asset.toString());
      increment(owner);return snapshot(owner);
    });
  }
  public Collection order(long owner,long version,List<UUID> ids) {
    if(version<0 || ids==null || ids.size()>200 || ids.stream().anyMatch(Objects::isNull) || new HashSet<>(ids).size()!=ids.size())throw invalid();
    return run(()->{
      lockCollection(owner);var before=snapshot(owner);var actual=before.items().stream().map(item->UUID.fromString(item.id())).toList();
      if(!new HashSet<>(ids).equals(new HashSet<>(actual)))throw conflict("STICKER_VERSION_CONFLICT","收藏集合已变更，请保留排序意图并重新确认。");
      if(ids.equals(actual))return before;
      if(version!=before.version())throw conflict("STICKER_VERSION_CONFLICT","另一端修改了收藏，请重新确认排序。");
      for(int i=0;i<ids.size();i++)jdbc.update("UPDATE sr_sticker_favorite SET position=? WHERE owner_id=? AND favorite_id=? AND deleted=0",i,owner,ids.get(i).toString());
      increment(owner);return snapshot(owner);
    });
  }
  private UUID copyMessage(long owner,UUID request,long message) {
    var sources=jdbc.queryForList("SELECT asset_id FROM sr_media_reference WHERE message_id=?",String.class,message);
    if(sources.size()!=1)throw MediaApiException.notFound();UUID id=UUID.fromString(sources.get(0));var asset=lockAsset(id);
    // Source-message access is mandatory even when that asset has another publicly readable reference.
    var rows=jdbc.queryForList("SELECT m.id FROM sr_chat_message m WHERE m.id=? AND m.message_type='IMAGE' AND m.recalled_at IS NULL "
      +"AND (m.channel_type='HALL' OR (m.channel_type='PRIVATE' AND (m.sender_id=? OR m.receiver_id=?) "
      +"AND EXISTS(SELECT 1 FROM sr_private_conversation c WHERE c.id=m.conversation_id AND ((c.user_a_id=m.sender_id AND c.user_b_id=m.receiver_id) OR (c.user_b_id=m.sender_id AND c.user_a_id=m.receiver_id))) "
      +"AND NOT EXISTS(SELECT 1 FROM sr_chat_message_visibility v WHERE v.message_id=m.id AND v.user_id=?))) FOR SHARE",message,owner,owner,owner);
    if(rows.isEmpty() || !"READY".equals(asset.get("state")) || asset.get("retired_at_ms")!=null)throw MediaApiException.notFound();
    try {
      long sourceOwner=((Number)asset.get("owner_id")).longValue();
      var clear=store.read(sourceOwner,id,PrivateImageStore.Variant.CLEAR);var thumb=store.read(sourceOwner,id,PrivateImageStore.Variant.THUMB);
      var pair=new StaticImageCandidateProcessor.Result(clear.mime().equals("image/gif")?clear:thumb,thumb);
      var copied=assets.copySticker(owner,request,pair);
      if(!copied.status().equals("ready"))throw new MediaApiException(503,"STICKER_COPY_PENDING","收藏复制尚未确认，请使用原操作重试。");
      return UUID.fromString(copied.asset().id());
    }catch(IOException error){throw MediaApiException.unavailable();}
  }
  private void lockCollection(long owner) {
    if(owner<=0)throw invalid();
    var account=jdbc.queryForList("SELECT user_type,deleted FROM sr_user WHERE id=? FOR SHARE",owner);
    if(account.isEmpty() || ((Number)account.get(0).get("deleted")).intValue()!=0 || "BANNED".equals(account.get(0).get("user_type")))throw MediaApiException.notFound();
    jdbc.update("INSERT INTO sr_sticker_collection(owner_id) VALUES(?) ON DUPLICATE KEY UPDATE owner_id=owner_id",owner);
    jdbc.queryForObject("SELECT version FROM sr_sticker_collection WHERE owner_id=? FOR UPDATE",Long.class,owner);
  }
  private Map<String,Object> lockAsset(UUID id) {
    var rows=jdbc.queryForList("SELECT owner_id,state,purpose,published_at_ms,retired_at_ms,expires_at_ms FROM sr_media_asset WHERE asset_id=? FOR UPDATE",id.toString());
    if(rows.isEmpty())throw MediaApiException.notFound();return rows.get(0);
  }
  private Collection snapshot(long owner) {
    long version=jdbc.queryForObject("SELECT version FROM sr_sticker_collection WHERE owner_id=?",Long.class,owner);
    var items=jdbc.query("SELECT f.favorite_id,a.asset_id,a.clear_mime,a.width,a.height FROM sr_sticker_favorite f JOIN sr_media_asset a ON a.asset_id=f.asset_id WHERE f.owner_id=? AND f.deleted=0 ORDER BY f.position,f.favorite_id",(r,n)->{
      String id=r.getString("asset_id"),base="/api/media/assets/"+id;return new Item(r.getString("favorite_id"),id,base+"/clear",base+"/thumb",r.getString("clear_mime"),r.getInt("width"),r.getInt("height"));
    },owner);
    return new Collection(version,items);
  }
  private void increment(long owner) {
    jdbc.update("UPDATE sr_sticker_collection SET version=version+1 WHERE owner_id=?",owner);
    long version=jdbc.queryForObject("SELECT version FROM sr_sticker_collection WHERE owner_id=?",Long.class,owner);
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){try{changed.accept(owner,version);}catch(RuntimeException ignored){/* foreground refresh repairs missed invalidations */}}});
  }
  private <T>T run(Supplier<T> action){try{return transaction.execute(s->action.get());}catch(DataAccessException|TransactionException failure){throw MediaApiException.unavailable();}}
  private static MediaApiException invalid(){return new MediaApiException(400,"STICKER_INVALID","收藏请求无效。");}
  private static MediaApiException conflict(String code,String message){return new MediaApiException(409,code,message);}
}
