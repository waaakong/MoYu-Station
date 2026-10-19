package com.studyroom.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.entity.User;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Explicit admin DTOs only; never serializes a database user row or password field. */
@Service
public class AdminRecordService {
  private final JdbcTemplate jdbc; private final AdminService admin; private final ObjectMapper json; private final boolean enabled;
  public AdminRecordService(JdbcTemplate jdbc,AdminService admin,ObjectMapper json,@Value("${studyroom.admin.versioned-records-enabled:false}") boolean enabled){this.jdbc=jdbc;this.admin=admin;this.json=json;this.enabled=enabled;}
  @javax.annotation.PostConstruct public void verifySchema(){if(enabled){jdbc.queryForList("SELECT admin_version FROM sr_user LIMIT 0");jdbc.queryForList("SELECT admin_version FROM sr_feedback LIMIT 0");}}

  @Transactional(readOnly=true)
  public Page page(String module,String cursor,String role) {
    String table=table(module),filter=module.equals("users")?"deleted=0":module.equals("posts")?"deleted_by_user=0 AND deleted_by_admin=0":"1=1";
    String scope=module;
    List<Object> params=new ArrayList<>();
    if(role!=null && !role.equals("ALL")){
      if(!module.equals("users") || !Set.of("NORMAL","MUTED","BANNED","ADMIN").contains(role))throw new BusinessException("INVALID_FILTER","角色筛选无效。");
      filter+=" AND user_type=?";params.add(role);scope+="-"+role;
    }
    if(cursor!=null && !cursor.isBlank()){
      try {
        if(!cursor.matches("[A-Za-z0-9_-]{1,192}"))throw new IllegalArgumentException();
        String[] parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\|",-1);
        if(parts.length!=3 || !parts[0].equals(scope))throw new IllegalArgumentException();
        LocalDateTime time=LocalDateTime.parse(parts[1]);long id=Long.parseLong(parts[2]);if(id<1)throw new IllegalArgumentException();
        filter+=" AND (created_at < ? OR (created_at = ? AND id < ?))";params.add(time);params.add(time);params.add(id);
      }catch(IllegalArgumentException|java.time.DateTimeException e){throw new BusinessException("INVALID_CURSOR","分页游标不匹配，请刷新当前列表。");}
    }
    boolean versioned=enabled&&!module.equals("posts");
    var keys=jdbc.query("SELECT id,created_at,"+(versioned?"admin_version":"NULL")+" AS revision FROM "+table+" WHERE "+filter+" ORDER BY created_at DESC,id DESC LIMIT 31",
        (rs,n)->new Key(rs.getLong("id"),rs.getObject("created_at",LocalDateTime.class),rs.getString("revision")),params.toArray());
    var selected=keys.subList(0,Math.min(keys.size(),30));List<Long> ids=selected.stream().map(Key::id).toList();
    List<?> records=switch(module){case "users"->admin.usersByIds(ids);case "posts"->admin.postsByIds(ids);default->admin.feedbackByIds(ids);};
    Map<String,Map<String,Object>> values=new HashMap<>();
    for(Object record:records){Map<String,Object> row=json.convertValue(record,new TypeReference<>(){});values.put(String.valueOf(row.get("id")),row);}
    List<Map<String,Object>> items=new ArrayList<>();
    for(Key key:selected){var row=values.get(String.valueOf(key.id()));if(row!=null){row.put("adminVersion",key.revision());items.add(row);}}
    Key last=selected.isEmpty()?null:selected.get(selected.size()-1);
    String next=keys.size()>30?Base64.getUrlEncoder().withoutPadding().encodeToString((scope+"|"+last.time()+"|"+last.id()).getBytes(StandardCharsets.UTF_8)):null;
    return new Page(items,next,versioned);
  }

  @Transactional public void role(User actor,long id,String version,String role,AdminAuditContext context){lockUser(actor,id,version);admin.updateUserType(actor,id,role,context);bump("sr_user",id);}
  @Transactional public void password(User actor,long id,String version,String password,AdminAuditContext context){lockUser(actor,id,version);admin.updatePassword(actor,id,password,context);bump("sr_user",id);}
  @Transactional public void feedback(User actor,long id,String version,String status,AdminAuditContext context){lockFeedback(actor,id,version);admin.updateFeedbackStatus(actor,id,status,context);bump("sr_feedback",id);}
  @Transactional public void deleteFeedback(User actor,long id,String version,AdminAuditContext context){lockFeedback(actor,id,version);admin.deleteFeedback(actor,id,context);}

  private void lockUser(User actor,long id,String version){
    requireEnabled();
    // Two admins editing each other must take the same user-row order.
    Map<String,Object> actorRow=null,target=null;
    for(long key:new TreeSet<>(List.of(actor.getId(),id))){var row=locked("sr_user",key);if(key==actor.getId())actorRow=row;if(key==id)target=row;}
    verifyActor(actor,actorRow);compare(target,version);
  }
  private void lockFeedback(User actor,long id,String version){requireEnabled();verifyActor(actor,locked("sr_user",actor.getId()));compare(locked("sr_feedback",id),version);}
  private void requireEnabled(){
    if(!enabled)throw new BusinessException("ADMIN_VERSIONING_UNAVAILABLE","版本化管理尚未启用，当前不能修改账号或反馈。");
    if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Versioned admin write requires a transaction");
  }
  private Map<String,Object> locked(String table,long id){var rows=jdbc.queryForList("SELECT * FROM "+table+" WHERE id=? FOR UPDATE",id);if(rows.isEmpty())throw new BusinessException("RESOURCE_NOT_FOUND","记录已不存在，请刷新列表。");return rows.get(0);}
  private void verifyActor(User actor,Map<String,Object> row){if(row==null || !"ADMIN".equals(row.get("user_type")) || ((Number)row.get("deleted")).intValue()!=0 || !Objects.equals(row.get("login_version"),actor.getLoginVersion()))throw new BusinessException("AUTH_SESSION_REVOKED","管理身份已变化，请重新登录。");}
  private void compare(Map<String,Object> row,String version){
    try{if(version==null || !version.matches("0|[1-9][0-9]{0,18}") || Long.parseLong(version)==Long.MAX_VALUE)throw new IllegalArgumentException();}
    catch(IllegalArgumentException e){throw new BusinessException("ADMIN_VERSION_REQUIRED","缺少有效修订号，请刷新列表后再操作。");}
    if(!String.valueOf(row.get("admin_version")).equals(version))throw new BusinessException("ADMIN_VERSION_CONFLICT","记录已被修改；本次未覆盖，请刷新并重新确认操作。");
  }
  private void bump(String table,long id){jdbc.update("UPDATE "+table+" SET admin_version=admin_version+1 WHERE id=?",id);}
  private String table(String module){return switch(module){case "users"->"sr_user";case "posts"->"sr_post";case "feedback"->"sr_feedback";default->throw new BusinessException("INVALID_MODULE","不支持此管理列表。");};}
  private record Key(long id,LocalDateTime time,String revision){}
  public record Page(List<Map<String,Object>> items,String nextCursor,boolean versionedWrites){}
}
