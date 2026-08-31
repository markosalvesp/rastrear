// Preferências de avisos por personagem (tipos de evento + presets).
export const ALL_EVENTS = ["connect", "disconnect", "kill", "death", "drop"];

export const PRESETS = {
  tudo: ["connect", "disconnect", "kill", "death", "drop"],
  afk: ["death", "disconnect", "drop"], // corre pro PC: morte + queda + o que dropou
  pvp: ["kill", "death"],
  drops: ["drop"],
};

// Modo padrão ao seguir um boneco (ideal AFK: morte + queda + drop).
export const DEFAULT_EVENTS = PRESETS.afk;

export const EVENT_LABEL = {
  connect: "conexão",
  disconnect: "desconexão",
  kill: "kills",
  death: "mortes",
  drop: "drops",
};

const PRESET_EMOJI = { tudo: "📢", afk: "🛡️", pvp: "⚔️", drops: "🎁", custom: "🎚️" };

// Nome do modo a partir do conjunto de eventos (bate com um preset, senão "custom").
export function modeLabel(events) {
  const s = new Set(events);
  for (const [name, ev] of Object.entries(PRESETS)) {
    if (ev.length === s.size && ev.every((e) => s.has(e))) return name;
  }
  return "custom";
}
export const modeEmoji = (name) => PRESET_EMOJI[name] || "🎚️";

// Descreve os eventos ativos em texto (pra /lista).
export function describeEvents(events) {
  const name = modeLabel(events);
  if (name !== "custom") return `${modeEmoji(name)} ${name.toUpperCase()}`;
  const parts = ALL_EVENTS.filter((e) => events.includes(e)).map((e) => EVENT_LABEL[e]);
  return `🎚️ ${parts.join(", ") || "nada"}`;
}

export const HELP =
  "🎯 <b>Rastreador Destiny</b>\n\n" +
  "<b>Seguir</b>\n" +
  "• <code>/seguir NICK</code> — acompanhar (já entra em 🛡️ AFK)\n" +
  "• <code>/parar NICK</code> — parar\n" +
  "• <code>/lista</code> — seus bonecos e modos\n" +
  "• <code>/status NICK</code> — consultar agora\n\n" +
  "<b>Modos</b> (por boneco)\n" +
  "• <code>/modo NICK afk</code> 🛡️ — morte, queda e drop (ideal AFK)\n" +
  "• <code>/modo NICK tudo</code> 📢 — tudo\n" +
  "• <code>/modo NICK pvp</code> ⚔️ — kills e mortes\n" +
  "• <code>/modo NICK drops</code> 🎁 — só drops\n\n" +
  "<b>Bosses</b> 🐉 <i>(já vêm ligados)</i>\n" +
  "• <code>/bosses</code> — ver a agenda dos bosses\n" +
  "• <code>/boss</code> — desligar (ou religar) os avisos de boss\n\n" +
  "<b>Ajuste fino</b>\n" +
  "• <code>/mutar NICK kills</code> — desliga um tipo\n" +
  "• <code>/avisar NICK kills</code> — liga um tipo\n" +
  "  <i>tipos: kills, mortes, drops, conexão, desconexão</i>";

// Mapeia palavra em PT -> tipo de evento (pra /mutar e /avisar).
export function parseType(word) {
  const w = String(word || "").toLowerCase();
  if (["kill", "kills", "matar", "matou", "abate", "abates"].includes(w)) return "kill";
  if (["morte", "mortes", "morrer", "morreu", "death", "deaths"].includes(w)) return "death";
  if (["drop", "drops", "item", "itens"].includes(w)) return "drop";
  if (["conexao", "conexão", "conectar", "conectou", "connect", "online"].includes(w)) return "connect";
  if (["desconexao", "desconexão", "desconectar", "desconectou", "disconnect", "offline", "queda"].includes(w)) return "disconnect";
  return null;
}
