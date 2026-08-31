// Estatísticas SÓ LEITURA (não altera nada). ?k=<TELEGRAM_BOT_TOKEN>. Rota: /api/stats
import { getStore } from "@netlify/blobs";
import { loadChats } from "../../lib/subs-store.js";
import { loadState } from "../../lib/presence-store.js";

export default async (req) => {
  const k = new URL(req.url).searchParams.get("k");
  if (k !== process.env.CRON_SECRET && k !== process.env.TELEGRAM_BOT_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }
  // checagem por chat específico (get é consistente na hora, diferente do list)
  const chatId = new URL(req.url).searchParams.get("chat");
  if (chatId) {
    const c = await getStore("subs").get("chat:" + chatId, { type: "json" }).catch(() => null);
    return Response.json({ chat: chatId, existe: !!c, dados: c || null });
  }

  const { chats } = await loadChats();
  const ids = Object.keys(chats);
  const bossOn = ids.filter((id) => chats[id]?.boss !== false).length;
  const following = ids.filter((id) => (chats[id]?.nicks || []).length > 0).length;

  let presence = null;
  try {
    const st = await loadState();
    presence = { liveCount: st.liveCount || 0, lastPoll: st.lastPoll || 0, agoSec: st.lastPoll ? Math.round((Date.now() - st.lastPoll) / 1000) : null };
  } catch {}

  return Response.json({
    inscritos: ids.length,
    recebemBoss: bossOn,
    seguemAlgumBoneco: following,
    sistema: presence,
  });
};

export const config = { path: "/api/stats" };
