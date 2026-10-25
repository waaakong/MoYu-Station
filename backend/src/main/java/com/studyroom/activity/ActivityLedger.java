package com.studyroom.activity;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.BusinessException;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@ConditionalOnProperty(name="studyroom.activity.enabled",havingValue="true")
public class ActivityLedger {
  public static final ZoneId ZONE=ZoneId.of("Asia/Shanghai");
  private final JdbcTemplate jdbc;private final ObjectMapper json;private final Clock clock;
  @Autowired
  public ActivityLedger(JdbcTemplate jdbc,ObjectMapper json){this(jdbc,json,Clock.systemUTC());}
  public ActivityLedger(JdbcTemplate jdbc,ObjectMapper json,Clock clock){this.jdbc=jdbc;this.json=json;this.clock=clock;}
  @javax.annotation.PostConstruct public void verifySchema(){
    for(String table:List.of("sr_activity_owner","sr_activity_stream","sr_activity_receipt","sr_activity_interval","sr_activity_day","sr_activity_focus_link"))jdbc.queryForList("SELECT * FROM "+table+" WHERE 1=0");
    jdbc.queryForList("SELECT activity_kind FROM sr_activity_interval WHERE 1=0");
    jdbc.queryForList("SELECT relax_ms FROM sr_activity_day WHERE 1=0");
  }
  public record Day(long onlineMs,long focusMs,boolean partial,Long relaxMs) {
    public Day(long onlineMs,long focusMs,boolean partial){this(onlineMs,focusMs,partial,null);}
    public long fishMs(){return relaxMs==null?onlineMs-focusMs:relaxMs;}
    public BigDecimal index(){return new ActivityMath.Totals(onlineMs,focusMs,relaxMs==null?0:relaxMs,relaxMs!=null).index(!partial);}
  }
  private static void require(boolean valid,String code){if(!valid)throw new BusinessException(code,"活动记录未确认，请保留原任务后重试。");}
  private static boolean uuid(String value){return value!=null && value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");}
  private String hash(ActivityBatch batch){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(batch)));}catch(Exception e){throw new IllegalStateException("ACTIVITY_HASH_FAILED");}}
  private void lock(long owner){require(!jdbc.queryForList("SELECT id FROM sr_user WHERE id=? AND deleted=0 FOR UPDATE",Long.class,owner).isEmpty(),"AUTH_REQUIRED");}
  public Map<String,Object> receipt(long owner,String requestId){
    require(uuid(requestId),"ACTIVITY_REQUEST_INVALID");
    var rows=jdbc.queryForList("SELECT request_id,sequence_no FROM sr_activity_receipt WHERE user_id=? AND request_id=?",owner,requestId);
    return rows.isEmpty()?Map.of("status","unconfirmed"):Map.of("status","committed","requestId",requestId,"sequence",((Number)rows.get(0).get("sequence_no")).longValue());
  }
  @Transactional public Map<String,Object> submit(long owner,ActivityBatch batch){
    require(batch!=null && uuid(batch.requestId()) && uuid(batch.sessionId()) && batch.sequence()>0 && batch.sequence()<=1_000_000,"ACTIVITY_REQUEST_INVALID");
    require(batch.segments()!=null && !batch.segments().isEmpty() && batch.segments().size()<=64,"ACTIVITY_SIZE_INVALID");
    lock(owner);String hash=hash(batch);
    var receipts=jdbc.queryForList("SELECT payload_hash FROM sr_activity_receipt WHERE user_id=? AND request_id=?",owner,batch.requestId());
    if(!receipts.isEmpty()){require(hash.equals(receipts.get(0).get("payload_hash")),"ACTIVITY_REQUEST_CONFLICT");return receipt(owner,batch.requestId());}
    require(batch.segments().get(0)!=null,"ACTIVITY_INTERVAL_INVALID");
    long now=clock.millis(),previous=0,first=batch.segments().get(0).startMs();
    boolean gaps=false;
    for(var item:batch.segments()){
      require(item!=null && item.state()!=null && Set.of("FOCUS","IDLE","FOCUS_V3","ONLINE","RELAX").contains(item.state()) && item.endMs()>item.startMs() && item.endMs()-item.startMs()<=30_000,"ACTIVITY_INTERVAL_INVALID");
      require(item.startMs()>=previous && item.startMs()>=now-Duration.ofDays(7).toMillis() && item.endMs()<=now+120_000,"ACTIVITY_CLOCK_INVALID");
      if(previous>0 && item.startMs()!=previous)gaps=true;
      previous=item.endMs();
    }
    require(previous-first<=60_000,"ACTIVITY_SIZE_INVALID");
    LocalDate firstDate=Instant.ofEpochMilli(first).atZone(ZONE).toLocalDate();
    jdbc.update("INSERT IGNORE INTO sr_activity_owner(user_id,first_date) VALUES(?,?)",owner,firstDate);
    jdbc.update("INSERT IGNORE INTO sr_activity_stream(user_id,session_id) VALUES(?,?)",owner,batch.sessionId());
    var stream=jdbc.queryForMap("SELECT last_sequence,last_end_ms FROM sr_activity_stream WHERE user_id=? AND session_id=?",owner,batch.sessionId());
    require(batch.sequence()==((Number)stream.get("last_sequence")).longValue()+1 && first>=((Number)stream.get("last_end_ms")).longValue(),"ACTIVITY_SEQUENCE_CONFLICT");
    if(batch.sequence()>1 && first!=((Number)stream.get("last_end_ms")).longValue())gaps=true;
    jdbc.update("INSERT INTO sr_activity_receipt(user_id,request_id,session_id,sequence_no,payload_hash) VALUES(?,?,?,?,?)",owner,batch.requestId(),batch.sessionId(),batch.sequence(),hash);
    Set<LocalDate> dates=new TreeSet<>();int ordinal=0;
    for(var item:batch.segments()){
      LocalDate end=Instant.ofEpochMilli(item.endMs()-1).atZone(ZONE).toLocalDate();
      for(LocalDate date=Instant.ofEpochMilli(item.startMs()).atZone(ZONE).toLocalDate();!date.isAfter(end);date=date.plusDays(1)){
        dates.add(date);
        long a=Math.max(item.startMs(),date.atStartOfDay(ZONE).toInstant().toEpochMilli()),b=Math.min(item.endMs(),date.plusDays(1).atStartOfDay(ZONE).toInstant().toEpochMilli());
        var ranges=ranges(owner,a,b);
        var covered=ActivityMath.union(ranges,a,b);
        ranges.add(item);var combined=ActivityMath.union(ranges,a,b);
        long online=combined.onlineMs()-covered.onlineMs(),focus=combined.focusMs()-covered.focusMs(),relax=combined.relaxMs()-covered.relaxMs();
        boolean modern=ActivityMath.pageBased(item.state());
        jdbc.update("INSERT INTO sr_activity_day(user_id,stat_date,online_ms,focus_ms,relax_ms) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE partial=CASE WHEN (? AND relax_ms IS NULL AND online_ms>0) OR (NOT ? AND relax_ms IS NOT NULL) THEN 1 ELSE partial END,online_ms=online_ms+VALUES(online_ms),focus_ms=focus_ms+VALUES(focus_ms),relax_ms=CASE WHEN relax_ms IS NOT NULL OR ? THEN COALESCE(relax_ms,0)+? ELSE NULL END",owner,date,online,focus,modern?relax:null,modern,modern,modern,relax);
      }
      jdbc.update("INSERT INTO sr_activity_interval(user_id,request_id,ordinal_no,start_ms,end_ms,focusing,activity_kind) VALUES(?,?,?,?,?,?,?)",owner,batch.requestId(),ordinal++,item.startMs(),item.endMs(),ActivityMath.focusing(item.state())?1:0,ActivityMath.pageBased(item.state())?item.state():null);
    }
    LocalDate cutover=jdbc.queryForObject("SELECT first_date FROM sr_activity_owner WHERE user_id=?",java.sql.Date.class,owner).toLocalDate();
    for(var date:dates){
      if(batch.partial() || gaps || !date.isAfter(cutover))jdbc.update("UPDATE sr_activity_day SET partial=1 WHERE user_id=? AND stat_date=?",owner,date);
    }
    jdbc.update("UPDATE sr_activity_stream SET last_sequence=?,last_end_ms=? WHERE user_id=? AND session_id=?",batch.sequence(),previous,owner,batch.sessionId());
    return receipt(owner,batch.requestId());
  }
  public Map<LocalDate,Day> days(long owner){
    Map<LocalDate,Day> result=new TreeMap<>();jdbc.query("SELECT stat_date,online_ms,focus_ms,partial,relax_ms FROM sr_activity_day WHERE user_id=?",rs->{result.put(rs.getDate(1).toLocalDate(),new Day(rs.getLong(2),rs.getLong(3),rs.getInt(4)!=0,(Long)rs.getObject(5)));},owner);return result;
  }
  private List<ActivityBatch.Segment> ranges(long owner,long from,long until){
    return jdbc.query("SELECT start_ms,end_ms,focusing,activity_kind FROM sr_activity_interval FORCE INDEX(idx_activity_overlap) WHERE user_id=? AND end_ms>? AND start_ms<?",(rs,n)->new ActivityBatch.Segment(rs.getLong(1),rs.getLong(2),rs.getString(4)==null?(rs.getInt(3)==1?"FOCUS":"IDLE"):rs.getString(4)),owner,from,until);
  }
  @Transactional public Map<String,Object> live(long owner){
    lock(owner);
    LocalDate date=Instant.ofEpochMilli(clock.millis()).atZone(ZONE).toLocalDate();
    long from=date.atStartOfDay(ZONE).toInstant().toEpochMilli(),until=Math.min(clock.millis(),date.plusDays(1).atStartOfDay(ZONE).toInstant().toEpochMilli());
    var intervals=ranges(owner,from,until);var day=days(owner).get(date);
    return Map.of("date",date.toString(),"timeZone",ZONE.getId(),"segments",ActivityMath.compact(intervals,from,until),"partial",day!=null&&day.partial(),"hasLegacy",intervals.stream().anyMatch(s->!ActivityMath.pageBased(s.state())));
  }
  @Transactional public void markPartial(long owner,LocalDate date){
    lock(owner);jdbc.update("INSERT INTO sr_activity_day(user_id,stat_date,partial) VALUES(?,?,1) ON DUPLICATE KEY UPDATE partial=1",owner,date);
  }
  public boolean ownsStream(long owner,String sessionId){return uuid(sessionId) && jdbc.queryForObject("SELECT COUNT(*) FROM sr_activity_stream WHERE user_id=? AND session_id=?",Long.class,owner,sessionId)>0;}
  public void linkFocus(long owner,String recordId,String sessionId,LocalDate date,int minutes){
    require(ownsStream(owner,sessionId),"ACTIVITY_NOT_SYNCED");
    jdbc.update("INSERT IGNORE INTO sr_activity_focus_link(user_id,client_record_id,stat_date,minutes) VALUES(?,?,?,?)",owner,recordId,date,minutes);
  }
  public Map<LocalDate,Integer> linkedFocus(long owner){Map<LocalDate,Integer> result=new HashMap<>();jdbc.query("SELECT stat_date,SUM(minutes) FROM sr_activity_focus_link WHERE user_id=? GROUP BY stat_date",rs->{result.put(rs.getDate(1).toLocalDate(),rs.getInt(2));},owner);return result;}
}
