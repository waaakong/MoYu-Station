export function isUnknownWriteOutcome(error: unknown): boolean {
  const value = error as { status?: number; code?: string } | undefined;
  return Number(value?.status) >= 500 || (!value?.status && !value?.code)
    // The desktop bridge can lose the response after the server commits a write.
    // Its generic failure is not evidence that the operation was rejected.
    || ['INTERNAL_ERROR', 'INTERNAL_SERVER_ERROR', 'NETWORK_ERROR', 'CLOUD_REQUEST_FAILED'].includes(value?.code || '');
}
