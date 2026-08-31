import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Carrega variáveis do .env (token do Telegram) — Node 20.6+
try { process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url))); } catch { /* sem .env: tudo bem */ }

import { getPage } from "./lib/fetcher.js";
import { parseRanking, parseItemLog, parseDuelLog } from "./lib/parsers.js";
import { startTracker, ensureFresh, getPresence } from "./lib/tracker.js";
import { startBot } from "./lib/bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const norm = (s) => String(s || "").trim().toLowerCase();

import { brToday } from "./lib/brdate.js";
function todayDayMonth() {
  return brToday(); // fuso do jogo (Brasília)
}

// Ranking cru (para navegar): /api/ranking?type=pvp&q=&page=1&perPage=25
app.get("/api/ranking", async (req, res) => {
  try {
    const { type = "pvp", q = "", page = 1, perPage = 25, sort = "kills", dir = "desc" } = req.query;
    const html = await getPage(`/rankings/${type}`, { q, page, perPage, sort, dir });
    res.json({ type, rows: parseRanking(html) });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// Painel completo do jogador: /api/player?nick=Fulano&day=30&month=8
app.get("/api/player", async (req, res) => {
  const nick = String(req.query.nick || "").trim();
  if (!nick) return res.status(400).json({ error: "Informe o nick." });

  const def = todayDayMonth();
  const day = req.query.day || def.day;
  const month = req.query.month || def.month;
  const nn = norm(nick);

  // Cada bloco é independente: se um falhar, os outros ainda vêm.
  const tasks = {
    pvp: () => getPage("/rankings/pvp", { q: nick, perPage: 25 }).then(parseRanking),
    // Histórico PvP: filtra por nick no servidor e traz vencedor vs perdedor (confrontos do dia)
    duel: () =>
      getPage("/rankings/pvp-history", { q: nick, day, month, perPage: 100 }).then(parseDuelLog),
    drops: () => getPage("/logs/drops", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
    boss: () => getPage("/logs/boss", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
    craft: () => getPage("/logs/craft", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
    aging: () => getPage("/logs/aging", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
    mix: () => getPage("/logs/mix", { q: nick, day, month, perPage: 50 }).then(parseItemLog),
  };

  // Presença (online agora + histórico de conexão rastreado por nós)
  await ensureFresh().catch(() => {});
  const presence = getPresence(nick);

  const entries = Object.entries(tasks);
  const settled = await Promise.allSettled(entries.map(([, fn]) => fn()));
  const out = {};
  const errors = {};
  settled.forEach((r, i) => {
    const key = entries[i][0];
    if (r.status === "fulfilled") out[key] = r.value;
    else errors[key] = String(r.reason?.message || r.reason);
  });

  // PvP: linha do próprio jogador (match exato, senão a primeira)
  const pvpRows = out.pvp || [];
  const pvpSelf = pvpRows.find((r) => norm(r.nick) === nn) || pvpRows[0] || null;

  // Duelos do dia: separa em "morreu para" (perdeu) e "matou" (venceu)
  const duels = out.duel || [];
  const deaths = duels.filter((d) => norm(d.loser) === nn); // morreu -> quem matou = winner
  const kills = duels.filter((d) => norm(d.winner) === nn);

  res.json({
    nick,
    date: { day: Number(day), month: Number(month) },
    presence,
    pvp: { self: pvpSelf, matches: pvpRows },
    duels: {
      deaths, // para quem ele morreu
      kills, // quem ele matou
      note:
        "Confrontos vêm do Histórico PvP do dia selecionado (janela recente). Troque a data para ver outros dias.",
    },
    drops: out.drops || { rows: [] },
    boss: out.boss || { rows: [] },
    craft: out.craft || { rows: [] },
    aging: out.aging || { rows: [] },
    mix: out.mix || { rows: [] },
    errors: Object.keys(errors).length ? errors : undefined,
  });
});

// Status online de vários nicks (para os "bonecos" salvos): /api/online?nicks=a,b,c
app.get("/api/online", async (req, res) => {
  try {
    await ensureFresh();
    const list = String(req.query.nicks || req.query.nick || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const players = {};
    let meta = { liveCount: 0, lastPoll: 0, trackingSince: null };
    for (const nick of list) {
      const p = getPresence(nick);
      players[nick] = { onlineNow: p.onlineNow, since: p.since, sinceExact: p.sinceExact, lastDisconnect: p.lastDisconnect };
      meta = { liveCount: p.liveCount, lastPoll: p.lastPoll, trackingSince: p.trackingSince };
    }
    if (!list.length) { const p = getPresence(""); meta = { liveCount: p.liveCount, lastPoll: p.lastPoll, trackingSince: p.trackingSince }; }
    res.json({ ...meta, players });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Destiny Tale Lookup rodando em:  http://localhost:${PORT}\n`);
  startTracker(); // começa a rastrear presença (conexões/desconexões)
  startBot();     // bot do Telegram (comandos + avisos)
});
