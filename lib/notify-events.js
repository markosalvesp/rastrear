// Lógica de avisos do bot no Netlify (presença + eventos de log).
import { getPage } from "./fetcher.js";
import { parseItemLog, parseDuelLog } from "./parsers.js";
import { sendMessage } from "./telegram.js";
import { presenceText, dropsDiff, pvpDiff } from "./events.js";
import {
  loadChats, loadMarks, saveMarks, followersOf, allFollowedNicks, getMark, setMark, wants,
} from "./subs-store.js";
import { brToday } from "./brdate.js";

const BUDGET_MS = 8000; // orçamento de tempo (função tem ~10s)
const BATCH = 12; // no máx. de bonecos por execução

export async function notifyPresence(chats, connects, disconnects) {
  for (const nick of connects)
    for (const c of followersOf(chats, nick))
      if (wants(chats, c, nick, "connect")) await sendMessage(c, presenceText(nick, "connect"));
  for (const { nick, durationSec } of disconnects)
    for (const c of followersOf(chats, nick))
      if (wants(chats, c, nick, "disconnect")) await sendMessage(c, presenceText(nick, "disconnect", { durationSec }));
}

// Envia cada mensagem só aos seguidores que querem aquele tipo.
// Só avança o marcador se TODAS as entregas tentadas deram certo.
async function applyDiff(nick, markType, diff, followers, marks, chats) {
  let allOk = true;
  for (const msg of diff.messages)
    for (const c of followers)
      if (wants(chats, c, nick, msg.type)) { if (!(await sendMessage(c, msg.text))) allOk = false; }
  if (allOk) setMark(marks, nick, markType, diff.newMark);
}

async function checkOne(nick, day, month, marks, chats) {
  const followers = followersOf(chats, nick);
  if (!followers.length) return;
  try {
    const log = await getPage("/logs/drops", { q: nick, day, month, perPage: 20 }).then(parseItemLog);
    await applyDiff(nick, "drops", dropsDiff(nick, log.rows, getMark(marks, nick, "drops")), followers, marks, chats);
  } catch (e) { console.error("drops", nick, e.message); }
  try {
    const rows = await getPage("/rankings/pvp-history", { q: nick, day, month, perPage: 30 }).then(parseDuelLog);
    await applyDiff(nick, "pvp", pvpDiff(nick, rows, getMark(marks, nick, "pvp")), followers, marks, chats);
  } catch (e) { console.error("pvp", nick, e.message); }
}

// Varre os eventos (drops/mortes) dos bonecos seguidos, com rodízio + orçamento de tempo.
export async function runEventChecks() {
  const chats = await loadChats();
  const nicks = allFollowedNicks(chats).sort();
  if (!nicks.length) return { checked: 0 };
  const marks = await loadMarks();
  const { day, month } = brToday();
  let idx = (marks.rot || 0) % nicks.length;
  const started = Date.now();
  let done = 0;
  while (done < nicks.length && done < BATCH && Date.now() - started < BUDGET_MS) {
    await checkOne(nicks[idx], day, month, marks, chats);
    idx = (idx + 1) % nicks.length;
    done++;
  }
  marks.rot = idx;
  await saveMarks(marks);
  return { checked: done };
}
