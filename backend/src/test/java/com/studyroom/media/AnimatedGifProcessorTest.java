package com.studyroom.media;

import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import javax.imageio.*;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AnimatedGifProcessorTest {
  @Test void actualWorkerPreservesAnimationTimingLoopAndTransparentPoster() throws Exception {
    var input = fixture(16,16,4,7,0);
    var result = worker().processStickerGif(input);
    var parsed=GifContainer.inspect(result.clear().bytes());
    assertThat(parsed.frames).hasSize(4); assertThat(parsed.loops).isZero(); assertThat(parsed.durationMs).isEqualTo(280);
    assertThat(parsed.frames.stream().map(GifContainer.Frame::disposal)).containsExactly(1,2,3,1);
    var png=ImageIO.read(new ByteArrayInputStream(result.thumb().bytes()));
    assertThat(png.getRGB(15,15)>>>24).isZero(); assertThat(png.getRGB(0,0)).isEqualTo(0xffff0000);
    assertThat(result.clear().mime()).isEqualTo("image/gif");
  }
  @Test void downscalingKeepsAllFramesAndLoopCount() throws Exception {
    var result=worker().processStickerGif(fixture(1024,512,4,7,3));
    var parsed=GifContainer.inspect(result.clear().bytes());
    assertThat(parsed.width).isEqualTo(512);assertThat(parsed.height).isEqualTo(256);
    assertThat(parsed.frames).hasSize(4);assertThat(parsed.loops).isEqualTo(3);assertThat(parsed.durationMs).isEqualTo(280);
    // Inspect the full output sequence with an independent decoder walk, not just the poster.
    var frames=decodeComposite(result.clear().bytes());
    assertThat(frames.get(0).getRGB(511,255)>>>24).isZero();
    assertThat(frames.get(0).getRGB(0,0)).isEqualTo(0xffff0000);
    assertThat(frames.get(1).getRGB(4,0)).isEqualTo(0xff00ff00);
    assertThat(frames.get(2).getRGB(4,0)>>>24).isZero(); // disposal 2 cleared the green patch
    assertThat(frames.get(2).getRGB(8,0)).isEqualTo(0xff0000ff);
    assertThat(frames.get(3).getRGB(8,0)>>>24).isZero(); // disposal 3 restored the prior canvas
    assertThat(frames.get(3).getRGB(12,0)).isEqualTo(0xffffff00);
    for(var frame:frames) assertThat(frame.getRGB(0,0)).isEqualTo(0xffff0000); // partial-frame disposal must not clear unrelated pixels
    frames.forEach(BufferedImage::flush);
  }
  @Test void enforcesEveryInputBudgetAndRejectsTruncationOrTrailingPayload() throws Exception {
    reject(fixture(1025,1,1,2,-1),"MEDIA_DIMENSIONS");
    reject(fixture(2,2,121,2,-1),"MEDIA_GIF_BUDGET");
    reject(fixture(2,2,2,800,-1),"MEDIA_GIF_BUDGET");
    reject(fixture(1024,1024,31,2,-1),"MEDIA_GIF_BUDGET");
    var valid=fixture(8,8,2,2,-1);
    assertThatThrownBy(()->worker().processStickerGif(Arrays.copyOf(valid,valid.length-1))).isInstanceOf(CandidateImageException.class);
    assertThatThrownBy(()->worker().processStickerGif(Arrays.copyOf(valid,valid.length+1))).isInstanceOf(CandidateImageException.class);
    reject(new byte[5*1024*1024+1],"MEDIA_TOO_LARGE");
    assertThatThrownBy(()->worker().process(valid,"image/gif")).isInstanceOf(CandidateImageException.class);
  }
  @Test void noLoopExtensionRemainsPlayOnceAndCommentsAreRemoved() throws Exception {
    var result=worker().processStickerGif(fixture(8,8,2,0,-1));
    assertThat(GifContainer.inspect(result.clear().bytes()).loops).isEqualTo(-1);
    assertThat(GifContainer.inspect(result.clear().bytes()).durationMs).isEqualTo(200);
    assertThat(new String(result.clear().bytes(),java.nio.charset.StandardCharsets.ISO_8859_1)).doesNotContain("private-comment");
  }
  private static void reject(byte[] input,String code) { assertThatThrownBy(()->worker().processStickerGif(input)).isInstanceOf(CandidateImageException.class).extracting(e->((CandidateImageException)e).code()).isEqualTo(code); }
  private static IsolatedImageProcessor worker() {return new IsolatedImageProcessor(System.getProperty("surefire.test.class.path",System.getProperty("java.class.path")));}
  static byte[] fixture(int width,int height,int count,int delay,int loops) throws Exception {
    var bytes=new ByteArrayOutputStream();var writer=ImageIO.getImageWritersByFormatName("gif").next();
    try(var output=new MemoryCacheImageOutputStream(bytes)) {
      writer.setOutput(output);writer.prepareWriteSequence(null);
      for(int i=0;i<count;i++) {
        int patchWidth=i==0?width:Math.min(8,width), patchHeight=i==0?height:Math.min(8,height), left=i==0?0:Math.min(i*8,width-patchWidth);
        var frame=new BufferedImage(patchWidth,patchHeight,BufferedImage.TYPE_INT_ARGB);
        int[] colors={0xffff0000,0xff00ff00,0xff0000ff,0xffffff00};
        AnimatedGifProcessor.fill(frame,0,0,Math.min(8,width),Math.min(8,height),colors[i%4]);
        var meta=writer.getDefaultImageMetadata(ImageTypeSpecifier.createFromRenderedImage(frame),null);
        var root=(IIOMetadataNode)meta.getAsTree("javax_imageio_gif_image_1.0");
        ((IIOMetadataNode)root.getElementsByTagName("ImageDescriptor").item(0)).setAttribute("imageLeftPosition",Integer.toString(left));
        var gce=(IIOMetadataNode)root.getElementsByTagName("GraphicControlExtension").item(0);
        gce.setAttribute("disposalMethod",new String[]{"doNotDispose","restoreToBackgroundColor","restoreToPrevious","doNotDispose"}[i%4]);
        gce.setAttribute("delayTime",Integer.toString(delay));
        var comments=new IIOMetadataNode("CommentExtensions"); var comment=new IIOMetadataNode("CommentExtension");comment.setAttribute("value","private-comment");comments.appendChild(comment);root.appendChild(comments);
        if(i==0 && loops>=0) {var apps=new IIOMetadataNode("ApplicationExtensions");var app=new IIOMetadataNode("ApplicationExtension");app.setAttribute("applicationID","NETSCAPE");app.setAttribute("authenticationCode","2.0");app.setUserObject(new byte[]{1,(byte)loops,(byte)(loops>>8)});apps.appendChild(app);root.appendChild(apps);}
        meta.setFromTree("javax_imageio_gif_image_1.0",root);writer.writeToSequence(new IIOImage(frame,null,meta),null);frame.flush();
      }
      writer.endWriteSequence();output.flush();return bytes.toByteArray();
    } finally{writer.dispose();}
  }
  private static List<BufferedImage> decodeComposite(byte[] bytes) throws Exception {
    var reader=ImageIO.getImageReadersByFormatName("gif").next();var parsed=GifContainer.inspect(bytes);var frames=new ArrayList<BufferedImage>();
    var canvas=new BufferedImage(parsed.width,parsed.height,BufferedImage.TYPE_INT_ARGB);
    try(var stream=new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
      reader.setInput(stream);for(int i=0;i<reader.getNumImages(true);i++) {
        var f=parsed.frames.get(i);var previous=AnimatedGifProcessor.copy(canvas);var patch=reader.read(i);var g=canvas.createGraphics();g.drawImage(patch,f.x(),f.y(),null);g.dispose();patch.flush();frames.add(AnimatedGifProcessor.copy(canvas));
        if(f.disposal()==2)AnimatedGifProcessor.fill(canvas,f.x(),f.y(),f.width(),f.height(),0);
        if(f.disposal()==3){canvas.flush();canvas=previous;}else previous.flush();
      }
      return frames;
    }finally{reader.dispose();canvas.flush();}
  }
}
