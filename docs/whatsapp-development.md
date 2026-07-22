# WhatsApp Development Guide

OdeoniFlow uses a provider-independent WhatsApp layer. Local development defaults to `WHATSAPP_PROVIDER=mock`, which stores messages and webhook results without sending real WhatsApp traffic.

## Mock Provider

1. Keep `WHATSAPP_PROVIDER=mock`.
2. Start Postgres and Redis with `docker compose up -d postgres redis`.
3. Create a WhatsApp connection from `/settings/whatsapp`.
4. Send a test message from the settings page.
5. Inspect stored messages from `/messages`.

## Twilio Sandbox

1. Set `WHATSAPP_PROVIDER=twilio`.
2. Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_SENDER`.
3. Use a secure tunnel for `POST /api/webhooks/whatsapp/twilio`.
4. Configure the Twilio Sandbox webhook URL to the tunneled endpoint.

## Meta Cloud API

1. Set `WHATSAPP_PROVIDER=meta`.
2. Configure `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_WHATSAPP_VERIFY_TOKEN`, and `META_WHATSAPP_APP_SECRET`.
3. Use `GET /api/webhooks/whatsapp/meta` for verification challenge.
4. Use `POST /api/webhooks/whatsapp/meta` for events.

## Webhook Verification

Twilio requests are checked with `x-twilio-signature`. Meta events are checked with `x-hub-signature-256`, and verification challenges use `hub.verify_token`.

## Jobs and Failures

WhatsApp sends are queued in BullMQ using Redis. Jobs are idempotent by message idempotency key, use exponential retry, and leave failed jobs in Redis for inspection. Stored message rows show `QUEUED`, `SENT`, `DELIVERED`, `READ`, `FAILED`, or `DEAD_LETTER`.

## Compliance

Before production, legal/privacy review is required for consent language, opt-out handling, marketing template usage, data retention, and provider-specific WhatsApp Business policy requirements.
