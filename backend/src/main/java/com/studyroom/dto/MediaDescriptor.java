package com.studyroom.dto;

/** Only processor-verified dimensions are emitted. Legacy URL fields remain authoritative for order. */
public record MediaDescriptor(String assetId, String purpose, int width, int height,
                              String thumbnailUrl, String clearUrl, String mime,
                              boolean animated, String posterUrl) { }
