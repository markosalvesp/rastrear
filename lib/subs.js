// Assinaturas do bot: quem (chat do Telegram) segue quais bonecos.
// Guarda em data/subs.json (local). No Netlify isso viraria Blobs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_EVENTS, PRESETS, DEFAULT_EVENTS, resolveEvents, mutePvpForAll, restorePvpForAll } from "./prefs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DIR, "subs.json");

const norm = (s) => String(s || "").trim().toLowerCase();

let data = { chats: {}, marks: {} };
load();

function load() {
  try {
    data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    data.chats ||= {}; data.marks ||= {};
  } catch {
    data = { chats: {}, marks: {} };
  }
}
function save() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch (e) { console.error("subs save falhou:", e.message); }
}

export function follow(chatId, nick) {
  const c = (data.chats[chatId] ||= { nicks: [] });
  if (!c.nicks.some((n) => norm(n) === norm(nick))) { c.nicks.push(nick.trim()); save(); return true; }
  return false; // já seguia
}
export function unfollow(chatId, nick) {
  const c = data.chats[chatId];
  if (!c) return false;
  const before = c.nicks.length;
  c.nicks = c.nicks.filter((n) => norm(n) !== norm(nick));
  if (c.nicks.length !== before) { save(); return true; }
  return false;
}
export function listFor(chatId) {
  return data.chats[chatId]?.nicks || [];
}
export function followersOf(nick) {
  const key = norm(nick);
  return Object.entries(data.chats)
    .filter(([, c]) => c.nicks.some((n) => norm(n) === key))
    .map(([chatId]) => chatId);
}
export function allFollowedNicks() {
  const set = new Set();
  for (const c of Object.values(data.chats)) for (const n of c.nicks) set.add(norm(n));
  return [...set];
}

// ---- avisos de boss (LIGADO por padrão; c.boss === false = desligou) ----
export function toggleBoss(chatId) {
  const c = (data.chats[chatId] ||= { nicks: [] });
  c.boss = c.boss === false; // ligado -> desliga; desligado -> liga
  save();
  return c.boss;
}
export const bossChats = () =>
  Object.entries(data.chats).filter(([, c]) => c.boss !== false).map(([id]) => id);

// Garante que o chat existe (pra receber avisos de boss por padrão).
export function touch(chatId) {
  if (!data.chats[chatId]) { data.chats[chatId] = { nicks: [] }; save(); }
}

// ---- preferências de aviso por (chat, nick) ----
export function eventsFor(chatId, nick) {
  return resolveEvents(data.chats[chatId]?.prefs?.[norm(nick)]);
}
export const wants = (chatId, nick, type) => eventsFor(chatId, nick).includes(type);

export function setMode(chatId, nick, preset) {
  const events = PRESETS[preset];
  if (!events) return false;
  const c = (data.chats[chatId] ||= { nicks: [] });
  if (!c.nicks.some((n) => norm(n) === norm(nick))) c.nicks.push(String(nick).trim());
  (c.prefs ||= {})[norm(nick)] = [...events];
  save();
  return true;
}
export function toggleType(chatId, nick, type, on) {
  const c = data.chats[chatId];
  if (!c || !c.nicks.some((n) => norm(n) === norm(nick))) return false;
  const cur = new Set(eventsFor(chatId, nick));
  on ? cur.add(type) : cur.delete(type);
  (c.prefs ||= {})[norm(nick)] = ALL_EVENTS.filter((e) => cur.has(e));
  save();
  return true;
}

export function mutePvpAll(chatId) {
  const c = data.chats[chatId];
  if (!c) return { total: 0, changed: 0 };
  const result = mutePvpForAll(c);
  if (result.total) save();
  return result;
}

export function restorePvpAll(chatId) {
  const c = data.chats[chatId];
  if (!c) return { total: 0, restored: false };
  const result = restorePvpForAll(c);
  if (result.restored) save();
  return result;
}

// marcadores anti-repetição (por nick + tipo de evento)
export function getMark(nick, type) { return data.marks[norm(nick) + ":" + type]; }
export function setMark(nick, type, value) { data.marks[norm(nick) + ":" + type] = value; save(); }
