// Diagnóstico temporário: mostra o estado dos Blobs do bot.
// Protegido: só responde com ?k=<TELEGRAM_BOT_TOKEN>. Remover depois.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== process.env.TELEGRAM_BOT_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }
  const chats = await getStore("subs").get("chats", { type: "json" }).catch((e) => ({ err: e.message }));
  const marks = await getStore("marks").get("marks", { type: "json" }).catch((e) => ({ err: e.message }));
  const presence = await getStore("presence").get("state", { type: "json" }).catch((e) => ({ err: e.message }));
  return Response.json({
    hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
    chats,
    marks,
    presence: presence ? { startedTracking: presence.startedTracking, lastPoll: presence.lastPoll, liveCount: presence.liveCount, players: undefined } : null,
    now: Date.now(),
  });
};

export const config = { path: "/api/debug" };
