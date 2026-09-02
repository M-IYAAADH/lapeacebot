# Telegram Sticker Moderator

A Telegram group bot that automatically deletes selected stickers or entire
sticker packs. It runs as Vercel serverless functions, receives updates through
a secured Telegram webhook, and stores blocklists in Upstash Redis.

## Commands

Only Telegram user ID `1901187181` can use these commands. The owner ID can be
changed with the `TELEGRAM_OWNER_USER_ID` environment variable. Anyone else who
tries receives: `Sorry you cant do that, you are not the Goat`.

- `/blocksticker` — reply to a sticker to block that exact sticker
- `/unblocksticker` — reply to a sticker to allow it again
- `/blockpack` — reply to a sticker to block its entire pack
- `/unblockpack` — reply to a sticker to allow its pack again
- `/blocked` — show the number of blocked stickers and packs
- `/help` — show command help

The bot remembers sticker message IDs it observes for up to 48 hours. When a
sticker or pack is blocked, it immediately removes matching recent messages as
well as deleting future occurrences. Telegram's Bot API does not let bots fetch
arbitrary historical group messages, so messages sent before this tracking
version was deployed cannot be discovered automatically; the sticker directly
replied to is still deleted.

## 1. Create the Telegram bot

1. Open `@BotFather` in Telegram.
2. Run `/newbot` and copy the bot token.
3. Add the bot to your group.
4. Promote it to administrator and enable **Delete messages**.

An administrator bot receives group messages, so disabling privacy mode is not
normally necessary. If the bot cannot see stickers, open BotFather, use
`/setprivacy`, select the bot, and choose **Disable**.

## 2. Create Redis storage

In Vercel, open **Storage / Marketplace**, create an Upstash Redis database,
and connect it to the project. Vercel should add:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## 3. Deploy to Vercel

Import this folder into a GitHub repository and then import that repository in
Vercel, or run `npx vercel` from this folder.

Add these environment variables to Production:

- `TELEGRAM_BOT_TOKEN` — token received from BotFather
- `TELEGRAM_WEBHOOK_SECRET` — a random value containing only letters, numbers,
  `_` and `-`
- `TELEGRAM_OWNER_USER_ID` — set this to `1901187181`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Generate a suitable secret locally:

```bash
openssl rand -hex 32
```

Redeploy after adding or changing environment variables. Confirm the deployment
is healthy at `https://YOUR-PROJECT.vercel.app/api/health`.

## 4. Register the webhook

From the project directory, run:

```bash
TELEGRAM_BOT_TOKEN='your-token' \
TELEGRAM_WEBHOOK_SECRET='your-secret' \
WEBHOOK_URL='https://YOUR-PROJECT.vercel.app/api/webhook' \
npm run set-webhook
```

Telegram should return `{"ok":true,"result":true,...}`.

You can inspect the current webhook status without exposing the response to
other people:

```bash
curl "https://api.telegram.org/botYOUR_TOKEN/getWebhookInfo"
```

## 5. Use it

In the group, reply to the unwanted sticker with `/blocksticker`. Recent tracked
uses and the replied-to message will be removed, and future uses of that exact
sticker will be deleted. Use `/blockpack` instead if every sticker from its pack
should be deleted.

## Security notes

- Never commit `.env`, `.env.local`, or the bot token.
- The webhook verifies Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- Blocklists are isolated by Telegram chat ID, so the same deployment can serve
  multiple groups.
- Only the configured owner (`1901187181` by default) can use bot commands or
  modify and inspect blocklists. The owner does not need to be a group admin,
  although the bot itself must be an admin with permission to delete messages.
- Telegram bots can generally delete eligible messages sent less than 48 hours
  ago; this bot deletes blocked stickers immediately.

## Local checking

```bash
npm install
npm run typecheck
```

For full local webhook testing, use `vercel dev` plus an HTTPS tunnel. For normal
use, deploying first and registering the production webhook is simpler.
