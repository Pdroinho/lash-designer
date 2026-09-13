# Lash Designer 3.2.0 RC — Luma Native Intelligence

## Motivo desta release

A 3.1 resolveu o problema do “chat genérico”, porém passou do ponto na direção editorial: a Luma ganhou superfícies rígidas, cantos quase retos e um vocabulário visual que parecia um produto separado do Lash Designer.

A 3.2 corrige essa divergência. A Luma continua com identidade própria, mas volta a falar a mesma linguagem de produto da plataforma: superfícies claras, raio de card/dialog, bordas suaves, vinho como acento, Fraunces apenas nos momentos editoriais e Manrope na operação.

## Direção de arte

**Luma Native Intelligence**: inteligência de negócio integrada ao beauty-tech do Lash Designer.

- nada de interface “quadrada” ou ledger rígido;
- nada de avatar/robô/estrelinha de assistente;
- nada de mini ChatGPT no drawer;
- nada de SVG decorativo;
- personalidade via tipografia, proporção, assimetria suave e microcontraste;
- raios, sombras e superfícies alinhados aos tokens do design system.

## Página dedicada

- canvas principal com `24px` de raio e sombra coerente com os cards do produto;
- header compacto com marca `Luma`, subtítulo e cota diária;
- estado inicial em duas colunas, com headline editorial e três prompts nativos;
- fundo atmosférico feito em CSS, sem asset artificial;
- prompts com `16px` de raio e respostas visuais sutis no hover;
- composer arredondado e integrado ao rodapé da experiência;
- conversa com pergunta em blush suave e análise em superfície elevada, sem bolhas tradicionais.

## Drawer

- drawer desktop deixa de ser uma parede lateral: vira sheet inset com `12px` de respiro e `24px` de raio;
- largura controlada entre 390 e 470 px;
- mesma identidade e cota da página;
- prompts e mensagens compactados sem virar outra linguagem;
- em mobile, o drawer usa tela inteira de forma intencional para preservar espaço útil e safe areas.

## Funcionalidade preservada

- histórico de sessão compartilhado página ↔ drawer;
- até 8 mensagens de contexto enviadas ao backend;
- cota diária;
- OpenRouter apenas no servidor;
- abort/stop;
- retry sem duplicação;
- textarea autoexpansível;
- launcher oculto na página dedicada;
- `prefers-reduced-motion`.

## Engenharia visual

- `src/luma-v31.css` removido;
- novo `src/luma-v32.css`;
- zero `!important` no módulo;
- zero `100vw/100dvw` no módulo;
- `scripts/luma-experience-audit.mjs` atualizado para o contrato 3.2;
- `scripts/v32-luma-visual-qa.py` adicionado;
- referências estruturais antigas atualizadas para `luma-v32.css`.

## QA executado

- 12/12 cenários dedicados Chromium da Luma 3.2 sem overflow/clipping estrutural;
- página: vazio e conversa em 1440×900, 1024×768, 390×844 e pressão em 320×568;
- drawer: vazio e conversa em desktop/mobile;
- 18/18 auditoria específica Luma;
- 26/26 responsividade;
- 22/22 sistema visual;
- 18/18 UX/overlays;
- 16/16 iconografia;
- 12/12 indicações;
- 16/16 onboarding;
- 25/25 experiência pública;
- 15/15 consentimento;
- 26/26 estrutural;
- 49/49 arquivos TS/TSX de runtime sem erro sintático na transpilação isolada.

## Gate externo

`npm ci --ignore-scripts --no-audit --no-fund` foi tentado nesta release e continua bloqueado pelo registry interno, que retorna `404` para `zod-validation-error@4.0.2`.

A release permanece RC até executar, em VPS/CI com registry funcional:

```bash
npm ci
npm run check
npm run preflight
```
