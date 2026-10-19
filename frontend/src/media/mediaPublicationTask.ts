import { MediaApi, PublicationRejectedError, freezePublication, type PublicationCommand, type Published } from "./mediaApi";

/** Created only after the user's publish action. No automatic submission, persistence or background retries. */
export class MediaPublicationTask {
  readonly command: PublicationCommand;
  private controller = new AbortController();
  private running?: Promise<Published>;
  private outcome?: Published;
  private state: "idle" | "sending" | "unknown" | "committed" | "rejected" | "cancelled" = "idle";
  constructor(private readonly api: MediaApi, command: PublicationCommand) { this.command = freezePublication(command); }
  snapshot() { return Object.freeze({ status: this.state, publication: this.outcome }); }
  cancel() { this.controller.abort(); this.state = "cancelled"; this.outcome = undefined; }
  submit(): Promise<Published> {
    try { this.api.assertCurrent(this.controller.signal); }
    catch (error) { this.cancel(); return Promise.reject(error); }
    if (this.outcome) return Promise.resolve(this.outcome);
    if (this.running) return this.running;
    if (this.state === "rejected") return Promise.reject(new PublicationRejectedError("请处理发布失败原因，不能重放已拒绝任务。"));
    const recover = this.state === "unknown";
    this.state = "sending";
    const work = async (): Promise<Published> => {
      try {
        let result: Published | undefined;
        if (recover) {
          const lookup = await this.api.lookupPublication(this.command, this.controller.signal);
          if (lookup.status === "committed") result = lookup.publication;
        }
        // unconfirmed is not absence; the same immutable command is safe to replay only on this explicit retry.
        result ??= await this.api.publish(this.command, this.controller.signal);
        this.api.assertCurrent(this.controller.signal);
        this.outcome = result; this.state = "committed"; return result;
      } catch (error) {
        try { this.api.assertCurrent(this.controller.signal); }
        catch (cancelled) { this.cancel(); throw cancelled; }
        this.state = error instanceof PublicationRejectedError ? "rejected" : "unknown";
        throw error;
      }
    };
    this.running = work().finally(() => { this.running = undefined; });
    return this.running;
  }
}
