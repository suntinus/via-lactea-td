# Via Láctea TD (v0.5.0-alpha)

Tower defense **Canvas 2D** em extensão Chrome (Manifest V3), tema espacial / Super Trunfo.
Produto: **Via Láctea TD**. Pasta local histórica: `virtue-tower-ext`. Sem Three.js.

**Solo e Multijogador são modos separados** — regras não se misturam.

Histórico: [CHANGELOG.md](CHANGELOG.md) · Licença: [MIT](LICENSE) · Instalação: [INSTALL.md](INSTALL.md)

## Modos

### Jogar Solo (clássico)

- Defenda **Planeta Terra** ou **Base Lunar** contra ondas **scriptadas**.
- Sem enviar ataques — sem tela dividida — o loop 0.4.x intacto.
- Duplo caminho (órbita / Nebulosa / Asteroides), torres Laser · Escudo · Sonda, Herói, bomba, congelar, upgrades, rank.

### Multijogador

Entrada própria no menu inicial.

- **vs IA** (local): tela dividida — você à esquerda, IA à direita. Ouro/HP separados; timer de onda compartilhado.
- **Antes de cada onda**: escolha 1 de 3 packs de ataque (**Força leve / mista / pesada**) para enviar à pista do oponente. A IA escolhe heuristicamente.
- Você defende o que a IA enviou; renda por kills. Primeira base a 0 HP perde — overlay de vencedor.
- **Amigo (online)**: stub na UI — **Em breve**.

## Como rodar

Veja [INSTALL.md](INSTALL.md) (`chrome://extensions` ou playtest web).

## Controles

- Escolha **Laser** / **Escudo** / **Sonda** / **Herói** e clique no mapa
- **Onda** · **Agora** · **+Escudo** · **Bomba** · **Congelar** · **Pausar** · **Reset**
- Teclas: `1` `2` `3` torres · `H` herói · `B` bomba · `F` congelar · **Espaço** pausa
- No Multijogador vs IA: modal de pack antes de cada onda; plantio só na metade esquerda

## Playtest

Anote: diversão 1–5 · chegou em qual onda · Chrome ficou lento? · go/no-go · Solo vs vs IA.
