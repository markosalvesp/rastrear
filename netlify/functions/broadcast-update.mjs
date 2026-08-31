// Broadcast temporário, autenticado e com texto fixo.
import { loadChats } from "../../lib/subs-store.js";
import { sendMessage } from "../../lib/telegram.js";

const MESSAGE = "Se inscreva novamente no bot para atualizar!";

async function checkChat(chatId) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const response = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId }),
  });
  const data = await response.json().catch(() => ({}));
  return { chatId, acessivel: data.ok === true, erro: data.ok ? null : (data.description || String(response.status)) };
}

export default async (req) => {
  const auth = req.headers.get("authorization") || "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!key || (key !== process.env.CRON_SECRET && key !== process.env.TELEGRAM_BOT_TOKEN)) {
    return new Response("forbidden", { status: 403 });
  }

  const { chats } = await loadChats();
  const chatIds = Object.keys(chats);

  if (req.method === "GET") {
    return Response.json({ chats: await Promise.all(chatIds.map(checkChat)) });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const results = await Promise.all(chatIds.map((chatId) => sendMessage(chatId, MESSAGE)));

  return Response.json({
    inscritos: chatIds.length,
    enviados: results.filter(Boolean).length,
    falharam: results.filter((sent) => !sent).length,
  });
};

export const config = { path: "/api/broadcast-update" };
