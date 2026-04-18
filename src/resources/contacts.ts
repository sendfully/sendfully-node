import type { RequestFn, RequestOptions } from "../http/request";
import type { OperationRequestBody, OperationResponse } from "../internal/openapi";

export type Contact = OperationResponse<"GetContact", 200>["data"];

export type CreateContactParams = OperationRequestBody<"CreateContact">;
export type UpdateContactParams = OperationRequestBody<"UpdateContact">;

export class ContactsResource {
  constructor(private readonly request: RequestFn) {}

  /**
   * Create a new contact.
   *
   * @throws {@link SendfullyConflictError} when a contact with the given email
   *   already exists.
   */
  async create(params: CreateContactParams, options?: RequestOptions): Promise<{ id: string }> {
    const res = await this.request<OperationResponse<"CreateContact", 201>>(
      "POST",
      "/v1/contacts",
      params,
      options,
    );
    return { id: res.id };
  }

  /**
   * Retrieve a contact by UUID or email address.
   *
   * @throws {@link SendfullyNotFoundError} when no contact matches.
   */
  async get(idOrEmail: string, options?: RequestOptions): Promise<Contact> {
    const res = await this.request<OperationResponse<"GetContact", 200>>(
      "GET",
      `/v1/contacts/${encodeURIComponent(idOrEmail)}`,
      undefined,
      options,
    );
    return res.data;
  }

  /**
   * Update an existing contact. Fields not specified in `params` are left
   * unchanged.
   */
  async update(
    idOrEmail: string,
    params: UpdateContactParams,
    options?: RequestOptions,
  ): Promise<void> {
    await this.request<OperationResponse<"UpdateContact", 200>>(
      "PATCH",
      `/v1/contacts/${encodeURIComponent(idOrEmail)}`,
      params,
      options,
    );
  }

  /**
   * Permanently delete a contact.
   *
   * @throws {@link SendfullyNotFoundError} when no contact matches.
   */
  async delete(idOrEmail: string, options?: RequestOptions): Promise<void> {
    await this.request<OperationResponse<"DeleteContact", 200>>(
      "DELETE",
      `/v1/contacts/${encodeURIComponent(idOrEmail)}`,
      undefined,
      options,
    );
  }
}
