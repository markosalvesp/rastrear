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
