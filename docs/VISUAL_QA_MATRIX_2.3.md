# Matriz visual manual — 2.3.0

Executada em 7 de agosto de 2026 no Chromium 149 com API e SQLite isolados. As capturas foram inspecionadas manualmente e acompanhadas por medição do viewport e overflow.

| Superfície | 1440 × 900 | 390 × 844 | Resultado |
| --- | :---: | :---: | --- |
| Hero e navegação da landing | ✓ | ✓ | headline sem quebra interna, CTA e preço visíveis |
| Landing completa | ✓ | ✓ | overflow horizontal igual a zero |
| Capturas reais e loop do produto | ✓ | ✓ | dashboard, Agenda e Luma legíveis |
| Checkout: escolha do ciclo | ✓ | ✓ | quatro ciclos, total e equivalente mensal |
| Checkout: criação do acesso | ✓ | ✓ | campos essenciais e resumo do pedido |
| Setup: escolha do caminho | ✓ | ✓ | assistido/manual, progresso e saída opcional |
| Setup: identidade | ✓ | ✓ | logo, preferências e paletas responsivas |
| Setup: agenda | ✓ | ✓ | dias, horários e resumo sem corte |
| Setup: serviços | ✓ | ✓ | edição, remoção, adição e resumo final |
| Sidebar expandida/recolhida | ✓ | — | redução medida de 268/260 px para 82 px |
| Drawer móvel | — | ✓ | collapse desktop não altera o contrato móvel |

## Medições finais

- landing desktop: `1440 × 900`, scroll total de 5849 px e overflow horizontal `0`;
- landing mobile: `390 × 844`, scroll total de 7565 px e overflow horizontal `0`;
- setup mobile: documento exatamente `390 × 844`, overflow horizontal `0`;
- sidebar recolhida: largura renderizada de `82 px`, overflow horizontal `0`;
- overlay do checkout: `100dvw × 100dvh` em desktop e mobile.

## Achados corrigidos na renderização

1. O CSS legado aplicava `overflow-wrap: anywhere` no corpo e quebrava “administrar” no meio. A landing agora neutraliza a herança e usa uma escala menor no hero.
2. O primeiro collapse escondia rótulos, mas mantinha `flex-basis: 260px`. Largura e base flexível agora mudam juntas para 82 px.
3. O link “configurar depois” sobrepunha a introdução do setup no mobile. Ele ganhou uma linha própria abaixo do progresso.

Safari, Firefox, leitor de tela, Lighthouse/WebPageTest e pagamento real permanecem gates externos antes da publicação.
