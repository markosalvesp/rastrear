// Fila persistente de envio (Netlify Blobs).
// Cada mensagem usa uma chave própria: assim enqueue e drain nunca disputam a
// escrita de um único array. Mensagens são marcadas antes do envio (at-most-once)
// e expiram rápido para um aviso antigo não chegar como se ainda fosse atual.
import { createHash, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { sendMessage } from "./telegram.js";

const LEGACY_KEY = "pending";
const MIGRATION_KEY = "queueV2Migration";
const PREFIX = "messages/";
const WAVE = 25; // por onda/segundo (< 30/seg do Telegram)
const MESSAGE_TTL_MS = 90_000; // depois disso o aviso já está desatualizado
const DEDUPE_TTL_MS = 10 * 60_000; // mantém o recibo para barrar reenvios
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fila e a trava precisam enxergar imediatamente inclusões, marcações e
// exclusões feitas pela execução anterior.
const queueStore = () => getStore({ name: "queue", consistency: "strong" });
const metaStore = () => getStore({ name: "meta", consistency: "strong" });

function messageId(message, createdAt) {
  // O minuto faz duas ocorrências legítimas do mesmo texto em minutos distintos
  // continuarem válidas, mas unifica o mesmo evento produzido duas vezes.
  const minute = Math.floor(createdAt / 60_000);
  return createHash("sha256")
    .update(`${String(message.chat)}\0${String(message.text)}\0${minute}`)
    .digest("hex")
    .slice(0, 32);
}

export function prepareMessages(messages, now = Date.now()) {
  const unique = new Map();
  for (const message of messages || []) {
    if (message?.chat == null || !message?.text) continue;
    const createdAt = Number(message.createdAt) || now;
    const id = message.id || messageId(message, createdAt);
    unique.set(id, {
      id,
      chat: message.chat,
      text: String(message.text),
      createdAt,
      expiresAt: Number(message.expiresAt) || createdAt + MESSAGE_TTL_MS,
      keepUntil: createdAt + DEDUPE_TTL_MS,
      status: "pending",
    });
  }
  return [...unique.values()];
}

// Migração única: preserva uma cópia da fila antiga e impede que notificações
// já atrasadas sejam disparadas depois do deploy. Não toca no store `subs`.
export async function migrateLegacyQueue() {
  const meta = metaStore();
  if (await meta.get(MIGRATION_KEY, { type: "json" })) return;

  const store = queueStore();
  const legacy = await store.get(LEGACY_KEY, { type: "json" });
  if (Array.isArray(legacy) && legacy.length) {
    await store.setJSON("archive/legacy-pending", {
      archivedAt: Date.now(),
      count: legacy.length,
      messages: legacy,
    });
  }
  await store.delete(LEGACY_KEY);
  await meta.setJSON(MIGRATION_KEY, {
    at: Date.now(),
    archived: Array.isArray(legacy) ? legacy.length : 0,
  });
}

export async function enqueue(messages) {
  const entries = prepareMessages(messages);
  if (!entries.length) return { added: 0 };

  const store = queueStore();
  let added = 0;
  await Promise.all(entries.map(async (entry) => {
    const key = PREFIX + entry.id;
    const existing = await store.get(key, { type: "json" });
    if (existing && Number(existing.keepUntil) > Date.now()) return;
    await store.setJSON(key, entry);
    added++;
  }));
  return { added };
}

export async function loadQueue(now = Date.now()) {
  const store = queueStore();
  const { blobs } = await store.list({ prefix: PREFIX });
  const values = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: "json" })));
  const pending = [];
  const expired = [];

  values.forEach((entry, index) => {
    const key = blobs[index].key;
    if (!entry || !entry.id || Number(entry.keepUntil) <= now) {
      expired.push(key);
      return;
    }
    if (entry.status === "pending" && Number(entry.expiresAt) > now) {
      pending.push({ ...entry, key });
    } else if (entry.status === "pending") {
      expired.push(key); // aviso ficou velho antes de ser enviado
    }
  });

  if (expired.length) await Promise.all(expired.map((key) => store.delete(key)));
  return pending.sort((a, b) => a.createdAt - b.createdAt);
}

// Onda de até `size` mensagens com chats distintos (1 mensagem/seg por chat).
export function buildWave(queue, size = WAVE) {
  const indexes = [], used = new Set();
  for (let index = 0; index < queue.length && indexes.length < size; index++) {
    const chat = String(queue[index].chat);
    if (!used.has(chat)) { used.add(chat); indexes.push(index); }
  }
  return indexes;
}

// Eleição de um único drain. A confirmação após a escrita resolve duas funções
// que tenham lido a trava ao mesmo tempo (a última escrita é a vencedora).
async function acquireLock(maxMs) {
  const store = metaStore();
  const now = Date.now();
  const current = await store.get("drainLock", { type: "json" });
  if (current?.until > now) return null;

  const owner = randomUUID();
  await store.setJSON("drainLock", { owner, until: now + maxMs + 30_000 });
  await sleep(250);
  const confirmed = await store.get("drainLock", { type: "json" });
  return confirmed?.owner === owner ? owner : null;
}

async function releaseLock(owner) {
  const store = metaStore();
  const current = await store.get("drainLock", { type: "json" });
  if (current?.owner === owner) await store.setJSON("drainLock", { owner: null, until: 0 });
}

// Marca a onda como enviada ANTES de chamar o Telegram. Em caso de queda após
// a chamada, preferimos perder um aviso isolado a mandar a mesma mensagem duas vezes.
export async function drainAll(maxMs) {
  const owner = await acquireLock(maxMs);
  if (!owner) return { skipped: true };

  const started = Date.now();
  let sent = 0, failed = 0;
  try {
    while (Date.now() - started < maxMs) {
      const queue = await loadQueue();
      if (!queue.length) break;
      const indexes = buildWave(queue);
      const wave = indexes.map((index) => queue[index]);
      const markedAt = Date.now();

      await Promise.all(wave.map(({ key, ...entry }) =>
        queueStore().setJSON(key, { ...entry, status: "sent", sentAt: markedAt })
      ));

      const results = await Promise.all(wave.map((message) => sendMessage(message.chat, message.text)));
      sent += results.filter(Boolean).length;
      failed += results.filter((ok) => !ok).length;
      if (queue.length > wave.length) await sleep(1000);
    }
  } finally {
    await releaseLock(owner);
  }
  return { sent, failed };
}
