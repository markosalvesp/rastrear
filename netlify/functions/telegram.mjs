// Webhook do Telegram (Netlify). Recebe os comandos e responde. Rota: /api/telegram
import { sendMessage } from "../../lib/telegram.js";
import {
  loadChats, updateChats, follow, unfollow, listFor, setMode, toggleType, eventsFor, toggleBoss, touchChat,
} from "../../lib/subs-store.js";
import { loadState, getPresenceFrom } from "../../lib/presence-store.js";
import { buildReply } from "../../lib/bot-commands.js";

// Escritas ATÔMICAS (não apagam a lista); leituras simples.
const store = {
  follow: async (c, n) => (await updateChats((s) => follow(s, c, n))).result,
  unfollow: async (c, n) => (await updateChats((s) => unfollow(s, c, n))).result,
  listWithModes: async (c) => { const s = await loadChats(); return listFor(s, c).map((n) => ({ nick: n, events: eventsFor(s, c, n) })); },
  setMode: async (c, n, p) => (await updateChats((s) => setMode(s, c, n, p))).result,
  toggleType: async (c, n, t, on) => (await updateChats((s) => toggleType(s, c, n, t, on))).result,
  toggleBoss: async (c) => (await updateChats((s) => toggleBoss(s, c))).result,
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
      // registra o chat (recebe avisos de boss por padrão) — atômico
      await updateChats((s) => touchChat(s, msg.chat.id));
      await sendMessage(msg.chat.id, await buildReply(msg.text, msg.chat.id, store));
    } catch (e) { console.error("telegram webhook:", e.message); }
  }
  return new Response("ok");
};

export const config = { path: "/api/telegram" };
