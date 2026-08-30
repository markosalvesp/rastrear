// Acesse esta rota UMA vez depois do deploy para registrar o webhook do Telegram
// apontando para /api/telegram deste mesmo site. Rota: /api/telegram-setup
export default async (req) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response("Falta a variável TELEGRAM_BOT_TOKEN no Netlify.", { status: 400 });

  const origin = new URL(req.url).origin;
  const webhookUrl = `${origin}/api/telegram`;
  const body = { url: webhookUrl, allowed_updates: ["message"] };
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) body.secret_token = secret;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Response.json({ webhookUrl, telegram: data });
};

export const config = { path: "/api/telegram-setup" };
