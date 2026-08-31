// Limpeza temporária e restrita aos IDs sintéticos criados no diagnóstico.
import { deleteChat, loadChat } from "../../lib/subs-store.js";

const TEST_CHAT_IDS = ["555000111", "600000077"];

export default async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const auth = req.headers.get("authorization") || "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!key || (key !== process.env.CRON_SECRET && key !== process.env.TELEGRAM_BOT_TOKEN)) {
    return new Response("forbidden", { status: 403 });
  }

  const before = await Promise.all(TEST_CHAT_IDS.map((id) => loadChat(id)));
  await Promise.all(TEST_CHAT_IDS.map((id) => deleteChat(id)));
  const after = await Promise.all(TEST_CHAT_IDS.map((id) => loadChat(id)));

  return Response.json({
    removed: TEST_CHAT_IDS.filter((_, index) => before[index] && !after[index]),
    alreadyMissing: TEST_CHAT_IDS.filter((_, index) => !before[index]),
    confirmedGone: after.every((chat) => chat === null),
  });
};

export const config = { path: "/api/cleanup-test-chats" };
