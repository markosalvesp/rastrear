// Bot do Telegram (modo long polling, para rodar local).
import { getUpdates, sendMessage, hasToken, deleteWebhook } from "./telegram.js";
import { follow, unfollow, listFor, setMode, toggleType, eventsFor } from "./subs.js";
import { getPresence } from "./tracker.js";
import { buildReply } from "./bot-commands.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let offset = 0;
let running = false;

// Armazenamento local (subs.js é síncrono).
const store = {
  follow: (c, n) => follow(c, n),
  unfollow: (c, n) => unfollow(c, n),
  listWithModes: (c) => listFor(c).map((n) => ({ nick: n, events: eventsFor(c, n) })),
  setMode: (c, n, p) => setMode(c, n, p),
  toggleType: (c, n, t, on) => toggleType(c, n, t, on),
  presence: (n) => getPresence(n),
};

async function handle(msg) {
  if (!msg.text) return;
  const reply = await buildReply(msg.text, msg.chat.id, store);
  await sendMessage(msg.chat.id, reply);
}

async function loop() {
  while (running) {
    try {
      const updates = await getUpdates(offset);
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) await handle(u.message).catch((e) => console.error("handle:", e.message));
      }
    } catch (e) {
      console.error("getUpdates:", e.message);
      await sleep(3000);
    }
  }
}

export function startBot() {
  if (!hasToken()) { console.log("  (Telegram desativado — sem TELEGRAM_BOT_TOKEN)"); return; }
  if (running) return;
  running = true;
  console.log("  Bot do Telegram ativo.");
  deleteWebhook().finally(loop);
}
