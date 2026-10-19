package com.studyroom.media;

import com.fasterxml.jackson.databind.*;
import com.studyroom.common.ApiResponse;
import com.studyroom.service.AuthService;
import java.io.IOException;
import java.util.Set;
import javax.servlet.http.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scenes/custom")
@ConditionalOnProperty(prefix="studyroom.scenes",name="enabled",havingValue="true")
public final class CustomSceneController {
  private final AuthService auth;
  private final CustomSceneService service;
  private final ObjectMapper json;
  public CustomSceneController(AuthService auth,CustomSceneService service,ObjectMapper json){this.auth=auth;this.service=service;this.json=json.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS);}
  @GetMapping public ApiResponse<CustomSceneService.Snapshot> get(HttpSession session){return ApiResponse.ok(service.get(auth.requireActiveUser(session)));}
  @GetMapping("/requests/{requestId}") public ApiResponse<CustomSceneService.Receipt> receipt(HttpSession session,@PathVariable String requestId){return ApiResponse.ok(service.lookup(auth.requireActiveUser(session),MediaAssetController.uuid(requestId)));}
  @PutMapping public ApiResponse<CustomSceneService.Receipt> save(HttpSession session,HttpServletRequest request)throws IOException{
    var user=auth.requireActiveUser(session);var body=read(request,Set.of("version","requestId","config"));
    if(!body.hasNonNull("config"))throw invalid();
    CustomSceneService.Config config;
    try{config=json.treeToValue(body.get("config"),CustomSceneService.Config.class);}catch(com.fasterxml.jackson.core.JsonProcessingException failure){throw invalid();}
    return ApiResponse.ok(service.save(user,body.get("version").longValue(),MediaAssetController.uuid(body.get("requestId").textValue()),config));
  }
  @DeleteMapping public ApiResponse<CustomSceneService.Receipt> delete(HttpSession session,HttpServletRequest request)throws IOException{
    var user=auth.requireActiveUser(session);var body=read(request,Set.of("version","requestId"));
    return ApiResponse.ok(service.delete(user,body.get("version").longValue(),MediaAssetController.uuid(body.get("requestId").textValue())));
  }
  private JsonNode read(HttpServletRequest request,Set<String> fields)throws IOException{
    if(request.getContentType()==null || !request.getContentType().split(";",2)[0].trim().equalsIgnoreCase("application/json"))throw invalid();
    byte[] bytes=request.getInputStream().readNBytes(16_385);if(bytes.length>16_384)throw new MediaApiException(413,"SCENE_TOO_LARGE","场景配置过大。");
    JsonNode node;try{node=json.readTree(bytes);}catch(com.fasterxml.jackson.core.JsonProcessingException malformed){throw invalid();}
    if(node==null || !node.isObject() || !node.has("version") || !node.get("version").isIntegralNumber() || !node.get("version").canConvertToLong() || node.get("version").longValue()<0 || !node.has("requestId") || !node.get("requestId").isTextual())throw invalid();
    var names=node.fieldNames();while(names.hasNext())if(!fields.contains(names.next()))throw invalid();return node;
  }
  private static MediaApiException invalid(){return new MediaApiException(400,"SCENE_INVALID","场景请求无效。");}
}
