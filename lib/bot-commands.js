// Lógica dos comandos do bot, compartilhada entre local (long polling) e Netlify (webhook).
// `store` abstrai o armazenamento (subs.js local ou subs-store.js/Blobs no Netlify).
import { PRESETS, parseType, EVENT_LABEL, describeEvents, HELP } from "./prefs.js";
import { scheduleText } from "./bosses.js";

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
const hhmm = (ms) => (ms ? new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export async function buildReply(text, chatId, store) {
  text = String(text || "").trim();
  if (!text.startsWith("/")) return HELP;
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const parts = rest.filter(Boolean);
  const nick = parts[0] || "";
  const extra = (parts[1] || "").toLowerCase();

  if (cmd === "/start" || cmd === "/help" || cmd === "/ajuda") return HELP;

  if (cmd === "/seguir" || cmd === "/add") {
    if (!nick) return "Use: <code>/seguir NICK</code>";
    const added = await store.follow(chatId, nick);
    return added
      ? `✅ Agora você segue <b>${esc(nick)}</b>.\nModo: 🛡️ AFK (avisa <b>morte</b>, <b>queda</b> e <b>drop</b>). Pra receber tudo: <code>/modo ${esc(nick)} tudo</code>.`
      : `Você já seguia <b>${esc(nick)}</b>.`;
  }
  if (cmd === "/parar" || cmd === "/remover") {
    if (!nick) return "Use: <code>/parar NICK</code>";
    return (await store.unfollow(chatId, nick))
      ? `🚫 Parou de seguir <b>${esc(nick)}</b>.`
      : `Você não seguia <b>${esc(nick)}</b>.`;
  }
  if (cmd === "/lista" || cmd === "/list") {
    const items = await store.listWithModes(chatId);
    if (!items.length) return "Você ainda não segue ninguém. Use <code>/seguir NICK</code>.";
    return "⭐ Seus bonecos:\n" + items.map((it) => `• <b>${esc(it.nick)}</b> — ${describeEvents(it.events)}`).join("\n");
  }
  if (cmd === "/modo") {
    if (!nick || !PRESETS[extra]) return "Use: <code>/modo NICK afk|tudo|pvp|drops</code>";
    await store.setMode(chatId, nick, extra);
    return `✅ <b>${esc(nick)}</b> agora no modo ${describeEvents(PRESETS[extra])}.`;
  }
  if (cmd === "/mutar" || cmd === "/avisar") {
    const on = cmd === "/avisar";
    const type = parseType(extra);
    if (!nick || !type) return `Use: <code>${cmd} NICK tipo</code>\n<i>tipos: kills, mortes, drops, conexão, desconexão</i>`;
    const ok = await store.toggleType(chatId, nick, type, on);
    if (!ok) return `Você não segue <b>${esc(nick)}</b>. Use <code>/seguir ${esc(nick)}</code> primeiro.`;
    return `${on ? "🔔 Ligado" : "🔕 Desligado"}: <b>${EVENT_LABEL[type]}</b> de <b>${esc(nick)}</b>.`;
  }
  if (cmd === "/bosses" || cmd === "/agenda") {
    return scheduleText();
  }
  if (cmd === "/boss") {
    const on = await store.toggleBoss(chatId);
    return on
      ? "🐉 <b>Avisos de boss LIGADOS!</b>\nVocê vai receber <b>5 min</b> e <b>1 min</b> antes de cada boss nascer.\n\nVer agenda: <code>/bosses</code> · Desligar: <code>/boss</code>"
      : "🔕 Avisos de boss <b>desligados</b>. (Ligar de novo: <code>/boss</code>)";
  }
  if (cmd === "/status") {
    if (!nick) return "Use: <code>/status NICK</code>";
    const p = await store.presence(nick);
    const linha = p.onlineNow
      ? "🟢 <b>Online agora</b>" + (p.sinceExact ? ` (desde ${hhmm(p.since)})` : "")
      : "🔴 <b>Offline</b>" + (p.lastDisconnect ? ` — visto ${hhmm(p.lastDisconnect)}` : "");
    return `<b>${esc(nick)}</b>\n${linha}`;
  }
  return "Não entendi.\n\n" + HELP;
}
