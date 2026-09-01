// Webhook do Telegram (Netlify). Recebe os comandos e responde. Rota: /api/telegram
import { sendMessage } from "../../lib/telegram.js";
import {
  loadChat, updateChat, follow, unfollow, listFor, setMode, toggleType, eventsFor, toggleBoss,
  mutePvpAll, restorePvpAll,
} from "../../lib/subs-store.js";
import { loadState, getPresenceFrom } from "../../lib/presence-store.js";
import { buildReply } from "../../lib/bot-commands.js";

// Escritas por CHAT (chave separada -> concorrência não apaga ninguém).
const store = {
  follow: (c, n) => updateChat(c, (chat) => follow(chat, n)),
  unfollow: (c, n) => updateChat(c, (chat) => unfollow(chat, n)),
  listWithModes: async (c) => {
    const id = String(c);
    const [chat, presenceState] = await Promise.all([loadChat(id), loadState()]);
    const s = { chats: { [id]: chat || { nicks: [] } } };
    return listFor(s, id).map((n) => ({
      nick: n,
      events: eventsFor(s, id, n),
      onlineNow: getPresenceFrom(presenceState, n).onlineNow,
    }));
  },
  setMode: (c, n, p) => updateChat(c, (chat) => setMode(chat, n, p)),
  toggleType: (c, n, t, on) => updateChat(c, (chat) => toggleType(chat, n, t, on)),
  mutePvpAll: (c) => updateChat(c, (chat) => mutePvpAll(chat)),
  restorePvpAll: (c) => updateChat(c, (chat) => restorePvpAll(chat)),
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
    let reply;
    try {
      // registra o chat (recebe avisos de boss por padrão) — cria a chave se não existir
      await updateChat(msg.chat.id, () => {});
      reply = await buildReply(msg.text, msg.chat.id, store);
    } catch (e) {
      console.error("telegram state:", e);
      // O Telegram tentará entregar o update novamente; não fingimos sucesso
      // quando o comando não foi persistido.
      return new Response("temporary error", { status: 503 });
    }
    try {
      await sendMessage(msg.chat.id, reply);
    } catch (e) {
      // O comando já foi persistido. Pedir retry aqui poderia aplicar comandos
      // não idempotentes (como /boss) uma segunda vez.
      console.error("telegram send:", e);
    }
  }
  return new Response("ok");
};

export const config = { path: "/api/telegram" };
