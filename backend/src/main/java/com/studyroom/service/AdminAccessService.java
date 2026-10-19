package com.studyroom.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.dto.ClientUpdateMembershipRequest;
import com.studyroom.entity.User;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Access management is separately gated; enabling this never enables client update distribution. */
@Service
public class AdminAccessService {
  private final JdbcTemplate jdbc;
  private final InvitationService invitations;
  private final ClientUpdateService updates;
  private final ObjectMapper json;
  private final boolean enabled;
  public AdminAccessService(JdbcTemplate jdbc,InvitationService invitations,ClientUpdateService updates,ObjectMapper json,
      @Value("${studyroom.admin.versioned-access-enabled:false}") boolean enabled){
    this.jdbc=jdbc;this.invitations=invitations;this.updates=updates;this.json=json;this.enabled=enabled;
  }
  @javax.annotation.PostConstruct public void verifySchema(){if(enabled){jdbc.queryForList("SELECT admin_version FROM sr_invitation LIMIT 0");jdbc.queryForList("SELECT admin_version FROM sr_client_update_membership LIMIT 0");}}
  public record Page(List<Map<String,Object>> items,String nextCursor,boolean versionedWrites){}

  @Transactional(readOnly=true)
  public Page invitationPage(String cursor){
    String where="";List<Object> args=new ArrayList<>();
    if(cursor!=null){var parts=decode(cursor,"invitations-v1");try{var time=LocalDateTime.parse(parts[1]);long id=positive(parts[2]);where=" WHERE created_at<? OR (created_at=? AND id<?)";args.add(time);args.add(time);args.add(id);}catch(IllegalArgumentException|java.time.DateTimeException e){throw badCursor();}}
    var keys=jdbc.query("SELECT id,created_at FROM sr_invitation"+where+" ORDER BY created_at DESC,id DESC LIMIT 31",(rs,n)->Map.entry(rs.getLong(1),rs.getObject(2,LocalDateTime.class)),args.toArray());
    var selected=keys.subList(0,Math.min(30,keys.size()));List<Map<String,Object>> items=selected.stream().map(key->invitation(key.getKey())).toList();
    var last=selected.isEmpty()?null:selected.get(selected.size()-1);
    return new Page(items,keys.size()>30?encode("invitations-v1|"+last.getValue()+"|"+last.getKey()):null,enabled);
  }
  @Transactional(readOnly=true)
  public Map<String,Object> invitation(long id){
    var dto=invitations.get(id);Map<String,Object> value=json.convertValue(dto,new TypeReference<>(){});
    value.put("adminVersion",enabled?jdbc.queryForObject("SELECT admin_version FROM sr_invitation WHERE id=?",String.class,id):null);
    return value;
  }
  @Transactional
  public Map<String,Object> disable(User actor,long id,String version,AdminAuditContext context){
    requireEnabled();lockActorAndTarget(actor,actor.getId());
    var rows=jdbc.queryForList("SELECT status,admin_version FROM sr_invitation WHERE id=? FOR UPDATE",id);
    if(rows.isEmpty())throw missing();validateVersion(version);
    // A disabled code never becomes active again. Retrying this desired state is a no-op, not a second audit.
    if(!"DISABLED".equals(rows.get(0).get("status"))){compare(rows.get(0),version);invitations.disable(id,actor,context);jdbc.update("UPDATE sr_invitation SET admin_version=admin_version+1 WHERE id=?",id);}
    return invitation(id);
  }

  @Transactional(readOnly=true)
  public Page memberPage(String cursor){
    String where="";List<Object> args=new ArrayList<>();
    if(cursor!=null){var parts=decode(cursor,"members-v1");try{long id=positive(parts[1]);channel(parts[2]);where=" WHERE (m.user_id>? OR (m.user_id=? AND m.channel>?))";args.add(id);args.add(id);args.add(parts[2]);}catch(IllegalArgumentException e){throw badCursor();}}
    var rows=jdbc.query("SELECT m.user_id,u.username,m.channel,m.enabled,"+(enabled?"m.admin_version":"NULL")+" AS revision FROM sr_client_update_membership m JOIN sr_user u ON u.id=m.user_id"+where+" ORDER BY m.user_id,m.channel LIMIT 31",(rs,n)->{
      Map<String,Object> row=new LinkedHashMap<>();row.put("userId",rs.getString("user_id"));row.put("username",rs.getString("username"));row.put("channel",rs.getString("channel"));row.put("enabled",rs.getBoolean("enabled"));row.put("adminVersion",rs.getString("revision"));return row;
    },args.toArray());
    var selected=List.copyOf(rows.subList(0,Math.min(30,rows.size())));var last=selected.isEmpty()?null:selected.get(selected.size()-1);
    return new Page(selected,rows.size()>30?encode("members-v1|"+last.get("userId")+"|"+last.get("channel")):null,enabled);
  }
  @Transactional(readOnly=true)
  public Map<String,Object> member(long id,String channel){
    channel(channel);var users=jdbc.queryForList("SELECT username FROM sr_user WHERE id=? AND deleted=0",id);if(users.isEmpty())throw missing();
    var rows=jdbc.queryForList("SELECT enabled,"+(enabled?"admin_version":"NULL AS admin_version")+" FROM sr_client_update_membership WHERE user_id=? AND channel=?",id,channel);
    Map<String,Object> row=new LinkedHashMap<>();row.put("userId",String.valueOf(id));row.put("username",users.get(0).get("username"));row.put("channel",channel);row.put("enabled",!rows.isEmpty()&&active(rows.get(0).get("enabled")));
    row.put("adminVersion",enabled?(rows.isEmpty()?"0":String.valueOf(rows.get(0).get("admin_version"))):null);return row;
  }
  @Transactional
  public Map<String,Object> changeMember(User actor,long id,ClientUpdateMembershipRequest request,AdminAuditContext context){
    requireEnabled();channel(request.getChannel());lockActorAndTarget(actor,id);
    var rows=jdbc.queryForList("SELECT enabled,admin_version FROM sr_client_update_membership WHERE user_id=? AND channel=? FOR UPDATE",id,request.getChannel());
    Map<String,Object> current=rows.isEmpty()?Map.of("enabled",0,"admin_version",0):rows.get(0);
    // Even a no-op must match the observed version: a stale grant must not survive a revoke/regrant cycle.
    compare(current,request.getExpectedVersion());
    if(active(current.get("enabled"))!=Boolean.TRUE.equals(request.getEnabled())){
      updates.updateMembership(actor,id,request,context);
      jdbc.update("UPDATE sr_client_update_membership SET admin_version=admin_version+1 WHERE user_id=? AND channel=?",id,request.getChannel());
    }
    return member(id,request.getChannel());
  }
  private void lockActorAndTarget(User actor,long id){
    for(long key:new TreeSet<>(List.of(actor.getId(),id))){
      var rows=jdbc.queryForList("SELECT user_type,deleted,login_version FROM sr_user WHERE id=? FOR UPDATE",key);if(rows.isEmpty())throw missing();var row=rows.get(0);
      if(((Number)row.get("deleted")).intValue()!=0)throw missing();
      if(key==actor.getId()&&(!"ADMIN".equals(row.get("user_type"))||!Objects.equals(row.get("login_version"),actor.getLoginVersion())))throw new BusinessException("AUTH_SESSION_REVOKED","管理身份已变化，请重新登录。");
    }
  }
  private void requireEnabled(){if(!enabled)throw new BusinessException("ADMIN_VERSIONING_UNAVAILABLE","版本化邀请码／成员管理尚未启用。");if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Access changes require a transaction");}
  private static void validateVersion(String v){try{if(v==null||!v.matches("0|[1-9][0-9]{0,18}")||Long.parseLong(v)==Long.MAX_VALUE)throw new IllegalArgumentException();}catch(IllegalArgumentException e){throw new BusinessException("ADMIN_VERSION_REQUIRED","请刷新取得有效修订号。");}}
  private static boolean active(Object v){return Boolean.TRUE.equals(v)||v instanceof Number&&((Number)v).intValue()==1;}
  private static void compare(Map<String,Object> row,String v){validateVersion(v);if(!String.valueOf(row.get("admin_version")).equals(v))throw new BusinessException("ADMIN_VERSION_CONFLICT","记录已变化，本次未覆盖；请刷新核对并重新确认。");}
  private static void channel(String value){if(!ClientUpdateService.CHANNELS.contains(value==null?"":value))throw new BusinessException("INVALID_CHANNEL","更新通道无效。");}
  private static long positive(String text){long value=Long.parseLong(text);if(value<1)throw new IllegalArgumentException();return value;}
  private static String encode(String value){return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));}
  private static String[] decode(String value,String scope){try{if(!value.matches("[A-Za-z0-9_-]{1,192}"))throw new IllegalArgumentException();var parts=new String(Base64.getUrlDecoder().decode(value),StandardCharsets.UTF_8).split("\\|",-1);if(parts.length!=3||!scope.equals(parts[0]))throw new IllegalArgumentException();return parts;}catch(IllegalArgumentException e){throw badCursor();}}
  private static BusinessException badCursor(){return new BusinessException("INVALID_CURSOR","分页游标无效，请刷新列表。");}
  private static BusinessException missing(){return new BusinessException("RESOURCE_NOT_FOUND","目标已不存在，请刷新列表。");}
}
