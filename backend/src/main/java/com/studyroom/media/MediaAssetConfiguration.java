package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.service.UploadQuotaService;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "studyroom.media", name = "enabled", havingValue = "true")
public class MediaAssetConfiguration {
  @Bean
  @ConditionalOnProperty(prefix="studyroom.scenes",name="enabled",havingValue="true")
  CustomSceneService customSceneService(JdbcTemplate jdbc,ObjectMapper json,
      com.studyroom.service.ChatService accounts,com.studyroom.service.ChatSocketHub sockets) {
    return new CustomSceneService(jdbc,json,Clock.systemUTC(),(owner,version)->sockets.sendToUserIf(owner,"SCENE_INVALIDATED",java.util.Map.of("version",version),session->{
      Object id=session.getAttributes().get(com.studyroom.service.AuthService.SESSION_USER_ID);
      Object token=session.getAttributes().get(com.studyroom.service.AuthService.SESSION_LOGIN_VERSION);
      return id instanceof Number value && value.longValue()==owner && token instanceof String text && accounts.requireSocketUser(owner,text)!=null;
    }));
  }
  @Bean
  @ConditionalOnProperty(prefix="studyroom.stickers",name="enabled",havingValue="true")
  StickerFavoriteService stickerFavoriteService(JdbcTemplate jdbc,PrivateImageStore store,MediaAssetService assets,
      com.studyroom.service.ChatService accounts,com.studyroom.service.ChatSocketHub sockets) {
    return new StickerFavoriteService(jdbc,store,assets,Clock.systemUTC(),(owner,version)->sockets.sendToUserIf(owner,"STICKERS_INVALIDATED",java.util.Map.of("version",version),session->{
      Object id=session.getAttributes().get(com.studyroom.service.AuthService.SESSION_USER_ID);
      Object token=session.getAttributes().get(com.studyroom.service.AuthService.SESSION_LOGIN_VERSION);
      return id instanceof Number value && value.longValue()==owner && token instanceof String text && accounts.requireSocketUser(owner,text)!=null;
    }));
  }
  @Bean MediaDescriptorService mediaDescriptorService(JdbcTemplate jdbc) { return new MediaDescriptorService(jdbc); }
  @Bean MediaAssetRepository mediaAssetRepository(JdbcTemplate jdbc) {
    var repository = new MediaAssetRepository(jdbc);
    repository.verifySchema(); // No implicit CREATE/ALTER/Flyway location changes here.
    return repository;
  }
  @Bean PrivateImageStore privateImageStore(UploadQuotaService quota) { return new PrivateImageStore(quota); }
  @Bean IsolatedImageProcessor mediaImageProcessor(@Value("${studyroom.media.worker-jar:}") String jar) throws IOException {
    if (jar.isBlank()) throw new IllegalStateException("A trusted packaged media worker jar must be explicitly configured");
    return IsolatedImageProcessor.fromPackagedJar(Path.of(jar));
  }
  @Bean MediaAssetService mediaAssetService(MediaAssetRepository repository, PrivateImageStore store, IsolatedImageProcessor processor) {
    return new MediaAssetService(repository, store, processor, Clock.systemUTC());
  }
  @Bean MediaPublicationNotifier mediaPublicationNotifier(com.studyroom.service.ChatService accounts, com.studyroom.service.ChatSocketHub sockets) {
    return new MediaPublicationNotifier(accounts, sockets);
  }
  @Bean MediaPublicationService mediaPublicationService(JdbcTemplate jdbc, PrivateImageStore store, MediaPublicationNotifier notifications) {
    var service = new MediaPublicationService(jdbc, store, Clock.systemUTC(), notifications);
    service.verifySchema();
    return service;
  }
  @Bean FilterRegistrationBean<MediaBoundaryFilter> mediaBoundaryFilter(ObjectMapper json) {
    var registration = new FilterRegistrationBean<>(new MediaBoundaryFilter(json));
    registration.addUrlPatterns("/api/media/*", "/api/stickers/*", "/api/scenes/*"); registration.setOrder(-50);
    return registration;
  }
}
