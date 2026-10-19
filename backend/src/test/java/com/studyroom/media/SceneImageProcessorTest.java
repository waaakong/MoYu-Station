package com.studyroom.media;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static com.studyroom.media.ImageFixtures.*;
import static com.studyroom.media.StaticImageCandidateProcessorTest.failure;
import static org.assertj.core.api.Assertions.*;

class SceneImageProcessorTest {
  @TempDir Path root;
  @Test void independentWorkerPreservesPortraitAndTransparentVariantsAndOldSocialBudget()throws Exception{
    var worker=new IsolatedImageProcessor(System.getProperty("surefire.test.class.path",System.getProperty("java.class.path")));
    byte[] image=png(1800,5400);
    failure(()->worker.process(image,"image/png"),"MEDIA_DIMENSIONS");
    var scene=worker.processScene(image,"image/png");
    assertThat(scene.clear().width()).isEqualTo(1365);assertThat(scene.clear().height()).isEqualTo(4096);
    assertThat(scene.display().height()).isEqualTo(2560);assertThat(scene.thumb().height()).isEqualTo(512);
    for(var item:List.of(scene.clear(),scene.display(),scene.thumb())){
      var decoded=javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(item.bytes()));
      assertThat(decoded.getRGB(0,0)>>>24).isZero();decoded.flush();
    }
    var quota=new com.studyroom.service.UploadQuotaService(root.resolve("uploads").toString(),256L*1024*1024,512L*1024*1024,0,root.resolve("private").toString());
    var store=new PrivateImageStore(quota);var stored=store.save(11,scene);
    assertThat(store.read(11,stored.assetId(),PrivateImageStore.Variant.DISPLAY).bytes()).isEqualTo(scene.display().bytes());
    Path dir=root.resolve("private/11/"+stored.assetId());
    try(var files=Files.list(dir)){assertThat(files.map(path->path.getFileName().toString())).containsExactlyInAnyOrder("clear.bin","display.bin","thumb.bin","ready.bin");}
    store.deleteRetired(11,stored.assetId());assertThat(dir).doesNotExist();
  }
  @Test void rejectsInputTypeDimensionsAndDoesNotWidenLegacyManifest()throws Exception{
    var scene=new SceneImageProcessor();
    failure(()->scene.process(new byte[SceneImageProcessor.INPUT_BYTES+1],"image/png"),"MEDIA_TOO_LARGE");
    failure(()->scene.process(png(12001,1),"image/png"),"MEDIA_DIMENSIONS");
    failure(()->scene.process(WEBP_LOSSY,"image/jpeg"),"MEDIA_MIME_MISMATCH");
    var large=scene.process(png(4096,4096),"image/png");
    assertThatThrownBy(()->new StoredImageManifest(1,UUID.randomUUID(),StoredImageManifest.describe(large.clear(),large.clear().bytes(),true),StoredImageManifest.describe(large.thumb(),large.thumb().bytes()))).isInstanceOf(CandidateImageException.class);
  }
  @Test void canonicalConfigurationAcceptsSevenExistingPeriodsAndRejectsUnboundedSettings(){
    var picture=new CustomSceneService.Picture(UUID.randomUUID(),"contain",0.5,0.7,1,0.3);
    var config=new CustomSceneService.Config("  私人空间  ",picture,Map.of("forenoon",picture));
    assertThat(CustomSceneService.validate(config).name()).isEqualTo("私人空间");
    assertThatThrownBy(()->CustomSceneService.validate(new CustomSceneService.Config("bad",picture,Map.of("dawn",picture)))).isInstanceOf(MediaApiException.class);
    assertThatThrownBy(()->CustomSceneService.validate(new CustomSceneService.Config("bad",new CustomSceneService.Picture(picture.assetId(),"cover",Double.NaN,0,1,0),Map.of()))).isInstanceOf(MediaApiException.class);
  }
  @Test void detailedPhotoFitsDerivedBudgetInsteadOfRejectingValidOriginal()throws Exception{
    var image=new java.awt.image.BufferedImage(2200,1600,java.awt.image.BufferedImage.TYPE_INT_RGB);
    var random=new Random(17);
    for(int y=0;y<1600;y++)for(int x=0;x<2200;x++)image.setRGB(x,y,random.nextInt(0x1000000));
    var bytes=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(image,"jpg",bytes);image.flush();
    assertThat(bytes.size()).isLessThan(SceneImageProcessor.INPUT_BYTES);
    var worker=new IsolatedImageProcessor(System.getProperty("surefire.test.class.path",System.getProperty("java.class.path")));
    var result=worker.processScene(bytes.toByteArray(),"image/jpeg");
    assertThat(result.clear().bytes().length).isLessThanOrEqualTo(SceneImageProcessor.MASTER_BYTES);
    assertThat(result.display().bytes().length).isLessThanOrEqualTo(SceneImageProcessor.DISPLAY_BYTES);
    assertThat(result.display().width()).isLessThan(2200);
    assertThat((double)result.display().width()/result.display().height()).isCloseTo(2200.0/1600,within(.003));
    var quota=new com.studyroom.service.UploadQuotaService(root.resolve("uploads").toString(),256L*1024*1024,512L*1024*1024,0,root.resolve("private").toString());
    var store=new PrivateImageStore(quota);var stored=store.save(11,result);
    assertThat(store.read(11,stored.assetId(),PrivateImageStore.Variant.DISPLAY).bytes()).isEqualTo(result.display().bytes());
  }
}
