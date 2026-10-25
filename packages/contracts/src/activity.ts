export type ActivityKind='FOCUS'|'IDLE'|'FOCUS_V3'|'ONLINE'|'RELAX';
export interface ActivitySegment {startMs:number;endMs:number;state:ActivityKind}
export interface ActivityBatch {requestId:string;sessionId:string;sequence:number;segments:ActivitySegment[];partial:boolean}
export interface ActivityReceipt {status:'unconfirmed'|'committed';requestId?:string;sequence?:number}
export interface ActivityLive {date:string;timeZone:'Asia/Shanghai';segments:ActivitySegment[];partial:boolean;hasLegacy:boolean}
