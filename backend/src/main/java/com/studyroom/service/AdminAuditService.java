package com.studyroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.dto.AdminAuditResponse;
import com.studyroom.entity.AdminAudit;
import com.studyroom.mapper.AdminAuditMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AdminAuditService {
  private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private static final Set<String> SAFE_FIELDS = Set.of(
      "userType", "status", "enabled", "channel", "rolloutPercentage", "mandatory",
      "minimumSupportedVersion", "label", "maxUses", "expiresAt", "feedbackStatus", "releaseStatus"
  );
  private final AdminAuditMapper mapper;
  private final ObjectMapper objectMapper;

  public AdminAuditService(AdminAuditMapper mapper, ObjectMapper objectMapper) {
    this.mapper = mapper;
    this.objectMapper = objectMapper;
  }

  public void success(Long actorId, String action, String targetType, Object targetId, Map<String, ?> before, Map<String, ?> after, AdminAuditContext context) {
    insert(actorId, action, targetType, targetId, before, after, "SUCCESS", null, context);
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void failure(Long actorId, String action, String targetType, Object targetId, String errorCode, AdminAuditContext context) {
    insert(actorId, action, targetType, targetId, null, null, "FAILED", clean(errorCode, 64), context);
  }

  public PageResult list(int page, int size, String action, Long actorId, String targetType) {
    int safePage = Math.max(1, page);
    int safeSize = Math.max(1, Math.min(100, size));
    LambdaQueryWrapper<AdminAudit> countQuery = query(action, actorId, targetType);
    long total = mapper.selectCount(countQuery);
    LambdaQueryWrapper<AdminAudit> dataQuery = query(action, actorId, targetType)
        .orderByDesc(AdminAudit::getCreatedAt)
        .last("LIMIT " + safeSize + " OFFSET " + ((safePage - 1L) * safeSize));
    List<AdminAuditResponse> items = mapper.selectList(dataQuery).stream().map(this::response).collect(Collectors.toList());
    return new PageResult(items, total, safePage, safeSize);
  }

  private LambdaQueryWrapper<AdminAudit> query(String action, Long actorId, String targetType) {
    return new LambdaQueryWrapper<AdminAudit>()
        .eq(StringUtils.hasText(action), AdminAudit::getActionCode, clean(action, 64))
        .eq(actorId != null, AdminAudit::getActorUserId, actorId)
        .eq(StringUtils.hasText(targetType), AdminAudit::getTargetType, clean(targetType, 48));
  }

  private void insert(Long actorId, String action, String targetType, Object targetId, Map<String, ?> before, Map<String, ?> after, String result, String errorCode, AdminAuditContext context) {
    AdminAudit audit = new AdminAudit();
    audit.setActorUserId(actorId);
    audit.setActionCode(clean(action, 64));
    audit.setTargetType(clean(targetType, 48));
    audit.setTargetId(clean(String.valueOf(targetId == null ? "-" : targetId), 96));
    audit.setBeforeJson(json(before));
    audit.setAfterJson(json(after));
    audit.setResult(result);
    audit.setErrorCode(errorCode);
    audit.setReason(context == null ? null : clean(context.reason(), 300));
    audit.setIpAddress(context == null ? null : clean(context.ipAddress(), 64));
    audit.setUserAgentHash(context == null ? null : sha256(context.userAgent()));
    mapper.insert(audit);
  }

  private String json(Map<String, ?> source) {
    if (source == null || source.isEmpty()) return null;
    Map<String, Object> safe = new LinkedHashMap<>();
    source.forEach((key, value) -> { if (SAFE_FIELDS.contains(key)) safe.put(key, value); });
    if (safe.isEmpty()) return null;
    try { return objectMapper.writeValueAsString(safe); }
    catch (JsonProcessingException exception) { throw new IllegalStateException("Unable to serialize administrator audit", exception); }
  }

  private AdminAuditResponse response(AdminAudit audit) {
    AdminAuditResponse response = new AdminAuditResponse();
    response.setId(audit.getId()); response.setActorUserId(audit.getActorUserId()); response.setActionCode(audit.getActionCode());
    response.setTargetType(audit.getTargetType()); response.setTargetId(audit.getTargetId()); response.setResult(audit.getResult());
    response.setErrorCode(audit.getErrorCode()); response.setReason(audit.getReason());
    response.setCreatedAt(audit.getCreatedAt() == null ? "" : audit.getCreatedAt().format(FORMAT));
    return response;
  }

  private String clean(String value, int max) {
    if (!StringUtils.hasText(value)) return null;
    String normalized = value.trim().replaceAll("[\\r\\n\\t]", " ");
    return normalized.substring(0, Math.min(max, normalized.length()));
  }

  private String sha256(String value) {
    if (!StringUtils.hasText(value)) return null;
    try {
      byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder result = new StringBuilder(64); for (byte item : bytes) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
      return result.toString();
    } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 unavailable", exception); }
  }

  public record PageResult(List<AdminAuditResponse> items, long total, int page, int size) {}
}
