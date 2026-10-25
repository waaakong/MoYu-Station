package com.studyroom.activity;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

public final class ActivityMath {
  private ActivityMath() {}
  public record Totals(long onlineMs,long focusMs,long relaxMs,boolean pageBased) {
    public Totals(long onlineMs,long focusMs){this(onlineMs,focusMs,0,false);}
    public long fishMs(){return pageBased?relaxMs:onlineMs-focusMs;}
    public BigDecimal index(boolean complete){
      if(!complete || onlineMs==0)return null;
      if(focusMs<0 || focusMs>onlineMs)throw new IllegalStateException("ACTIVITY_TOTAL_INVALID");
      return BigDecimal.valueOf(focusMs+fishMs()*2).divide(BigDecimal.valueOf(onlineMs),2,RoundingMode.HALF_UP);
    }
  }
  public static boolean focusing(String state){return "FOCUS".equals(state)||"FOCUS_V3".equals(state);}
  public static boolean pageBased(String state){return Set.of("FOCUS_V3","ONLINE","RELAX").contains(state);}
  /** Half-open ranges; focus wins, then relaxation, then ordinary online. */
  public static List<ActivityBatch.Segment> compact(List<ActivityBatch.Segment> segments,long from,long until){
    TreeMap<Long,long[]> events=new TreeMap<>();
    for(var item:segments){
      long a=Math.max(from,item.startMs()),b=Math.min(until,item.endMs());if(a>=b)continue;
      long focus=focusing(item.state())?1:0,relax="RELAX".equals(item.state())?1:0,modern=pageBased(item.state())?1:0;
      var begin=events.computeIfAbsent(a,k->new long[4]);begin[0]++;begin[1]+=focus;begin[2]+=relax;begin[3]+=modern;
      var end=events.computeIfAbsent(b,k->new long[4]);end[0]--;end[1]-=focus;end[2]-=relax;end[3]-=modern;
    }
    var result=new ArrayList<ActivityBatch.Segment>();
    long active=0,focusing=0,relaxing=0,modern=0,previous=from;
    for(var event:events.entrySet()){
      long end=event.getKey();
      if(active>0 && end>previous){
        String state=focusing>0?(modern>0?"FOCUS_V3":"FOCUS"):relaxing>0?"RELAX":modern>0?"ONLINE":"IDLE";
        var last=result.isEmpty()?null:result.get(result.size()-1);
        if(last!=null && last.endMs()==previous && last.state().equals(state))result.set(result.size()-1,new ActivityBatch.Segment(last.startMs(),end,state));
        else result.add(new ActivityBatch.Segment(previous,end,state));
      }
      active+=event.getValue()[0];focusing+=event.getValue()[1];relaxing+=event.getValue()[2];modern+=event.getValue()[3];previous=end;
    }
    return result;
  }
  public static Totals union(List<ActivityBatch.Segment> segments,long from,long until){
    long online=0,focus=0,relax=0;boolean modern=false;
    for(var item:compact(segments,from,until)){
      long duration=item.endMs()-item.startMs();online+=duration;
      if(focusing(item.state()))focus+=duration;
      if("RELAX".equals(item.state()))relax+=duration;
      modern|=pageBased(item.state());
    }
    return new Totals(online,focus,relax,modern);
  }
}
