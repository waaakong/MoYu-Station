package com.studyroom.activity;
import com.studyroom.common.ApiResponse;
import com.studyroom.common.BusinessException;
import com.studyroom.service.AuthService;
import java.util.Map;
import javax.servlet.http.HttpSession;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/activity")
public class ActivityController {
  private final AuthService auth;private final ObjectProvider<ActivityLedger> ledger;private final com.fasterxml.jackson.databind.ObjectMapper json;
  public ActivityController(AuthService auth,ObjectProvider<ActivityLedger> ledger,com.fasterxml.jackson.databind.ObjectMapper json){this.auth=auth;this.ledger=ledger;this.json=json.copy().enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);}
  @GetMapping("/capabilities") public ApiResponse<?> capabilities(HttpSession session){auth.requireActiveUser(session);return ApiResponse.ok(Map.of("version",ledger.getIfAvailable()==null?0:2,"relaxTimingVersion",ledger.getIfAvailable()==null?0:1));}
  @GetMapping("/live") public ApiResponse<?> live(HttpSession session){var user=auth.requireActiveUser(session);return ApiResponse.ok(enabled().live(user.getId()));}
  private ActivityLedger enabled(){var value=ledger.getIfAvailable();if(value==null)throw new BusinessException("ACTIVITY_UNAVAILABLE","当前服务尚未开放活动账本。");return value;}
  @PostMapping("/intervals") public ApiResponse<?> submit(@RequestBody String body,HttpSession session){var user=auth.requireActiveUser(session);
    if(body.length()>16384)throw new BusinessException("ACTIVITY_SIZE_INVALID","活动记录过大。");
    ActivityBatch batch;try{batch=json.readValue(body,ActivityBatch.class);}catch(Exception error){throw new BusinessException("ACTIVITY_REQUEST_INVALID","活动记录格式无效。");}
    return ApiResponse.ok(enabled().submit(user.getId(),batch));}
  @GetMapping("/requests/{id}") public ApiResponse<?> receipt(@PathVariable String id,HttpSession session){var user=auth.requireActiveUser(session);return ApiResponse.ok(enabled().receipt(user.getId(),id));}
}
