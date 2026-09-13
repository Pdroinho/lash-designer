# Lash Designer 2.4.1 — Luma Drawer Hotfix

## Motivo

A revisão 2.4.0 consolidou shell, overlays e responsividade, mas a abertura lateral da Luma ainda possuía um defeito visual importante: a área de sugestões era um grid de uma coluna sem linhas explícitas. Como o grid ocupava altura definida, o primeiro track podia esticar e os botões das sugestões herdavam esse crescimento, produzindo cartões muito altos, uma faixa horizontal de scroll desproporcional e uma composição que parecia quebrada.

## Correções

- o corpo do drawer agora usa `grid-template-rows: auto minmax(0, 1fr)`;
- sugestões no desktop passaram a ser uma lista compacta de perguntas rápidas;
- o drawer desktop usa largura fluida entre 370 e 440 px, com margem visual de 10 px;
- cabeçalho, contador diário, marca e fechamento foram compactados;
- mensagens usam largura adequada ao painel, sem grandes blocos vazios laterais;
- composer foi reduzido e não permite resize manual no drawer;
- em até 760 px, sugestões viram uma faixa horizontal compacta em vez de ocupar altura excessiva;
- em até 520 px, a Luma vira uma experiência de tela cheia, aproveitando toda a altura disponível;
- animação de entrada foi adicionada e é desativada por `prefers-reduced-motion`;
- a fixture visual agora possui um cenário `luma-drawer`, evitando regressão futura;
- a captura da matriz espera a estabilização das animações antes de medir geometria.

## Validação específica

- Luma drawer: 10/10 cenários Chromium sem overflow, texto vertical ou painel fora do viewport.
- Luma page: 3/3 cenários Chromium preservados.
- `visual-system-audit`: 22/22.
- `responsive-audit`: 26/26.
- `ux-audit`: 18/18.
- `iconography-audit`: 16/16.
- `onboarding-audit`: 16/16.
- `referral-audit`: 12/12.

## Escopo

Esta revisão é deliberadamente focada na Luma lateral e no seu QA automático. Não altera contratos de billing, referrals, Agenda, OpenRouter ou regras comerciais.
