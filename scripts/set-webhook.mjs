const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBHOOK_URL } = process.env;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !WEBHOOK_URL) {
  console.error(
    "Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and WEBHOOK_URL before running this script."
  );
  process.exit(1);
}

const response = await fetch(
  `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"]
    })
  }
);

const result = await response.json();
console.log(JSON.stringify(result, null, 2));

if (!response.ok || !result.ok) process.exit(1);
