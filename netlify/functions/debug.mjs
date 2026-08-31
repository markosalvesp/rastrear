// Diagnóstico SÓ LEITURA (não altera nada). ?k=<TELEGRAM_BOT_TOKEN>.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== process.env.TELEGRAM_BOT_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }
  const data = await getStore("subs").get("chats", { type: "json" }).catch((e) => ({ err: e.message }));
  const chats = data?.chats || {};
  const ids = Object.keys(chats);
  const bossOn = ids.filter((id) => chats[id]?.boss !== false);

  // se passar ?chat=ID, mostra o status daquele chat específico
  const chatId = url.searchParams.get("chat");
  let one = null;
  if (chatId) {
    const c = chats[chatId];
    one = c ? { exists: true, boss: c.boss !== false, nicks: c.nicks || [] } : { exists: false };
  }

  return Response.json({
    totalChats: ids.length,
    bossSubscribers: bossOn.length,
    passaDoTeto100: bossOn.length > 100,
    chat: one,
  });
};

export const config = { path: "/api/debug" };
