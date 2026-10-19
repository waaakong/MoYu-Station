package com.studyroom.media;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class MediaEntityIdTest {
  final MediaPublicationController controller=new MediaPublicationController(null,null);
  byte[] body(String recipient){return ("{\"requestId\":\"00000000-0000-4000-8000-000000000001\",\"kind\":\"PRIVATE\",\"recipient\":"+recipient+",\"assets\":[\"00000000-0000-4000-8000-000000000002\"]}").getBytes(StandardCharsets.UTF_8);}
  @Test void stringBigintSurvivesPublicationAndLegacySmallNumbersRemainCompatible(){
    assertThat(controller.parse(body("\"9007199254740993\"")).recipient()).isEqualTo(9007199254740993L);
    assertThat(controller.parse(body("2")).recipient()).isEqualTo(2L);
    assertThat(MediaEntityId.parse("9223372036854775807",false)).isEqualTo(Long.MAX_VALUE);
  }
  @Test void malformedOrLossyIdsAreRejected(){
    for(String id:java.util.List.of("\"0\"","\"01\"","\" 2\"","\"+2\"","\"1e3\"","{}","1.2","true","9007199254740993","\"9223372036854775808\""))
      assertThatThrownBy(()->controller.parse(body(id))).isInstanceOf(MediaApiException.class);
  }
}
