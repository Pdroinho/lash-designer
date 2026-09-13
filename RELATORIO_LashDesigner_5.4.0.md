# Relatório — Lash Designer 5.4.0

## Escopo

Reconstrução da direção de motion e refinamento visual/comercial da landing após a 5.3 continuar abaixo do benchmark Mangomint em escala tipográfica, coreografia, sensação de produto vivo e sofisticação de interação.

A 5.4 não adiciona outro framework de UI nem Tailwind. A base visual continua no CSS do projeto e a nova dependência de runtime é somente `gsap@3.15.0`, usada para coreografia, ScrollTrigger e SplitText.

## Diagnóstico aplicado

A 5.3 ainda dependia demais de recursos típicos de landing gerada rapidamente:

1. headline usada como principal efeito visual;
2. reveal genérico por IntersectionObserver;
3. pouca relação entre scroll e estado do produto;
4. movimento ornamental sem uma timeline central;
5. subcopy ainda usando vocabulário de SaaS em vez da rotina real da lash designer.

## Mudanças principais

### Hero

Headline atual:

> Você cuida dos cílios. O Lash Designer cuida da rotina.

O teto tipográfico foi reduzido para aproximadamente 66 px no desktop grande. O objetivo é deixar o produto competir com a headline, em vez de aparecer abaixo de um bloco tipográfico colossal.

A supporting copy agora descreve o fluxo concreto:

> A cliente agenda pelo link, o WhatsApp confirma e você acompanha agenda, clientes e financeiro no mesmo lugar — sem organizar o dia entre mensagens, caderno e planilha.

O fundo deixou de ser um gradiente estático e passou a usar mesh em camadas, glows lentos e grain sutil.

### Produto no hero

- Agenda continua sendo a primeira visão;
- o fluxo real de agendamento usa vídeo quando movimento é permitido;
- Visão Geral e Luma permanecem acessíveis por tabs;
- side peeks da experiência mobile e do booking ganham deslocamento ligado ao scroll no desktop;
- o palco inteiro recebe scale/y progressivo via ScrollTrigger.

### Motion com GSAP

A landing passa a usar:

- `SplitText` com máscara por palavras no hero;
- `SplitText` por linhas nas headlines de seção;
- `ScrollTrigger` para reveals e progressão de seções;
- scrub no palco principal e elementos laterais;
- scroll story Agendamento → WhatsApp → Gestão;
- parallax controlado em fotografias editoriais;
- CTAs magnéticos com reset elástico;
- transições de estado do produto e do módulo operacional via GSAP;
- `gsap.matchMedia()` para separar comportamento desktop;
- cleanup de listeners/plugins ao desmontar o componente.

`prefers-reduced-motion` continua desabilitando movimento não essencial.

### Scroll story operacional

O módulo Agendamento / WhatsApp / Gestão passa a ter um comportamento editorial de scroll:

- os passos ficam à esquerda;
- a mídia fica sticky à direita em desktop;
- ScrollTrigger altera o estado ativo conforme o passo entra na faixa de leitura;
- em tablet/mobile o módulo volta a uma composição estática e tocável, evitando scroll-jacking.

### Tipografia

Além do hero, os títulos de seção receberam novos tetos. A landing não depende mais de headings gigantes para criar hierarquia.

### Copy

A copy foi ajustada para reduzir termos abstratos e aproximar o produto da rotina real: link de agendamento, WhatsApp, mensagens, caderno, planilha, confirmação e fechamento do dia.

## O que deliberadamente não entrou

- Tailwind;
- Magic UI;
- Aceternity UI;
- React Bits;
- Motion/Framer Motion;
- segundo design system;
- partículas/cursor trails/3D apenas por decoração;
- prova social inventada.

Essas bibliotecas foram avaliadas, mas adicioná-las agora criaria sobreposição de styling/dependências sem resolver melhor a coreografia central do que GSAP.

## Audits

A matriz estática completa voltou verde:

- Landing 5.4: 22/22;
- Responsividade: 26/26;
- Iconografia: 16/16;
- Visual System: 22/22;
- Design System 3.3: aprovado;
- UX: 18/18;
- Indicações: 12/12;
- Onboarding: 16/16;
- Estrutural: 26/26;
- Luma: 33/33;
- Financeiro: 24/24;
- Appointment Lifecycle: 36/36;
- WhatsApp Center: 25/25;
- Product Consistency: 19/19;
- Customer Experience: 25/25;
- Marketing Consent: 15/15;
- Security 5.x: 43/43;
- Password UI: 11/11.

Testes executáveis independentes:

- migrations: 11/11;
- security primitives: 11/11;
- WhatsApp: 31/31;
- total: 53/53.

`npm audit --omit=dev --offline`: 0 vulnerabilidades reportadas pelo lockfile/cache disponível.

## Gate não validado nesta sessão

`npm run typecheck` não pode ser concluído porque o ambiente desta sessão não possui a árvore de dependências instalada; o TypeScript interrompe em:

`TS2688: Cannot find type definition file for 'vite/client'`.

Além disso, `gsap@3.15.0` foi adicionado ao manifesto/lockfile, mas o pacote não pôde ser baixado neste ambiente sem rede. Portanto não são declarados como aprovados aqui:

- `npm ci`;
- typecheck integral;
- lint integral;
- build Vite;
- `npm run check` integral;
- preflight de produção;
- QA visual renderizado da 5.4.

Esses gates devem rodar no ambiente de deploy, onde o projeto já possui acesso ao registry.
