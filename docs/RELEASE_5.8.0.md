# Lash Designer 5.8.0 — Dark Editorial Sales Landing

## Objetivo
Reestruturar a landing page com uma direção de venda mais forte e uma composição editorial escura, usando a página enviada pelo produto como referência de ritmo e hierarquia, sem copiar identidade visual, conteúdo ou marca de terceiros.

## Mudanças principais
- Hero escuro e centralizado, com headline limitada e produto aparecendo já na primeira dobra.
- Faixa de telas do produto no hero: Financeiro, Agenda, Visão Geral, Booking e WhatsApp.
- Paleta restrita a preto quente, vinho, rosa queimado, marfim e tons neutros. Nenhum verde de marketing.
- Três pilares fotográficos orientados a resultado, em vez do bloco abstrato de "rotina real".
- Showcase de produto com quatro áreas: Agenda, WhatsApp, Financeiro e Luma.
- Estado do showcase controlado exclusivamente pelo React; GSAP fica restrito a reveal e parallax leve.
- Diretório compacto de capacidades com ícones Phosphor já presentes no projeto.
- Seção editorial com fotografia do studio para conectar produto e operação real.
- Pricing preserva a evolução comercial da 5.5/5.7: produto completo em todos os ciclos, primeiro mês promocional e economia explícita.
- CTA final fotográfico e footer em colunas.
- Sem testimonials, logos, métricas ou prova social inventada.

## Ícones
A landing usa o mapa semântico `src/components/Icons.ts`, abastecido por `@phosphor-icons/react@2.1.10`. Emojis e glyphs textuais decorativos foram removidos da landing.

## Motion
GSAP/ScrollTrigger permanece como dependência existente, mas não controla tabs/carousels/estado React. O uso ficou limitado a:
- entrada inicial do hero;
- entrada escalonada da faixa de produto;
- reveals ao entrar no viewport;
- parallax discreto da faixa do hero.

## Responsividade validada
Fixture visual renderizada em:
- 390x844
- 768x900
- 1440x900
- 1920x1080

Resultado: 0 overflow horizontal e 0 heading com clipping estrutural nos quatro viewports.

## Gate de build
A sintaxe TSX da `LandingPage.tsx` foi transpilada sem diagnóstico sintático. O `npm run typecheck` completo não pode finalizar neste ambiente porque `node_modules` não está instalado e o TypeScript para na ausência de `vite/client`.
