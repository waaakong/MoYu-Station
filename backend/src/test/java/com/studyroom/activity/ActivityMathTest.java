package com.studyroom.activity;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
class ActivityMathTest {
  @Test void overlapIsNotDoubleCountedAndFocusWins(){
    var result=ActivityMath.union(List.of(new ActivityBatch.Segment(0,60000,"IDLE"),new ActivityBatch.Segment(10000,40000,"FOCUS"),new ActivityBatch.Segment(20000,30000,"FOCUS")),0,60000);
    assertThat(result.onlineMs()).isEqualTo(60000);assertThat(result.focusMs()).isEqualTo(30000);assertThat(result.fishMs()).isEqualTo(30000);assertThat(result.index(true)).isEqualByComparingTo("1.50");
  }
  @Test void clipsDatesAndPreservesGaps(){
    var ranges=List.of(new ActivityBatch.Segment(0,10000,"IDLE"),new ActivityBatch.Segment(20000,30000,"FOCUS"));
    assertThat(ActivityMath.union(ranges,5000,25000)).isEqualTo(new ActivityMath.Totals(10000,5000));
  }
  @Test void unavailableDenominatorOrPartialCannotBecomeZero(){
    assertThat(new ActivityMath.Totals(0,0).index(true)).isNull();assertThat(new ActivityMath.Totals(10000,10000).index(false)).isNull();
    assertThat(ActivityView.of(30,0,null)).isEqualTo(new ActivityView(30,null,null,null,"UNAVAILABLE"));
    var day=new ActivityLedger.Day(120000,60000,false);
    assertThat(ActivityView.of(1,1,day).index()).isEqualByComparingTo("1.50");
    assertThat(ActivityView.of(10,1,day).coverage()).isEqualTo("PARTIAL");
    assertThat(ActivityView.of(10,1,day).focusMinutes()).isEqualTo(10);
  }
}
