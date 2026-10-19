package com.studyroom.activity;

import java.util.List;

/** Authenticated owner is deliberately absent from the wire payload. */
public record ActivityBatch(String requestId, String sessionId, long sequence,
                            List<Segment> segments, boolean partial) {
  public record Segment(long startMs,long endMs,String state) {}
}
