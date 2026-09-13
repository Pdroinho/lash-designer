# Lash Designer 5.10.2 — Mobile App Foundation · Parte 3

## Escopo
Terceiro lote da migração da experiência mobile para uma linguagem de aplicativo, cobrindo:

- Financeiro
- Luma
- Assinatura

A fundação das Partes 1 e 2 é preservada. Desktop não recebe redesign estrutural nesta entrega.

## Financeiro
- hero promocional removido da composição de celular;
- ações reorganizadas para toque;
- KPIs mantidos em 2×2 mesmo em telas pequenas;
- filtros viram segmented control;
- gráfico reduz elementos periféricos em largura móvel;
- eixo Y é removido no celular para aumentar área útil do gráfico;
- modais financeiros viram bottom sheets;
- listas e painéis recebem densidade apropriada para toque.

## Luma
- página dedicada ocupa a viewport útil entre topbar e navegação inferior;
- removida moldura/cartão de desktop;
- corrigida linha implícita do grid que criava espaço morto no mobile;
- sugestões iniciais viram carrossel horizontal tocável;
- conversa usa largura e hierarquia de chat mobile;
- composer permanece no rodapé útil e respeita safe area;
- histórico e ações mantêm touch targets adequados.

## Assinatura
- hero reduzido e com leitura comercial curta;
- planos viram linhas compactas de seleção;
- benefícios permanecem no resumo;
- CTA de compra persistente fica acima da bottom navigation;
- CTA reutiliza exatamente o mesmo `startCheckout()` do desktop;
- promoção mensal, descontos, referral credit e InfinitePay não foram alterados.

## QA
- audit Mobile Parte 3: 18/18;
- QA visual: 12/12 casos sem overflow horizontal (390, 430 e 768 px);
- audits anteriores de mobile, responsividade, visual, consistência, Financeiro, Luma, tema e segurança permanecem verdes;
- testes executáveis independentes: 60/60;
- `npm audit --omit=dev --offline`: 0 vulnerabilidades reportadas.

## Gate não executado
O `typecheck` integral continua bloqueado neste ambiente por ausência de `node_modules` / `vite/client`. Deve ser executado no ambiente de deploy com `npm ci && npm run check`.

## Próxima parte
Parte 4: Configurações + Indicações + Setup/Onboarding + Booking público.
