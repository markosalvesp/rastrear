// Motor de avisos (Netlify): monta as mensagens (NÃO envia — quem envia é a fila).
// ESCALÁVEL: busca o FEED GLOBAL (drops/pvp de todos) e cruza com quem cada um segue.
import { getPage } from "./fetcher.js";
import { parseItemLog, parseDuelLog } from "./parsers.js";
import { presenceText, dropText, killText, deathText } from "./events.js";
import { loadMarks, saveMarks, followersOf, allFollowedNicks, wants } from "./subs-store.js";
import { brToday } from "./brdate.js";

const MAX_PAGES = 3;
const FLOOD_CAP = 60;

// Presença -> lista de mensagens {chat, text}
export function buildPresence(chats, connects, disconnects) {
  const out = [];
  for (const nick of connects)
    for (const c of followersOf(chats, nick))
      if (wants(chats, c, nick, "connect")) out.push({ chat: c, text: presenceText(nick, "connect") });
  for (const { nick, durationSec } of disconnects)
    for (const c of followersOf(chats, nick))
      if (wants(chats, c, nick, "disconnect")) out.push({ chat: c, text: presenceText(nick, "disconnect", { durationSec }) });
  return out;
}

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

function decide(mark, newest, fresh, hitMark) {
  if (!newest) return { skip: true };
  if (mark == null) return { baseline: true };
  if (!hitMark || fresh.length > FLOOD_CAP) return { baseline: true };
  if (newest === mark) return { skip: true };
  return {};
}

// Eventos (drops + pvp) do feed global -> lista de mensagens {chat, text}. Avança marcadores.
export async function buildEvents(chats) {
  const out = [];
  const followed = new Set(allFollowedNicks(chats));
  if (!followed.size) return out;
  const marks = await loadMarks();
  const { day, month } = brToday();

  // DROPS
  try {
    const key = (r) => `${r.time}|${(r.nick || "").toLowerCase()}|${r.item}`;
    const { fresh, newest, hitMark } = await fetchFresh("/logs/drops", { day, month, perPage: 50 }, parseItemLog, key, marks.globalDrops);
    const d = decide(marks.globalDrops, newest, fresh, hitMark);
    if (!d.skip) {
      if (!d.baseline)
        for (const r of fresh) {
          const nick = (r.nick || "").toLowerCase();
          if (!followed.has(nick)) continue;
          const text = dropText(r);
          for (const c of followersOf(chats, r.nick)) if (wants(chats, c, r.nick, "drop")) out.push({ chat: c, text });
        }
      marks.globalDrops = newest;
      await saveMarks(marks);
    }
  } catch (e) { console.error("global drops:", e.message); }

  // PVP (kills e mortes)
  try {
    const key = (r) => `${r.time}|${r.winner}|${r.loser}`;
    const { fresh, newest, hitMark } = await fetchFresh("/rankings/pvp-history", { day, month, perPage: 50 }, parseDuelLog, key, marks.globalPvp);
    const d = decide(marks.globalPvp, newest, fresh, hitMark);
    if (!d.skip) {
      if (!d.baseline)
        for (const r of fresh) {
          const w = (r.winner || "").toLowerCase(), l = (r.loser || "").toLowerCase();
          if (followed.has(w)) { const t = killText(r); for (const c of followersOf(chats, r.winner)) if (wants(chats, c, r.winner, "kill")) out.push({ chat: c, text: t }); }
          if (followed.has(l)) { const t = deathText(r); for (const c of followersOf(chats, r.loser)) if (wants(chats, c, r.loser, "death")) out.push({ chat: c, text: t }); }
        }
      marks.globalPvp = newest;
      await saveMarks(marks);
    }
  } catch (e) { console.error("global pvp:", e.message); }

  return out;
}
