import {z} from 'zod';
export const lyricsFrameSchema=z.object({
  title:z.string().max(500),line:z.string().max(2000),nextLine:z.string().max(2000),status:z.string().max(100),
  trackKey:z.string().max(1024).optional(),lineKey:z.string().max(1100).optional(),
  positionMs:z.number().finite().min(0).max(86400000).optional(),playing:z.boolean().optional(),jump:z.boolean().optional(),
  words:z.array(z.object({text:z.string().min(1).max(2000),timeMs:z.number().finite().min(0).max(86400000),endMs:z.number().finite().min(0).max(86400000).optional()}).strict()).max(500).optional()
}).strict().superRefine((frame,ctx)=>{
  if(frame.words&& (frame.words.map(w=>w.text).join('')!==frame.line||frame.words.some((w,i)=>w.endMs!==undefined&&w.endMs<w.timeMs||i>0&&w.timeMs<frame.words![i-1]!.timeMs)))ctx.addIssue({code:'custom',message:'LYRICS_TIMING_INVALID'});
});
export const LYRICS_ACTIONS=['close','lock','settings','play-pause','next','previous','font-smaller','font-larger','toggle-rows','color-next'] as const;
