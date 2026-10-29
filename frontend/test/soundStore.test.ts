import { describe, expect, it } from "vitest";
import { defaultSoundSettings, sanitizeSoundSettings } from "../src/stores/sound";

describe("sound settings", () => {
  it('keeps new stage choices through sound sanitizing and preserves old stage fields',()=>{
    const preferences={version:2,layout:'visual',lyricStyle:'chat',background:'wave',quality:40,intensity:.4,depth:.6};
    const settings=sanitizeSoundSettings({...defaultSoundSettings(),visualizer:{mode:'waveform',quality:'medium',stage:{composition:'visual',tone:'moon',cameraX:2,cameraY:0,preferences}}});
    expect(settings.visualizer.stage).toEqual({composition:'visual',tone:'moon',cameraX:2,cameraY:0,preferences});
  });
  it("keeps bounded stage preferences and accepts old records without them", () => {
    const defaults = defaultSoundSettings();
    expect(sanitizeSoundSettings(defaults).visualizer.stage).toBeUndefined();
    const restored = sanitizeSoundSettings({ ...defaults, visualizer: { mode: 'particles', quality: 'high', stage: { composition: 'lyrics', tone: 'moon', cameraX: 100, cameraY: -50, unknown: 'discard' } } });
    expect(restored.visualizer.stage).toEqual({ composition: 'lyrics', tone: 'moon', cameraX: 8, cameraY: -6 });
  });
  it("restores safe settings but always stops ambient runtime state", () => {
    const defaults = defaultSoundSettings(0.7, true);
    const restored = sanitizeSoundSettings({
      ...defaults,
      musicBus: { volume: 5, muted: true },
      crossfadeSeconds: 99,
      ambientTracks: [{
        id: "rain",
        sourceId: "rain",
        volume: 0.3,
        pan: 2,
        muted: false,
        solo: false,
        fadeInMs: 200,
        fadeOutMs: 200,
        randomStart: true,
        status: "playing"
      }]
    }, defaults);
    expect(restored.musicBus).toEqual({ volume: 1, muted: true });
    expect(restored.crossfadeSeconds).toBe(12);
    expect(restored.ambientTracks[0]).toMatchObject({ status: "stopped", pan: 1 });
  });

  it("falls back from damaged versions and malformed EQ bands", () => {
    const defaults = defaultSoundSettings();
    expect(sanitizeSoundSettings({ version: 99 }, defaults)).toEqual(defaults);
    const restored = sanitizeSoundSettings({
      ...defaults,
      equalizer: { ...defaults.equalizer, bands: [{ frequencyHz: 30, gainDb: 99 }] }
    }, defaults);
    expect(restored.equalizer.bands).toEqual(defaults.equalizer.bands);
  });
});
