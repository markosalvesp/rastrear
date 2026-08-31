// Assinaturas do bot no Netlify Blobs.
// CADA CHAT é uma CHAVE SEPARADA ("chat:<id>") — escritas concorrentes não se
// sobrescrevem (o bug de "sobrou 1 inscrito" era gravar todos num blob só).
import { getStore } from "@netlify/blobs";
import { ALL_EVENTS, PRESETS, DEFAULT_EVENTS } from "./prefs.js";

const norm = (s) => String(s || "").trim().toLowerCase();
const CKEY = (id) => "chat:" + id;
// O store de assinaturas precisa de leitura forte: o webhook costuma ler logo
// depois de escrever e o tick precisa enxergar chaves novas sem esperar o cache
// eventual (que pode ficar defasado por até 60 segundos).
const subs = () => getStore({ name: "subs", consistency: "strong" });
// O tick lê este marcador no minuto seguinte à escrita. Leitura eventual pode
// devolver o valor anterior e fazer o mesmo evento parecer novo outra vez.
const marksStore = () => getStore({ name: "marks", consistency: "strong" });

// Leitura direta de um chat, usada pelos comandos que não precisam varrer todos.
export async function loadChat(chatId) {
  return subs().get(CKEY(chatId), { type: "json" });
}

// ---- LEITURA: monta { chats } lendo cada chave chat:* (+ compat do blob antigo) ----
export async function loadChats() {
  const store = subs();
  const chats = {};
  // list() já agrega todas as páginas quando paginate não é informado.
  const { blobs } = await store.list({ prefix: "chat:" });
  const keys = blobs.map((b) => b.key);
  const vals = await Promise.all(keys.map((k) => store.get(k, { type: "json" })));
  keys.forEach((k, i) => { if (vals[i]) chats[k.slice(5)] = vals[i]; });

  // compat: inclui o blob antigo "chats" (dados de antes da migração)
  const old = await store.get("chats", { type: "json" });
  if (old?.chats) for (const [id, c] of Object.entries(old.chats)) if (!chats[id]) chats[id] = c;
  return { chats };
}

// ---- ESCRITA: um chat por chave (concorrência segura) ----
export async function updateChat(chatId, mutator) {
  const store = subs();
  const key = CKEY(chatId);
  const c = (await store.get(key, { type: "json" })) || { nicks: [] };
  const result = mutator(c);
  // Não ocultar a falha: o webhook deve pedir retry se a gravação falhar.
  await store.setJSON(key, c);
  return result;
}
export async function deleteChat(chatId) {
  await subs().delete(CKEY(chatId));
}

// ---- helpers de ESCRITA (operam num chat `c`) ----
export function follow(c, nick) {
  c.nicks ||= [];
  if (!c.nicks.some((n) => norm(n) === norm(nick))) { c.nicks.push(String(nick).trim()); return true; }
  return false;
}
export function unfollow(c, nick) {
  if (!c.nicks) return false;
  const before = c.nicks.length;
  c.nicks = c.nicks.filter((n) => norm(n) !== norm(nick));
  return c.nicks.length !== before;
}
export function setMode(c, nick, preset) {
  const ev = PRESETS[preset];
  if (!ev) return false;
  c.nicks ||= [];
  if (!c.nicks.some((n) => norm(n) === norm(nick))) c.nicks.push(String(nick).trim());
  (c.prefs ||= {})[norm(nick)] = [...ev];
  return true;
}
export function toggleType(c, nick, type, on) {
  if (!c.nicks || !c.nicks.some((n) => norm(n) === norm(nick))) return false;
  const cur = new Set(c.prefs?.[norm(nick)] || DEFAULT_EVENTS);
  on ? cur.add(type) : cur.delete(type);
  (c.prefs ||= {})[norm(nick)] = ALL_EVENTS.filter((e) => cur.has(e));
  return true;
}
export function toggleBoss(c) { c.boss = c.boss === false; return c.boss; }

// ---- helpers de LEITURA (operam no { chats } do loadChats) ----
export const listFor = (s, chatId) => s.chats[chatId]?.nicks || [];
export const eventsFor = (s, chatId, nick) => s.chats[chatId]?.prefs?.[norm(nick)] || DEFAULT_EVENTS;
export const wants = (s, chatId, nick, type) => eventsFor(s, chatId, nick).includes(type);
export const followersOf = (s, nick) =>
  Object.entries(s.chats).filter(([, c]) => (c.nicks || []).some((n) => norm(n) === norm(nick))).map(([id]) => id);
export function allFollowedNicks(s) {
  const set = new Set();
  for (const c of Object.values(s.chats)) for (const n of c.nicks || []) set.add(norm(n));
  return [...set];
}
export const bossChats = (s) => Object.entries(s.chats).filter(([, c]) => c.boss !== false).map(([id]) => id);

// ---- marks (só o tick escreve -> blob único é seguro) ----
export async function loadMarks() {
  try { return (await marksStore().get("marks", { type: "json" })) || { marks: {}, rot: 0 }; }
  catch { return { marks: {}, rot: 0 }; }
}
export async function saveMarks(m) { await marksStore().setJSON("marks", m); }
export const getMark = (m, nick, type) => m.marks[norm(nick) + ":" + type];
export const setMark = (m, nick, type, v) => { m.marks[norm(nick) + ":" + type] = v; };
