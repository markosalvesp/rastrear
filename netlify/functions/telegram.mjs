// Webhook do Telegram (Netlify). Recebe os comandos e responde.
// O Telegram faz POST aqui a cada mensagem. Rota: /api/telegram
import { sendMessage } from "../../lib/telegram.js";
import { loadChats, saveChats, follow, unfollow, listFor } from "../../lib/subs-store.js";
import { loadState, getPresenceFrom } from "../../lib/presence-store.js";

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
const hhmm = (ms) => (ms ? new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

const HELP =
  "🎯 <b>Rastreador Destiny</b>\n\n" +
  "Comandos:\n" +
  "• <code>/seguir NICK</code> — acompanhar um boneco\n" +
  "• <code>/parar NICK</code> — parar de acompanhar\n" +
  "• <code>/lista</code> — ver quem você segue\n" +
  "• <code>/status NICK</code> — consultar agora\n\n" +
  "Você recebe aviso quando o boneco <b>conecta, desconecta, morre, mata ou dropa</b>.";

export default async (req) => {
  // segurança opcional: valida o secret do webhook se configurado
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  let update;
  try { update = await req.json(); } catch { return new Response("ok"); }
  const msg = update.message;
  if (!msg || !msg.text) return new Response("ok");

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();

  try {
    if (cmd === "/start" || cmd === "/help" || cmd === "/ajuda") {
      await sendMessage(chatId, HELP);
    } else if (cmd === "/seguir" || cmd === "/add") {
      if (!arg) await sendMessage(chatId, "Use: <code>/seguir NICK</code>");
      else {
        const s = await loadChats();
        const added = follow(s, chatId, arg);
        if (added) await saveChats(s);
        await sendMessage(chatId, added ? `✅ Agora você segue <b>${esc(arg)}</b>.` : `Você já seguia <b>${esc(arg)}</b>.`);
      }
    } else if (cmd === "/parar" || cmd === "/remover") {
      if (!arg) await sendMessage(chatId, "Use: <code>/parar NICK</code>");
      else {
        const s = await loadChats();
        const removed = unfollow(s, chatId, arg);
        if (removed) await saveChats(s);
        await sendMessage(chatId, removed ? `🚫 Parou de seguir <b>${esc(arg)}</b>.` : `Você não seguia <b>${esc(arg)}</b>.`);
      }
    } else if (cmd === "/lista" || cmd === "/list") {
      const nicks = listFor(await loadChats(), chatId);
      await sendMessage(chatId, nicks.length ? "⭐ Seus bonecos:\n" + nicks.map((n) => "• " + esc(n)).join("\n") : "Você ainda não segue ninguém. Use <code>/seguir NICK</code>.");
    } else if (cmd === "/status") {
      if (!arg) await sendMessage(chatId, "Use: <code>/status NICK</code>");
      else {
        const p = getPresenceFrom(await loadState(), arg);
        const linha = p.onlineNow
          ? "🟢 <b>Online agora</b>" + (p.sinceExact ? ` (desde ${hhmm(p.since)})` : "")
          : "🔴 <b>Offline</b>" + (p.lastDisconnect ? ` — visto ${hhmm(p.lastDisconnect)}` : "");
        await sendMessage(chatId, `<b>${esc(arg)}</b>\n${linha}`);
      }
    } else {
      await sendMessage(chatId, "Não entendi. " + HELP);
    }
  } catch (e) {
    console.error("telegram webhook:", e.message);
  }
  return new Response("ok");
};

export const config = { path: "/api/telegram" };
