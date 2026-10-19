package com.studyroom.media;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.assertj.core.api.Assertions.assertThat;

class MediaCollectionConfigurationTest {
  @Test void absentOrPartialOptInNeverCreatesCollectorOrScheduler() {
    for (String[] properties : new String[][] {{}, {"studyroom.media.enabled=true"},
        {"studyroom.media.collection-enabled=true"},
        {"studyroom.media.enabled=true", "studyroom.media.collection-enabled=false"}}) {
      new ApplicationContextRunner().withUserConfiguration(MediaCollectionConfiguration.class)
          .withPropertyValues(properties).run(context -> {
            assertThat(context).hasNotFailed().doesNotHaveBean(MediaAssetCollector.class)
                .doesNotHaveBean(MediaCollectionConfiguration.CollectionJob.class)
                .doesNotHaveBean("org.springframework.context.annotation.internalScheduledAnnotationProcessor");
          });
    }
  }
}
