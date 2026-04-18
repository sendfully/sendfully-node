export type { SendfullyClientOptions } from "./client";
export { Sendfully } from "./client";
export type { SendfullyErrorBody, SendfullyRateLimitInfo } from "./http/errors";

export {
  SendfullyAbortError,
  SendfullyAPIError,
  SendfullyAuthenticationError,
  SendfullyBadRequestError,
  SendfullyConflictError,
  SendfullyConnectionError,
  SendfullyError,
  SendfullyNotFoundError,
  SendfullyPermissionError,
  SendfullyRateLimitError,
  SendfullyServerError,
  SendfullyTimeoutError,
  SendfullyUnprocessableEntityError,
} from "./http/errors";
export type { RequestOptions } from "./http/request";
export type {
  Contact,
  ContactsResource,
  CreateContactParams,
  UpdateContactParams,
} from "./resources/contacts";
export type { EmailsResource, SendEmailParams, SendEmailResult } from "./resources/emails";
