// Data "de hoje" no fuso do jogo (Brasília / America/Sao_Paulo).
// As funções do Netlify rodam em UTC — sem isto, das 21h à meia-noite (Brasília)
// elas pediriam o log do dia seguinte e não achariam nada.
export function brToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Hora atual de Brasília (com hora/minuto), pra agenda de bosses.
export function brNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  const hour = Number(p.hour) % 24, minute = Number(p.minute);
  return {
    year: +p.year, month: +p.month, day: +p.day, hour, minute,
    minuteOfDay: hour * 60 + minute,
    dateStr: `${p.year}-${p.month}-${p.day}`,
  };
}
