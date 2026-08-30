// Função sob demanda: painel completo do jogador.
// Rota: /api/player?nick=&day=&month=
import { getPage } from "../../lib/fetcher.js";
import { parseRanking, parseItemLog, parseDuelLog } from "../../lib/parsers.js";
import { loadState, getPresenceFrom } from "../../lib/presence-store.js";

const norm = (s) => String(s || "").trim().toLowerCase();

export default async (req) => {
  const url = new URL(req.url);
  const nick = (url.searchParams.get("nick") || "").trim();
  if (!nick) return Response.json({ error: "Informe o nick." }, { status: 400 });

  const d = new Date();
  const day = url.searchParams.get("day") || d.getDate();
  const month = url.searchParams.get("month") || d.getMonth() + 1;
  const nn = norm(nick);

  const tasks = {
    pvp: () => getPage("/rankings/pvp", { q: nick, perPage: 25 }).then(parseRanking),
    duel: () =>
      getPage("/rankings/pvp-history", { q: nick, day, month, perPage: 100 }).then(parseDuelLog),
    drops: () => getPage("/logs/drops", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
    boss: () => getPage("/logs/boss", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
    craft: () => getPage("/logs/craft", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
    aging: () => getPage("/logs/aging", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
    mix: () => getPage("/logs/mix", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
  };

  // presença (histórico coletado pela função agendada)
  let presence = null;
  try {
    presence = getPresenceFrom(await loadState(), nick);
  } catch {
    presence = null;
  }

  const entries = Object.entries(tasks);
  const settled = await Promise.allSettled(entries.map(([, fn]) => fn()));
  const out = {};
  const errors = {};
  settled.forEach((r, i) => {
    const key = entries[i][0];
    if (r.status === "fulfilled") out[key] = r.value;
    else errors[key] = String(r.reason?.message || r.reason);
  });

  const pvpRows = out.pvp || [];
  const pvpSelf = pvpRows.find((r) => norm(r.nick) === nn) || pvpRows[0] || null;

  const duels = out.duel || [];
  const deaths = duels.filter((x) => norm(x.loser) === nn);
  const kills = duels.filter((x) => norm(x.winner) === nn);

  return Response.json({
    nick,
    date: { day: Number(day), month: Number(month) },
    presence,
    pvp: { self: pvpSelf, matches: pvpRows },
    duels: { deaths, kills },
    drops: out.drops || { rows: [] },
    boss: out.boss || { rows: [] },
    craft: out.craft || { rows: [] },
    aging: out.aging || { rows: [] },
    mix: out.mix || { rows: [] },
    errors: Object.keys(errors).length ? errors : undefined,
  });
};

export const config = { path: "/api/player" };
