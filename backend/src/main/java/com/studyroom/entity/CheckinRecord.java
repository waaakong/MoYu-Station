package com.studyroom.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDate;
import java.time.LocalDateTime;

@TableName("sr_checkin_record")
public class CheckinRecord {
  @TableId
  private Long id;
  private Long userId;
  private LocalDate checkinDate;
  private String drawType;
  private String title;
  private String explanation;
  private Integer expAdded;
  private Integer levelAfter;
  private Integer expAfter;
  private LocalDateTime createdAt;

  public Long getId() { return id; }
  public void setId(Long id) { this.id = id; }
  public Long getUserId() { return userId; }
  public void setUserId(Long userId) { this.userId = userId; }
  public LocalDate getCheckinDate() { return checkinDate; }
  public void setCheckinDate(LocalDate checkinDate) { this.checkinDate = checkinDate; }
  public String getDrawType() { return drawType; }
  public void setDrawType(String drawType) { this.drawType = drawType; }
  public String getTitle() { return title; }
  public void setTitle(String title) { this.title = title; }
  public String getExplanation() { return explanation; }
  public void setExplanation(String explanation) { this.explanation = explanation; }
  public Integer getExpAdded() { return expAdded; }
  public void setExpAdded(Integer expAdded) { this.expAdded = expAdded; }
  public Integer getLevelAfter() { return levelAfter; }
  public void setLevelAfter(Integer levelAfter) { this.levelAfter = levelAfter; }
  public Integer getExpAfter() { return expAfter; }
  public void setExpAfter(Integer expAfter) { this.expAfter = expAfter; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
