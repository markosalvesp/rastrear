// Função AGENDADA (a cada 1 min): rastreia presença 24/7, avisa conexões/desconexões
// e varre drops/mortes dos bonecos seguidos, mandando pro Telegram.
import { pollOnce } from "../../lib/presence-store.js";
import { getPage } from "../../lib/fetcher.js";
import { parseItemLog, parseDuelLog } from "../../lib/parsers.js";
import { sendMessage, hasToken } from "../../lib/telegram.js";
import { presenceText, dropsDiff, pvpDiff } from "../../lib/events.js";
import {
  loadChats, loadMarks, saveMarks, followersOf, allFollowedNicks, getMark, setMark,
} from "../../lib/subs-store.js";

const BUDGET_MS = 7000; // orçamento de tempo pra varrer eventos (função tem ~10s)
const BATCH = 12; // no máx. de bonecos por execução (o resto vem no próximo minuto)

async function notifyPresence(chats, connects, disconnects) {
  for (const nick of connects)
    for (const c of followersOf(chats, nick)) await sendMessage(c, presenceText(nick, "connect"));
  for (const { nick, durationSec } of disconnects)
    for (const c of followersOf(chats, nick)) await sendMessage(c, presenceText(nick, "disconnect", { durationSec }));
}

async function checkOne(nick, day, month, marks, chats) {
  const followers = followersOf(chats, nick);
  if (!followers.length) return;
  try {
    const log = await getPage("/logs/drops", { q: nick, day, month, perPage: 20 }).then(parseItemLog);
    const diff = dropsDiff(nick, log.rows, getMark(marks, nick, "drops"));
    setMark(marks, nick, "drops", diff.newMark);
    for (const m of diff.messages) for (const c of followers) await sendMessage(c, m);
  } catch (e) { console.error("drops", nick, e.message); }
  try {
    const rows = await getPage("/rankings/pvp-history", { q: nick, day, month, perPage: 30 }).then(parseDuelLog);
    const diff = pvpDiff(nick, rows, getMark(marks, nick, "pvp"));
    setMark(marks, nick, "pvp", diff.newMark);
    for (const m of diff.messages) for (const c of followers) await sendMessage(c, m);
  } catch (e) { console.error("pvp", nick, e.message); }
}

export default async () => {
  // 1) presença (sempre)
  const { liveCount, connects, disconnects } = await pollOnce();

  // 2) avisos (só se o bot estiver configurado)
  if (hasToken()) {
    try {
      const chats = await loadChats();
      await notifyPresence(chats, connects, disconnects);

      const nicks = allFollowedNicks(chats).sort();
      if (nicks.length) {
        const marks = await loadMarks();
        const d = new Date();
        const day = d.getDate(), month = d.getMonth() + 1;
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
      }
    } catch (e) {
      console.error("notificações falharam:", e.message);
    }
  }

  return new Response(`ok: ${liveCount} online`);
};

export const config = { schedule: "* * * * *" };
