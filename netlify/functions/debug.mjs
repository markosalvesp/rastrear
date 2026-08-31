// Diagnóstico temporário. Protegido por ?k=<TELEGRAM_BOT_TOKEN>. Remover depois.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (new URL(req.url).searchParams.get("k") !== process.env.TELEGRAM_BOT_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }
  const chats = await getStore("subs").get("chats", { type: "json" }).catch((e) => ({ err: e.message }));
  const marks = await getStore("marks").get("marks", { type: "json" }).catch((e) => ({ err: e.message }));
  return Response.json({ chats, marks });
};

export const config = { path: "/api/debug" };
