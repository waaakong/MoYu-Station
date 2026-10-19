package com.studyroom.config;

import com.studyroom.service.HttpMetricsService;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@Component
public class HttpMetricsInterceptor implements HandlerInterceptor {
  private final HttpMetricsService httpMetricsService;

  public HttpMetricsInterceptor(HttpMetricsService httpMetricsService) {
    this.httpMetricsService = httpMetricsService;
  }

  @Override
  public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
    httpMetricsService.recordRequest(response.getStatus());
  }
}
