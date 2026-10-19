package com.studyroom.media;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;

/** One request per JVM. No Spring, database, input file paths or stored originals. */
public final class ImageWorker {
  private ImageWorker() { }

  public static void main(String[] args) throws IOException {
    try (var input = new DataInputStream(System.in); var output = new DataOutputStream(System.out)) {
      try {
        String mime = input.readUTF();
        boolean scene = mime.startsWith("scene:");
        if (scene) mime = mime.substring(6);
        int length = input.readInt();
        boolean gif = "image/gif".equals(mime);
        if (length <= 0 || length > (scene ? SceneImageProcessor.INPUT_BYTES : gif ? GifContainer.MAX_BYTES : StaticImageCandidateProcessor.MAX_BYTES)) throw CandidateImageException.invalid();
        byte[] bytes = input.readNBytes(length);
        if (bytes.length != length || input.read() != -1) throw CandidateImageException.invalid();
        var result = scene ? new SceneImageProcessor().process(bytes, mime) : gif ? new AnimatedGifProcessor().process(bytes) : new StaticImageCandidateProcessor().process(bytes, mime);
        output.writeBoolean(true);
        writeVariant(output, result.clear());
        writeVariant(output, result.thumb());
        if (scene) writeVariant(output, result.display());
      } catch (CandidateImageException exception) {
        output.writeBoolean(false);
        output.writeUTF(exception.code());
        output.writeUTF(exception.getMessage());
      }
    }
  }

  private static void writeVariant(DataOutputStream output, StaticImageCandidateProcessor.Variant variant) throws IOException {
    output.writeUTF(variant.mime()); output.writeInt(variant.width()); output.writeInt(variant.height());
    byte[] bytes = variant.bytes();
    output.writeInt(bytes.length); output.write(bytes);
  }
}
