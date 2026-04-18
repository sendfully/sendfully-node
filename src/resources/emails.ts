import type { RequestFn, RequestOptions } from "../http/request";
import type { OperationRequestBody, OperationResponse } from "../internal/openapi";

type SendEmailSuccess = OperationResponse<"SendEmail", 200>;

/**
 * Parameters for sending an email. The server runs additional validation on
 * top of these types. `scheduledAt` accepts an ISO-8601 string or a `Date`.
 */
export type SendEmailParams = Omit<OperationRequestBody<"SendEmail">, "scheduledAt"> & {
  scheduledAt?: string | Date;
};

/** Mirrors the server payload, except for the `success` flag. */
export type SendEmailResult = Omit<SendEmailSuccess, "success">;

export class EmailsResource {
  constructor(private readonly request: RequestFn) {}

  /**
   * Send or schedule a transactional email.
   *
   * Use a `templateId` to render a published template, or pass inline
   * `html`/`text` along with `from` and `subject`.
   *
   * Set `options.idempotencyKey` to make the call safe to retry; the API
   * dedupes replays for 24 hours.
   *
   * @throws {@link SendfullyBadRequestError} on validation errors.
   * @throws {@link SendfullyPermissionError} when the key isn't allowed to send.
   * @throws {@link SendfullyServerError} on server failure. `.id` may be set
   *   to correlate with a persisted record.
   */
  async send(params: SendEmailParams, options?: RequestOptions): Promise<SendEmailResult> {
    const { success: _success, ...result } = await this.request<SendEmailSuccess>(
      "POST",
      "/v1/emails/send",
      params,
      options,
    );
    return result;
  }
}
