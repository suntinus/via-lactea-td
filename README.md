# Via Láctea TD by Suntinus

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.6.0--alpha-orange.svg)](https://github.com/suntinus/via-lactea-td)
[![Platform](https://img.shields.io/badge/Chrome-MV3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)

Tower defense espacial em **Canvas 2D**, distribuído como extensão Chrome (Manifest V3) e jogável na web. Tema inspirado em Super Trunfo: cartas de força, aliens, UFOs, vírus e chefões asteroide.

**Via Láctea TD by Suntinus** · evolução G-456 · alpha público.

| | |
|---|---|
| **Play no browser** | [suntinus.github.io/via-lactea-td](https://suntinus.github.io/via-lactea-td/game.html) |
| **Release alpha** | [v0.5.0-alpha](https://github.com/suntinus/via-lactea-td/releases/tag/v0.5.0-alpha) |
| **Instalação** | [INSTALL.md](INSTALL.md) |
| **Histórico** | [CHANGELOG.md](CHANGELOG.md) |

---

## Por que existe

Validar se um TD curto, de sessão micro, com fantasia espacial e modos Solo / Multijogador, diverte o bastante para virar produto — sem Three.js em extensão, sem telemetria, MIT.

## Modos (separados)

O menu inicial escolhe o modo. As regras **não se misturam**.

### Solo

Defesa clássica contra ondas scriptadas.

- Base: **Planeta Terra** (mais HP) ou **Base Lunar** (mais ouro)
- Mapas com **dois caminhos** (Órbita · Nebulosa · Asteroides)
- Torres: **Laser** · **Escudo** · **Sonda** (stats Força / Alcance / Cadência)
- Herói único, poderes Bomba e Congelar
- Upgrades a cada **$150** ganhos, com **cap 3 stacks** por opção
- Rank local no navegador

### Multijogador

- **vs IA** (local): tela dividida; ouro e HP separados
- Antes de cada onda, cada lado escolhe um pack de ataque (**leve / mista / pesada**) e envia à pista do oponente — estilo Warcraft TD
- Primeira base a 0 HP perde
- **Amigo (online):** em breve

## Stack

- Canvas 2D puro (sem framework de jogo, sem Three.js)
- Chrome Extension Manifest V3
- `localStorage` para rank
- Português (pt-BR) na UI

## Instalação rápida

### Extensão (recomendado)

1. Baixe o zip da [release v0.5.0-alpha](https://github.com/suntinus/via-lactea-td/releases/tag/v0.5.0-alpha) e extraia
2. Abra `chrome://extensions` → ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione a pasta do projeto
4. Clique no ícone → **Abrir jogo**

Detalhes: [INSTALL.md](INSTALL.md).

### Web

Abra a [demo no GitHub Pages](https://suntinus.github.io/via-lactea-td/game.html) (pode levar alguns minutos após o deploy).

## Controles

| Ação | Input |
|------|--------|
| Torres | `1` Laser · `2` Escudo · `3` Sonda · clique no mapa |
| Herói | `H` (uma vez por partida) |
| Poderes | `B` Bomba · `F` Congelar |
| Pausa | `Espaço` |
| Onda | botão **Onda** / **Agora** (pula o resumo de 5s) |

No vs IA: plantio só na metade esquerda; escolha de pack antes de cada onda.

## Roadmap (alpha)

- [x] Solo jogável + Multijogador vs IA
- [x] Repo público + release zip + Pages
- [ ] Amigo online
- [ ] Mais cartas Super Trunfo / chefões
- [ ] Go / no-go do spike G-456 após playtests externos

## Contribuir

Issues e PRs são bem-vindos neste estágio alpha. Mantenha o escopo leve (Canvas 2D, sem bundler obrigatório) e atualize o [CHANGELOG.md](CHANGELOG.md) no formato Keep a Changelog.

## Licença

[MIT](LICENSE) © Suntinus
