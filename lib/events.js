// Lógica pura de mensagens de evento (sem I/O) — usada pelo bot local e pelo Netlify.
export const esc = (s) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
export const dur = (sec) => {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}m` : `${m}min`;
};

export function presenceText(nick, kind, info = {}) {
  return kind === "connect"
    ? `🟢 <b>${esc(nick)}</b> conectou`
    : `🔴 <b>${esc(nick)}</b> desconectou` + (info.durationSec ? ` — ficou ${dur(info.durationSec)} online` : "");
}

const MAX_BURST = 8;

// Compara as linhas (mais nova primeiro) com o último marcador e devolve as
// mensagens novas + o novo marcador. Na 1ª vez (mark vazio) não gera mensagem.
export function diffLog(rows, keyOf, msgOf, mark) {
  if (!rows || !rows.length) return { messages: [], newMark: mark };
  const newestKey = keyOf(rows[0]);
  if (mark === undefined || mark === null) return { messages: [], newMark: newestKey };
  if (mark === newestKey) return { messages: [], newMark: mark };
  const fresh = [];
  for (const r of rows) { if (keyOf(r) === mark) break; fresh.push(r); }
  const messages = fresh.slice(0, MAX_BURST).reverse().map(msgOf);
  return { messages, newMark: newestKey };
}

// Cada mensagem carrega { type, text } pra poder filtrar por preferência do seguidor.
export function dropsDiff(nick, rows, mark) {
  return diffLog(rows, (r) => `${r.time}|${r.item}`, (r) => ({
    type: "drop",
    text: `🎁 <b>${esc(nick)}</b> dropou <b>${esc(r.item)}</b>${r.map ? ` <i>(${esc(r.map)})</i>` : ""} — ${esc(r.time || "")}`,
  }), mark);
}

export function pvpDiff(nick, rows, mark) {
  const n = String(nick).trim().toLowerCase();
  return diffLog(rows, (r) => `${r.time}|${r.winner}|${r.loser}`, (r) =>
    String(r.loser || "").toLowerCase() === n
      ? { type: "death", text: `💀 <b>${esc(nick)}</b> morreu para <b>${esc(r.winner)}</b> (${esc(r.winnerClass || "?")}) — ${esc(r.time || "")}` }
      : { type: "kill", text: `⚔️ <b>${esc(nick)}</b> matou <b>${esc(r.loser)}</b> (${esc(r.loserClass || "?")}) — ${esc(r.time || "")}` }, mark);
}
