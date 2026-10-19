package com.studyroom.health;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DatabaseReadinessProbe implements ReadinessProbe {
  private final JdbcTemplate jdbcTemplate;

  public DatabaseReadinessProbe(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public String name() {
    return "database";
  }

  @Override
  public void verify() {
    Integer value = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
    if (value == null || value != 1) throw new IllegalStateException("Database readiness probe failed");
  }
}
