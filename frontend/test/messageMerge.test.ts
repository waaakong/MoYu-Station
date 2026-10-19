import { describe, expect, it } from "vitest";
import { lastMessageId, mergeMessages } from "../src/chat/messageMerge";

describe("chat cursor merge", () => {
  it('keeps adjacent 64-bit message IDs distinct and ordered',()=>{
    expect(mergeMessages([{id:'2104509220480131075'}],[{id:'2104509220480131074'}]).map(item=>item.id)).toEqual(['2104509220480131074','2104509220480131075']);
  });
  it("deduplicates reconnect overlap and keeps ascending cursor order", () => {
    const merged = mergeMessages(
      [{ id: 7, content: "a" }, { id: 8, content: "old" }],
      [{ id: 8, content: "new" }, { id: 10, content: "c" }, { id: 9, content: "b" }]
    );
    expect(merged.map((message) => message.id)).toEqual([7, 8, 9, 10]);
    expect(merged[1].content).toBe("new");
    expect(lastMessageId(merged)).toBe(10);
  });
});
