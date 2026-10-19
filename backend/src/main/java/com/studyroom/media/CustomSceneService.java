package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.entity.User;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.*;
import java.util.function.BiConsumer;
import java.util.function.Supplier;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.*;

/** Single private account configuration; account -> config -> sorted asset locks, never last-write-wins. */
public final class CustomSceneService {
  public static final Set<String> PERIODS=Set.of("morning","forenoon","noon","afternoon","dusk","night","midnight");
  public record Picture(UUID assetId,String fit,double focalX,double focalY,double zoom,double dim) {}
  public record Config(String name,Picture defaultImage,Map<String,Picture> periods) {}
  public record Media(String assetId,int width,int height,String clearUrl,String displayUrl,String thumbUrl,long bytes) {}
  public record Snapshot(long version,boolean deleted,Config config,List<Media> media) {}
  public record Receipt(String status,String requestId,Long version,Boolean deleted,Snapshot current) {}
  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;
  private final ObjectMapper json;
  private final Clock clock;
  private final BiConsumer<Long,Long> changed;

  public CustomSceneService(JdbcTemplate jdbc,ObjectMapper json,Clock clock,BiConsumer<Long,Long> changed) {
    this.jdbc=new JdbcTemplate(Objects.requireNonNull(jdbc.getDataSource()));this.jdbc.setQueryTimeout(5);
    this.tx=new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    tx.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);tx.setTimeout(15);
    this.json=json;this.clock=clock;this.changed=changed;
    this.jdbc.queryForList("SELECT request_id FROM sr_custom_scene_receipt WHERE 1=0");
  }

  public Snapshot get(User user) {return run(()->{lock(user);return snapshot(user.getId());});}
  public Receipt lookup(User user,UUID request) {return run(()->{lock(user);var receipt=receipt(user.getId(),request);return receipt==null?new Receipt("missing",request.toString(),null,null,null):receipt;});}
  public Receipt save(User user,long version,UUID request,Config config) {return mutate(user,version,request,validate(config));}
  public Receipt delete(User user,long version,UUID request) {return mutate(user,version,request,null);}

  private Receipt mutate(User user,long version,UUID request,Config config) {
    if(version<0 || request==null)throw invalid();
    String encoded=config==null?null:encode(config);
    String fingerprint=StoredImageManifest.digest((version+"\n"+(encoded==null?"DELETE":encoded)).getBytes(StandardCharsets.UTF_8));
    return run(()->{
      lock(user);long owner=user.getId();
      var previous=jdbc.queryForList("SELECT fingerprint FROM sr_custom_scene_receipt WHERE owner_id=? AND request_id=?",owner,request.toString());
      if(!previous.isEmpty()){
        if(!fingerprint.equals(previous.get(0).get("fingerprint")))throw conflict("SCENE_REQUEST_CONFLICT","原请求 ID 已绑定其他内容，请先查询原结果。");
        return receipt(owner,request);
      }
      var before=snapshot(owner);
      if(before.version()!=version)throw conflict("SCENE_VERSION_CONFLICT","另一端已修改场景；草稿已保留，请重新确认。");
      var requested=pictures(config);var ids=new TreeSet<UUID>(Comparator.comparing(UUID::toString));requested.forEach(p->ids.add(p.assetId()));
      var old=jdbc.queryForList("SELECT asset_id FROM sr_media_reference WHERE scene_owner_id=?",String.class,owner);
      old.forEach(id->ids.add(UUID.fromString(id)));
      var assets=new HashMap<UUID,Map<String,Object>>();
      // Publication and collection use the same asset rows. Lock all old/new assets before changing a reference.
      for(UUID id:ids){
        var rows=jdbc.queryForList("SELECT owner_id,purpose,state,expires_at_ms,published_at_ms,retired_at_ms,clear_bytes,thumb_bytes,display_bytes FROM sr_media_asset WHERE asset_id=? FOR UPDATE",id.toString());
        if(rows.isEmpty())throw MediaApiException.notFound();assets.put(id,rows.get(0));
      }
      long total=0;var counted=new HashSet<UUID>();
      for(var picture:requested){
        var asset=assets.get(picture.assetId());
        if(((Number)asset.get("owner_id")).longValue()!=owner || !"scene".equals(asset.get("purpose")) || !"READY".equals(asset.get("state"))
            || asset.get("retired_at_ms")!=null || asset.get("display_bytes")==null
            || asset.get("published_at_ms")==null && ((Number)asset.get("expires_at_ms")).longValue()<=clock.millis())throw conflict("SCENE_ASSET_INVALID","图片未就绪、已过期或不属于当前账号的场景资源。");
        if(counted.add(picture.assetId()))total+=((Number)asset.get("clear_bytes")).longValue()+((Number)asset.get("thumb_bytes")).longValue()+((Number)asset.get("display_bytes")).longValue()+StoredImageManifest.MAX_BYTES;
      }
      if(total>96L*1024*1024)throw new MediaApiException(413,"SCENE_QUOTA","单套场景衍生资源不得超过 96 MiB。");
      jdbc.update("DELETE FROM sr_media_reference WHERE scene_owner_id=?",owner);
      for(int i=0;i<requested.size();i++){
        String id=requested.get(i).assetId().toString();
        jdbc.update("INSERT INTO sr_media_reference(asset_id,scene_owner_id,position) VALUES(?,?,?)",id,owner,i);
        jdbc.update("UPDATE sr_media_asset SET published_at_ms=COALESCE(published_at_ms,?),unreferenced_at_ms=NULL WHERE asset_id=?",clock.millis(),id);
      }
      for(String id:old)jdbc.update("UPDATE sr_media_asset SET unreferenced_at_ms=COALESCE(unreferenced_at_ms,?) WHERE asset_id=? AND NOT EXISTS(SELECT 1 FROM sr_media_reference r WHERE r.asset_id=sr_media_asset.asset_id)",clock.millis(),id);
      long next=Math.addExact(version,1);
      jdbc.update("UPDATE sr_custom_scene SET version=?,deleted=?,config_json=? WHERE owner_id=?",next,config==null?1:0,encoded,owner);
      jdbc.update("INSERT INTO sr_custom_scene_receipt(owner_id,request_id,fingerprint,version,deleted,created_at_ms) VALUES(?,?,?,?,?,?)",owner,request.toString(),fingerprint,next,config==null?1:0,clock.millis());
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){try{changed.accept(owner,next);}catch(RuntimeException ignored){/* foreground GET repairs missed invalidations */}}});
      return receipt(owner,request);
    });
  }

  private void lock(User user){
    if(user==null || user.getId()==null || user.getId()<=0)throw invalid();
    var account=jdbc.queryForList("SELECT login_version,deleted,user_type FROM sr_user WHERE id=? FOR SHARE",user.getId());
    if(account.isEmpty() || ((Number)account.get(0).get("deleted")).intValue()!=0 || "BANNED".equals(account.get(0).get("user_type")))throw MediaApiException.notFound();
    if(!Objects.equals(user.getLoginVersion(),account.get(0).get("login_version")))throw new com.studyroom.common.AccountLoggedInElsewhereException();
    jdbc.update("INSERT INTO sr_custom_scene(owner_id) VALUES(?) ON DUPLICATE KEY UPDATE owner_id=owner_id",user.getId());
    jdbc.queryForObject("SELECT version FROM sr_custom_scene WHERE owner_id=? FOR UPDATE",Long.class,user.getId());
  }
  private Receipt receipt(long owner,UUID id){
    var rows=jdbc.queryForList("SELECT version,deleted FROM sr_custom_scene_receipt WHERE owner_id=? AND request_id=?",owner,id.toString());
    if(rows.isEmpty())return null;var row=rows.get(0);
    return new Receipt("committed",id.toString(),((Number)row.get("version")).longValue(),((Number)row.get("deleted")).intValue()==1,snapshot(owner));
  }
  private Snapshot snapshot(long owner){
    var row=jdbc.queryForMap("SELECT version,deleted,config_json FROM sr_custom_scene WHERE owner_id=?",owner);
    boolean deleted=((Number)row.get("deleted")).intValue()==1;
    Config config=null;
    if(!deleted)try{config=json.readValue(row.get("config_json").toString(),Config.class);}catch(java.io.IOException failure){throw MediaApiException.unavailable();}
    var media=jdbc.query("SELECT DISTINCT a.asset_id,a.width,a.height,a.clear_bytes,a.thumb_bytes,a.display_bytes FROM sr_media_reference r JOIN sr_media_asset a ON a.asset_id=r.asset_id WHERE r.scene_owner_id=? ORDER BY a.asset_id",(r,n)->{
      String id=r.getString("asset_id"),base="/api/media/assets/"+id;return new Media(id,r.getInt("width"),r.getInt("height"),base+"/clear",base+"/display",base+"/thumb",r.getLong("clear_bytes")+r.getLong("thumb_bytes")+r.getLong("display_bytes")+StoredImageManifest.MAX_BYTES);
    },owner);
    return new Snapshot(((Number)row.get("version")).longValue(),deleted,config,media);
  }
  static Config validate(Config config){
    if(config==null || config.name()==null || config.name().strip().isEmpty() || config.name().codePointCount(0,config.name().length())>40 || config.name().chars().anyMatch(Character::isISOControl)
        || config.defaultImage()==null || config.periods()==null || !PERIODS.containsAll(config.periods().keySet()))throw invalid();
    for(var picture:pictures(config))if(picture==null || picture.assetId()==null || picture.fit()==null || !Set.of("cover","contain").contains(picture.fit())
        || !range(picture.focalX(),0,1) || !range(picture.focalY(),0,1) || !range(picture.zoom(),1,3) || !range(picture.dim(),0,0.8))throw invalid();
    return new Config(config.name().strip(),config.defaultImage(),Collections.unmodifiableMap(new TreeMap<>(config.periods())));
  }
  private static boolean range(double value,double min,double max){return Double.isFinite(value) && value>=min && value<=max;}
  private static List<Picture> pictures(Config config){if(config==null)return List.of();var all=new ArrayList<Picture>();all.add(config.defaultImage());all.addAll(new TreeMap<>(config.periods()).values());return all;}
  private String encode(Config config){try{return json.writeValueAsString(config);}catch(java.io.IOException failure){throw invalid();}}
  private <T>T run(Supplier<T> action){try{return tx.execute(s->action.get());}catch(DataAccessException|TransactionException failure){throw MediaApiException.unavailable();}}
  private static MediaApiException invalid(){return new MediaApiException(400,"SCENE_INVALID","场景配置无效。");}
  private static MediaApiException conflict(String code,String message){return new MediaApiException(409,code,message);}
}
