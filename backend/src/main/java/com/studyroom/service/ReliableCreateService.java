package com.studyroom.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import com.studyroom.entity.User;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import javax.annotation.PostConstruct;
import java.security.MessageDigest;
import java.util.*;
import java.util.function.*;

/** The business insert and its minimal receipt commit together, including under concurrent retry. */
@Service
@ConditionalOnProperty(name="studyroom.reliable-create.enabled", havingValue="true")
public class ReliableCreateService {
  public enum Kind { COMMENT, FEEDBACK, INVITATION }
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transaction;
  private final ObjectMapper json;

  public ReliableCreateService(JdbcTemplate jdbc, PlatformTransactionManager manager, ObjectMapper json) {
    this.jdbc=jdbc; this.transaction=new TransactionTemplate(manager); this.json=json;
    this.transaction.setTimeout(15);
  }

  @PostConstruct public void verifySchema() {
    jdbc.queryForList("SELECT owner_id,operation_kind,request_id,payload_hash,target_id FROM sr_create_receipt WHERE 1=0");
  }

  public static ReliableCreateService required(ReliableCreateService service) {
    if(service==null) throw new BusinessException("RELIABLE_CREATE_UNAVAILABLE","可靠提交尚未启用，请稍后再试。");
    return service;
  }

  public static void validateRequestId(String id) {
    if(id==null || !id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
      throw new BusinessException("CREATE_REQUEST_INVALID","请求标识无效。");
  }

  public <T> T execute(User actor, Kind kind, String id, Object payload, Supplier<T> create,
                       ToLongFunction<T> targetId, LongFunction<T> replay) {
    validateRequestId(id);
    long owner=actor.getId();
    String hash=hash(payload);
    return transaction.execute(status -> {
      // Serialize with role/password revocation, not just with another create request.
      var accounts=jdbc.queryForList("SELECT login_version,user_type,deleted FROM sr_user WHERE id=? FOR UPDATE",owner);
      if(accounts.isEmpty() || ((Number)accounts.get(0).get("deleted")).intValue()!=0 || !Objects.equals(accounts.get(0).get("login_version"),actor.getLoginVersion()))
        throw new BusinessException("AUTH_SESSION_EXPIRED","账号会话已失效，请重新登录。");
      String role=String.valueOf(accounts.get(0).get("user_type"));
      if("BANNED".equalsIgnoreCase(role))throw new BusinessException("AUTH_ACCOUNT_BANNED","当前账号已被封禁。");
      if(kind==Kind.COMMENT && "MUTED".equalsIgnoreCase(role) || kind==Kind.INVITATION && !"ADMIN".equalsIgnoreCase(role))
        throw new BusinessException("CREATE_FORBIDDEN","当前账号不能执行此操作。");
      // InnoDB unique-key contention serializes the first insert and every retry.
      jdbc.update("INSERT INTO sr_create_receipt(owner_id,operation_kind,request_id,payload_hash) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE request_id=request_id",
          owner,kind.name(),id,hash);
      Map<String,Object> row=jdbc.queryForMap("SELECT payload_hash,target_id FROM sr_create_receipt WHERE owner_id=? AND operation_kind=? AND request_id=? FOR UPDATE",owner,kind.name(),id);
      if(!hash.equals(row.get("payload_hash"))) throw new BusinessException("CREATE_REQUEST_CONFLICT","原请求的目标或内容已改变，请先核对原提交结果。");
      Number existing=(Number)row.get("target_id");
      if(existing!=null) return replay.apply(existing.longValue());
      T result=create.get();
      long target=targetId.applyAsLong(result);
      if(target<=0) throw new IllegalStateException("Creation did not produce a valid identity");
      jdbc.update("UPDATE sr_create_receipt SET target_id=? WHERE owner_id=? AND operation_kind=? AND request_id=?",target,owner,kind.name(),id);
      return result;
    });
  }

  public Map<String,String> result(long owner, Kind kind, String id) {
    validateRequestId(id);
    List<Long> rows=jdbc.query("SELECT target_id FROM sr_create_receipt WHERE owner_id=? AND operation_kind=? AND request_id=? AND target_id IS NOT NULL",
        (rs,n)->rs.getLong(1),owner,kind.name(),id);
    return rows.isEmpty()?Map.of("status","missing","requestId",id):Map.of("status","committed","requestId",id,"targetId",rows.get(0).toString());
  }

  private String hash(Object payload) {
    try {
      byte[] digest=MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(payload));
      StringBuilder result=new StringBuilder(64);
      for(byte value:digest) result.append(String.format(Locale.ROOT,"%02x",value & 255));
      return result.toString();
    } catch(Exception error) { throw new IllegalArgumentException("Cannot fingerprint create request",error); }
  }
}
