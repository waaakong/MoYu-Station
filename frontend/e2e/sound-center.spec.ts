import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const tracks = [
      { id: "track-1", title: "Autumn Window", artist: "Local Artist", album: "Quiet Hours", durationMs: 183000, source: { kind: "local", fileToken: "00000000-0000-4000-8000-000000000001" } },
      { id: "track-2", title: "Late Library", artist: "Local Artist", durationMs: 201000, source: { kind: "local", fileToken: "00000000-0000-4000-8000-000000000002" } }
    ];
    let favorites: typeof tracks = [];
    let playlists: { id: string; name: string; trackCount: number; createdAt: number; updatedAt: number }[] = [];
    let snapshots: { id: string; name: string; state: unknown; updatedAt: number }[] = [];
    const playlistTracks = new Map<string, typeof tracks>();
    Object.defineProperty(window, "studyRoomDesktop", { value: {
      getCapabilities: async () => ({ platform: "electron", localLibrary: true, persistentQueue: true, secureCredentials: true, mediaKeys: true, systemTray: true, autoUpdate: true, localFocusDatabase: true, publicRadio: true, providerLogin: true, providerPlayback: true }),
      readQueue: async () => [], replaceQueue: async () => undefined, recordPlaybackEvent: async () => undefined, onMediaCommand: () => () => undefined,
      listTracks: async () => tracks, listRecentTracks: async () => [], listMissingTracks: async () => [], listLibraryRoots: async () => [],
      listFavoriteTracks: async () => favorites,
      setTrackFavorite: async ({ trackId, favorite }: { trackId: string; favorite: boolean }) => { favorites = favorite ? tracks.filter(({ id }) => id === trackId) : favorites.filter(({ id }) => id !== trackId); return favorite; },
      listPlaylists: async () => playlists,
      createPlaylist: async ({ name }: { name: string }) => { const created = { id: "playlist-1", name, trackCount: 0, createdAt: Date.now(), updatedAt: Date.now() }; playlists = [created]; playlistTracks.set(created.id, []); return created; },
      renamePlaylist: async ({ playlistId, name }: { playlistId: string; name: string }) => { const current = playlists.find(({ id }) => id === playlistId)!; const renamed = { ...current, name, updatedAt: Date.now() }; playlists = [renamed]; return renamed; },
      deletePlaylist: async ({ playlistId }: { playlistId: string }) => { playlists = playlists.filter(({ id }) => id !== playlistId); },
      listPlaylistItems: async ({ playlistId }: { playlistId: string }) => (playlistTracks.get(playlistId) || []).map((track, position) => ({ playlistId, track, position })),
      addPlaylistTrack: async ({ playlistId, trackId }: { playlistId: string; trackId: string }) => { const list = playlistTracks.get(playlistId) || []; const track = tracks.find(({ id }) => id === trackId)!; if (!list.some(({ id }) => id === trackId)) list.push(track); playlistTracks.set(playlistId, list); playlists = playlists.map((entry) => entry.id === playlistId ? { ...entry, trackCount: list.length } : entry); return list.map((item, position) => ({ playlistId, track: item, position })); },
      removePlaylistTrack: async ({ playlistId, trackId }: { playlistId: string; trackId: string }) => { const list = (playlistTracks.get(playlistId) || []).filter(({ id }) => id !== trackId); playlistTracks.set(playlistId, list); playlists = playlists.map((entry) => entry.id === playlistId ? { ...entry, trackCount: list.length } : entry); return list.map((track, position) => ({ playlistId, track, position })); },
      readSoundSettings: async () => undefined, saveSoundSettings: async () => undefined, listSoundSnapshots: async () => snapshots,
      saveSoundSnapshot: async ({ snapshot }: { snapshot: { id: string; name: string; state: unknown } }) => { const saved = { ...snapshot, updatedAt: Date.now() }; snapshots = [saved, ...snapshots]; return saved; },
      deleteSoundSnapshot: async ({ snapshotId }: { snapshotId: string }) => { snapshots = snapshots.filter(({ id }) => id !== snapshotId); },
      getTrackLyrics: async () => undefined, getTrackLyricOffset: async ({ trackId }: { trackId: string }) => ({ trackId, offsetMs: 0 }), saveTrackLyricOffset: async (value: unknown) => value,
      listRadioStations: async () => ({ items: [
        { id: "somafm-groove-salad", name: "Groove Salad", category: "氛围电子", format: "mp3", bitrateKbps: 128 },
        { id: "somafm-drone-zone", name: "Drone Zone", category: "深度专注", format: "mp3", bitrateKbps: 128 }
      ] }),
      refreshRadioNowPlaying: async ({ stationId }: { stationId: string }) => ({ stationId, title: "Quiet Rain", artist: "Moyu", updatedAt: Date.now() }),
      prepareRadioPlayback: async () => ({ sourceKind: "radio", mediaToken: "a".repeat(64), supportsRange: true }),
      listProviderStatuses: async () => (["netease", "qq", "kugou"].map((providerId) => ({ providerId, enabled: false, state: "unavailable", capabilities: [], errorCode: "PROVIDER_UNAVAILABLE" }))),
      setProviderConsent: async () => (["netease", "qq", "kugou"].map((providerId) => ({ providerId, enabled: false, state: "unavailable", capabilities: [], errorCode: "PROVIDER_UNAVAILABLE" }))),
      setPreferredProviderOrder: async ({ providerIds }: { providerIds: string[] }) => providerIds,
      searchAggregatedTracks: async () => ({ items: [], completedProviders: [], failedProviders: { netease: "PROVIDER_UNAVAILABLE" } }),
      openProviderLogin: async () => undefined,
      logoutProvider: async () => undefined,
      prepareProviderPlayback: async () => ({ sourceKind: "provider", providerId: "netease", trackId: "1", mediaToken: "b".repeat(64), supportsRange: true }),
      onSourceSwitch: () => () => undefined,
      onProviderStatusChanged: () => () => undefined,
      onProviderSearchProgress: () => () => undefined,
      setUpdaterActivityState: async () => ({ state: 'disabled' }), setUpdaterAuthState: async () => ({ state: 'disabled' }), onUpdateStatus: () => () => undefined
    } });
  });
});

test('provider playlists page, queue the selected collection, and clear after logout', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const bridge=window.studyRoomDesktop!;let signedIn=true;
    const track={id:'netease:1',title:'Fixture song',artist:'Fixture artist',source:{kind:'provider' as const,providerId:'netease' as const,trackId:'1'}};
    bridge.listProviderStatuses=async()=>[{providerId:'netease',enabled:true,state:signedIn?'signed-in':'signed-out',capabilities:['search','playlists','favorites','playback']}];
    bridge.listProviderPlaylists=async input=>({providerId:'netease',items:[{providerId:'netease',id:input.cursor?'2':'1',name:input.cursor?'Second page':'Fixture playlist',trackCount:1}],nextCursor:input.cursor?undefined:'30'});
    bridge.listProviderPlaylistTracks=async()=>({providerId:'netease',items:[track]});
    bridge.listProviderFavorites=async()=>({providerId:'netease',items:[]});
    bridge.logoutProvider=async()=>{signedIn=false;};
    bridge.replaceQueue=async items=>{(window as unknown as {testQueue:unknown}).testQueue=items;};
  });
  await page.goto('/#/sound');
  await page.getByRole('button',{name:/网易云/}).click();
  await page.getByRole('button',{name:'我的歌单',exact:true}).click();
  await page.getByRole('button',{name:'加载更多',exact:true}).click();
  await expect(page.getByRole('button',{name:'Second page 1 首',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Fixture playlist 1 首',exact:true}).click();
  await page.getByRole('button',{name:'播放 Fixture song',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {testQueue:{track:{id:string}}[]}).testQueue?.[0]?.track.id)).toBe('netease:1');
  await page.getByRole('button',{name:'我喜欢的',exact:true}).last().click();
  await expect(page.getByText('还没有曲目',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'打开实验音乐平台'}).click();
  await page.getByRole('dialog',{name:'实验音乐平台'}).getByRole('button',{name:'退出',exact:true}).click();
  await page.getByRole('button',{name:'关闭实验音乐平台'}).click();
  await page.getByRole('button',{name:'我的歌单',exact:true}).click();
  await expect(page.getByText('登录后查看私人音乐库',{exact:true})).toBeVisible();
  await expect(page.getByRole('list',{name:'平台歌单'})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("sound center manages local favorites and playlists", async ({ page }) => {
  await page.goto("/#/sound");
  await expect(page.getByRole("list", { name: "本地曲库" })).toBeVisible();
  await page.getByRole("button", { name: "新建播放列表" }).click();
  await page.getByRole("textbox", { name: "播放列表名称" }).fill("写作时刻");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByRole("heading", { name: "写作时刻" })).toBeVisible();
  await page.getByRole("button", { name: /本地曲库/ }).click();
  await page.getByRole("button", { name: "喜欢 Autumn Window" }).click();
  await page.getByRole("button", { name: /我喜欢的/ }).click();
  await expect(page.getByRole("button", { name: "播放 Autumn Window", exact: true })).toBeVisible();
});

test("sound center opens ambient mixer in the responsive drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#/sound");
  await page.getByRole("button", { name: /环境声音/ }).click();
  await expect(page.getByRole("region", { name: "环境声音库" })).toBeVisible();
  await page.getByRole("button", { name: "播放 白噪音" }).click();
  await expect(page.getByRole("complementary", { name: "声音控制台" })).toBeVisible();
  await page.getByRole("tab", { name: "播放" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "混音" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "环境声音混音器" })).toContainText("白噪音");
  await page.getByText("十段均衡器", { exact: false }).click();
  await expect(page.getByRole("region", { name: "均衡器" })).toBeVisible();
  await page.getByRole("textbox", { name: "声音快照名称" }).fill("雨夜阅读");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: "雨夜阅读", exact: true })).toBeVisible();
  const modal = page.getByRole("dialog", { name: "声音控制台" });
  expect(await modal.evaluate(el => el.matches(':modal'))).toBe(true);
  expect(await modal.boundingBox()).toEqual({ x:0, y:0, width:1280, height:720 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "声音控制台" })).toBeHidden();
  await expect(page.getByRole("button", { name: "打开声音控制台" })).toBeFocused();
});

for (const [width,height] of [[1440,900],[1280,720],[1080,640],[390,844]]) {
  test(`modal overlays cover navigation and player at ${width}`, async ({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height});
    await page.goto('/#/sound');
    await expect(page.getByRole('heading',{name:'声音',exact:true})).toBeVisible();
    const trigger=page.getByRole('button',{name:'打开实验音乐平台'});
    await trigger.click();
    const modal=page.getByRole('dialog',{name:'实验音乐平台',exact:true});
    await expect(modal).toBeVisible();
    expect(await modal.boundingBox()).toEqual({x:0,y:0,width,height});
    expect(await modal.evaluate(el=>({top:el.matches(':modal'),body:el.parentElement===document.body,
      corners:[[1,1],[innerWidth-1,1],[1,innerHeight-1],[innerWidth-1,innerHeight-1]].every(([x,y])=>document.elementFromPoint(x,y)===el)}))).toEqual({top:true,body:true,corners:true});
    const close=modal.getByRole('button',{name:'关闭实验音乐平台'});
    const centered=await close.evaluate(el=>{const b=el.getBoundingClientRect(),s=el.querySelector('svg')!.getBoundingClientRect();return Math.abs(b.x+b.width/2-s.x-s.width/2)<1&&Math.abs(b.y+b.height/2-s.y-s.height/2)<1;});
    expect(centered).toBe(true);
    await page.keyboard.press('Escape');await expect(modal).toBeHidden();await expect(trigger).toBeFocused();
    await trigger.click();await page.mouse.click(2,2);await expect(modal).toBeHidden();
    await page.goto('/#/focus');await page.getByRole('button',{name:'今日签到',exact:true}).click();
    const checkin=page.getByRole('dialog',{name:'今日签到',exact:true});
    expect(await checkin.boundingBox()).toEqual({x:0,y:0,width,height});
    expect(await checkin.evaluate(el=>el.matches(':modal'))).toBe(true);
    await page.getByRole('button',{name:'关闭签到',exact:true}).click();await expect(checkin).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test("sound center keeps the three-column desktop layout inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/#/sound");
  await expect(page.getByRole("complementary", { name: "声音来源" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "声音控制台" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight }));
  expect(dimensions.scrollWidth).toBe(dimensions.width);
  expect(dimensions.scrollHeight).toBe(dimensions.height);
  const playerBox = await page.getByRole("contentinfo", { name: "播放器" }).boundingBox();
  const contextBox = await page.getByRole("complementary", { name: "声音控制台" }).boundingBox();
  expect(Boolean(playerBox && contextBox && playerBox.x + playerBox.width > contextBox.x)).toBe(false);
});

test("sound center exposes audited radio and honest provider states", async ({ page }) => {
  await page.goto("/#/sound");
  await page.getByRole("button", { name: /公开电台/ }).click();
  await expect(page.getByRole("region", { name: "公开电台目录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "播放电台 Groove Salad" })).toContainText("Quiet Rain");

  await page.getByRole("button", { name: "打开实验音乐平台" }).click();
  const dialog = page.getByRole("dialog", { name: "实验音乐平台" });
  await expect(dialog).toContainText("非网易云音乐、QQ 音乐或酷狗音乐官方客户端");
  await expect(dialog).toContainText("外部阻断");
  await expect(dialog.getByRole("button", { name: "登录" })).toHaveCount(0);
});
