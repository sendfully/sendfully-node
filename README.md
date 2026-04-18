# Sendfully Node.js SDK

The official Node.js SDK for [Sendfully](https://sendfully.com).

## Installation

```bash
npm install sendfully
# or
pnpm add sendfully
# or
yarn add sendfully
```

Requires Node.js 20.3 or later. Zero runtime dependencies.

## Quick start

```ts
import { Sendfully } from "sendfully";

const client = new Sendfully({ apiKey: process.env.SENDFULLY_API_KEY });

// Send a transactional email from a published template
await client.emails.send({
  templateId: "welcome_email_a1b2",
  to: "user@example.com",
  variables: { first_name: "Ada" },
});

// Or send inline HTML
await client.emails.send({
  from: "Acme <hello@acme.com>",
  to: "user@example.com",
  subject: "Hello from Acme",
  html: "<p>Welcome!</p>",
});
```

The `apiKey` option falls back to the `SENDFULLY_API_KEY` environment variable when omitted.

## Contacts

```ts
// Create
const { id } = await client.contacts.create({
  email: "user@example.com",
  firstName: "Ada",
  subscribed: true,
});

// Look up by UUID or email
const contact = await client.contacts.get("user@example.com");

// Update (PATCH semantics: only the fields you pass are changed)
await client.contacts.update(id, { subscribed: false });

// Delete
await client.contacts.delete(id);
```

## Emails

A few common scenarios for `emails.send`. Sending from a published template is the main approach, but you can also provide inline content directly.

### Templated

```ts
await client.emails.send({
  templateId: "order-confirmation",
  to: "buyer@example.com",
  variables: { orderId: "1234", total: "$42.00" },
});
```

### Inline content

```ts
await client.emails.send({
  from: "Acme <hello@acme.com>",
  to: ["a@example.com", "b@example.com"],
  subject: "Weekly digest",
  html: "<h1>This week</h1>...",
  text: "This week: ...", // optional, auto-generated from html when omitted
});
```

### Scheduling

```ts
await client.emails.send({
  templateId: "reminder",
  to: "user@example.com",
  scheduledAt: new Date("2026-05-01T09:00:00Z"),
});
```

### Attachments

```ts
import { readFileSync } from "node:fs";

await client.emails.send({
  from: "hello@acme.com",
  to: "user@example.com",
  subject: "Your receipt",
  html: "<p>Receipt attached.</p>",
  attachments: [
    {
      filename: "receipt.pdf",
      content: readFileSync("./receipt.pdf").toString("base64"),
    },
    // Or fetch from a public URL:
    { filename: "logo.png", path: "https://cdn.example.com/logo.png" },
  ],
});
```

## Error handling

Every error thrown by the SDK extends `SendfullyError`. See the [API documentation](https://sendfully.com/docs/api/introduction) for the full list of error classes and the status codes they map to.

## Configuration

`apiKey` is the only required setting. The rest have defaults you can override if you need to.

```ts
const client = new Sendfully({
  apiKey: "sf_...", // required (or set SENDFULLY_API_KEY)
  baseUrl: "https://api.sendfully.com",
  timeout: 60_000, // ms, default 60s
  maxRetries: 2,
  headers: { "X-App": "myapp" }, // merged into every request
  fetch: customFetch, // override the fetch implementation
});
```

Every resource method also accepts a trailing `options` object to override these defaults per-call:

```ts
await client.emails.send(
  { templateId: "t", to: "u@example.com" },
  { timeout: 5_000, signal: controller.signal },
);
```

### Retries

GET, PATCH, and DELETE are retried automatically on transient failures. `POST` is only retried when you pass `idempotencyKey`, since otherwise a retry could send the same email twice.

Pass `idempotencyKey` on `emails.send` to make a send safely retryable. If you call `emails.send` again with the same key within 24 hours, the API returns the original response instead of sending a second time.

```ts
await client.emails.send(
  { templateId: "welcome_email_a1b2", to: "user@example.com" },
  { idempotencyKey: "welcome-user-1234" },
);
```

## License

MIT
