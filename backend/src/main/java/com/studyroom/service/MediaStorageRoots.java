package com.studyroom.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Validates configured roots; never creates, moves or deletes user files. */
public final class MediaStorageRoots {
  private final Path publicRoot;
  private final Path configuredPublicRoot;
  private final Path privateRoot;

  public MediaStorageRoots(Path publicRoot, Path privateRoot) throws IOException {
    this.configuredPublicRoot = publicRoot.toAbsolutePath().normalize();
    this.publicRoot = resolveExistingAncestor(publicRoot);
    this.privateRoot = resolveExistingAncestor(privateRoot);
    if (this.privateRoot.getParent() == null
        || this.privateRoot.startsWith(this.publicRoot)
        || this.publicRoot.startsWith(this.privateRoot)) {
      throw new IllegalArgumentException("Private media root must be separate from the public upload root.");
    }
  }

  public Path privateRoot() { return privateRoot; }

  public Path ownerDirectory(long ownerId) throws IOException {
    if (ownerId <= 0) throw new IllegalArgumentException("Invalid media owner.");
    Path directory = privateRoot.resolve(Long.toString(ownerId));
    verifyPrivatePath(directory);
    return directory;
  }

  /** Re-check the resolved location so a later symlink/junction cannot escape. */
  public void verifyPrivatePath(Path path) throws IOException {
    Path normalized = path.toAbsolutePath().normalize();
    Path resolved = resolveExistingAncestor(normalized);
    if (!resolveExistingAncestor(configuredPublicRoot).equals(publicRoot)
        || !normalized.startsWith(privateRoot) || !resolved.equals(normalized)
        || resolved.startsWith(publicRoot) || Files.isSymbolicLink(normalized)) {
      throw new IOException("Private media path changed or escaped its storage root.");
    }
  }

  private static Path resolveExistingAncestor(Path path) throws IOException {
    Path absolute = path.toAbsolutePath().normalize();
    Path ancestor = absolute;
    while (ancestor != null && !Files.exists(ancestor, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
      ancestor = ancestor.getParent();
    }
    if (ancestor == null) throw new IOException("No accessible storage ancestor.");
    return ancestor.toRealPath().resolve(ancestor.relativize(absolute)).normalize();
  }
}
