import type { HttpMethod, RequestFn, RequestOptions } from "../../src/http/request";

export interface RecordedCall {
  method: HttpMethod;
  path: string;
  body: unknown;
  options: RequestOptions | undefined;
}

export function makeFakeRequest(response: unknown): { request: RequestFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const request = (async (method, path, body, options) => {
    calls.push({ method, path, body, options });
    return response;
  }) as RequestFn;
  return { request, calls };
}

export function makeThrowingRequest(err: unknown): RequestFn {
  return (async () => {
    throw err;
  }) as RequestFn;
}
