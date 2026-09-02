import { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Sticker = {
  file_unique_id: string;
  set_name?: string;
};

type User = {
  id: number;
};

type Chat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
};

type Message = {
  message_id: number;
  text?: string;
  from?: User;
  chat: Chat;
  sticker?: Sticker;
  reply_to_message?: Message;
};

type Update = {
  update_id: number;
  message?: Message;
};

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const ownerUserId = Number(process.env.TELEGRAM_OWNER_USER_ID ?? "1901187181");

if (!botToken || !webhookSecret || !redisUrl || !redisToken) {
  throw new Error("Missing one or more required environment variables");
}

if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
  throw new Error("TELEGRAM_OWNER_USER_ID must be a valid Telegram user ID");
}

const redis = new Redis({ url: redisUrl, token: redisToken });
const telegramBaseUrl = `https://api.telegram.org/bot${botToken}`;

function stickerKey(chatId: number) {
  return `telegram:${chatId}:blocked-stickers`;
}

function packKey(chatId: number) {
  return `telegram:${chatId}:blocked-packs`;
}

function commandFrom(text?: string): string | undefined {
  if (!text?.startsWith("/")) return undefined;
  return text.trim().split(/\s+/, 1)[0].split("@", 1)[0].toLowerCase();
}

async function telegram<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const result = await fetch(`${telegramBaseUrl}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    throw new Error(`Telegram ${method} failed with HTTP ${result.status}`);
  }

  return (await result.json()) as T;
}

async function sendMessage(chatId: number, text: string, replyTo?: number) {
  await telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {})
  });
}

async function handleCommand(message: Message, command: string) {
  const { chat, from, message_id: messageId } = message;

  if (chat.type !== "group" && chat.type !== "supergroup") return;
  if (!from || from.id !== ownerUserId) {
    await sendMessage(chat.id, "Sorry you cant do that, you are not the Goat", messageId);
    return;
  }

  if (command === "/help" || command === "/start") {
    await sendMessage(
      chat.id,
      [
        "Sticker moderator commands:",
        "/blocksticker — reply to one sticker",
        "/unblocksticker — reply to one sticker",
        "/blockpack — reply to a sticker to block its pack",
        "/unblockpack — reply to a sticker to unblock its pack",
        "/blocked — show blocked totals"
      ].join("\n"),
      messageId
    );
    return;
  }

  if (command === "/blocked") {
    const [stickers, packs] = await Promise.all([
      redis.scard(stickerKey(chat.id)),
      redis.scard(packKey(chat.id))
    ]);
    await sendMessage(chat.id, `Blocked stickers: ${stickers}\nBlocked packs: ${packs}`, messageId);
    return;
  }

  const sticker = message.reply_to_message?.sticker;
  if (!sticker) {
    await sendMessage(chat.id, "Reply to a sticker when using that command.", messageId);
    return;
  }

  if (command === "/blocksticker") {
    await redis.sadd(stickerKey(chat.id), sticker.file_unique_id);
    await sendMessage(chat.id, "That sticker is now blocked.", messageId);
  } else if (command === "/unblocksticker") {
    await redis.srem(stickerKey(chat.id), sticker.file_unique_id);
    await sendMessage(chat.id, "That sticker is now allowed.", messageId);
  } else if (command === "/blockpack") {
    if (!sticker.set_name) {
      await sendMessage(chat.id, "This sticker does not belong to a detectable sticker pack.", messageId);
      return;
    }
    await redis.sadd(packKey(chat.id), sticker.set_name);
    await sendMessage(chat.id, "That entire sticker pack is now blocked.", messageId);
  } else if (command === "/unblockpack") {
    if (!sticker.set_name) {
      await sendMessage(chat.id, "This sticker does not belong to a detectable sticker pack.", messageId);
      return;
    }
    await redis.srem(packKey(chat.id), sticker.set_name);
    await sendMessage(chat.id, "That sticker pack is now allowed.", messageId);
  }
}

async function processUpdate(update: Update) {
  const message = update.message;
  if (!message) return;

  const command = commandFrom(message.text);
  const supportedCommands = new Set([
    "/start",
    "/help",
    "/blocked",
    "/blocksticker",
    "/unblocksticker",
    "/blockpack",
    "/unblockpack"
  ]);

  if (command && supportedCommands.has(command)) {
    await handleCommand(message, command);
    return;
  }

  if (!message.sticker) return;

  const checks: Promise<number>[] = [
    redis.sismember(stickerKey(message.chat.id), message.sticker.file_unique_id)
  ];
  if (message.sticker.set_name) {
    checks.push(redis.sismember(packKey(message.chat.id), message.sticker.set_name));
  }

  const blocked = (await Promise.all(checks)).some(Boolean);
  if (blocked) {
    await telegram("deleteMessage", {
      chat_id: message.chat.id,
      message_id: message.message_id
    });
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    return response.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const suppliedSecret = request.headers["x-telegram-bot-api-secret-token"];
  if (suppliedSecret !== webhookSecret) {
    return response.status(401).json({ ok: false, error: "Invalid webhook secret" });
  }

  try {
    await processUpdate(request.body as Update);
  } catch (error) {
    console.error("Failed to process Telegram update", error);
    // Return 200 to prevent Telegram repeatedly delivering a permanently bad update.
  }

  return response.status(200).json({ ok: true });
}
