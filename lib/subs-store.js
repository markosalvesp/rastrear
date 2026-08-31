// Assinaturas do bot no Netlify Blobs.
// - blob "subs"  -> { chats }  (escrito pelo webhook de comandos)
// - blob "marks" -> { marks, rot }  (escrito só pela função agendada)
// Escritores diferentes em blobs diferentes = sem conflito de escrita.
import { getStore } from "@netlify/blobs";
import { ALL_EVENTS, PRESETS } from "./prefs.js";

const norm = (s) => String(s || "").trim().toLowerCase();

// ---- chats (quem segue quem) ----
export async function loadChats() {
  try { return (await getStore("subs").get("chats", { type: "json" })) || { chats: {} }; }
  catch { return { chats: {} }; }
}
export async function saveChats(s) { await getStore("subs").setJSON("chats", s); }

export function follow(s, chatId, nick) {
  const c = (s.chats[chatId] ||= { nicks: [] });
  if (!c.nicks.some((n) => norm(n) === norm(nick))) { c.nicks.push(String(nick).trim()); return true; }
  return false;
}
export function unfollow(s, chatId, nick) {
  const c = s.chats[chatId];
  if (!c) return false;
  const before = c.nicks.length;
  c.nicks = c.nicks.filter((n) => norm(n) !== norm(nick));
  return c.nicks.length !== before;
}
export const listFor = (s, chatId) => s.chats[chatId]?.nicks || [];
export const followersOf = (s, nick) =>
  Object.entries(s.chats).filter(([, c]) => c.nicks.some((n) => norm(n) === norm(nick))).map(([id]) => id);
export function allFollowedNicks(s) {
  const set = new Set();
  for (const c of Object.values(s.chats)) for (const n of c.nicks) set.add(norm(n));
  return [...set];
}

// ---- preferências de aviso por (chat, nick) ----
export function eventsFor(s, chatId, nick) {
  return s.chats[chatId]?.prefs?.[norm(nick)] || ALL_EVENTS;
}
export const wants = (s, chatId, nick, type) => eventsFor(s, chatId, nick).includes(type);

export function setMode(s, chatId, nick, preset) {
  const events = PRESETS[preset];
  if (!events) return false;
  const c = (s.chats[chatId] ||= { nicks: [] });
  if (!c.nicks.some((n) => norm(n) === norm(nick))) c.nicks.push(String(nick).trim());
  (c.prefs ||= {})[norm(nick)] = [...events];
  return true;
}
export function toggleType(s, chatId, nick, type, on) {
  const c = s.chats[chatId];
  if (!c || !c.nicks.some((n) => norm(n) === norm(nick))) return false;
  const cur = new Set(eventsFor(s, chatId, nick));
  on ? cur.add(type) : cur.delete(type);
  (c.prefs ||= {})[norm(nick)] = ALL_EVENTS.filter((e) => cur.has(e));
  return true;
}

// ---- marks (dedup + rodízio) ----
export async function loadMarks() {
  try { return (await getStore("marks").get("marks", { type: "json" })) || { marks: {}, rot: 0 }; }
  catch { return { marks: {}, rot: 0 }; }
}
export async function saveMarks(m) { await getStore("marks").setJSON("marks", m); }
export const getMark = (m, nick, type) => m.marks[norm(nick) + ":" + type];
export const setMark = (m, nick, type, v) => { m.marks[norm(nick) + ":" + type] = v; };
