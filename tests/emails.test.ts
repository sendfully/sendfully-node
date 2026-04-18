import { describe, expect, it } from "vitest";

import {
  SendfullyBadRequestError,
  SendfullyPermissionError,
  SendfullyServerError,
} from "../src/http/errors";
import { EmailsResource, type SendEmailParams } from "../src/resources/emails";
import { makeFakeRequest, makeThrowingRequest } from "./helpers/fakeRequest";

describe("EmailsResource.send", () => {
  it("sends a templated email and returns {id, status}", async () => {
    const { request, calls } = makeFakeRequest({
      success: true,
      id: "email_1",
      status: "sent",
    });
    const emails = new EmailsResource(request);

    const result = await emails.send({
      templateId: "welcome_email_a1b2",
      to: "user@example.com",
      variables: { name: "Ada" },
    });

    expect(result).toEqual({ id: "email_1", status: "sent" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/v1/emails/send",
      body: {
        templateId: "welcome_email_a1b2",
        to: "user@example.com",
        variables: { name: "Ada" },
      },
    });
  });

  it("sends an inline HTML email", async () => {
    const { request, calls } = makeFakeRequest({
      success: true,
      id: "email_2",
      status: "sent",
    });
    const emails = new EmailsResource(request);

    await emails.send({
      to: ["a@x.com", "b@x.com"],
      from: "Us <noreply@our.com>",
      subject: "Hello",
      html: "<p>hi</p>",
    });

    expect(calls[0]!.body).toEqual({
      to: ["a@x.com", "b@x.com"],
      from: "Us <noreply@our.com>",
      subject: "Hello",
      html: "<p>hi</p>",
    });
  });

  it("Date scheduledAt serializes to ISO-8601 on the wire", async () => {
    const { request, calls } = makeFakeRequest({
      success: true,
      id: "email_3",
      status: "scheduled",
    });
    const emails = new EmailsResource(request);
    const date = new Date("2026-05-01T12:00:00Z");

    await emails.send({
      templateId: "t",
      to: "u@x.com",
      scheduledAt: date,
    });

    const wireBody = JSON.parse(JSON.stringify(calls[0]!.body));
    expect(wireBody.scheduledAt).toBe("2026-05-01T12:00:00.000Z");
  });

  it("passes through a string scheduledAt unchanged", async () => {
    const { request, calls } = makeFakeRequest({
      success: true,
      id: "email_4",
      status: "queued",
    });
    const emails = new EmailsResource(request);

    await emails.send({
      templateId: "t",
      to: "u@x.com",
      scheduledAt: "2026-05-01T12:00:00Z",
    });

    expect((calls[0]!.body as { scheduledAt: string }).scheduledAt).toBe("2026-05-01T12:00:00Z");
  });

  it("does not mutate the caller-supplied params object", async () => {
    const { request } = makeFakeRequest({ success: true, id: "x", status: "sent" });
    const emails = new EmailsResource(request);
    const params: SendEmailParams = {
      templateId: "t",
      to: "u@x.com",
      scheduledAt: new Date("2026-05-01T12:00:00Z"),
    };
    const originalDate = params.scheduledAt;

    await emails.send(params);
    expect(params.scheduledAt).toBe(originalDate);
  });

  it("surfaces 400 as SendfullyBadRequestError", async () => {
    const request = makeThrowingRequest(
      new SendfullyBadRequestError({ message: "unknown template", status: 400 }),
    );
    const emails = new EmailsResource(request);
    await expect(emails.send({ templateId: "missing", to: "u@x.com" })).rejects.toBeInstanceOf(
      SendfullyBadRequestError,
    );
  });

  it("surfaces 403 as SendfullyPermissionError", async () => {
    const request = makeThrowingRequest(
      new SendfullyPermissionError({ message: "forbidden", status: 403 }),
    );
    const emails = new EmailsResource(request);
    await expect(
      emails.send({ from: "a@x.com", subject: "s", text: "t", to: "u@x.com" }),
    ).rejects.toBeInstanceOf(SendfullyPermissionError);
  });

  it("surfaces 500 with correlated id on the error", async () => {
    const request = makeThrowingRequest(
      new SendfullyServerError({
        message: "failed to send",
        status: 500,
        id: "email_failed_123",
      }),
    );
    const emails = new EmailsResource(request);
    try {
      await emails.send({ templateId: "t", to: "u@x.com" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SendfullyServerError);
      expect((err as SendfullyServerError).id).toBe("email_failed_123");
    }
  });

  it("forwards RequestOptions to the underlying request", async () => {
    const { request, calls } = makeFakeRequest({ success: true, id: "x", status: "sent" });
    const emails = new EmailsResource(request);
    await emails.send({ templateId: "t", to: "u@x.com" }, { timeout: 1000, maxRetries: 0 });
    expect(calls[0]!.options).toEqual({ timeout: 1000, maxRetries: 0 });
  });

  it("forwards idempotencyKey to the underlying request", async () => {
    const { request, calls } = makeFakeRequest({ success: true, id: "x", status: "sent" });
    const emails = new EmailsResource(request);
    await emails.send({ templateId: "t", to: "u@x.com" }, { idempotencyKey: "order-1234" });
    expect(calls[0]!.options).toEqual({ idempotencyKey: "order-1234" });
  });
});
