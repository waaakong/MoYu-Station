package com.studyroom.controller;
import com.studyroom.common.BusinessException;
import com.studyroom.entity.User;
import com.studyroom.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class ReliableCreateControllerTest {
  @Test void capabilityIsOffWithoutBeanAndAlwaysAuthenticates(){
    var auth=mock(AuthService.class);var session=new MockHttpSession();var controller=new ReliableCreateController(auth);
    assertThat(controller.capabilities(session).getData()).containsEntry("reliableCreate",false);verify(auth).requireActiveUser(session);
  }
  @Test void resultUsesCallerIdentityAndInvitationRequiresAdmin(){
    var auth=mock(AuthService.class);var service=mock(ReliableCreateService.class);var controller=new ReliableCreateController(auth);controller.setReliable(service);
    var session=new MockHttpSession();var user=new User();user.setId(2104509220480131074L);when(auth.requireActiveUser(session)).thenReturn(user);when(auth.requireAdmin(session)).thenThrow(new BusinessException("denied"));
    String id="11111111-1111-4111-8111-111111111111";controller.result("FEEDBACK",id,session);
    verify(service).result(user.getId(),ReliableCreateService.Kind.FEEDBACK,id);
    assertThatThrownBy(()->controller.result("INVITATION",id,session)).isInstanceOf(BusinessException.class);
    verify(service,never()).result(anyLong(),eq(ReliableCreateService.Kind.INVITATION),anyString());
  }
  @Test void unknownOperationNeverReachesStorage(){
    var controller=new ReliableCreateController(mock(AuthService.class));
    assertThatThrownBy(()->controller.result("ANY","id",new MockHttpSession())).isInstanceOf(BusinessException.class);
  }
  @Test void feedbackHasTheSame360CharacterLimitAsTheEditor(){
    try(var factory=javax.validation.Validation.buildDefaultValidatorFactory()){
      var request=new com.studyroom.dto.FeedbackRequest();request.setTitle("标题");request.setContent("字".repeat(360));
      assertThat(factory.getValidator().validate(request)).isEmpty();request.setContent("字".repeat(361));
      assertThat(factory.getValidator().validate(request)).extracting(v->v.getPropertyPath().toString()).contains("content");
    }
  }
}
