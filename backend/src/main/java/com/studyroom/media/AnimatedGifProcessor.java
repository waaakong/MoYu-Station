package com.studyroom.media;

import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.*;
import javax.imageio.*;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.*;

/** Qualified only in a worker JVM. Each input frame is decoded, composited and disposed explicitly. */
public final class AnimatedGifProcessor {
  public StaticImageCandidateProcessor.Result process(byte[] input) {
    var source = GifContainer.inspect(input);
    boolean resize = Math.max(source.width,source.height) > 512;
    var canvas = new BufferedImage(source.width,source.height,BufferedImage.TYPE_INT_ARGB);
    int background = source.frames.get(0).transparent() ? 0 : source.background;
    fill(canvas,0,0,source.width,source.height,background);
    var encoded = new ByteArrayOutputStream();
    var reader = ImageIO.getImageReadersByFormatName("gif").next();
    var writer = ImageIO.getImageWritersByFormatName("gif").next();
    BufferedImage poster = null;
    try (var stream = new MemoryCacheImageInputStream(new ByteArrayInputStream(source.clean));
         var output = new MemoryCacheImageOutputStream(encoded) {
           @Override public void write(int value) throws IOException { check(1); super.write(value); }
           @Override public void write(byte[] value,int offset,int length) throws IOException { check(length); super.write(value,offset,length); }
           private void check(int length) throws IOException { if (length > GifContainer.MAX_BYTES-getStreamPosition()) throw new CandidateImageException("MEDIA_OUTPUT_TOO_LARGE", "处理后 GIF 超过 5 MiB。"); }
         }) {
      reader.setInput(stream,false,false);
      reader.addIIOReadWarningListener((r, warning) -> { throw CandidateImageException.invalid(); });
      if (reader.getNumImages(true) != source.frames.size()) throw CandidateImageException.invalid();
      if (resize) { writer.setOutput(output); writer.prepareWriteSequence(null); }
      for (int i=0; i<source.frames.size(); i++) {
        var frame = source.frames.get(i);
        if (reader.getWidth(i) != frame.width() || reader.getHeight(i) != frame.height()) throw CandidateImageException.invalid();
        BufferedImage previous = frame.disposal() == 3 ? copy(canvas) : null;
        BufferedImage decoded = reader.read(i);
        if (decoded == null) throw CandidateImageException.invalid();
        var g = canvas.createGraphics();
        try { g.drawImage(decoded,frame.x(),frame.y(),null); } finally { g.dispose(); decoded.flush(); }
        if (i == 0) poster = scaled(canvas);
        if (resize) {
          var scaled = scaled(canvas);
          // The JDK writer owns palette quantization. Metadata is constructed fresh, never copied from uploads.
          var metadata = writer.getDefaultImageMetadata(ImageTypeSpecifier.createFromRenderedImage(scaled),null);
          var tree = (IIOMetadataNode)metadata.getAsTree("javax_imageio_gif_image_1.0");
          var control = (IIOMetadataNode)tree.getElementsByTagName("GraphicControlExtension").item(0);
          control.setAttribute("disposalMethod","restoreToBackgroundColor");
          control.setAttribute("delayTime",Integer.toString(frame.delay()));
          control.setAttribute("userInputFlag","FALSE");
          if (i==0 && source.loops>=0) {
            var apps = new IIOMetadataNode("ApplicationExtensions");
            var app = new IIOMetadataNode("ApplicationExtension");
            app.setAttribute("applicationID","NETSCAPE"); app.setAttribute("authenticationCode","2.0");
            app.setUserObject(new byte[]{1,(byte)source.loops,(byte)(source.loops>>8)}); apps.appendChild(app); tree.appendChild(apps);
          }
          metadata.setFromTree("javax_imageio_gif_image_1.0",tree);
          writer.writeToSequence(new IIOImage(scaled,null,metadata),null); scaled.flush();
        }
        // An opaque delta does not turn a transparent logical canvas into an opaque one.
        if (frame.disposal()==2) fill(canvas,frame.x(),frame.y(),frame.width(),frame.height(),background);
        else if (previous!=null) { canvas.flush(); canvas=previous; previous=null; }
        if (previous!=null) previous.flush();
      }
      if (resize) writer.endWriteSequence();
      output.flush();
      byte[] animation = resize ? encoded.toByteArray() : source.clean;
      var checked = GifContainer.inspect(animation);
      if (checked.frames.size()!=source.frames.size() || checked.loops!=source.loops || checked.durationMs!=source.durationMs)
        throw CandidateImageException.invalid();
      var png = new ByteArrayOutputStream(); ImageIO.write(poster,"png",png);
      return new StaticImageCandidateProcessor.Result(new StaticImageCandidateProcessor.Variant(animation,"image/gif",poster.getWidth(),poster.getHeight()),
          new StaticImageCandidateProcessor.Variant(png.toByteArray(),"image/png",poster.getWidth(),poster.getHeight()));
    } catch (IOException | IllegalArgumentException failure) {
      for (Throwable cause=failure; cause!=null; cause=cause.getCause()) if (cause instanceof CandidateImageException known) throw known;
      throw CandidateImageException.invalid();
    } finally { reader.dispose(); writer.dispose(); canvas.flush(); if (poster!=null) poster.flush(); }
  }
  static BufferedImage copy(BufferedImage image) {
    var result = new BufferedImage(image.getWidth(),image.getHeight(),BufferedImage.TYPE_INT_ARGB);
    var g=result.createGraphics(); try { g.setComposite(AlphaComposite.Src); g.drawImage(image,0,0,null); } finally {g.dispose();} return result;
  }
  static void fill(BufferedImage canvas,int x,int y,int w,int h,int argb) {
    var g=canvas.createGraphics(); try {g.setComposite(AlphaComposite.Src);g.setColor(new Color(argb,true));g.fillRect(x,y,w,h);} finally {g.dispose();}
  }
  static BufferedImage scaled(BufferedImage source) {
    double ratio=Math.min(1,512.0/Math.max(source.getWidth(),source.getHeight()));
    var target=new BufferedImage(Math.max(1,(int)Math.round(source.getWidth()*ratio)),Math.max(1,(int)Math.round(source.getHeight()*ratio)),BufferedImage.TYPE_INT_ARGB);
    var g=target.createGraphics(); try {g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);g.drawImage(source,0,0,target.getWidth(),target.getHeight(),null);} finally {g.dispose();}
    return target;
  }
}
