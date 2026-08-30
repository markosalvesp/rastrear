# Destiny Tale — Consulta de Jogador (app local)

App local que consulta um personagem do **destinytale.com.br** por **nick** e junta num painel só:

- **PvP**: classe, level, clã, abates, mortes, K/D e posição no ranking
- **Status online**: se o personagem está online agora (mesma bolinha verde do site)
- **Histórico de conexão**: quando conectou e quando desconectou (rastreado pelo app)
- **Para quem morreu / quem matou**: do Histórico PvP do dia
- **Drops, Boss/Roleta, Craft, Aging, Mix**: logs de item do dia

## Como rodar (local)

```bash
npm install
npm start
```

Depois abra **http://localhost:3000**, digite o nick e clique em Buscar.
A data (dia/mês) começa em hoje — mude para consultar outros dias.
Clique na estrela ★ pra salvar o personagem em **"Meus bonecos"** (fica salvo no navegador).

## Publicar grátis (Netlify)

Veja **[DEPLOY.md](DEPLOY.md)**. Resumo: site estático + Netlify Functions pras buscas +
uma função agendada (1 min) que rastreia presença 24/7 + Netlify Blobs pro histórico.
Tudo no plano grátis, sem login. Os "bonecos" de cada pessoa ficam no navegador dela.

## Como funciona

O site não tem API pública: as páginas são HTML renderizado no servidor.
O app faz a leitura desse HTML (scraping) e devolve os dados já limpos.

- `lib/fetcher.js` — busca as páginas com **headers de navegador real**, **cache** (~90s)
  e **fila com throttle + retry**. Isso é obrigatório: com User-Agent simples ou muitas
  requisições seguidas, o edge do site devolve **404** (anti-bot).
- `lib/parsers.js` — parsers Cheerio: ranking, logs de item (colunas vêm da classe
  `dest-rts-grid-...`) e duelo (card vencedor vs perdedor).
- `lib/online.js` — lista de personagens online (via um "server function" do site).
- `lib/tracker.js` — **rastreador de presença**: a cada 60s lê quem está online e
  registra conexões/desconexões em `data/presence.json`.
- `server.js` — API: `/api/player?nick=&day=&month=`, `/api/ranking?type=&q=`, `/api/online`.
- `public/index.html` — interface (busca + painel).

## Status online e histórico de conexão

- **Online agora**: vem direto do site (a mesma lista que acende a bolinha verde).
- **Quando conectou / desconectou**: o site **NÃO guarda** esse histórico — só mostra o
  estado ao vivo. Então o app **rastreia com o tempo**: enquanto o servidor estiver
  rodando, ele checa a lista de online a cada minuto e anota quando cada personagem
  aparece (conectou) e some (desconectou), com duração da sessão.
- **Consequência**: o histórico só existe a partir do momento em que você ligou o app.
  Nada é retroativo. Quanto mais tempo o app ficar rodando, mais histórico acumula.
  Os dados ficam em `data/presence.json` (sobrevivem a reinícios).

## Limitações (importante)

- **"Para quem morreu"** sai do **log de duelos** (PvP 1v1) e é **por dia**. As "mortes"
  totais do ranking incluem PvP aberto/outros, que o site não detalha por evento — então
  só dá pra mostrar o que o log de duelo registra.
- Se o site mudar o HTML, os parsers podem precisar de ajuste (custo de não ter API).
- Respeite o site: o cache e o throttle existem pra não sobrecarregar o servidor deles.
