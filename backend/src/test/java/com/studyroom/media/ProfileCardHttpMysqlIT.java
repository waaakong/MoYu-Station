package com.studyroom.media;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.activity.ActivityLedger;
import com.studyroom.common.GlobalExceptionHandler;
import com.studyroom.config.AuthSecurityProperties;
import com.studyroom.controller.ProfileController;
import com.studyroom.mapper.DailyStatMapper;
import com.studyroom.mapper.UserMapper;
import com.studyroom.service.AuthService;
import com.studyroom.service.ProfileService;
import java.net.*;
import java.net.http.*;
import java.nio.file.Path;
import java.time.*;
import javax.servlet.http.HttpSession;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.boot.web.servlet.context.AnnotationConfigServletWebServerApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import static org.assertj.core.api.Assertions.*;

/** Real loopback HTTP + owned MySQL + production card/controller/auth lookup.
 * Test-only session issuance avoids external accounts; this does not test login, CSRF or Redis sessions. */
class ProfileCardHttpMysqlIT {
  @TempDir static Path root;
  static EphemeralMysql mysql;
  static com.zaxxer.hikari.HikariDataSource source;
  static JdbcTemplate jdbc;
  static AnnotationConfigServletWebServerApplicationContext web;
  static URI origin;
  static final ObjectMapper json=new ObjectMapper();

  @Configuration @EnableWebMvc
  @Import({ProfileController.class,GlobalExceptionHandler.class,FixtureSession.class})
  static class WebConfig {}

  @RestController
  static class FixtureSession {
    @PostMapping("/fixture/card-session/{id}")
    void issue(@PathVariable long id,HttpSession session){
      if(id<1||id>3)throw new IllegalArgumentException("Synthetic owner only");
      session.setAttribute(AuthService.SESSION_USER_ID,id);
      session.setAttribute(AuthService.SESSION_LOGIN_VERSION,"card-test-session");
    }
  }

  @BeforeAll static void start() throws Exception {
    mysql=EphemeralMysql.start(root,Path.of(System.getProperty("media.mysql.binary")));
    mysql.verifyOwnership();
    source=new com.zaxxer.hikari.HikariDataSource();source.setJdbcUrl(mysql.databaseUrl);
    source.setUsername("root");source.setPassword("");source.setMaximumPoolSize(3);source.setMinimumIdle(0);
    Flyway.configure().dataSource(source).locations("classpath:db/migration","classpath:db/media-migration").cleanDisabled(true).load().migrate();
    jdbc=new JdbcTemplate(source);
    for(long id=1;id<=3;id++)jdbc.update("INSERT INTO sr_user(id,username,password_hash,nickname,user_type,login_version) VALUES(?,?,?,'synthetic',?,'card-test-session')",id,"card-fixture-"+id,"unused-test-hash",id==3?"BANNED":"NORMAL");
    jdbc.update("INSERT INTO sr_daily_stat(user_id,stat_date,focus_minutes) VALUES(1,'2020-01-01',60),(1,'2020-01-03',120),(2,'2020-01-02',240)");
    jdbc.update("INSERT INTO sr_activity_day(user_id,stat_date,online_ms,focus_ms,relax_ms,partial) VALUES(1,'2020-01-02',6000000,1800000,1200000,0)");
    var config=new MybatisConfiguration();config.setMapUnderscoreToCamelCase(true);
    config.addMapper(UserMapper.class);config.addMapper(DailyStatMapper.class);
    var factory=new MybatisSqlSessionFactoryBean();factory.setDataSource(source);factory.setConfiguration(config);
    var mappers=new SqlSessionTemplate(factory.getObject());
    var auth=new AuthService(mappers.getMapper(UserMapper.class),null,null,new AuthSecurityProperties());
    var profile=new ProfileService(auth,mappers.getMapper(UserMapper.class),mappers.getMapper(DailyStatMapper.class),null,null,null,null);
    profile.setActivity(new ActivityLedger(jdbc,json,Clock.fixed(Instant.parse("2020-01-04T00:00:00Z"),ZoneOffset.UTC)));
    web=new AnnotationConfigServletWebServerApplicationContext();
    web.registerBean(AuthService.class,()->auth);web.registerBean(ProfileService.class,()->profile);
    web.registerBean(TomcatServletWebServerFactory.class,()->{var server=new TomcatServletWebServerFactory(0);try{server.setAddress(InetAddress.getByName("127.0.0.1"));}catch(Exception e){throw new IllegalStateException(e);}server.setBaseDirectory(root.resolve("tomcat").toFile());return server;});
    web.registerBean("dispatcher",ServletRegistrationBean.class,()->new ServletRegistrationBean<>(new DispatcherServlet(web),"/"));
    web.register(WebConfig.class);web.refresh();web.start();
    origin=URI.create("http://127.0.0.1:"+web.getWebServer().getPort());
  }

  @AfterAll static void stop() throws Exception {
    try{if(web!=null)web.close();}finally{try{if(source!=null)source.close();}finally{if(mysql!=null)mysql.close();}}
  }
  static HttpClient client(){return HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).connectTimeout(Duration.ofSeconds(5)).build();}
  static HttpResponse<String> request(HttpClient client,String path,boolean post) throws Exception {
    var builder=HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(10));
    return client.send(post?builder.POST(HttpRequest.BodyPublishers.noBody()).build():builder.GET().build(),HttpResponse.BodyHandlers.ofString());
  }
  static HttpClient session(long id)throws Exception{var c=client();assertThat(request(c,"/fixture/card-session/"+id,true).statusCode()).isEqualTo(200);return c;}
  static JsonNode card(HttpClient c,String date)throws Exception{var r=request(c,"/api/profile/share-card?date="+date,false);assertThat(r.statusCode()).isEqualTo(200);return json.readTree(r.body()).path("data");}

  @Test void historicalSixMetricsUseSelectedDateAndSessionOwner()throws Exception{
    var one=session(1);var report=card(one,"2020-01-02");
    assertThat(report.path("statDate").asText()).isEqualTo("2020-01-02");assertThat(report.path("timeZone").asText()).isEqualTo("Asia/Shanghai");
    assertThat(report.path("focusMinutes").asInt()).isEqualTo(30);assertThat(report.path("onlineMinutes").asInt()).isEqualTo(100);
    assertThat(report.path("fishMinutes").asInt()).isEqualTo(20);assertThat(report.path("streakDays").asInt()).isEqualTo(2);
    assertThat(report.path("totalFocusHours").decimalValue()).isEqualByComparingTo("1.5");assertThat(report.path("fakeEffortIndex").decimalValue()).isEqualByComparingTo("0.70");
    assertThat(report.path("fishTimingBasis").asText()).isEqualTo("RELAX_PAGE");
    assertThat(card(one,"2020-01-03").path("totalFocusHours").decimalValue()).isEqualByComparingTo("3.5");
    assertThat(card(session(2),"2020-01-02").path("focusMinutes").asInt()).isEqualTo(240);
    var spoof=request(one,"/api/profile/share-card?date=2020-01-02&userId=2",false);
    assertThat(json.readTree(spoof.body()).path("data").path("focusMinutes").asInt()).isEqualTo(30);
  }
  @Test void missingAndInvalidDatesNeverBorrowTodayOrOtherRecords()throws Exception{
    var c=session(1);var empty=card(c,"2019-12-31");
    for(String field:new String[]{"focusMinutes","onlineMinutes","fishMinutes","fakeEffortIndex"})assertThat(empty.hasNonNull(field)).as(field).isFalse();
    assertThat(empty.path("streakDays").asInt()).isZero();assertThat(empty.path("totalFocusHours").decimalValue()).isEqualByComparingTo("0");
    for(String date:new String[]{"2020-02-30","2999-01-01","invalid"})assertThat(request(c,"/api/profile/share-card?date="+date,false).statusCode()).isEqualTo(400);
  }
  @Test void anonymousBannedAndStaleSessionsCannotReadCards()throws Exception{
    assertThat(request(client(),"/api/profile/share-card?date=2020-01-02",false).statusCode()).isEqualTo(401);
    assertThat(request(session(3),"/api/profile/share-card?date=2020-01-02",false).statusCode()).isEqualTo(403);
    var c=session(1);jdbc.update("UPDATE sr_user SET login_version='changed-test-session' WHERE id=1");
    try{assertThat(request(c,"/api/profile/share-card?date=2020-01-02",false).statusCode()).isEqualTo(401);}
    finally{jdbc.update("UPDATE sr_user SET login_version='card-test-session' WHERE id=1");}
  }
}
