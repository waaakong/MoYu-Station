package com.studyroom.dto;

public class SystemMetrics {
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
}
