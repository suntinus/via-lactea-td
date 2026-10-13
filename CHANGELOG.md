# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added

- Servidor WebSocket autoritativo (Node/TypeScript) em `127.0.0.1` e `PORT` (padrão 8030): lobby, convite por link, moedas, envio de monstros, reconexão e ranking entre amigos.
- Limites do servidor: `maxPayload` de 8192 bytes, ping a cada 25s, TTL de salas, teto de conexões por IP e de salas por conexão, bloqueio temporário de convites errados, teto de pausas e reconexões por partida.
- Ranking do círculo fica em memória e só é gravado em `circles.json` quando muda. A chave é um id estável do jogador, persistido no navegador, e não o nick.
- O limite por IP e o bloqueio de convite usam `X-Forwarded-For` ou `X-Real-IP` apenas quando a conexão chega de um proxy em loopback.
- Nick online só entra se passar na allowlist (1 a 16 letras, números, espaço, `_` ou `-`). Listas e resumos do jogo escrevem texto com `textContent`, sem interpolar HTML.
- Código de convite gerado com `crypto.randomInt`, sem viés de módulo.
- Exemplo de nginx com `wss` e timeouts em `docs/nginx-wss.example.conf` (documentado, não aplicado).
- Login da primeira versão: código de convite + nick. Magic link permanece como opção futura.
- Regras compartilhadas em `shared/rules.js` (cliente e servidor).
- A IA do vs local compra escudo com HP baixo e escolhe upgrades nos marcos de ouro.
- O preview da próxima onda conta 2 chefões a partir da onda 10.
- O rank local mostra as 10 melhores partidas.

### Changed

- Marca do produto: **Via Láctea TD by Suntinus**. Spike documentado como **G-456**.

## [0.5.0] - 2026-09-27

### Added

- **Separação explícita Solo × Multijogador** na tela inicial (modos com regras distintas).
- **Jogar Solo**: loop clássico 0.4.x — ondas scriptadas, sem packs de ataque, sem tela dividida.
- **Multijogador → vs IA** (local): canvas dividido esquerda/direita; ouro e HP separados; timer de onda compartilhado.
- Packs de ataque estilo Warcraft TD (**Força leve / mista / pesada**) escolhidos **antes de cada onda** e enviados à pista do oponente; IA escolhe por heurística (fraqueza do jogador).
- Overlay de vencedor quando uma base chega a 0 HP.
- Stub **Amigo (online)** na UI: **Em breve**.

### Changed

- Manifest / popup / README em **0.5.0**; produto documenta a bifurcação Solo vs Multijogador.

## [0.4.1] - 2026-09-27

### Changed

- Marcos de upgrade agora acontecem a cada **$150** de ouro ganho.
- Upgrades têm no máximo 3 stacks por opção; alcance/cadência dão +5%, ouro dá no máximo +15% e a base ganha +1 HP até 3 vezes.
- Botões exibem o stack atual e oferecem ouro/cura quando as opções de upgrade estão esgotadas.

## [0.4.0] - 2026-09-27

### Added

- Tela inicial para escolher a última defesa: **Planeta Terra** (mais HP) ou **Base Lunar** (mais ouro), com dificuldade opcional Fácil / Normal / Difícil.
- Layouts com **dois caminhos** (fork A/B); inimigos escolhem a rota aleatoriamente; torres plantam fora de ambos.
- Torres Super Trunfo: **Laser**, **Escudo** (lentidão) e **Sonda**, com carta Força · Alcance · Cadência.
- **Herói** colocável uma vez ($100) com disparo AOE forte.
- Roster espacial: Disco voador 🛸, Alienígena 👽, Predador 👾, Vírus 🦠; **Asteroide Boss** ☄️ a cada 5 ondas.
- Superpoderes: **Bomba** (área, $50 + CD) e **Congelar** onda por 3s ($40 + CD).

### Changed

- Produto renomeado de TD SUN / Virtue Tower para **Via Láctea TD**; pasta da extensão permanece `virtue-tower-ext`.
- Virtudes Amor/Honra removidas; tema 100% Via Láctea / espaço.
- Mapas Compacto / Aberto / Corredor renomeados para layouts **Órbita**, **Nebulosa** e **Asteroides**.
- Botão +Vida passou a **+Escudo**; Lar passou a Terra/Lunar conforme a escolha inicial.
- Rank local agora em `viaLacteaTdRank`.

### Kept

- Pontuação e Top 10, upgrades a cada $150 de ouro, resumo de onda com auto-continue em 5s, armadura em Predador/Boss, plantio + modal de upgrade.

## [0.3.3] - 2026-09-27

### Changed

- Produto renomeado de Virtue Tower para **TD SUN**; o caminho da extensão permanece `virtue-tower-ext`.

## [0.3.2] - 2026-09-27

### Added

- Resumo ao fim de cada onda, com ouro, pontuação, dificuldade e quantidade de inimigos da próxima onda.
- Continuação automática da próxima onda após 5 segundos; **Agora** pula a contagem, e Espaço/Pausar congela o cronômetro.
- Traits individuais de inimigos: Rush, Tank, Glass e Armored, com diferenças de velocidade, vida, recompensa, tamanho e armadura.

### Changed

- A defesa foi ampliada com armadura por unidade: Tank e Armored reduzem o dano recebido, mantendo pelo menos 1 de dano.
- A chance de unidades Armored aumenta conforme as ondas avançam.

## [0.3.1] - 2026-09-27

### Added

- A cada $100 de ouro ganho na run, pausa e oferece 3 upgrades aleatórios; a escolha se aplica ao tipo de torre ou globalmente.

## [0.3.0] - 2026-09-27

### Added

- Rank local em `localStorage`, com pontuação da run e Top 10.
- Vida do Lar com HP, barra visual e botão **+Vida**.
- Mapas Compacto, Aberto e Corredor.
- Indicador de alcance ao passar o mouse e durante o preview de plantio.

## [0.2.1] - 2026-09-22

### Fixed

- Abertura do jogo pelo link do popup, corrigindo o uso de tabs.

## [0.2.0] - 2026-09-22

### Added

- Jogo em aba cheia.
- Virtudes Amor e Honra.
- Mapa maior.

## [0.1.0] - 2026-09-22

### Added

- Versão inicial jogável: tower defense Canvas 2D em extensão Chrome Manifest V3.

