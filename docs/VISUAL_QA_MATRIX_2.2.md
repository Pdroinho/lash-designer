# Matriz visual manual — 2.2.0

Auditoria executada em 7 de agosto de 2026 com Chromium 149, dados locais isolados e inspeção manual das capturas. A matriz combinou renderização real, medição do viewport, verificação de overflow e navegação por teclado.

## Viewports

| Perfil | Viewport | Uso |
| --- | ---: | --- |
| Desktop | 1440 × 900 | landing, checkout, ADMIN, DEV, Luma e modais |
| Tablet | 1024 × 768 | landing e checkout |
| Mobile | 390 × 844 | landing, checkout, ADMIN, navegação e bottom sheets |
| Mobile estreito | 320 × 700 | landing e checkout |

## Resultado por superfície

| Superfície | 1440 | 1024 | 390 | 320 | Evidência verificada |
| --- | :---: | :---: | :---: | :---: | --- |
| Landing: navegação e hero | ✓ | ✓ | ✓ | ✓ | menu, hierarquia, CTAs, quebra de copy e ausência de corte |
| Landing: produto, experiência e recursos | ✓ | ✓ | ✓ | ✓ | cards, fotos, gráficos decorativos e ritmo vertical |
| Landing: Luma, prova, planos, FAQ e CTA final | ✓ | ✓ | ✓ | ✓ | contraste, disclosure de demonstração, legibilidade e densidade |
| Compra direta na landing | ✓ | ✓ | ✓ | ✓ | overlay integral, seleção de ciclo, scroll interno e CTA visível |
| Dashboard ADMIN | ✓ | — | ✓ | — | banner humanizado, métricas, navegação móvel e overflow zero |
| Luma: página, launcher e drawer | ✓ | — | ✓ | — | launcher lateral, camada integral, Escape e restauração do fluxo |
| Indicações ADMIN | ✓ | — | ✓ | — | link, métricas, estados e ações sem compressão lateral |
| Cobrança ADMIN | ✓ | — | ✓ | — | banner compacto, planos, resumo e histórico |
| Console DEV: espaços e indicações | ✓ | — | ✓ | — | overview, tabela/cards e navegação responsiva |
| Novo espaço e configuração do espaço | ✓ | — | ✓ | — | conteúdo, ações, confirmação e zona de risco |
| Serviços: criar/editar | ✓ | — | ✓ | — | diálogo central e bottom sheet móvel |
| Agenda: novo agendamento | ✓ | — | ✓ | — | overlay 100% do viewport, cabeçalho, campos e ações |
| Financeiro: movimentação, extrato e metas | ✓ | — | ✓ | — | alturas, scroll, rodapés e alinhamento |
| Confirmação e exclusão definitiva | ✓ | — | ✓ | — | prioridade visual, copy de risco e ações protegidas |
| Notificações e menu móvel | ✓ | — | ✓ | — | posicionamento, fechamento e coexistência com overlays |

`✓` indica aprovação na combinação renderizada; `—` indica que o breakpoint não acrescentava um contrato distinto ao já coberto. Todos os documentos medidos ficaram com overflow horizontal igual a zero.

## Achados corrigidos durante a matriz

1. O checkout da landing era renderizado por portal fora do escopo dos tokens da página, deixando o CTA branco sobre fundo branco. Os tokens essenciais agora acompanham a camada do checkout.
2. `overflow-x: hidden` transformava o corpo da landing em um contêiner de rolagem inesperado. A página passou a usar `overflow-x: clip`, preservando a captura e a navegação verticais.
3. O coordenador de overlays ignorava elementos `position: fixed` por depender de `offsetParent`. A visibilidade agora é determinada pela geometria realmente renderizada; Escape e foco voltaram a funcionar no drawer da Luma.
4. O launcher da Luma herdava `width: 100%` da área de conteúdo e virava uma barra inferior. A largura passou a ser intrínseca no desktop e fixa no mobile.
5. A animação persistente de entrada da Agenda criava um containing block para o modal, limitando o overlay ao conteúdo. Ao montar um diálogo, transforms ancestrais são neutralizados; a medição final foi exatamente 1440 × 900 e 390 × 844.
6. O cabeçalho do bottom sheet móvel empilhava título e fechar. O contrato específico de modal mantém os dois controles na mesma linha.

## Gate externo de publicação

A matriz desta entrega aprova os contratos visuais no Chromium. Antes da publicação comercial ainda devem ser registrados Safari, Firefox, leitores de tela, Lighthouse/WebPageTest e o pagamento real com as credenciais de produção, conforme `docs/RELEASE_CHECKLIST.md`.
