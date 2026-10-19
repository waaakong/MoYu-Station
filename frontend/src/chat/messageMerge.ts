export type IdentifiedMessage = { id?: string | number | null } & Record<string, unknown>;

export function dedupeMessages<T extends IdentifiedMessage>(messages: T[] | null | undefined): T[] {
  const byId = new Map<string, T>();
  for (const message of messages || []) {
    if (message?.id === null || message?.id === undefined || message.id === "") continue;
    const key = String(message.id);
    if (!byId.has(key)) byId.set(key, message);
    else byId.set(key, { ...byId.get(key), ...message });
  }
  return [...byId.values()];
}

export function mergeMessages<T extends IdentifiedMessage>(current: T[], incoming: T[]): T[] {
  return dedupeMessages([...(current || []), ...(incoming || [])])
    .sort((left, right) => {
      if(/^[0-9]+$/.test(String(left.id)) && /^[0-9]+$/.test(String(right.id))){const a=BigInt(left.id!),b=BigInt(right.id!);return a<b?-1:a>b?1:0;}
      return String(left.id).localeCompare(String(right.id));
    });
}

export function lastMessageId(messages: IdentifiedMessage[]): string | number | undefined {
  return messages.at(-1)?.id ?? undefined;
}
