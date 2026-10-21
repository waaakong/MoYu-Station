package com.studyroom.media;

import java.io.IOException;
import java.net.*;
import java.nio.file.*;
import java.sql.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Explicit opt-in test helper. Never accepts a datasource URL or an existing data directory. */
final class EphemeralMysql implements AutoCloseable {
  private final Path data;
  private final Path pidFile;
  private final Process server;
  private final String rootUrl;
  final String databaseUrl;

  private EphemeralMysql(Path data, Path pidFile, Process server, int port) {
    this.data = data; this.pidFile = pidFile; this.server = server;
    rootUrl = "jdbc:mysql://127.0.0.1:" + port + "/?useSSL=false&serverTimezone=UTC&connectTimeout=1000&socketTimeout=5000&allowPublicKeyRetrieval=true";
    databaseUrl = rootUrl.replace("/?", "/media_assets_it?");
  }

  static EphemeralMysql start(Path scratch, Path executable) throws Exception {
    // Surefire's isolated class loader does not always expose JDBC service providers to DriverManager.
    Class.forName("com.mysql.cj.jdbc.Driver");
    Path binary = executable.toRealPath();
    if (!Files.isRegularFile(binary) || !binary.getFileName().toString().matches("mysqld(\\.exe)?")) {
      throw new IllegalArgumentException("An explicit mysqld binary is required");
    }
    Path run = Files.createTempDirectory(scratch.toRealPath(), "isolated-mysql-");
    Path data = Files.createDirectory(run.resolve("data")).toRealPath();
    if (!data.startsWith(scratch.toRealPath())) throw new IOException("Test data directory escaped scratch root");
    try (var contents = Files.list(data)) { if (contents.findAny().isPresent()) throw new IOException("Data directory is not empty"); }
    var common = new ArrayList<>(List.of(binary.toString(), "--no-defaults", "--basedir=" + binary.getParent().getParent(),
        "--datadir=" + data, "--secure-file-priv=" + run,
        "--innodb-buffer-pool-size=32M", "--innodb-redo-log-capacity=8M"));
    if (System.getProperty("os.name").startsWith("Windows")) common.add("--no-monitor");
    var init = new ArrayList<>(common); init.add("--initialize-insecure"); init.add("--console");
    Process initialization = start(init, run.resolve("initialize.log"));
    if (!initialization.waitFor(45, TimeUnit.SECONDS)) {
      stopOwnedTree(initialization);
      throw new IOException("Isolated MySQL initialization timed out; see " + run.resolve("initialize.log"));
    }
    if (initialization.exitValue() != 0) throw new IOException("Isolated MySQL initialization failed; see " + run.resolve("initialize.log"));
    int port;
    try (var socket = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) { port = socket.getLocalPort(); }
    Path pid = run.resolve("mysql.pid");
    var command = new ArrayList<>(common);
    command.addAll(List.of("--console", "--bind-address=127.0.0.1", "--port=" + port, "--mysqlx=OFF",
        "--socket=" + run.resolve("mysql.sock"),
        "--skip-log-bin", "--max-connections=16", "--pid-file=" + pid, "--local-infile=OFF"));
    Process server = start(command, run.resolve("server.log"));
    var instance = new EphemeralMysql(data, pid, server, port);
    try {
      long deadline = System.nanoTime() + Duration.ofSeconds(40).toNanos();
      boolean ready = false;
      SQLException lastConnectionFailure = null;
      while (System.nanoTime() < deadline && server.isAlive()) {
        try (Connection connection = DriverManager.getConnection(instance.rootUrl, "root", "")) {
          instance.verify(connection);
          try (Statement statement = connection.createStatement()) { statement.execute("CREATE DATABASE media_assets_it CHARACTER SET utf8mb4"); }
          ready = true; break;
        } catch (SQLException unavailable) { lastConnectionFailure = unavailable; Thread.sleep(100); }
      }
      if (!ready) {
        // Package defaults may point outside this owned directory. Keep bounded
        // startup diagnostics even when JUnit later removes its temporary files.
        var lines = Files.readAllLines(run.resolve("server.log"));
        var tail = String.join("\n", lines.subList(Math.max(0, lines.size() - 16), lines.size()));
        throw new IOException("Isolated MySQL did not become ready; owned startup log:\n" + tail, lastConnectionFailure);
      }
      return instance;
    } catch (Exception failure) { instance.close(); throw failure; }
  }

  private static Process start(List<String> command, Path log) throws IOException {
    var builder = new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(log.toFile());
    builder.environment().keySet().removeIf(key -> !Set.of("SystemRoot", "WINDIR", "TEMP", "TMP")
        .stream().anyMatch(allowed -> allowed.equalsIgnoreCase(key)));
    return builder.start();
  }

  private void verify(Connection connection) throws Exception {
    if (!server.isAlive()) throw new IOException("Owned MySQL process has exited");
    try (var statement = connection.createStatement(); var result = statement.executeQuery("SELECT @@datadir, @@pid_file")) {
      if (!result.next() || !Path.of(result.getString(1)).toRealPath().equals(data)
          || !Path.of(result.getString(2)).toRealPath().equals(pidFile.toRealPath())
          || Long.parseLong(Files.readString(pidFile).trim()) != server.pid()) {
        throw new IOException("Refusing to use a database instance not owned by this test");
      }
    }
  }

  void verifyOwnership() throws Exception {
    try (var connection = DriverManager.getConnection(rootUrl, "root", "")) { verify(connection); }
  }

  @Override public void close() throws Exception {
    if (!server.isAlive()) return;
    try (var connection = DriverManager.getConnection(rootUrl, "root", "")) {
      verify(connection);
      try (var statement = connection.createStatement()) { statement.execute("SHUTDOWN"); }
    } catch (SQLException unavailable) { /* Owned-process termination below is the only fallback. */ }
    finally {
      if (!server.waitFor(8, TimeUnit.SECONDS)) {
        stopOwnedTree(server);
      }
      if (server.isAlive()) throw new IOException("Owned isolated MySQL did not stop; preserve its data directory");
    }
  }

  private static void stopOwnedTree(Process process) throws InterruptedException {
    // Snapshot descendants before stopping the parent; never enumerate/kill unrelated mysqld processes.
    var children = process.descendants().toList();
    for (var child : children) child.destroy();
    process.destroy();
    if (!process.waitFor(5, TimeUnit.SECONDS)) process.destroyForcibly();
    for (var child : children) if (child.isAlive()) child.destroyForcibly();
    process.waitFor(5, TimeUnit.SECONDS);
  }
}
