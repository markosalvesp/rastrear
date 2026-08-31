// Motor de avisos (Netlify): presença + eventos.
// ESCALÁVEL: em vez de 1 consulta por personagem seguido, busca o FEED GLOBAL
// (drops e pvp de todos os players) e cruza com quem cada um segue. Assim o
// trabalho não cresce com o nº de personagens — aguenta o servidor inteiro.
import { getPage } from "./fetcher.js";
import { parseItemLog, parseDuelLog } from "./parsers.js";
import { sendMessage } from "./telegram.js";
import { presenceText, dropText, killText, deathText } from "./events.js";
import {
  loadChats, loadMarks, saveMarks, followersOf, allFollowedNicks, wants,
} from "./subs-store.js";
import { brToday } from "./brdate.js";

const MAX_PAGES = 3; // páginas do feed a varrer por ciclo (para se achar o marcador)
const FLOOD_CAP = 60; // se aparecerem +q isso de novos (ex: após queda), só re-baseia

export async function notifyPresence(chats, connects, disconnects) {
  for (const nick of connects)
    for (const c of followersOf(chats, nick))
      if (wants(chats, c, nick, "connect")) await sendMessage(c, presenceText(nick, "connect"));
  for (const { nick, durationSec } of disconnects)
    for (const c of followersOf(chats, nick))
      if (wants(chats, c, nick, "disconnect")) await sendMessage(c, presenceText(nick, "disconnect", { durationSec }));
}

// Busca o feed (várias páginas se preciso) e devolve os registros mais novos
// que o marcador — em ordem cronológica.
async function fetchFresh(path, params, parser, keyOf, mark) {
  const collected = [];
  let newest = null, hitMark = false;
  for (let page = 1; page <= MAX_PAGES && !hitMark; page++) {
    const parsed = await getPage(path, { ...params, page }).then(parser);
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    if (!rows.length) break;
    if (page === 1) newest = keyOf(rows[0]);
    for (const r of rows) {
      if (mark != null && keyOf(r) === mark) { hitMark = true; break; }
      collected.push(r);
    }
  }
  return { fresh: collected.reverse(), newest, hitMark };
}

// Decide se avisa os eventos novos ou só re-baseia (1ª vez / enxurrada pós-queda).
function shouldBaseline(mark, newest, fresh, hitMark) {
  if (!newest) return { baseline: false, skip: true }; // feed vazio
  if (mark == null) return { baseline: true }; // 1ª vez
  if (!hitMark || fresh.length > FLOOD_CAP) return { baseline: true }; // caiu atrás demais
  if (newest === mark) return { skip: true }; // nada novo
  return { baseline: false };
}

export async function runEventChecks() {
  const chats = await loadChats();
  const followed = new Set(allFollowedNicks(chats)); // nicks (minúsculos) que ALGUÉM segue
  if (!followed.size) return { checked: 0 };
  const marks = await loadMarks();
  const { day, month } = brToday();

  // ---------- DROPS (feed global) ----------
  try {
    const key = (r) => `${r.time}|${(r.nick || "").toLowerCase()}|${r.item}`;
    const { fresh, newest, hitMark } = await fetchFresh("/logs/drops", { day, month, perPage: 50 }, parseItemLog, key, marks.globalDrops);
    const d = shouldBaseline(marks.globalDrops, newest, fresh, hitMark);
    if (!d.skip) {
      if (!d.baseline) {
        for (const r of fresh) {
          const nick = (r.nick || "").toLowerCase();
          if (!followed.has(nick)) continue;
          const text = dropText(r);
          for (const c of followersOf(chats, r.nick)) if (wants(chats, c, r.nick, "drop")) await sendMessage(c, text);
        }
      }
      marks.globalDrops = newest;
      await saveMarks(marks);
    }
  } catch (e) { console.error("global drops:", e.message); }

  // ---------- PVP: kills e mortes (feed global) ----------
  try {
    const key = (r) => `${r.time}|${r.winner}|${r.loser}`;
    const { fresh, newest, hitMark } = await fetchFresh("/rankings/pvp-history", { day, month, perPage: 50 }, parseDuelLog, key, marks.globalPvp);
    const d = shouldBaseline(marks.globalPvp, newest, fresh, hitMark);
    if (!d.skip) {
      if (!d.baseline) {
        for (const r of fresh) {
          const w = (r.winner || "").toLowerCase(), l = (r.loser || "").toLowerCase();
          if (followed.has(w)) { const t = killText(r); for (const c of followersOf(chats, r.winner)) if (wants(chats, c, r.winner, "kill")) await sendMessage(c, t); }
          if (followed.has(l)) { const t = deathText(r); for (const c of followersOf(chats, r.loser)) if (wants(chats, c, r.loser, "death")) await sendMessage(c, t); }
        }
      }
      marks.globalPvp = newest;
      await saveMarks(marks);
    }
  } catch (e) { console.error("global pvp:", e.message); }

  return { checked: followed.size };
}
