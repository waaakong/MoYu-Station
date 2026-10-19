export type AdminPageModule = 'users'|'posts'|'feedback';
export interface AdminRecordPage<T> {items:T[];nextCursor:string|null;versionedWrites:boolean}
export interface AdminVersionedRecord {adminVersion?:string|null}
export interface AdminUpdateMember {userId:string;username:string;channel:'stable'|'beta'|'provider-experimental';enabled:boolean;adminVersion:string|null}
export type AdminAccessModule = 'invitations'|'members';
