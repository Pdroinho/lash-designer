# Lash Designer 4.0.0 RC — System Consistency

## Objetivo

A 4.0 é uma rodada de consolidação de produto. Ela nasce do princípio de que um sistema maduro não pode depender de controles nativos diferentes por navegador, gráficos artesanais frágeis ou pequenas linguagens visuais por módulo.

O foco desta release é reduzir variação estrutural e tornar consistência um contrato verificável.

## 1. Dropdowns: um único componente de produto

Foi criado `src/components/ProductSelect.tsx` como implementação canônica de seleção para o produto.

Características do contrato:

- menu renderizado por portal para escapar de clipping de modais, cards e containers com overflow;
- posicionamento adaptativo acima/abaixo do gatilho conforme o espaço disponível;
- contenção horizontal no viewport;
- teclado com Arrow Up/Down, Home, End, Enter, Space, Escape e Tab;
- typeahead;
- foco restaurado com `preventScroll`;
- fechamento por clique fora;
- reposicionamento em resize e scroll;
- estados selected, hover, highlighted, focus, invalid e disabled;
- tamanhos `compact` e `default` sobre a mesma geometria;
- roles e atributos ARIA de listbox/option.

Todos os `<select>` renderizados pelo produto foram removidos. Financeiro, WhatsApp, Setup, configurações, horários e filtros agora passam pelo mesmo componente.

Os clones antigos `custom-select` e `time-select-*` também foram removidos da implementação visual e do CSS ativo.

## 2. Financeiro: gráfico por biblioteca, não desenho manual

O gráfico artesanal da 3.8/3.9 foi removido e substituído por `FinanceFlowChart.tsx`, baseado em Chart.js 4.5.1.

A composição combina:

- barras de Entradas;
- barras de Saídas;
- linha de Saldo;
- tooltip por mês;
- escala monetária em pt-BR;
- tabela acessível equivalente;
- estado vazio explícito;
- explicação de histórico curto fora da área do plot.

Meses sem movimentação não recebem saldo artificial `0` na série da linha. Eles usam `null` e `spanGaps: false`, evitando fabricar uma trajetória visual por meses para os quais não existe movimentação.

## 3. Financeiro: formulários e extrato

`Nova movimentação` foi reorganizada como formulário de produto:

- Tipo e Data na primeira linha no desktop;
- Tipo usa `ProductSelect`;
- Valor, Categoria/Método e descrição possuem hierarquia previsível;
- footer padronizado;
- uma coluna no mobile;
- menu do dropdown não fica preso nem cortado pelo modal.

O modal de Extrato também foi consolidado:

- filtros em grid;
- Tipo usa o mesmo dropdown canônico;
- cabeçalho da tabela sticky por CSS;
- tratamento responsivo dedicado;
- proteção existente de CSV contra formula injection preservada.

## 4. Design System 3.3

A release não adiciona uma nova estética paralela. `product-system-v33.css` continua sendo o contrato.

Além dos novos controles, as cores locais de `luma-v35.css` e `whatsapp-v39.css` foram migradas para tokens canônicos/`color-mix`, removendo os avisos de paletas locais que ainda apareciam na auditoria 3.3.

Superfícies translúcidas importantes desses módulos também passaram a derivar de `--ld-color-raised`/tokens semânticos, preservando coerência com temas.

## 5. Gate de consistência

Novo audit: `npm run test:consistency`.

Ele bloqueia regressões como:

- reintrodução de `<select>` nativo em TSX/JSX;
- criação de outro listbox fora de `ProductSelect`;
- retorno de clones `custom-select`/`time-select-*`;
- CSS local de dropdown legado;
- retorno do gráfico SVG artesanal;
- divergência de versão do Chart.js no lockfile;
- uso do ProductSelect dentro de wrappers de input legados na Agenda;
- `!important` ou `100vw` nos componentes novos.

## 6. QA desta release

Auditorias específicas:

- Product Consistency: 19/19;
- Financeiro: 24/24;
- WhatsApp Center: 25/25;
- Appointment Lifecycle: 36/36;
- Luma: 33/33;
- Responsividade: 26/26;
- Visual System: 22/22;
- UX: 18/18;
- Iconografia: 16/16;
- Onboarding: 16/16;
- Estrutural: 26/26;
- Customer Experience: 25/25;
- Marketing Consent: 15/15;
- Referrals: 12/12;
- Design System 3.3: aprovado sem avisos de paleta local em Luma/WhatsApp.

QA visual dedicado:

- System Consistency: 6/6;
- WhatsApp 3.9: 10/10;
- matriz legada focada em Agenda/Financeiro/Modal/WhatsApp/Setup: 21/21.

A transpilação sintática isolada aprovou 57 arquivos TS/TSX.

### Gate externo ainda bloqueado

O ambiente de geração não conseguiu completar `npm ci` por falhas DNS `EAI_AGAIN` ao acessar o registry npm. Como consequência, a árvore local ficou sem `vite/client` e o `npm run typecheck` completo não pode ser usado como gate válido neste ambiente.

Por isso a release permanece **RC**. Antes de produção, executar em VPS/CI com registry funcional:

```bash
npm ci
npm run check
npm run preflight
```

## Princípio daqui para frente

Dropdown não é mais uma decisão de cada tela. Gráfico financeiro não é mais um desenho artesanal dentro de `App.tsx`. Controles e cores de produto precisam sair do contrato central ou falhar na auditoria.
