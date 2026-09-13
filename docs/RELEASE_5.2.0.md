# Lash Designer 5.2.0 — Landing Rebuild

## Objetivo

Reconstruir a landing page para que a percepção externa do Lash Designer acompanhe a maturidade real do produto. A direção deixa de ser “template SaaS feminino” e passa a ser uma composição editorial de beauty business, com o produto real como principal elemento visual.

## Direção de referência

A Mangomint foi usada como referência principal de princípios, não como layout para cópia:

- hero centralizado e simples;
- produto em escala grande como principal prova visual;
- gradiente atmosférico/aurora em vez de excesso de cards;
- muito espaço respirável;
- blocos escuros como âncoras de ritmo;
- tipografia sans forte;
- simplificação progressiva no mobile;
- movimento sutil para dar vida ao produto sem transformar a página em demo de animação.

O Lash Designer mantém identidade própria: vinho, marfim, lilás/rosa/pêssego, copy em português e foco específico na lash designer brasileira.

## Nova narrativa

### Hero

**Seu studio, com cara de negócio de verdade.**

O hero vende transformação antes de lista de funcionalidades. O produto real aparece logo abaixo em um carousel de Visão geral, Agenda e Luma.

### Cliente ↔ profissional

A página passa a usar uma oposição central:

1. **A experiência dela** — agendamento e percepção profissional da marca.
2. **A sua visão** — dashboard/agenda e clareza operacional.

Isso substitui a antiga sequência de cards equivalentes por uma história de valor mais proprietária.

### WhatsApp

O módulo é vendido como alívio operacional: menos confirmação digitada manualmente, conversas contextualizadas e continuidade do relacionamento no número da profissional.

### Luma

A Luma deixa de disputar a primeira dobra. Ela aparece depois do core do produto, quando o visitante já entendeu agenda, clientes e operação.

### Produto

O inventário de funcionalidades virou diretório editorial por trabalho:

- Atendimento
- Clientes
- Negócio
- Marca

Sem parede de feature cards.

### Preço

Os quatro ciclos continuam vindo da API de billing e preservam o mesmo checkout, mas são apresentados em um único painel comparável em vez de quatro cards independentes.

### Prova social

A prova social demonstrativa/falsa foi removida. A landing não atribui falas ou resultados a clientes inexistentes. Um bloco de customer stories deve voltar somente quando houver material real autorizado.

## Movimento

A página usa apenas CSS e APIs nativas:

- aurora animada;
- troca automática do produto a cada 5,5 s;
- reveal com IntersectionObserver;
- transições curtas de mockup;
- suporte a `prefers-reduced-motion`.

Nenhuma dependência de animação foi adicionada.

## Responsividade

QA visual dedicado nos viewports:

- 390 × 844
- 768 × 900
- 1366 × 900
- 1920 × 1080

A adaptação mobile não é redução proporcional do desktop: side peeks desaparecem, o produto principal assume a composição, grid editorial empilha e navegação vira menu compacto.

## Assets

A release usa os melhores assets já existentes no pacote, incluindo screenshots reais de Dashboard, Agenda e Luma.

As fotografias editoriais atuais são adequadas para lançar a nova direção, mas continuam sendo uma dívida de conteúdo: a próxima evolução visual ideal é substituí-las por um ensaio real de lash designer/studio sem alterar a arquitetura da landing.

## Verificações

- Landing 5.2: 24/24
- Responsividade: 26/26
- Iconografia: 16/16
- Visual System: 22/22
- Design System 3.3: aprovado
- UX: 18/18
- Onboarding: 16/16
- Estrutural: 26/26
- Luma: 33/33
- Financeiro: 24/24
- Appointment Lifecycle: 36/36
- WhatsApp: 25/25
- Consistência: 19/19
- Customer Experience: 25/25
- Consentimento: 15/15
- Security 5.x: 43/43
- Password UI: 11/11
- Testes executáveis de migrations/security/WhatsApp: 53/53
- QA visual Landing 5.2: 4/4 viewports sem overflow horizontal do documento

## Gate não concluído neste ambiente

`npm run typecheck` para em `TS2688: Cannot find type definition file for 'vite/client'` porque a árvore de dependências não está instalada nesta sessão. Consequentemente não se declara `npm run check`/build aprovados aqui. O deploy deve usar a árvore normal de dependências e executar o pipeline padrão antes de promoção.
