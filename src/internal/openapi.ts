import type { operations } from "../generated/api-types";

type JsonContent<T> = T extends { content: { "application/json": infer B } } ? B : never;

type Responses<O extends keyof operations> = operations[O]["responses"];

/** Response body for `operations[O]` on status `S`, stripped of the optional wrapper. */
export type OperationResponse<
  O extends keyof operations,
  S extends keyof Responses<O>,
> = NonNullable<JsonContent<Responses<O>[S]>>;

/** JSON request body for `operations[O]`. Only valid for operations that define one. */
export type OperationRequestBody<O extends keyof operations> = JsonContent<
  NonNullable<operations[O]["requestBody"]>
>;
