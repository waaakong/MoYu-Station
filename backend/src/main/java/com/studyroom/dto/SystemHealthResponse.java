package com.studyroom.dto;

import java.util.Map;

public record SystemHealthResponse(
    String state,
    String releaseId,
    String gitSha,
    String builtAt,
    String checkedAt,
    Map<String, HealthComponentStatus> components
) {
}
