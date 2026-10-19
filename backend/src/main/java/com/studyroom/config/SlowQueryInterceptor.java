package com.studyroom.config;

import com.studyroom.service.HttpMetricsService;
import org.apache.ibatis.executor.statement.StatementHandler;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Plugin;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.session.ResultHandler;
import org.springframework.stereotype.Component;

import java.sql.Statement;
import java.util.Properties;

@Component
@Intercepts({
    @Signature(type = StatementHandler.class, method = "query", args = {Statement.class, ResultHandler.class}),
    @Signature(type = StatementHandler.class, method = "update", args = {Statement.class})
})
public class SlowQueryInterceptor implements Interceptor {
  private final HttpMetricsService httpMetricsService;

  public SlowQueryInterceptor(HttpMetricsService httpMetricsService) {
    this.httpMetricsService = httpMetricsService;
  }

  @Override
  public Object intercept(Invocation invocation) throws Throwable {
    long started = System.nanoTime();
    try {
      return invocation.proceed();
    } finally {
      long elapsedMs = Math.max(0, (System.nanoTime() - started) / 1_000_000);
      httpMetricsService.recordQuery(elapsedMs);
    }
  }

  @Override
  public Object plugin(Object target) {
    return Plugin.wrap(target, this);
  }

  @Override
  public void setProperties(Properties properties) {
    // No custom properties needed.
  }
}
