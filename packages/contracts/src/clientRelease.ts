/** Decimal strings preserve database BIGINT IDs/revisions across web and Electron. */
export interface ClientRelease {
  id: string; releaseId: string; channel: string; version: string;
  status: 'DRAFT' | 'PILOT' | 'ROLLING' | 'FULL' | 'PAUSED' | 'WITHDRAWN';
  rolloutPercentage: number; mandatory: boolean;
  minimumSupportedVersion: string | null; releaseNotes: string | null;
  policyVersion: string | null; createdAt: string;
}
export interface ClientReleasePage {
  items: ClientRelease[]; nextCursor: string | null; versionedPolicyEnabled: boolean;
}
export interface ClientReleasePolicy {
  status: ClientRelease['status']; rolloutPercentage: number; mandatory: boolean;
  minimumSupportedVersion: string | null; releaseNotes: string | null;
  reason: string; expectedVersion: string;
}
