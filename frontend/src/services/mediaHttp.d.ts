import "axios";

declare module "axios" {
  interface AxiosRequestConfig<D = any> {
    /** Local lifecycle guard; never serialized or forwarded to the server/IPC. */
    mediaGuard?: () => void;
  }
}
