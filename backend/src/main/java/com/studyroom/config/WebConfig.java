package com.studyroom.config;

import com.studyroom.security.CsrfOriginInterceptor;
import com.studyroom.security.CsrfTokenService;
import com.studyroom.security.SessionPolicyInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Paths;
import java.util.concurrent.TimeUnit;

@Configuration
public class WebConfig implements WebMvcConfigurer {
  private final HttpMetricsInterceptor httpMetricsInterceptor;
  private final CorsOriginProperties corsOriginProperties;
  private final SessionPolicyInterceptor sessionPolicyInterceptor;
  private final CsrfOriginInterceptor csrfOriginInterceptor;

  @Value("${studyroom.upload-dir:uploads}")
  private String uploadDir;

  public WebConfig(
      HttpMetricsInterceptor httpMetricsInterceptor,
      CorsOriginProperties corsOriginProperties,
      SessionPolicyInterceptor sessionPolicyInterceptor,
      CsrfOriginInterceptor csrfOriginInterceptor
  ) {
    this.httpMetricsInterceptor = httpMetricsInterceptor;
    this.corsOriginProperties = corsOriginProperties;
    this.sessionPolicyInterceptor = sessionPolicyInterceptor;
    this.csrfOriginInterceptor = csrfOriginInterceptor;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/**")
        .allowedOriginPatterns(corsOriginProperties.resolvedPatterns())
        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("Content-Type", "Accept", CsrfTokenService.HEADER_NAME, "X-StudyRoom-Client")
        .exposedHeaders("Retry-After")
        .allowCredentials(true)
        .maxAge(3600);
  }

  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    String location = Paths.get(uploadDir).toAbsolutePath().normalize().toUri().toString();
    registry.addResourceHandler("/uploads/**")
        .addResourceLocations(location)
        .setCacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic());
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(sessionPolicyInterceptor)
        .addPathPatterns("/api/**")
        .order(-30);
    registry.addInterceptor(csrfOriginInterceptor)
        .addPathPatterns("/api/**")
        .excludePathPatterns("/api/internal/client-updates/**")
        .order(-20);
    registry.addInterceptor(httpMetricsInterceptor)
        .addPathPatterns("/api/**")
        .order(0);
  }
}
