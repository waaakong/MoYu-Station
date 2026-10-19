package com.studyroom.activity;

import java.math.BigDecimal;

/** Legacy focus is retained; legacy derived online/slack values are never promoted to evidence. */
public record ActivityView(Integer focusMinutes,Integer onlineMinutes,Integer fishMinutes,BigDecimal index,String coverage) {
  public static ActivityView of(Integer legacyFocus,int linkedFocus,ActivityLedger.Day day){
    int legacy=Math.max(0,(legacyFocus==null?0:legacyFocus)-linkedFocus);
    if(day==null)return new ActivityView(legacyFocus,null,null,null,"UNAVAILABLE");
    boolean partial=day.partial() || legacy>0;
    // Without segment evidence for legacy records their overlap is unknown: expose a lower bound, never sum both blindly.
    int focus=legacy>0?Math.max(legacyFocus==null?0:legacyFocus,(int)(day.focusMs()/60000)):(int)(day.focusMs()/60000);
    return new ActivityView(focus,(int)(day.onlineMs()/60000),(int)(day.fishMs()/60000),
        partial?null:day.index(),partial?"PARTIAL":"CONFIRMED");
  }
}
