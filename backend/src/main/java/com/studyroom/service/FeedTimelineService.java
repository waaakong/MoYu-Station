package com.studyroom.service;

import com.studyroom.common.BusinessException;
import com.studyroom.dto.FeedPostResponse;
import com.studyroom.entity.User;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Database-side follow filtering and timestamp/id keyset pagination. */
@Service
@ConditionalOnProperty(prefix="studyroom.community",name="enabled",havingValue="true")
public class FeedTimelineService {
  public record Page(List<FeedPostResponse> items,String nextCursor,long relationshipVersion,
      @com.fasterxml.jackson.databind.annotation.JsonSerialize(contentUsing=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class) List<Long> followingIds) {}
  public record Relationship(
      @com.fasterxml.jackson.databind.annotation.JsonSerialize(using=com.fasterxml.jackson.databind.ser.std.ToStringSerializer.class) long userId,boolean following,long version) {}
  private record Position(LocalDateTime time,long id) {}
  private record Cursor(Position ceiling,Position before,long version) {}
  private final JdbcTemplate jdbc;private final FeedService feed;private final ChatSocketHub sockets;
  public FeedTimelineService(JdbcTemplate jdbc,FeedService feed,ChatSocketHub sockets){this.jdbc=jdbc;this.feed=feed;this.sockets=sockets;}
  @javax.annotation.PostConstruct void verify(){jdbc.queryForList("SELECT owner_id,followed_id FROM sr_user_follow WHERE 1=0");}
  @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public Page page(User user,String stream,String cursor){
    if(!Set.of("square","following").contains(stream))throw invalid();
    long owner=user.getId(),version=version(owner);Cursor decoded=cursor==null?null:decode(cursor);
    if(stream.equals("following") && decoded!=null && decoded.version()!=version)throw new BusinessException("FEED_RELATIONS_CHANGED","关注关系已变化，请刷新关注流。");
    var arguments=new ArrayList<Object>();StringBuilder where=new StringBuilder("p.deleted_by_user=0 AND p.deleted_by_admin=0");
    if(stream.equals("following")){where.append(" AND EXISTS(SELECT 1 FROM sr_user_follow f WHERE f.owner_id=? AND f.followed_id=p.user_id)");arguments.add(owner);}
    if(decoded!=null){where.append(" AND (p.created_at<? OR (p.created_at=? AND p.id<=?)) AND (p.created_at<? OR (p.created_at=? AND p.id<?))");Collections.addAll(arguments,decoded.ceiling.time,decoded.ceiling.time,decoded.ceiling.id,decoded.before.time,decoded.before.time,decoded.before.id);}
    // DATETIME is a wall-clock value, not an instant. Timestamp would shift it by the JVM/connection timezone difference.
    var rows=jdbc.query("SELECT p.id,p.created_at FROM sr_post p WHERE "+where+" ORDER BY p.created_at DESC,p.id DESC LIMIT 31",(r,n)->new Position(r.getObject("created_at",LocalDateTime.class),r.getLong("id")),arguments.toArray());
    boolean more=rows.size()>30;List<Position> selected=rows.stream().limit(30).toList();
    var posts=feed.postsByIds(user,selected.stream().map(Position::id).toList());
    List<Long> authors=posts.stream().map(FeedPostResponse::getAuthorId).distinct().toList();
    List<Long> following=authors.isEmpty()?List.of():jdbc.queryForList("SELECT followed_id FROM sr_user_follow WHERE owner_id=? AND followed_id IN ("+String.join(",",Collections.nCopies(authors.size(),"?"))+")",Long.class,concat(owner,authors));
    String next=more?encode(new Cursor(decoded==null?selected.get(0):decoded.ceiling,selected.get(selected.size()-1),version)):null;
    return new Page(posts,next,version,following);
  }
  @Transactional
  public Relationship follow(User user,long target,boolean desired){
    long owner=user.getId();if(target<=0 || owner==target)throw invalid();
    // Deterministic account locking prevents reciprocal follow operations taking opposite row orders.
    for(long id:new TreeSet<>(List.of(owner,target))){
      var rows=jdbc.queryForList("SELECT deleted,user_type,login_version FROM sr_user WHERE id=? FOR SHARE",id);
      if(rows.isEmpty() || ((Number)rows.get(0).get("deleted")).intValue()!=0 || "BANNED".equals(rows.get(0).get("user_type")))throw new BusinessException("FEED_USER_UNAVAILABLE","该账号不可关注。");
      if(id==owner && !Objects.equals(user.getLoginVersion(),rows.get(0).get("login_version")))throw new com.studyroom.common.AccountLoggedInElsewhereException();
    }
    jdbc.update("INSERT INTO sr_follow_collection(owner_id) VALUES(?) ON DUPLICATE KEY UPDATE owner_id=owner_id",owner);
    jdbc.queryForObject("SELECT version FROM sr_follow_collection WHERE owner_id=? FOR UPDATE",Long.class,owner);
    boolean existing=jdbc.queryForObject("SELECT COUNT(*) FROM sr_user_follow WHERE owner_id=? AND followed_id=?",Integer.class,owner,target)>0;
    if(existing!=desired){
      if(desired)jdbc.update("INSERT INTO sr_user_follow(owner_id,followed_id) VALUES(?,?)",owner,target);else jdbc.update("DELETE FROM sr_user_follow WHERE owner_id=? AND followed_id=?",owner,target);
      jdbc.update("UPDATE sr_follow_collection SET version=version+1 WHERE owner_id=?",owner);
      long committedVersion=version(owner);
      org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization(){@Override public void afterCommit(){sockets.sendToUser(owner,"FOLLOWS_INVALIDATED",Map.of("version",committedVersion));}});
    }
    return new Relationship(target,desired,version(owner));
  }
  private long version(long owner){var rows=jdbc.queryForList("SELECT version FROM sr_follow_collection WHERE owner_id=?",Long.class,owner);return rows.isEmpty()?0:rows.get(0);}
  private static Object[] concat(long owner,List<Long> ids){var result=new ArrayList<Object>();result.add(owner);result.addAll(ids);return result.toArray();}
  private static String encode(Cursor cursor){return Base64.getUrlEncoder().withoutPadding().encodeToString((cursor.ceiling.time+"|"+cursor.ceiling.id+"|"+cursor.before.time+"|"+cursor.before.id+"|"+cursor.version).getBytes(StandardCharsets.US_ASCII));}
  private static Cursor decode(String value){try{
    if(value.length()>256 || !value.matches("[A-Za-z0-9_-]+"))throw invalid();String[] parts=new String(Base64.getUrlDecoder().decode(value),StandardCharsets.US_ASCII).split("\\|",-1);if(parts.length!=5)throw invalid();
    var cursor=new Cursor(new Position(LocalDateTime.parse(parts[0]),Long.parseLong(parts[1])),new Position(LocalDateTime.parse(parts[2]),Long.parseLong(parts[3])),Long.parseLong(parts[4]));
    if(cursor.ceiling.id<=0 || cursor.before.id<=0 || cursor.version<0 || cursor.before.time.isAfter(cursor.ceiling.time) || cursor.before.time.equals(cursor.ceiling.time) && cursor.before.id>cursor.ceiling.id)throw invalid();return cursor;
  }catch(RuntimeException error){throw invalid();}}
  private static BusinessException invalid(){return new BusinessException("FEED_QUERY_INVALID","动态游标或关注目标无效。");}
}
