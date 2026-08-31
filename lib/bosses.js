// Agenda de bosses (horários em Brasília).
export const BOSSES = [
  { name: "Valento", local: "Vale Gallubia", times: ["03:30", "15:30", "23:30"] },
  { name: "Babel", local: "Coração de Perum", times: ["00:30", "08:30", "14:30", "19:30"] },
  { name: "Kelvezu", local: "Caverna do Kelvezu", times: ["10:30", "16:30", "21:35"] },
  { name: "Hellsgate", local: "NPC na ponte entre o distribuidor e o baú de ricarten", times: ["12:00", "20:00"] },
  { name: "Dark Guardian", local: "Ilha Perdida", times: ["12:30", "20:30"] },
  { name: "Mokova", local: "Ilha da Morte", times: ["13:30", "22:30"] },
  { name: "Arena PVP", local: "NPC nas escadas à esquerda do mestre Verkan", times: ["21:00"] },
  { name: "Fúria", local: "Templo Maldito - 3º Andar", times: ["22:00"] },
];

// Retorna os avisos "devidos" neste minuto (5 ou 1 minuto antes de um boss nascer).
export function dueAlerts(minuteOfDay) {
  const out = [];
  for (const b of BOSSES) {
    for (const t of b.times) {
      const [h, m] = t.split(":").map(Number);
      const diff = h * 60 + m - minuteOfDay;
      if (diff === 5 || diff === 1) out.push({ name: b.name, local: b.local, time: t, lead: diff });
    }
  }
  return out;
}

// Texto da agenda completa (pro comando /bosses).
export function scheduleText() {
  return (
    "🐉 <b>Agenda de Bosses</b> (horário de Brasília)\n\n" +
    BOSSES.map((b) => `• <b>${b.name}</b> — ${b.local}\n   ⏰ ${b.times.join(" · ")}`).join("\n\n")
  );
}
