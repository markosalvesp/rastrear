# Como publicar de graça no Netlify

Este app já está pronto pro Netlify (grátis, sem login, sem banco pago):

- **Site** → `public/` (estático)
- **Buscas** (`/api/player`, `/api/online`) → Netlify Functions (sob demanda)
- **Rastreador 24/7** → `netlify/functions/poll.mjs` roda **a cada 1 min** sozinho
- **Histórico** → Netlify **Blobs** (armazenamento grátis, ativado automaticamente)
- **Seus "bonecos"** → salvos no navegador (localStorage), sem login

## Opção A — pelo GitHub (recomendado)

1. Crie um repositório no GitHub e suba esta pasta:
   ```bash
   git init && git add . && git commit -m "app destiny tale"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git push -u origin main
   ```
2. Entre em https://app.netlify.com → **Add new site → Import an existing project** → escolha o repositório.
3. O Netlify lê o `netlify.toml` sozinho (publish `public`, functions `netlify/functions`).
   Clique em **Deploy**. Pronto.

## Opção B — pela linha de comando (Netlify CLI)

```bash
npm install -g netlify-cli
netlify login
netlify init      # cria/conecta o site
netlify deploy --prod
```

## Testar localmente

- **Como vai rodar no Netlify** (funções + Blobs + agendador emulados):
  ```bash
  netlify dev
  ```
- **Modo servidor simples** (Express, rastreador em arquivo — bom pra desenvolver):
  ```bash
  npm start
  ```

## Detalhes que valem saber

- **Custo:** dentro do plano grátis do Netlify (a função agendada roda ~43 mil vezes/mês,
  bem abaixo do limite de 125 mil). Blobs também é grátis.
- **Primeiro minuto:** logo após publicar, o histórico de presença fica vazio até a função
  agendada rodar a primeira vez (≤ 1 min). Depois disso vai enchendo sozinho.
- **Precisão:** o agendamento do Netlify é "melhor esforço"; a hora de conexão/desconexão
  pode variar ~1 min. O histórico só existe a partir do deploy (não é retroativo).
- **Bonecos por pessoa:** cada visitante tem a própria lista (guardada no navegador dele).
  Não sincroniza entre aparelhos — é por navegador, sem cadastro.
