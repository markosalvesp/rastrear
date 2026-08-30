// Rastreador de presença: consulta a lista de online periodicamente e registra
// quando cada personagem CONECTOU e DESCONECTOU (transições online<->offline).
//
// IMPORTANTE: o site não guarda histórico de sessão — só o estado ao vivo.
// Então o histórico só existe a partir do momento em que este rastreador começou
// a rodar. Nada é retroativo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchOnlineNicks, normNick } from "./online.js";
import { onPresence, pollAllEvents } from "./notifier.js";

// dispara aviso sem travar o poll (erros não quebram o rastreamento)
function notify(fn) {
  try { Promise.resolve(fn()).catch((e) => console.error("notify:", e.message)); }
  catch (e) { console.error("notify:", e.message); }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "presence.json");

const POLL_MS = 60_000; // consulta a cada 60s (o site atualiza ~30s)
const MAX_SESSIONS = 40; // sessões guardadas por personagem
const PRUNE_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000; // esquece offline há +7 dias

let state = { startedTracking: null, lastPoll: 0, liveCount: 0, players: {} };
let liveSet = new Set();
let timer = null;
let polling = false;

function load() {
  try {
    state = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (!state.players) state.players = {};
  } catch {
    state = { startedTracking: null, lastPoll: 0, liveCount: 0, players: {} };
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state));
  } catch (e) {
    console.error("presence save falhou:", e.message);
  }
}

function newPlayer() {
  return { online: false, since: null, lastConnect: null, lastDisconnect: null, sessions: [] };
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const { nicks, updatedAt } = await fetchOnlineNicks();
    const now = Date.now();
    const firstPoll = !state.startedTracking;
    if (firstPoll) state.startedTracking = now;

    const online = new Set(nicks.map(normNick));
    liveSet = online;

    // Conexões: quem está online agora e não estava antes
    for (const nick of online) {
      const p = (state.players[nick] ||= newPlayer());
      if (!p.online) {
        p.online = true;
        p.since = now;
        // no primeiro poll não sabemos a hora exata em que conectou (já estava online)
        const exact = !firstPoll;
        if (exact) p.lastConnect = now;
        p.sessions.push({ connectedAt: now, disconnectedAt: null, sinceExact: exact });
        if (p.sessions.length > MAX_SESSIONS) p.sessions.shift();
        if (exact) notify(() => onPresence(nick, "connect")); // não avisa no 1º poll
      }
    }

    // Desconexões: quem estava online e sumiu da lista
    for (const [nick, p] of Object.entries(state.players)) {
      if (p.online && !online.has(nick)) {
        p.online = false;
        p.lastDisconnect = now;
        p.since = null;
        const s = p.sessions[p.sessions.length - 1];
        if (s && s.disconnectedAt == null) {
          s.disconnectedAt = now;
          s.durationSec = Math.round((now - s.connectedAt) / 1000);
        }
        notify(() => onPresence(nick, "disconnect", { durationSec: s?.durationSec }));
      }
    }

    // Poda: esquece quem está offline há muito tempo e sem sessões
    for (const [nick, p] of Object.entries(state.players)) {
      if (!p.online && p.lastDisconnect && now - p.lastDisconnect > PRUNE_OFFLINE_MS) {
        delete state.players[nick];
      }
    }

    state.lastPoll = now;
    state.liveCount = online.size;
    state.updatedAt = updatedAt;
    save();
  } catch (e) {
    console.error("poll de presença falhou:", e.message);
  } finally {
    polling = false;
  }
}

export function startTracker() {
  load();
  poll(); // primeira coleta imediata (não bloqueia o boot)
  timer = setInterval(poll, POLL_MS);
  if (timer.unref) timer.unref();

  // Varre os logs (drops/mortes) dos bonecos seguidos, defasado do poll de presença.
  const evTimer = setInterval(() => {
    pollAllEvents().catch((e) => console.error("pollAllEvents:", e.message));
  }, POLL_MS);
  if (evTimer.unref) evTimer.unref();
}

// Garante dados minimamente frescos sob demanda (se o poll ainda não rodou).
export async function ensureFresh() {
  if (!state.lastPoll || Date.now() - state.lastPoll > POLL_MS * 2) await poll();
}

export function getPresence(nick) {
  const key = normNick(nick);
  const p = state.players[key] || newPlayer();
  const onlineNow = liveSet.has(key);
  // sessões mais recentes primeiro
  const sessions = [...p.sessions].reverse();
  return {
    onlineNow,
    since: p.online ? p.since : null,
    sinceExact: p.online ? p.sessions[p.sessions.length - 1]?.sinceExact ?? false : null,
    lastConnect: p.lastConnect,
    lastDisconnect: p.lastDisconnect,
    sessions,
    trackingSince: state.startedTracking,
    lastPoll: state.lastPoll,
    liveCount: state.liveCount,
  };
}
