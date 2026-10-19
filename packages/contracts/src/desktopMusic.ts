export interface DesktopMusicSettings {
  shortcutsEnabled:boolean;
  shortcuts:{'play-pause':string;next:string;previous:string};
  lyricsVisible:boolean;
  lyricsLocked:boolean;
}
export interface DesktopLyricsFrame {title:string;line:string;nextLine:string;status:string}
export interface DesktopMusicState {settings:DesktopMusicSettings;error?:string}
