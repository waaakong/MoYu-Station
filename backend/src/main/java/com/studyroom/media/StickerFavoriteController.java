package com.studyroom.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.studyroom.common.ApiResponse;
import com.studyroom.service.AuthService;
import java.io.IOException;
import java.util.*;
import javax.servlet.http.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stickers/favorites")
@ConditionalOnProperty(prefix="studyroom.stickers",name="enabled",havingValue="true")
public final class StickerFavoriteController {
  private final AuthService auth;private final StickerFavoriteService service;private final ObjectMapper json;
  public StickerFavoriteController(AuthService auth,StickerFavoriteService service,ObjectMapper json){this.auth=auth;this.service=service;this.json=json;}
  @GetMapping public ApiResponse<StickerFavoriteService.Collection> list(HttpSession session){var user=auth.requireActiveUser(session);return ApiResponse.ok(service.forUser(user,()->service.list(user.getId())));}
  @PutMapping("/{favoriteId}") public ApiResponse<StickerFavoriteService.Collection> add(@PathVariable String favoriteId,HttpSession session,HttpServletRequest request)throws IOException{
    var user=auth.requireActiveUser(session);var body=read(request,Set.of("assetId","messageId"));
    UUID asset=body.hasNonNull("assetId")?MediaAssetController.uuid(body.get("assetId").asText()):null;
    Long message=null;if(body.hasNonNull("messageId")){
      var id=body.get("messageId");if(!id.isTextual()&&!id.isIntegralNumber())throw invalid();
      try{message=MediaEntityId.parse(id.asText(),id.isIntegralNumber());}catch(IllegalArgumentException error){throw invalid();}
    }
    var command=new StickerFavoriteService.Add(asset,message);
    return ApiResponse.ok(service.forUser(user,()->service.add(user.getId(),MediaAssetController.uuid(favoriteId),command)));
  }
  @DeleteMapping("/{favoriteId}") public ApiResponse<StickerFavoriteService.Collection> delete(@PathVariable String favoriteId,HttpSession session){var user=auth.requireActiveUser(session);return ApiResponse.ok(service.forUser(user,()->service.delete(user.getId(),MediaAssetController.uuid(favoriteId))));}
  @PutMapping("/order") public ApiResponse<StickerFavoriteService.Collection> order(HttpSession session,HttpServletRequest request)throws IOException{
    var user=auth.requireActiveUser(session);var body=read(request,Set.of("version","ids"));
    if(!body.has("version") || !body.get("version").isIntegralNumber() || !body.get("version").canConvertToLong() || !body.has("ids") || !body.get("ids").isArray() || body.get("ids").size()>200)throw invalid();
    var ids=new ArrayList<UUID>();for(var id:body.get("ids"))ids.add(MediaAssetController.uuid(id.asText()));
    return ApiResponse.ok(service.forUser(user,()->service.order(user.getId(),body.get("version").longValue(),ids)));
  }
  private com.fasterxml.jackson.databind.JsonNode read(HttpServletRequest request,Set<String> fields)throws IOException{
    if(request.getContentType()==null || !request.getContentType().split(";",2)[0].trim().equalsIgnoreCase("application/json"))throw invalid();
    byte[] bytes=request.getInputStream().readNBytes(16_385);if(bytes.length>16_384)throw new MediaApiException(413,"STICKER_TOO_LARGE","收藏请求过大。");
    var node=json.readTree(bytes);if(node==null || !node.isObject())throw invalid();
    var names=node.fieldNames();while(names.hasNext())if(!fields.contains(names.next()))throw invalid();return node;
  }
  private static MediaApiException invalid(){return new MediaApiException(400,"STICKER_INVALID","收藏请求无效。");}
}
