# Lash Designer 5.10.3 — Mobile App Foundation · Parte 4

## Escopo

Quarto lote da migração mobile para uma linguagem de aplicativo, cobrindo as superfícies restantes do ciclo principal:

- Configurações;
- Indicações;
- Setup/Onboarding;
- Booking público.

As Partes 1, 2 e 3 são preservadas. O desktop continua sem redesign estrutural nesta entrega.

## Configurações

- conteúdo passa para uma coluna no celular;
- cartões recebem densidade e raios coerentes com o restante do app mobile;
- domínio personalizado mantém fluxo real de conexão, verificação, ações e DNS;
- identidade visual usa upload/logo, campos e CTA com touch targets adequados;
- segurança é compactada sem remover senha, MFA, dispositivos, sessões ou preferências legais;
- histórico de faturas deixa de depender de rolagem horizontal e vira leitura em cartões no mobile;
- assinatura continua usando os dados e estados reais já existentes.

## Indicações

- hero comercial fica curto e compatível com tela de app;
- crédito disponível vira resumo horizontal legível;
- métricas reais permanecem vinculadas ao backend e passam para trilho horizontal tocável;
- criação/cópia do link usa os mesmos handlers atuais;
- regras, limites e créditos do programa não foram alterados.

## Setup / Onboarding

- continua sendo um fluxo real de quatro etapas: Caminho, Marca, Agenda e Serviços;
- cabeçalho vira barra compacta de app;
- progresso vira indicador segmentado;
- ações Voltar/Continuar ficam persistentes no rodapé útil;
- paletas viram carrossel horizontal no celular;
- inputs, dias, horários e catálogo são redimensionados para toque;
- análise da Luma, fallback manual e conclusão transacional permanecem inalterados.

## Booking público

- topbar passa a ser persistente no celular;
- as quatro etapas viram uma barra de progresso compacta;
- serviço, datas e horários recebem densidade móvel mais direta;
- resumo de seleção continua navegável horizontalmente;
- CTA de confirmação fica acessível ao polegar e respeita safe area;
- nome, WhatsApp, consentimento opcional, disponibilidade e criação da reserva continuam usando a lógica existente.

## QA

- audit Mobile Parte 4: 20/20;
- QA visual dedicado: 12/12 casos sem overflow horizontal em 390, 430 e 768 px;
- auditorias de responsividade: 26/26;
- indicações: 12/12;
- onboarding: 16/16;
- Mobile Parte 1: 22/22;
- Mobile Parte 2: 18/18;
- Mobile Parte 3: 18/18;
- consistência de produto: 19/19;
- experiência pública: 25/25;
- UX: 18/18;
- iconografia: 16/16;
- sistema visual: 22/22.

## Gate conhecido

O contrato Design System 3.3 ainda reporta três regressões preexistentes fora desta Parte 4: raw hex em `design-system.css` e `!important` nas camadas mobile 5.10/Parte 3. A nova folha `mobile-app-v510-part4.css` não adiciona `!important`, `100vw/100dvw` ou hex local.

O build/typecheck integral continua dependendo de `npm ci` em ambiente com registry funcional.

## Próximo passo sugerido

Com a fundação mobile principal concluída, o próximo ciclo deve ser de polimento transversal: estados vazios/loading/erro, microinterações, QA em aparelho físico e correções visuais pontuais encontradas no uso real, em vez de abrir uma quinta migração estrutural.
