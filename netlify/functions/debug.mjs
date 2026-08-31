// Diagnóstico. ?k=<TELEGRAM_BOT_TOKEN>. ?del=<chatId> remove um chat (limpeza de teste).
import { loadChats, deleteChat } from "../../lib/subs-store.js";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== process.env.TELEGRAM_BOT_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }

  const del = url.searchParams.get("del");
  if (del) await deleteChat(del);

  const data = await loadChats();
  const chats = data?.chats || {};
  const ids = Object.keys(chats);
  const chatId = url.searchParams.get("chat");
  const one = chatId ? (chats[chatId] ? { exists: true, boss: chats[chatId].boss !== false } : { exists: false }) : null;

  return Response.json({
    totalChats: ids.length,
    bossSubscribers: ids.filter((id) => chats[id]?.boss !== false).length,
    chat: one,
    deleted: del || undefined,
  });
};

export const config = { path: "/api/debug" };
