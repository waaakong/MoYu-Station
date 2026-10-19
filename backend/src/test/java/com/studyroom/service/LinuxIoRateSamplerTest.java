package com.studyroom.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

class LinuxIoRateSamplerTest {
  @TempDir Path root;
  Path proc, sys;
  AtomicLong nanos = new AtomicLong();
  LinuxIoRateSampler sampler;

  @BeforeEach void setup() throws Exception {
    proc = Files.createDirectories(root.resolve("proc/net")).getParent();
    sys = Files.createDirectories(root.resolve("sys"));
    Files.createDirectories(sys.resolve("block/vda/slaves"));
    Files.createDirectories(sys.resolve("class/net/eth0/device"));
    Files.writeString(sys.resolve("class/net/eth0/type"), "1\n");
    Files.writeString(sys.resolve("class/net/eth0/ifindex"), "2\n");
    counters(100, 200, 1000, 2000);
    sampler = new LinuxIoRateSampler(proc, sys, nanos::get);
  }
  String disk(String name, long read, long write) {
    return "253 0 " + name + " 1 0 " + read + " 0 1 0 " + write + " 0 0 0 0\n";
  }
  String net(String name, long read, long write) {
    return name + ": " + read + " 0 0 0 0 0 0 0 " + write + " 0 0 0 0 0 0 0\n";
  }
  void counters(long read, long write, long receive, long transmit) throws Exception {
    Files.writeString(proc.resolve("diskstats"), disk("vda", read, write));
    Files.writeString(proc.resolve("net/dev"), "Inter-| Receive | Transmit\n" + net("eth0", receive, transmit));
  }
  LinuxIoRateSampler.Rates next() { nanos.addAndGet(1_000_000_000L); return sampler.sample(); }

  @Test void warmsUpThenMeasuresActualDeltasWithMonotonicTime() throws Exception {
    assertEquals("UNAVAILABLE", sampler.sample().diskRead());
    counters(104, 208, 2024, 4048);
    assertEquals(new LinuxIoRateSampler.Rates("2.0 KiB/s", "4.0 KiB/s", "1.0 KiB/s", "2.0 KiB/s"), next());
  }
  @Test void idleIsZeroOnlyAfterTwoValidSamples() {
    assertEquals("UNAVAILABLE", sampler.sample().receive());
    assertEquals(new LinuxIoRateSampler.Rates("0 B/s", "0 B/s", "0 B/s", "0 B/s"), next());
  }
  @Test void excludesPartitionsStackedDevicesRamDisksLoopbackAndVirtualInterfaces() throws Exception {
    Files.createDirectories(sys.resolve("block/dm-0/slaves/vda"));
    Files.createDirectories(sys.resolve("block/loop0/slaves"));
    Files.createDirectories(sys.resolve("block/zram0/slaves"));
    sampler.sample();
    Files.writeString(proc.resolve("diskstats"),disk("vda",102,202)+disk("vda1",99999,99999)+disk("dm-0",99999,99999)+disk("loop0",99999,99999)+disk("zram0",99999,99999));
    Files.writeString(proc.resolve("net/dev"),net("eth0",2024,3024)+net("lo",99999,99999)+net("veth0",99999,99999));
    assertEquals(new LinuxIoRateSampler.Rates("1.0 KiB/s", "1.0 KiB/s", "1.0 KiB/s", "1.0 KiB/s"),next());
  }
  @Test void counterResetDoesNotBecomeNegativeOrSyntheticZeroAndRecovers() throws Exception {
    sampler.sample(); counters(1,2,1,2);
    assertEquals(new LinuxIoRateSampler.Rates("UNAVAILABLE","UNAVAILABLE","UNAVAILABLE","UNAVAILABLE"),next());
    counters(3,4,1025,1026);assertEquals("1.0 KiB/s",next().diskRead());
  }
  @Test void diskFailureDoesNotHideNetworkAndRequiresFreshBaselineAfterRecovery() throws Exception {
    sampler.sample();Files.delete(proc.resolve("diskstats"));
    var failed=next();assertEquals("UNAVAILABLE",failed.diskRead());assertEquals("0 B/s",failed.receive());
    counters(1000,2000,1000,2000);assertEquals("UNAVAILABLE",next().diskRead());assertEquals("0 B/s",next().diskRead());
  }
  @Test void networkFailureDoesNotHideDiskAndRequiresFreshBaselineAfterRecovery() throws Exception {
    sampler.sample();Files.writeString(proc.resolve("net/dev"),"eth0: invalid\n");
    var failed=next();assertEquals("UNAVAILABLE",failed.receive());assertEquals("0 B/s",failed.diskRead());
    counters(100,200,1000,2000);assertEquals("UNAVAILABLE",next().receive());assertEquals("0 B/s",next().receive());
  }
  @Test void addedDiskAndRecreatedInterfaceRequireNewBaseline() throws Exception {
    sampler.sample();Files.createDirectories(sys.resolve("block/vdb/slaves"));
    Files.writeString(proc.resolve("diskstats"),disk("vda",100,200)+disk("vdb",1000,2000));
    Files.writeString(sys.resolve("class/net/eth0/ifindex"),"3");
    assertEquals(new LinuxIoRateSampler.Rates("UNAVAILABLE","UNAVAILABLE","UNAVAILABLE","UNAVAILABLE"),next());
    assertEquals("0 B/s",next().receive());
  }
  @Test void shortIntervalDoesNotConsumeBaselineAndClockRollbackRewarms() throws Exception {
    sampler.sample();counters(102,202,2024,3024);nanos.set(10_000_000L);
    assertEquals("UNAVAILABLE",sampler.sample().diskRead());nanos.set(1_000_000_000L);
    assertEquals("1.0 KiB/s",sampler.sample().diskRead());nanos.set(0);
    assertEquals("UNAVAILABLE",sampler.sample().diskRead());assertEquals("0 B/s",next().diskRead());
  }
  @Test void absentOperatingSystemCountersAndEmptyDevicesRemainUnavailable() throws Exception {
    var absent=new LinuxIoRateSampler(root.resolve("missing"),root.resolve("absent"),nanos::get);
    assertEquals("UNAVAILABLE",absent.sample().diskRead());
    Files.delete(sys.resolve("block/vda/slaves"));Files.delete(sys.resolve("block/vda"));
    Files.writeString(proc.resolve("diskstats"),"");Files.writeString(proc.resolve("net/dev"),net("lo",100,100));
    sampler.sample();assertEquals(new LinuxIoRateSampler.Rates("UNAVAILABLE","UNAVAILABLE","UNAVAILABLE","UNAVAILABLE"),next());
  }
  @Test void rejectsMalformedNegativeAndOverflowingDiskCounters() throws Exception {
    sampler.sample();Files.writeString(proc.resolve("diskstats"),disk("vda",-1,200));assertEquals("UNAVAILABLE",next().diskRead());
    Files.writeString(proc.resolve("diskstats"),disk("vda",Long.MAX_VALUE,200));assertEquals("UNAVAILABLE",next().diskRead());
    Files.writeString(proc.resolve("diskstats"),"253 0 vda 1");assertEquals("UNAVAILABLE",next().diskRead());
  }
}
