import {reactive} from 'vue';
import type {ActivitySegment} from '@studyroom/contracts';
export const activityState=reactive({owner:'',sessionId:'',enabled:false,pending:0,error:'',revision:0,relaxTiming:false,observed:[] as ActivitySegment[]});
