// Webhook do Telegram (Netlify). Recebe os comandos e responde. Rota: /api/telegram
import { sendMessage } from "../../lib/telegram.js";
import {
  loadChats, updateChat, follow, unfollow, listFor, setMode, toggleType, eventsFor, toggleBoss,
} from "../../lib/subs-store.js";
import { loadState, getPresenceFrom } from "../../lib/presence-store.js";
import { buildReply } from "../../lib/bot-commands.js";

// Escritas por CHAT (chave separada -> concorrência não apaga ninguém).
const store = {
  follow: (c, n) => updateChat(c, (chat) => follow(chat, n)),
  unfollow: (c, n) => updateChat(c, (chat) => unfollow(chat, n)),
  listWithModes: async (c) => { const s = await loadChats(); return listFor(s, c).map((n) => ({ nick: n, events: eventsFor(s, c, n) })); },
  setMode: (c, n, p) => updateChat(c, (chat) => setMode(chat, n, p)),
  toggleType: (c, n, t, on) => updateChat(c, (chat) => toggleType(chat, n, t, on)),
  toggleBoss: (c) => updateChat(c, (chat) => toggleBoss(chat)),
  presence: async (n) => getPresenceFrom(await loadState(), n),
};

export default async (req) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  let update;
  try { update = await req.json(); } catch { return new Response("ok"); }
  const msg = update.message;
  if (msg && msg.text) {
    try {
      // registra o chat (recebe avisos de boss por padrão) — cria a chave se não existir
      await updateChat(msg.chat.id, () => {});
      await sendMessage(msg.chat.id, await buildReply(msg.text, msg.chat.id, store));
    } catch (e) { console.error("telegram webhook:", e.message); }
  }
  return new Response("ok");
};

export const config = { path: "/api/telegram" };
