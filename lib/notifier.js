// Detecta eventos dos bonecos seguidos e avisa os assinantes no Telegram (modo local).
import { getPage } from "./fetcher.js";
import { parseItemLog, parseDuelLog } from "./parsers.js";
import { followersOf, getMark, setMark, allFollowedNicks, wants } from "./subs.js";
import { sendMessage } from "./telegram.js";
import { presenceText, dropsDiff, pvpDiff } from "./events.js";
import { brToday } from "./brdate.js";

// Presença (chamado pelo tracker em conexão/desconexão) — respeita a preferência
export async function onPresence(nick, kind, info = {}) {
  for (const chatId of followersOf(nick))
    if (wants(chatId, nick, kind)) await sendMessage(chatId, presenceText(nick, kind, info));
}

async function apply(nick, markType, diff) {
  // envia cada mensagem só a quem quer o tipo; só avança o marcador se tudo deu certo
  let allOk = true;
  for (const msg of diff.messages)
    for (const chatId of followersOf(nick))
      if (wants(chatId, nick, msg.type)) { if (!(await sendMessage(chatId, msg.text))) allOk = false; }
  if (allOk && getMark(nick, markType) !== diff.newMark) setMark(nick, markType, diff.newMark);
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
  const { day, month } = brToday(); // fuso do jogo (Brasília)
  for (const nick of nicks) await checkEvents(nick, day, month);
}
