// Webhook do Telegram (Netlify). Recebe os comandos e responde. Rota: /api/telegram
import { sendMessage } from "../../lib/telegram.js";
import {
  loadChats, saveChats, follow, unfollow, listFor, setMode, toggleType, eventsFor, toggleBoss, touchChat,
} from "../../lib/subs-store.js";
import { loadState, getPresenceFrom } from "../../lib/presence-store.js";
import { buildReply } from "../../lib/bot-commands.js";

// Armazenamento no Blobs: cada operação carrega e (se mudou) salva.
const store = {
  follow: async (c, n) => { const s = await loadChats(); const r = follow(s, c, n); if (r) await saveChats(s); return r; },
  unfollow: async (c, n) => { const s = await loadChats(); const r = unfollow(s, c, n); if (r) await saveChats(s); return r; },
  listWithModes: async (c) => { const s = await loadChats(); return listFor(s, c).map((n) => ({ nick: n, events: eventsFor(s, c, n) })); },
  setMode: async (c, n, p) => { const s = await loadChats(); const r = setMode(s, c, n, p); if (r) await saveChats(s); return r; },
  toggleType: async (c, n, t, on) => { const s = await loadChats(); const r = toggleType(s, c, n, t, on); if (r) await saveChats(s); return r; },
  toggleBoss: async (c) => { const s = await loadChats(); const r = toggleBoss(s, c); await saveChats(s); return r; },
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
      // registra o chat (recebe avisos de boss por padrão)
      const s = await loadChats();
      if (touchChat(s, msg.chat.id)) await saveChats(s);
      await sendMessage(msg.chat.id, await buildReply(msg.text, msg.chat.id, store));
    } catch (e) { console.error("telegram webhook:", e.message); }
  }
  return new Response("ok");
};

export const config = { path: "/api/telegram" };
