// Detecta eventos dos bonecos seguidos e avisa os assinantes no Telegram (modo local).
import { getPage } from "./fetcher.js";
import { parseItemLog, parseDuelLog } from "./parsers.js";
import { followersOf, getMark, setMark, allFollowedNicks } from "./subs.js";
import { sendMessage } from "./telegram.js";
import { presenceText, dropsDiff, pvpDiff } from "./events.js";

async function broadcast(nick, text) {
  for (const chatId of followersOf(nick)) await sendMessage(chatId, text);
}

// Presença (chamado pelo tracker em conexão/desconexão)
export async function onPresence(nick, kind, info = {}) {
  if (!followersOf(nick).length) return;
  await broadcast(nick, presenceText(nick, kind, info));
}

async function apply(nick, type, diff) {
  if (getMark(nick, type) !== diff.newMark) setMark(nick, type, diff.newMark);
  for (const msg of diff.messages) await broadcast(nick, msg);
}

// Eventos de log de um nick (drops + mortes/abates)
export async function checkEvents(nick, day, month) {
  if (!followersOf(nick).length) return;
  try {
    const log = await getPage("/logs/drops", { q: nick, day, month, perPage: 20 }).then(parseItemLog);
    await apply(nick, "drops", dropsDiff(nick, log.rows, getMark(nick, "drops")));
  } catch (e) { console.error("checkEvents drops:", e.message); }
  try {
    const rows = await getPage("/rankings/pvp-history", { q: nick, day, month, perPage: 30 }).then(parseDuelLog);
    await apply(nick, "pvp", pvpDiff(nick, rows, getMark(nick, "pvp")));
  } catch (e) { console.error("checkEvents pvp:", e.message); }
}

// Varre todos os bonecos seguidos (chamado periodicamente pelo tracker).
export async function pollAllEvents() {
  const nicks = allFollowedNicks();
  if (!nicks.length) return;
  const d = new Date();
  const day = d.getDate(), month = d.getMonth() + 1;
  for (const nick of nicks) await checkEvents(nick, day, month);
}
