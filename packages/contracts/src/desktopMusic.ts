export interface DesktopMusicSettings {
  shortcutsEnabled:boolean;
  shortcuts:{'play-pause':string;next:string;previous:string};
  lyricsVisible:boolean;
  lyricsLocked:boolean;
  lyricsStyle?:DesktopLyricsStyle;
  wheel?:DesktopWheelSettings;
}
export const DESKTOP_WHEEL_COMMANDS=['play-pause','next','focus','sound','space','lyrics','mute','previous'] as const;
export type DesktopWheelCommand=typeof DESKTOP_WHEEL_COMMANDS[number];
export interface DesktopWheelSettings {enabled:boolean;accelerator:string;slots:DesktopWheelCommand[];allowFullscreen:boolean}
export interface DesktopLyricsStyle {
  fontSize:number;highlight:string;rows:1|2;
  base?:string;fontFamily?:'system'|'sans'|'serif';opacity?:number;smoothScroll?:boolean;
}
export interface DesktopLyricWord {text:string;timeMs:number;endMs?:number}
export interface DesktopLyricsFrame {title:string;line:string;nextLine:string;status:string;trackKey?:string;lineKey?:string;positionMs?:number;playing?:boolean;words?:DesktopLyricWord[];jump?:boolean}
export interface DesktopMusicState {settings:DesktopMusicSettings;error?:string}
