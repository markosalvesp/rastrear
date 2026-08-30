// Diagnóstico temporário. Protegido por ?k=<TELEGRAM_BOT_TOKEN>.
//   ?k=TOKEN                -> mostra estado dos Blobs
//   ?k=TOKEN&run=1          -> roda a checagem de eventos AGORA e reporta envios
//   ?k=TOKEN&run=1&force=1  -> zera os marcadores antes (força re-detecção)
// Remover depois de validar.
import { getStore } from "@netlify/blobs";
import { getPage } from "../../lib/fetcher.js";
import { parseItemLog, parseDuelLog } from "../../lib/parsers.js";
import { sendMessage } from "../../lib/telegram.js";
import { dropsDiff, pvpDiff } from "../../lib/events.js";
import { loadChats, loadMarks, saveMarks, followersOf, allFollowedNicks, getMark, setMark } from "../../lib/subs-store.js";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== process.env.TELEGRAM_BOT_TOKEN) return new Response("forbidden", { status: 403 });

  const chats = await loadChats().catch((e) => ({ err: e.message }));
  const marks = await loadMarks().catch((e) => ({ marks: {}, rot: 0, err: e.message }));

  if (url.searchParams.get("run") !== "1") {
    return Response.json({ hasToken: !!process.env.TELEGRAM_BOT_TOKEN, chats, marks });
  }

  // roda a checagem agora e reporta
  const force = url.searchParams.get("force") === "1";
  const report = [];
  const d = new Date();
  const day = d.getDate(), month = d.getMonth() + 1;
  for (const nick of allFollowedNicks(chats)) {
    const followers = followersOf(chats, nick);
    const entry = { nick, followers, sent: [], fails: [] };
    try {
      const rows = await getPage("/rankings/pvp-history", { q: nick, day, month, perPage: 30 }).then(parseDuelLog);
      const mark = force ? "00:00:00|x|x" : getMark(marks, nick, "pvp");
      const diff = pvpDiff(nick, rows, mark);
      entry.messages = diff.messages.length;
      let allOk = true;
      for (const m of diff.messages) for (const c of followers) {
        const ok = await sendMessage(c, m);
        (ok ? entry.sent : entry.fails).push(m.replace(/<[^>]+>/g, ""));
        if (!ok) allOk = false;
      }
      if (allOk) setMark(marks, nick, "pvp", diff.newMark);
    } catch (e) { entry.error = e.message; }
    report.push(entry);
  }
  await saveMarks(marks).catch(() => {});
  return Response.json({ ran: true, day, month, report });
};

export const config = { path: "/api/debug" };
