# Lash Designer 4.0.0 RC — System Consistency

## Escopo da rodada

Esta release parte da 3.9.0 e trata a inconsistência visual como problema de arquitetura de UI, não como correção pontual dos três prints.

Os alvos principais foram:

1. substituir o gráfico financeiro artesanal por uma implementação baseada em biblioteca;
2. corrigir o formulário `Nova movimentação`;
3. padronizar **todos os dropdowns renderizados pelo produto**;
4. remover implementações concorrentes de dropdown;
5. consolidar tokens visuais recentes de Luma e WhatsApp no Design System 3.3;
6. adicionar gates para impedir que essas divergências voltem.

## Resultado

### Dropdowns

Foi criado um único componente: `src/components/ProductSelect.tsx`.

A busca final em `src` não encontra nenhum `<select>` nativo renderizado por TSX/JSX. Também não permanecem as implementações antigas `custom-select`, `time-select-trigger`, `time-select-dropdown` ou `time-option` no CSS ativo.

O mesmo dropdown passa a atender Financeiro, WhatsApp, Setup, horários, filtros e configurações administrativas, com:

- menu por portal;
- viewport-aware positioning;
- teclado completo;
- typeahead;
- foco com `preventScroll`;
- Escape/Tab;
- ARIA listbox/option;
- estados consistentes;
- versão compacta e padrão derivadas do mesmo componente.

### Financeiro

O desenho manual do gráfico foi removido. `FinanceFlowChart.tsx` usa Chart.js 4.5.1 para barras de Entradas/Saídas e linha de Saldo.

A regra de histórico curto foi corrigida: mês sem movimentação usa `null` na linha, sem fabricar saldo zero e sem ligar visualmente meses vazios.

O formulário `Nova movimentação` foi reestruturado e o campo Tipo passou a usar o dropdown canônico. O mesmo vale para o filtro de Tipo no Extrato.

### Design System

`luma-v35.css` e `whatsapp-v39.css` foram migrados das paletas hex locais para tokens canônicos do Design System 3.3 e `color-mix` semântico. A auditoria de Design System, que antes registrava avisos nesses dois módulos, agora passa sem esses avisos.

## Arquivos centrais da mudança

- `src/components/ProductSelect.tsx`
- `src/product-controls-v40.css`
- `src/components/FinanceFlowChart.tsx`
- `src/finance-v36.css`
- `src/App.tsx`
- `src/components/WhatsAppCenter.tsx`
- `src/components/WorkspaceSetup.tsx`
- `src/agenda-v24.css`
- `src/luma-v35.css`
- `src/whatsapp-v39.css`
- `src/main.tsx`
- `scripts/product-consistency-audit.mjs`
- `scripts/finance-experience-audit.mjs`
- `scripts/v40-consistency-visual-qa.py`
- `scripts/v39-whatsapp-visual-qa.py`
- `scripts/visual-matrix-v24.py`
- `visual-fixtures/app.html`
- `package.json`
- `package-lock.json`

## Validação final

### Audits de contrato

- Product Consistency: **19/19**
- Financeiro: **24/24**
- WhatsApp Center: **25/25**
- Appointment Lifecycle: **36/36**
- Luma: **33/33**
- Responsividade: **26/26**
- Visual System: **22/22**
- UX: **18/18**
- Iconografia: **16/16**
- Onboarding: **16/16**
- Estrutural 2.4: **26/26**
- Customer Experience: **25/25**
- Marketing Consent: **15/15**
- Indicações: **12/12**
- Design System 3.3: **aprovado sem avisos de paleta local em Luma/WhatsApp**

### QA visual

- System Consistency dedicado: **6/6**
- WhatsApp 3.9 dedicado: **10/10**
- matriz histórica focada em Agenda Hours + Financeiro + Modais + WhatsApp + Setup: **21/21**

Essas matrizes verificam geometria, overflow, clipping, viewport de menu e contenção de diálogo em desktop/mobile. A prévia de 4.0 é gerada por fixture visual estática; não é apresentada como substituta de um build React real.

### Sintaxe

- **57/57 arquivos TS/TSX** passaram em transpilação sintática isolada com TypeScript.

## Gate que não foi falsamente aprovado

A tentativa final de `npm ci` não conseguiu baixar dependências por falha de DNS/registry (`EAI_AGAIN`). O log inclui falhas ao buscar pacotes como `zod-validation-error`, `zod`, `yargs` e outros.

Sem uma árvore íntegra, `npm run typecheck` reporta ausência de `vite/client`. Logo, **typecheck completo, build e preflight não são declarados aprovados neste ambiente**.

A versão permanece corretamente **RC** até executar em VPS/CI:

```bash
npm ci
npm run check
npm run preflight
```

## Nota de qualidade

A release elimina a classe de inconsistência que motivou esta rodada — dropdowns concorrentes/nativos e gráfico financeiro artesanal — e adiciona gates para impedir regressão. Ela também reduz divergências recentes de tokens em Luma/WhatsApp.

Isso não é uma declaração de que toda dívida histórica de CSS do repositório foi apagada: folhas antigas ainda contêm legado que é protegido por baseline e deve ser removido de forma incremental, sem uma reescrita arriscada às cegas. O compromisso da 4.0 é que **nenhuma nova camada concorrente foi criada e os componentes ativos tratados aqui passaram pelos contratos existentes do produto**.
