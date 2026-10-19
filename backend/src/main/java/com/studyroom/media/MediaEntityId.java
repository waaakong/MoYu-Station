package com.studyroom.media;

/** Decimal strings preserve BIGINT IDs. Legacy JSON numbers are accepted only in JS's safe range. */
final class MediaEntityId {
  static long parse(String value,boolean legacyNumber){
    if(value==null||!value.matches("[1-9][0-9]{0,18}"))throw new IllegalArgumentException("INVALID_ENTITY_ID");
    long id=Long.parseLong(value);
    if(legacyNumber&&id>9_007_199_254_740_991L)throw new IllegalArgumentException("UNSAFE_NUMERIC_ID");
    return id;
  }
}
