package com.studyroom.dto;

import java.util.LinkedHashMap;
import java.util.Map;

public class AdminDashboardResponse {
  private String sampledAt;
  private Map<String, MetricSectionStatus> sections = new LinkedHashMap<>();
  private Long onlineUsers;
  private Long todayPosts;
  private Long pendingFeedback;
  private String systemStatus;
  private Integer cpuUsage;
  private Integer jvmMemoryUsage;
  private Integer systemMemoryUsage;
  private Integer apiLatencyMs;
  private Integer redisHitRate;
  private Long redisHits;
  private Long redisMisses;
  private Integer redisLatencyMs;
  private String redisStatus;
  private String uptime;
  private Integer diskIoUsage;
  private String diskReadRate;
  private String diskWriteRate;
  private String networkReceiveRate;
  private String networkTransmitRate;
  private String diskFreeSpace;
  private String diskTotalSpace;
  private Integer diskUsage;
  private String projectSize;
  private Long gcCount;
  private Long gcTimeMs;
  private Integer activeThreads;
  private Integer peakThreads;
  private Integer dbActiveConnections;
  private Integer dbIdleConnections;
  private Integer dbTotalConnections;
  private Integer dbThreadsAwaitingConnection;
  private String dbStatus;
  private Long slowQueryCount;
  private Long recentSlowQueryCount;
  private Long requestCount;
  private Integer requestsPerMinute;
  private String qps;
  private Long http4xxCount;
  private Long http5xxCount;
  private Integer httpErrorRate;

  public String getSampledAt() {
    return sampledAt;
  }

  public void setSampledAt(String sampledAt) {
    this.sampledAt = sampledAt;
  }

  public Map<String, MetricSectionStatus> getSections() {
    return sections;
  }

  public void setSections(Map<String, MetricSectionStatus> sections) {
    this.sections = sections;
  }

  public Long getOnlineUsers() {
    return onlineUsers;
  }

  public void setOnlineUsers(Long onlineUsers) {
    this.onlineUsers = onlineUsers;
  }

  public Long getTodayPosts() {
    return todayPosts;
  }

  public void setTodayPosts(Long todayPosts) {
    this.todayPosts = todayPosts;
  }

  public Long getPendingFeedback() {
    return pendingFeedback;
  }

  public void setPendingFeedback(Long pendingFeedback) {
    this.pendingFeedback = pendingFeedback;
  }

  public String getSystemStatus() {
    return systemStatus;
  }

  public void setSystemStatus(String systemStatus) {
    this.systemStatus = systemStatus;
  }

  public Integer getCpuUsage() {
    return cpuUsage;
  }

  public void setCpuUsage(Integer cpuUsage) {
    this.cpuUsage = cpuUsage;
  }

  public Integer getJvmMemoryUsage() {
    return jvmMemoryUsage;
  }

  public void setJvmMemoryUsage(Integer jvmMemoryUsage) {
    this.jvmMemoryUsage = jvmMemoryUsage;
  }

  public Integer getSystemMemoryUsage() {
    return systemMemoryUsage;
  }

  public void setSystemMemoryUsage(Integer systemMemoryUsage) {
    this.systemMemoryUsage = systemMemoryUsage;
  }

  public Integer getApiLatencyMs() {
    return apiLatencyMs;
  }

  public void setApiLatencyMs(Integer apiLatencyMs) {
    this.apiLatencyMs = apiLatencyMs;
  }

  public Integer getRedisHitRate() {
    return redisHitRate;
  }

  public void setRedisHitRate(Integer redisHitRate) {
    this.redisHitRate = redisHitRate;
  }

  public Long getRedisHits() {
    return redisHits;
  }

  public void setRedisHits(Long redisHits) {
    this.redisHits = redisHits;
  }

  public Long getRedisMisses() {
    return redisMisses;
  }

  public void setRedisMisses(Long redisMisses) {
    this.redisMisses = redisMisses;
  }

  public Integer getRedisLatencyMs() {
    return redisLatencyMs;
  }

  public void setRedisLatencyMs(Integer redisLatencyMs) {
    this.redisLatencyMs = redisLatencyMs;
  }

  public String getRedisStatus() {
    return redisStatus;
  }

  public void setRedisStatus(String redisStatus) {
    this.redisStatus = redisStatus;
  }

  public String getUptime() {
    return uptime;
  }

  public void setUptime(String uptime) {
    this.uptime = uptime;
  }

  public Integer getDiskIoUsage() {
    return diskIoUsage;
  }

  public void setDiskIoUsage(Integer diskIoUsage) {
    this.diskIoUsage = diskIoUsage;
  }

  public String getDiskReadRate() {
    return diskReadRate;
  }

  public void setDiskReadRate(String diskReadRate) {
    this.diskReadRate = diskReadRate;
  }

  public String getDiskWriteRate() {
    return diskWriteRate;
  }

  public void setDiskWriteRate(String diskWriteRate) {
    this.diskWriteRate = diskWriteRate;
  }

  public String getNetworkReceiveRate() {
    return networkReceiveRate;
  }

  public void setNetworkReceiveRate(String networkReceiveRate) {
    this.networkReceiveRate = networkReceiveRate;
  }

  public String getNetworkTransmitRate() {
    return networkTransmitRate;
  }

  public void setNetworkTransmitRate(String networkTransmitRate) {
    this.networkTransmitRate = networkTransmitRate;
  }

  public String getDiskFreeSpace() {
    return diskFreeSpace;
  }

  public void setDiskFreeSpace(String diskFreeSpace) {
    this.diskFreeSpace = diskFreeSpace;
  }

  public String getDiskTotalSpace() {
    return diskTotalSpace;
  }

  public void setDiskTotalSpace(String diskTotalSpace) {
    this.diskTotalSpace = diskTotalSpace;
  }

  public Integer getDiskUsage() {
    return diskUsage;
  }

  public void setDiskUsage(Integer diskUsage) {
    this.diskUsage = diskUsage;
  }

  public String getProjectSize() {
    return projectSize;
  }

  public void setProjectSize(String projectSize) {
    this.projectSize = projectSize;
  }

  public Long getGcCount() {
    return gcCount;
  }

  public void setGcCount(Long gcCount) {
    this.gcCount = gcCount;
  }

  public Long getGcTimeMs() {
    return gcTimeMs;
  }

  public void setGcTimeMs(Long gcTimeMs) {
    this.gcTimeMs = gcTimeMs;
  }

  public Integer getActiveThreads() {
    return activeThreads;
  }

  public void setActiveThreads(Integer activeThreads) {
    this.activeThreads = activeThreads;
  }

  public Integer getPeakThreads() {
    return peakThreads;
  }

  public void setPeakThreads(Integer peakThreads) {
    this.peakThreads = peakThreads;
  }

  public Integer getDbActiveConnections() {
    return dbActiveConnections;
  }

  public void setDbActiveConnections(Integer dbActiveConnections) {
    this.dbActiveConnections = dbActiveConnections;
  }

  public Integer getDbIdleConnections() {
    return dbIdleConnections;
  }

  public void setDbIdleConnections(Integer dbIdleConnections) {
    this.dbIdleConnections = dbIdleConnections;
  }

  public Integer getDbTotalConnections() {
    return dbTotalConnections;
  }

  public void setDbTotalConnections(Integer dbTotalConnections) {
    this.dbTotalConnections = dbTotalConnections;
  }

  public Integer getDbThreadsAwaitingConnection() {
    return dbThreadsAwaitingConnection;
  }

  public void setDbThreadsAwaitingConnection(Integer dbThreadsAwaitingConnection) {
    this.dbThreadsAwaitingConnection = dbThreadsAwaitingConnection;
  }

  public String getDbStatus() {
    return dbStatus;
  }

  public void setDbStatus(String dbStatus) {
    this.dbStatus = dbStatus;
  }

  public Long getSlowQueryCount() {
    return slowQueryCount;
  }

  public void setSlowQueryCount(Long slowQueryCount) {
    this.slowQueryCount = slowQueryCount;
  }

  public Long getRecentSlowQueryCount() {
    return recentSlowQueryCount;
  }

  public void setRecentSlowQueryCount(Long recentSlowQueryCount) {
    this.recentSlowQueryCount = recentSlowQueryCount;
  }

  public Long getRequestCount() {
    return requestCount;
  }

  public void setRequestCount(Long requestCount) {
    this.requestCount = requestCount;
  }

  public Integer getRequestsPerMinute() {
    return requestsPerMinute;
  }

  public void setRequestsPerMinute(Integer requestsPerMinute) {
    this.requestsPerMinute = requestsPerMinute;
  }

  public String getQps() {
    return qps;
  }

  public void setQps(String qps) {
    this.qps = qps;
  }

  public Long getHttp4xxCount() {
    return http4xxCount;
  }

  public void setHttp4xxCount(Long http4xxCount) {
    this.http4xxCount = http4xxCount;
  }

  public Long getHttp5xxCount() {
    return http5xxCount;
  }

  public void setHttp5xxCount(Long http5xxCount) {
    this.http5xxCount = http5xxCount;
  }

  public Integer getHttpErrorRate() {
    return httpErrorRate;
  }

  public void setHttpErrorRate(Integer httpErrorRate) {
    this.httpErrorRate = httpErrorRate;
  }
}
