// Parsers do HTML do Destiny Tale usando Cheerio.
// As páginas são renderizadas no servidor: os dados estão no HTML.
import * as cheerio from "cheerio";

const txt = (el) => (el ? el.text().replace(/\s+/g, " ").trim() : "");
const num = (s) => {
  const n = parseInt(String(s).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Ranking (pvp, level, bellatra, bless-castle...).
 * Linhas: .dest-rt-row.dest-rt-row-desktop
 */
export function parseRanking($input) {
  const $ = typeof $input === "string" ? cheerio.load($input) : $input;
  const rows = [];
  $(".dest-rt-row.dest-rt-row-desktop").each((_, el) => {
    const $r = $(el);
    const nick = txt($r.find(".dest-rt-name").first());
    if (!nick) return;
    // números com fonte mono (exclui o rank e o level)
    const nums = $r
      .find("span.font-mono.tabular-nums")
      .filter((_, s) => !$(s).hasClass("dest-rt-rank-wrap"))
      .map((_, s) => num($(s).text()))
      .get();
    rows.push({
      rank: num($r.find(".dest-rt-rank-wrap").first().text()),
      nick,
      class: txt($r.find(".dest-rt-class").first()),
      level: num($r.find(".dest-rt-level-cell").first().text()),
      kills: nums[0] ?? null,
      deaths: nums[1] ?? null,
      clan: txt($r.find(".dest-rt-clan-text").first()) || null,
    });
  });
  return rows;
}

/**
 * Logs de item (drops, boss, craft, aging, mix).
 * A ordem das colunas vem da classe da grid: dest-rts-grid-<col>-<col>-...
 * Ex: drops = nick-item-map-when | boss = nick-item-map-roll-when
 */
export function parseItemLog($input) {
  const $ = typeof $input === "string" ? cheerio.load($input) : $input;
  const rows = [];

  $(".dest-rt-row.dest-rt-row-desktop").each((_, el) => {
    const $r = $(el);
    // descobre as colunas pela classe da grid
    const gridClass =
      ($r.attr("class") || "")
        .split(/\s+/)
        .find((c) => c.startsWith("dest-rts-grid-")) || "";
    const cols = gridClass.replace("dest-rts-grid-", "").split("-").filter(Boolean);

    // filhos diretos: [0] = rank, depois um por coluna
    const cells = $r.children("span").toArray();
    const row = {};
    cols.forEach((col, i) => {
      const $c = $(cells[i + 1]);
      if (!$c || $c.length === 0) return;
      if (col === "nick") {
        row.nick = txt($c.find(".dest-rt-name").first());
        row.class = txt($c.find(".dest-rt-class").first());
      } else if (col === "item") {
        row.item = txt($c.find(".dest-log-item-cell__name").first()) || txt($c);
        const src = $c.find("img").attr("src");
        if (src) row.itemIcon = src;
      } else if (col === "when") {
        row.time = txt($c.find(".dest-log-cell-when__time").first());
        row.ago = txt($c.find(".dest-log-cell-when__rel").first());
      } else if (col === "map") {
        row.map = txt($c);
      } else if (col === "roll") {
        row.roll = txt($c);
      } else {
        row[col] = txt($c);
      }
    });
    if (row.nick || row.item) rows.push(row);
  });

  return { columns: rows.length ? Object.keys(rows[0]) : [], rows };
}

/**
 * Log de duelo (PvP 1v1): cards vencedor vs perdedor.
 * .dest-log-combat-card  ->  esquerda = vencedor, direita = perdedor
 */
export function parseDuelLog($input) {
  const $ = typeof $input === "string" ? cheerio.load($input) : $input;
  const rows = [];

  $(".dest-log-combat-card").each((_, el) => {
    const $c = $(el);
    const side = (sel) => {
      const $s = $c.find(sel);
      return {
        nick: txt($s.find(".dest-log-combat-combatant__name .truncate").first()) ||
          txt($s.find(".dest-log-combat-combatant__name").first()),
        class: $s.find("img").attr("alt") || null,
      };
    };
    const winner = side(".dest-log-combat-combatant--left");
    const loser = side(".dest-log-combat-combatant--right");
    if (!winner.nick && !loser.nick) return;
    rows.push({
      winner: winner.nick,
      winnerClass: winner.class,
      loser: loser.nick,
      loserClass: loser.class,
      time:
        $c.find(".dest-log-combat-hud__time").attr("aria-label") ||
        txt($c.find(".dest-log-combat-hud__time").first()),
      ago: txt($c.find(".dest-log-combat-hud__rel").first()),
      stakes: txt($c.find(".dest-log-combat-hud__stakes").first()) || null,
    });
  });

  return rows;
}
