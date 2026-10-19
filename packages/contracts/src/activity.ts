export interface ActivitySegment {startMs:number;endMs:number;state:'FOCUS'|'IDLE'}
export interface ActivityBatch {requestId:string;sessionId:string;sequence:number;segments:ActivitySegment[];partial:boolean}
export interface ActivityReceipt {status:'unconfirmed'|'committed';requestId?:string;sequence?:number}
