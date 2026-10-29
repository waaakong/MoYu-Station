import type {StagePreferences,VisualizerMode} from '@studyroom/contracts';
export type {StagePreferences,StageLayout,StageLyricStyle,StageBackground} from '@studyroom/contracts';
export const STAGE_LYRICS=[['scroll','平滑滚动'],['focus','居中聚焦'],['steps','阶梯错落'],['giant','超大文字'],['chat','对话气泡'],['story','文字分镜']] as const;
export const STAGE_BACKGROUNDS=[['cover','封面流光'],['spectrum','光带频谱'],['wave','流体声波'],['particles','封面星云'],['off','关闭']] as const;
const defaults:StagePreferences={version:2,layout:'cover',lyricStyle:'scroll',background:'cover',quality:'auto',intensity:.65,depth:.5};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const unit=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.min(1,Math.max(0,value)):fallback;
export function normalizeStagePreferences(input:unknown,fallback:StagePreferences=defaults):StagePreferences {
  const v=record(input);if(v.version!==2)return {...fallback};
  return {
    version:2,
    layout:['cover','lyrics','visual'].includes(String(v.layout))?v.layout as StagePreferences['layout']:fallback.layout,
    lyricStyle:STAGE_LYRICS.some(([id])=>id===v.lyricStyle)?v.lyricStyle as StagePreferences['lyricStyle']:fallback.lyricStyle,
    background:STAGE_BACKGROUNDS.some(([id])=>id===v.background)?v.background as StagePreferences['background']:fallback.background,
    quality:['auto',24,40,60].includes(v.quality as number)?v.quality as StagePreferences['quality']:fallback.quality,
    intensity:unit(v.intensity,fallback.intensity),depth:unit(v.depth,fallback.depth)
  };
}
export function readStagePreferences(input:unknown):StagePreferences {
  const v=record(input),stage=record(v.stage);
  const legacy={...defaults,
    layout:['cover','lyrics','visual'].includes(String(stage.composition))?stage.composition as StagePreferences['layout']:defaults.layout,
    background:STAGE_BACKGROUNDS.some(([id])=>id===v.mode)?v.mode as StagePreferences['background']:v.mode==='waveform'?'wave' as const:defaults.background,
    quality:v.quality==='low'?24 as const:v.quality==='medium'?40 as const:v.quality==='high'?60 as const:'auto' as const
  };
  return normalizeStagePreferences(stage.preferences,legacy);
}
export function stageVisualizerMode(p:StagePreferences):VisualizerMode {return p.background==='wave'?'waveform':p.background;}
