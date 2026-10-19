package com.studyroom.activity;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

public final class ActivityMath {
  private ActivityMath() {}
  public record Totals(long onlineMs,long focusMs) {
    public long fishMs(){return onlineMs-focusMs;}
    public BigDecimal index(boolean complete){
      if(!complete || onlineMs==0)return null;
      if(focusMs<0 || focusMs>onlineMs)throw new IllegalStateException("ACTIVITY_TOTAL_INVALID");
      return BigDecimal.valueOf(focusMs+fishMs()*2).divide(BigDecimal.valueOf(onlineMs),2,RoundingMode.HALF_UP);
    }
  }
  /** Half-open ranges; any active focus wins over other devices' idle ranges. */
  public static Totals union(List<ActivityBatch.Segment> segments,long from,long until){
    TreeMap<Long,long[]> events=new TreeMap<>();
    for(var item:segments){
      long a=Math.max(from,item.startMs()),b=Math.min(until,item.endMs());if(a>=b)continue;
      long focus="FOCUS".equals(item.state())?1:0;
      var begin=events.computeIfAbsent(a,k->new long[2]);begin[0]++;begin[1]+=focus;
      var end=events.computeIfAbsent(b,k->new long[2]);end[0]--;end[1]-=focus;
    }
    long online=0,focus=0,active=0,focusing=0,previous=from;
    for(var event:events.entrySet()){
      long duration=event.getKey()-previous;if(active>0)online+=duration;if(focusing>0)focus+=duration;
      active+=event.getValue()[0];focusing+=event.getValue()[1];previous=event.getKey();
    }
    return new Totals(online,focus);
  }
}
