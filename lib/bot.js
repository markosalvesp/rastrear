// Bot do Telegram (modo long polling, para rodar local).
// Comandos: /start, /seguir NICK, /parar NICK, /lista, /status NICK
import { getUpdates, sendMessage, hasToken, deleteWebhook } from "./telegram.js";
import { follow, unfollow, listFor } from "./subs.js";
import { getPresence } from "./tracker.js";

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmm = (ms) => (ms ? new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

let offset = 0;
let running = false;

const HELP =
  "🎯 <b>Rastreador Destiny</b>\n\n" +
  "Comandos:\n" +
  "• <code>/seguir NICK</code> — acompanhar um boneco\n" +
  "• <code>/parar NICK</code> — parar de acompanhar\n" +
  "• <code>/lista</code> — ver quem você segue\n" +
  "• <code>/status NICK</code> — consultar agora\n\n" +
  "Você recebe aviso quando o boneco <b>conecta, desconecta, morre, mata ou dropa</b>.";

async function handle(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (!text.startsWith("/")) { await sendMessage(chatId, HELP); return; }
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();

  if (cmd === "/start" || cmd === "/help" || cmd === "/ajuda") {
    await sendMessage(chatId, HELP);
  } else if (cmd === "/seguir" || cmd === "/add") {
    if (!arg) return void (await sendMessage(chatId, "Use: <code>/seguir NICK</code>"));
    const added = follow(chatId, arg);
    await sendMessage(chatId, added ? `✅ Agora você segue <b>${esc(arg)}</b>.` : `Você já seguia <b>${esc(arg)}</b>.`);
  } else if (cmd === "/parar" || cmd === "/remover") {
    if (!arg) return void (await sendMessage(chatId, "Use: <code>/parar NICK</code>"));
    const removed = unfollow(chatId, arg);
    await sendMessage(chatId, removed ? `🚫 Parou de seguir <b>${esc(arg)}</b>.` : `Você não seguia <b>${esc(arg)}</b>.`);
  } else if (cmd === "/lista" || cmd === "/list") {
    const nicks = listFor(chatId);
    await sendMessage(chatId, nicks.length ? "⭐ Seus bonecos:\n" + nicks.map((n) => "• " + esc(n)).join("\n") : "Você ainda não segue ninguém. Use <code>/seguir NICK</code>.");
  } else if (cmd === "/status") {
    if (!arg) return void (await sendMessage(chatId, "Use: <code>/status NICK</code>"));
    const p = getPresence(arg);
    const linha = p.onlineNow
      ? "🟢 <b>Online agora</b>" + (p.sinceExact ? ` (desde ${hhmm(p.since)})` : "")
      : "🔴 <b>Offline</b>" + (p.lastDisconnect ? ` — visto ${hhmm(p.lastDisconnect)}` : "");
    await sendMessage(chatId, `<b>${esc(arg)}</b>\n${linha}`);
  } else {
    await sendMessage(chatId, "Não entendi. " + HELP);
  }
}

async function loop() {
  while (running) {
    try {
      const updates = await getUpdates(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) await handle(u.message).catch((e) => console.error("handle:", e.message));
      }
    } catch (e) {
      console.error("getUpdates:", e.message);
      await sleep(3000);
    }
  }
}

export function startBot() {
  if (!hasToken()) { console.log("  (Telegram desativado — sem TELEGRAM_BOT_TOKEN)"); return; }
  if (running) return;
  running = true;
  console.log("  Bot do Telegram ativo.");
  deleteWebhook().finally(loop); // garante long polling (remove webhook do Netlify, se houver)
}
