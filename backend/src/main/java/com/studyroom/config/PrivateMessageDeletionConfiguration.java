package com.studyroom.config;

import com.studyroom.service.*;
import java.time.Clock;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(prefix="studyroom.chat",name="private-deletion-enabled",havingValue="true")
public class PrivateMessageDeletionConfiguration {
  @Bean PrivateMessageDeletionService privateMessageDeletionService(JdbcTemplate jdbc,ChatSocketHub sockets,org.springframework.beans.factory.ObjectProvider<ChatService> accounts){
    var service=new PrivateMessageDeletionService(jdbc,Clock.systemUTC(),event->sockets.sendToUserIf(event.owner(),"PRIVATE_MESSAGE_DELETED",
      Map.of("messageId",event.messageId(),"peerId",String.valueOf(event.peer())),session->{
        Object id=session.getAttributes().get(AuthService.SESSION_USER_ID),version=session.getAttributes().get(AuthService.SESSION_LOGIN_VERSION);
        return id instanceof Number owner && owner.longValue()==event.owner() && version instanceof String token && accounts.getObject().requireSocketUser(event.owner(),token)!=null;
      }));
    service.verifySchema();return service;
  }
}
