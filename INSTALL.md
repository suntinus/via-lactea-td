# Instalar Via Láctea TD (alpha)

## Chrome (extensão unpacked)

1. Baixe o ZIP da release `v0.5.0-alpha` e extraia a pasta.
2. Abra `chrome://extensions` no Chrome / Edge Chromium.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta extraída (onde está o `manifest.json`).
5. Clique no ícone da extensão → **Abrir jogo**.

Se já tinha uma versão anterior: em `chrome://extensions` → **Atualizar**, depois recarregue a aba do jogo.

## Playtest sem instalar (web)

Se o GitHub Pages estiver ligado neste repo, abra:

`https://suntinus.github.io/via-lactea-td/game.html`

(ou o link publicado na release). Alguns recursos de extensão (popup) não se aplicam no modo web.

## Notas

- Manifest V3, pasta histórica `virtue-tower-ext` no disco local; produto = **Via Láctea TD**.
- Alpha: Solo + Multijogador vs IA + amigo online local.
- Online: `npm install && npm run dev` e abra `http://127.0.0.1:8030/game.html`. Sem deploy na VPS até o GO do founder.
