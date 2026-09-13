# Lash Designer Product Design System 3.3

> **Escopo:** toda a experiência de produto do Lash Designer — dashboard, Agenda, Clientes, Serviços, Financeiro, Billing, WhatsApp, domínios, Configurações, Setup, autenticação, booking/agendamento público, área da cliente, console ADMIN/DEV, overlays e Luma.
>
> **Fora do escopo:** **Landing Page comercial.** A LP será redesenhada como um projeto de direção de arte separado. Nada neste documento deve ser usado para justificar manter a LP atual.

## 1. Por que este design system existe

O Lash Designer já tem uma identidade reconhecível, mas ainda não tem um contrato visual único. A evolução do produto criou boas soluções em momentos diferentes — shell 2.4, booking 3.0, Luma 3.2 — porém elas ainda convivem com CSS de gerações anteriores.

Na baseline 3.2, excluindo os arquivos da landing, existem aproximadamente:

- 18 folhas CSS de produto;
- 10.817 linhas de CSS de produto;
- 132 custom properties declaradas;
- 459 ocorrências de `!important`;
- dezenas de valores de `border-radius` distintos;
- paletas/tokens locais em Booking e Luma;
- uma camada antiga (`design-system.css`) que ainda depende fortemente de overrides.

Este documento substitui a ideia de “design system = CSS que ganha na especificidade”. O novo sistema é um **contrato de produto**: decisões, tokens, padrões e limites claros. Componentes migrados devem usar esse contrato diretamente, sem depender de patches posteriores.

---

# 2. Direção de arte do produto

## 2.1 Conceito

### **Quiet Beauty Utility**

O Lash Designer é um software profissional para negócios de beleza. A interface deve combinar:

- **sofisticação feminina sem infantilização**;
- **calma visual sem parecer vazia**;
- **tato editorial sem sacrificar operação**;
- **tecnologia discreta, nunca “futurismo de IA”**;
- **personalidade por composição, não por ornamento gratuito**.

A referência mental não é “dashboard SaaS feminino”. É um **atelier de beleza contemporâneo transformado em produto digital**: materiais claros, vinho profundo, tipografia precisa, fotografia contextual e espaços que parecem intencionais.

## 2.2 O que torna o produto memorável

A assinatura visual deve vir de quatro elementos:

1. **Geometria macia e consistente** — controles de 12 px, cards de 18 px, painéis de 24 px;
2. **Contraste editorial pontual** — Fraunces apenas quando a tela merece um momento de narrativa;
3. **Vinho como pontuação, não como preenchimento indiscriminado**;
4. **Superfícies quentes/táteis** — marfim, papel, blush e grafite em vez de branco puro + cinza SaaS.

## 2.3 Regra contra estética genérica de IA

Não usar como padrão:

- grids de cards todos iguais;
- ícones em círculos coloridos para qualquer informação;
- sparkle como metáfora universal de IA;
- gradiente roxo/rosa sobre branco;
- glow decorativo sem função;
- blobs e SVGs abstratos “tecnológicos”;
- glassmorphism sem contexto;
- chat em bolhas simplesmente porque existe IA;
- pills em excesso;
- “bento grid” como solução padrão;
- três cards de sugestão idênticos para qualquer estado vazio;
- hero escuro em toda tela só para parecer premium.

Uma superfície expressiva deve ter **uma ideia memorável**, não seis efeitos competindo.

---

# 3. Famílias de superfície

O produto tem quatro níveis de expressão. Todos compartilham os mesmos tokens.

## A. Operacional

Exemplos: Dashboard, Agenda, Clientes, Serviços, Financeiro, Configurações, ADMIN.

- Manrope domina;
- máxima legibilidade e densidade controlada;
- cards simples, borda discreta e sombra mínima;
- cor de marca principalmente em ação/estado;
- Fraunces não aparece em tabelas, filtros, métricas ou CRUD.

## B. Especializada

Exemplos: Luma, Billing, Setup.

- pode ter uma composição própria;
- pode usar Fraunces em **uma** headline principal;
- pode usar uma superfície especial ou imagem contextual;
- continua obedecendo raios, espaçamento, controles e cores do produto.

## C. Pública operacional

Exemplos: booking/agendamento, área da cliente, login.

- mais editorial e emocional que o dashboard;
- fotografia pode ser protagonista quando informa contexto real;
- Fraunces é permitida em títulos;
- ainda deve parecer o mesmo Lash Designer em inputs, botões, estados e feedback.

## D. DEV dark

- mesma arquitetura e densidade;
- carvão quente, não navy/preto azulado;
- accent adaptado para contraste;
- nenhuma tela deve criar um “dark theme próprio”.

---

# 4. Tokens canônicos

Arquivo fonte: `src/product-system-v33.css`.

## 4.1 Tipografia

### UI — Manrope

Usar em:

- navegação;
- botões;
- inputs;
- tabelas;
- métricas;
- filtros;
- modais administrativos;
- mensagens de status;
- legendas e metadados.

### Display — Fraunces

Usar apenas em:

- booking e área pública em momentos editoriais;
- Luma no estado introdutório/headline-chave;
- Billing/Setup quando existe narrativa de entrada;
- telas especiais explicitamente aprovadas.

**Nunca** usar Fraunces em tabelas, labels, menus, badges, números operacionais ou campos.

### Escala

| Token | Uso | Tamanho |
|---|---|---|
| `display-xl` | hero público excepcional | `clamp(2.75rem, 5vw, 4.5rem)` |
| `display-lg` | headline editorial | `clamp(2.15rem, 4vw, 3.45rem)` |
| `page` | título de página operacional | `clamp(1.55rem, 2.4vw, 2rem)` |
| `section` | título de seção/card | `1.15rem` |
| `subsection` | subtítulo forte | `.95rem` |
| `body` | texto padrão | `.875rem / 1.55` |
| `small` | descrição/ajuda | `.78rem / 1.5` |
| `caption` | metadado | `.69rem` |
| `micro` | eyebrow/índice | `.61rem` |

### Regras tipográficas

- máximo de 2 famílias por tela;
- `letter-spacing` negativo apenas em headings;
- microcopy nunca abaixo de `.61rem` em desktop nem ilegível no mobile;
- usar `font-variant-numeric: tabular-nums` em dinheiro, horas e indicadores;
- `text-wrap: balance` em headlines curtas e `pretty` em parágrafos;
- não quebrar palavras letra por letra;
- largura recomendada de parágrafo: 44–68 caracteres.

---

## 4.2 Cor

### Neutros de produto

| Token | Valor | Uso |
|---|---|---|
| Canvas | `#F7F4F5` | fundo padrão da aplicação |
| Canvas warm | `#F3EEEB` | pública/feature especial |
| Panel | `#FFFEFE` | shell/sidebar |
| Paper | `#FFFDF9` | booking/editorial |
| Raised | `#FFFFFF` | cards/inputs |
| Soft | `#F2EDEF` | controles secundários |
| Soft warm | `#F8F2EE` | superfície editorial |
| Muted | `#E9E2E5` | separação/disabled |
| Ink strong | `#2A1E23` | título/texto principal |
| Ink body | `#5F5258` | corpo |
| Ink soft | `#7B6E74` | secundário |
| Ink faint | `#9B8E94` | metadado |

### Marca

A família base continua vinho/rosé:

- Wine 900 `#4D172D`
- Wine 800 `#651D3C`
- Wine 700 `#7D2449`
- Wine 600 `#972D57`
- Rose 500 `#B43A68`
- Rose 300 `#ECA6C0`
- Blush 100 `#FDEBF2`
- Blush 50 `#FFF7FA`

### Customização por tenant

A cor definida pela profissional pode substituir o **accent**, mas não pode recolorir:

- texto neutro;
- canvas;
- danger/success/warning/info;
- sombras;
- fotografia;
- toda a interface indiscriminadamente.

A cor do tenant serve para:

- CTA primário;
- item ativo;
- foco;
- seleção;
- pequenos detalhes de identidade;
- booking público do tenant.

### Cores semânticas

São fixas e independentes do tenant:

- Success: `#287457` / `#EAF6F0`
- Warning: `#8B5F18` / `#FFF7DF`
- Danger: `#A4253E` / `#FFF0F3`
- Info: `#245C9E` / `#EDF4FF`

---

# 5. Espaçamento e densidade

Escala base: **4 px**.

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80`

## Regras

- controles: gap interno 8–12 px;
- campos em formulário: 16–20 px;
- cards relacionados: 12–16 px;
- seções de página: 24–32 px;
- grandes transições editoriais: 40–64 px;
- não inventar `17px`, `23px`, `27px` para “acertar no olho” sem motivo;
- densidade mobile é **reorganizada**, não simplesmente reduzida.

---

# 6. Raios

| Token | Valor | Uso |
|---|---:|---|
| `radius-xs` | 8 px | chips pequenos, eventos, miniaturas |
| `radius-control` | 12 px | inputs, botões, nav items |
| `radius-card` | 18 px | cards padrão |
| `radius-panel` | 24 px | modais, drawers, Luma, painéis principais |
| `radius-hero` | 28 px | superfícies editoriais/públicas excepcionais |
| `radius-pill` | 999 px | badge/segmented/pill real |

### Proibido

- 10, 11, 13, 14, 15, 17, 19, 21 px arbitrários em componentes novos;
- usar pill em botão retangular só porque “parece moderno”;
- cada feature inventar sua própria escala.

Exceções precisam ser documentadas e ter razão funcional, como evento pequeno de calendário.

---

# 7. Elevação

A plataforma é **border-first**, não shadow-first.

| Nível | Uso |
|---|---|
| none | navegação e superfícies dentro de painel |
| xs | card normal, input elevado |
| sm | painel destacado, Luma page |
| md | popover/dropdown importante |
| overlay | modal/drawer |

Cards não “pulam” no hover por padrão. Hover comunica interatividade com mudança sutil de fundo/borda. `translateY(-1px)` é reservado para CTA primário ou elemento explicitamente interativo.

---

# 8. Layout de produto

## Shell

- sidebar expandida: 268 px;
- sidebar recolhida: 76 px;
- topbar: 78 px;
- conteúdo máximo: 1680 px;
- gutter: `clamp(16px, 2.1vw, 34px)`;
- nenhum layout interno usa `100vw`;
- flex/grid children críticos sempre têm `min-width: 0`.

## Larguras de conteúdo

- leitura/conversa longa: até 720 px;
- formulário focado: até 640 px;
- configurações: até 980 px;
- dashboards/data: largura disponível até 1680 px.

## Responsividade

Breakpoints são usados por **necessidade de composição**, não por dispositivo imaginário.

Baseline de QA:

- 320×568;
- 360×800;
- 390×844;
- 412×915;
- 768×900;
- 1024×768;
- 1280/1366;
- 1440×900;
- 1920×1080;
- pressão equivalente de zoom 80%–150% nos fluxos críticos.

### Regra mobile

Mobile não é desktop comprimido.

- tabelas viram lista/card quando leitura horizontal perde sentido;
- drawers de consulta podem virar full-screen;
- modais transacionais viram bottom sheet quando apropriado;
- ações críticas continuam acessíveis sem hover;
- touch target mínimo: 44 px.

---

# 9. Componentes canônicos

## 9.1 Botões

### Primary

- altura 44 px, 48 px para CTA importante;
- vinho/accent sólido;
- texto branco;
- raio 12 px;
- sem gradiente;
- ícone opcional depois ou antes do rótulo, conforme significado.

### Secondary

- fundo raised/white;
- borda strong;
- ink body;
- hover em soft.

### Quiet

- sem borda visível em repouso;
- usado para “Voltar”, “Cancelar”, ações auxiliares.

### Danger

- fundo danger-soft para ação não final;
- danger sólido apenas para confirmação destrutiva final.

### Icon button

- 40–44 px;
- nunca menor que 36 px em desktop nem 44 px em touch crítico;
- tooltip obrigatório quando não existe label visível.

### Não fazer

- gradiente em CTA operacional;
- mais de um botão primário no mesmo grupo;
- ícone decorativo em todo botão;
- botão pill longo por padrão.

---

## 9.2 Inputs

- label sempre visível;
- altura mínima 44 px;
- raio 12 px;
- ajuda e erro em linha própria;
- placeholder exemplifica, não substitui label;
- foco: borda accent + ring 3 px;
- erro não depende só de cor;
- `font-size: 16px` em inputs mobile quando necessário para impedir zoom automático.

Campos especiais (telefone, moeda, senha) podem ter prefixo/sufixo, mas o texto nunca pode ser comprimido.

---

## 9.3 Cards

### Card padrão

- raised;
- 1 px line-soft;
- radius 18;
- shadow-xs;
- padding 16–24 conforme densidade.

### Card soft

- soft/warm;
- sem sombra;
- usado para agrupamento, não para criar outra camada de elevação.

### Card interativo

- cursor e estado hover claros;
- mudança de borda/fundo;
- não aplicar lift exagerado.

### Regra de nesting

Evitar mais de **duas superfícies com borda aninhadas**. Se existe card dentro de card dentro de card, a hierarquia está errada.

---

## 9.4 Métricas

- número é protagonista;
- `tabular-nums`;
- ícone é opcional, não obrigatório;
- trend usa semântica de cor e texto;
- no mobile o card deve ficar mais denso, não apenas mais alto.

---

## 9.5 Tabelas e listas

Desktop:

- cabeçalho discreto;
- 44–52 px por linha;
- ações compactas no final;
- bordas horizontais leves;
- zebra striping não é padrão.

Mobile:

- converter para lista/card quando necessário;
- preservar nome/estado/ação principal sem scroll horizontal;
- scroll horizontal é aceitável em calendário e data grids que dependem de eixo temporal.

---

## 9.6 Tabs e segmented controls

- container soft;
- raio 12–14 apenas enquanto legado migra; padrão final 12;
- item ativo raised + shadow-xs;
- sem underline + pill + border ao mesmo tempo.

---

## 9.7 Badges/status

- pill somente aqui faz sentido;
- altura 24–28 px;
- texto curto;
- sem ícone quando a palavra já comunica o estado;
- status semântico usa paleta fixa.

---

# 10. Navegação

## Sidebar

- três zonas: marca / navegação rolável / conta;
- expanded 268, collapsed 76;
- item 44 px;
- radius 12;
- ativo = blush/accent suave + accent; nunca um gradiente;
- collapsed mostra apenas ícone centralizado + tooltip;
- mobile usa drawer próprio, não sidebar desktop estreita.

## Topbar

- 78 px;
- translúcida somente o suficiente para separar rolagem;
- título e breadcrumb claros;
- ações à direita com baixa densidade;
- busca não domina o header.

---

# 11. Overlays

Contrato obrigatório:

```text
document.body
└── OverlayPortal
    ├── Backdrop
    └── Dialog / Drawer / Sheet / Popover
```

- nunca montar modal dentro de `.app-content`;
- backdrop fixed cobre o viewport inteiro;
- foco preso enquanto modal está aberto;
- Escape quando seguro;
- foco restaurado ao fechar;
- um único scroll lock manager;
- nenhuma compensação de scrollbar local.

## Dialog desktop

- radius 24;
- shadow-overlay;
- altura máxima pelo viewport;
- corpo rolável, header/footer estáveis.

## Mobile

- transacional: bottom sheet 24 px nos cantos superiores;
- fluxo imersivo/consulta: full-screen quando fizer mais sentido;
- safe-area obrigatória.

## Drawer desktop

- quando for sheet flutuante: 12 px de margem da viewport + radius 24;
- quando for navegação estrutural: pode encostar na lateral, mas pertence ao shell.

---

# 12. Estados vazios, loading e feedback

## Empty states

- uma frase útil + próximo passo;
- ilustração/foto somente quando contextual;
- nenhum desenho genérico de “caixa vazia com estrelinhas”.

## Loading

- skeleton acompanha a geometria real;
- spinner apenas para ações curtas/localizadas;
- botão em loading mantém largura.

## Erro

- dizer o que aconteceu e o que fazer;
- preservar dados digitados sempre que possível;
- danger só onde existe problema real.

## Toast

- feedback breve, não confirmação de decisão crítica;
- ações destrutivas ou financeiras não dependem apenas de toast.

---

# 13. Fotografia e assets

Fotografia é permitida quando adiciona contexto humano real:

- dashboard hero pontual;
- serviço no booking;
- onboarding/empty state específico;
- área pública.

### Regras

- nunca colocar uma foto “porque há espaço vazio”;
- recorte pensado por breakpoint;
- evitar stock genérico com pose artificial;
- textura de pele e ambiente natural;
- overlay serve à legibilidade, não como efeito de moda;
- não gerar SVG abstrato para “dar personalidade”.

Gráficos decorativos devem representar alguma ideia real de ritmo/dados ou desaparecer.

---

# 14. Iconografia

Biblioteca: **Phosphor Icons**.

- peso e tamanho consistentes por contexto;
- 18–20 px em navegação/ação padrão;
- 16 px em metadado;
- 20–24 px em controle destacado;
- não misturar bibliotecas;
- não criar pictograma customizado se Phosphor já possui metáfora adequada;
- ícone não substitui label em ações ambíguas.

Sparkle é reservado a conceito realmente ligado à Luma/assistência e mesmo assim deve ser raro.

---

# 15. Motion

A interface não precisa “se mexer para parecer premium”.

- fast: 120 ms;
- base: 170 ms;
- slow: 240 ms;
- transições principalmente em cor, opacity e transform curto;
- page-load especial somente em superfícies editoriais;
- sem spring/bounce em tarefas administrativas;
- respeitar `prefers-reduced-motion`.

Momentos de alto impacto devem ser poucos e coordenados.

---

# 16. Regras por área

## Dashboard

- operacional com **um** momento humanizado/hero, no máximo;
- métricas e agenda resumida simples;
- não transformar cada seção em banner.

## Agenda

- densidade e leitura temporal têm prioridade;
- calendário pode quebrar a regra de “sem scroll horizontal” quando necessário;
- eventos usam radius-xs;
- controles seguem o sistema padrão.

## Clientes

- informação pessoal clara;
- status/promotional consent de forma discreta;
- mobile em lista legível;
- ações secundárias não podem competir com nome/contato.

## Serviços

- imagem de serviço é contexto, não decoração;
- desktop pode usar tabela;
- mobile usa cards compactos.

## Financeiro

- números e comparação são protagonistas;
- cores semânticas usadas com parcimônia;
- nenhuma cor do tenant altera “positivo/negativo”.

## Billing

- pode ser mais editorial;
- regras comerciais e preço sempre cristalinos;
- sem esconder total anual atrás do equivalente mensal;
- apenas um CTA primário por decisão.

## WhatsApp

- esconder infraestrutura da profissional;
- linguagem orientada à tarefa: conectar, status, QR, mensagens;
- preview só quando ajuda a entender resultado.

## Domínios

- estado DNS/TLS claro;
- configuração em passos curtos;
- status semântico consistente;
- dados técnicos avançados atrás de “Detalhes”.

## Setup

- narrativa guiada, mas sem virar landing page;
- um passo = uma decisão principal;
- progresso compacto;
- actions persistentes quando necessário.

## Booking público

O booking 3.0 define uma boa direção: editorial, calmo e humano. Porém deve migrar de tokens `--b30-*` para os tokens canônicos.

- Fraunces permitida;
- `Paper`/`Canvas warm` permitidos;
- fotografia somente vinculada ao serviço/tenant;
- controles seguem sistema;
- consentimento promocional permanece secundário e voluntário.

## Área da cliente

- mais próxima do booking do que do dashboard administrativo;
- foco em horários, confirmação, preferência e histórico;
- linguagem simples;
- sem navegação complexa.

## Luma

A Luma pode ser reconhecível, mas **não pode ter um design system próprio**.

- usa os mesmos neutrals, accent, raios e sombras;
- Fraunces apenas no opening/editorial moment;
- page = workspace de análise;
- drawer = consulta rápida;
- resposta não precisa virar bolha de chat;
- monograma/identidade é permitido, sparkle é exceção;
- tokens `--l32-*` são dívida de migração e devem virar aliases temporários até desaparecerem.

## Login

- pública operacional;
- pode ter imagem ou painel editorial;
- formulário continua usando os mesmos inputs/botões;
- CTA primário sem gradiente no estado final do sistema.

## ADMIN/DEV

- operacional;
- maior densidade é aceitável;
- dark mode só no DEV;
- nenhuma feature administrativa inventa componente visual só para “parecer técnica”.

---

# 17. Acessibilidade

- contraste WCAG AA para texto/controles;
- focus visible sempre;
- touch target 44 px;
- labels reais;
- teclado em menus/calendário/dialogs;
- sem informação apenas por cor;
- `aria-live` para feedback assíncrono adequado;
- motion reduzido;
- zoom até 200% não pode impedir tarefa principal;
- truncamento nunca esconde dado crítico sem alternativa.

---

# 18. Regras de engenharia visual

Para componentes migrados/novos:

1. `0 !important`;
2. `0 100vw/100dvw` dentro do shell;
3. sem paleta hexadecimal local — usar tokens;
4. sem escala própria de radius;
5. sem nova fonte;
6. sem gradiente operacional salvo exceção documentada;
7. sem inline style para layout visual estático;
8. `min-width: 0` em filhos de flex/grid que contenham texto;
9. estados hover/focus/disabled/loading definidos;
10. mobile validado como composição própria.

---

# 19. Definition of Done visual

Uma tela não está pronta enquanto existir:

- overflow horizontal involuntário;
- clipping;
- faixa residual de scrollbar;
- texto quebrando letra por letra;
- heading truncado;
- botão inacessível;
- dupla rolagem;
- modal fora do viewport;
- backdrop com lacuna;
- contraste insuficiente;
- desktop apenas comprimido no mobile;
- card nesting sem necessidade;
- radius/paleta local sem justificativa;
- “personalidade” obtida por asset abstrato genérico;
- divergência visual entre duas superfícies da mesma feature.

---

# 20. Arquitetura de migração

A partir da 3.3:

```text
product-system-v33.css  → tokens e primitives canônicos
foundation-v24.css      → viewport/scroll até ser absorvido
shell-v24.css           → shell até migração final
feature.css             → somente layout/expressão específica da feature
legacy styles           → reduzir continuamente
```

A meta não é criar `v34-fixes.css`. A meta é:

> **componente tocado = componente migrado para o design system.**

A landing permanece fora desta cadeia até seu redesign completo.
