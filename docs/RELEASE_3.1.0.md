# Lash Designer 3.1.0 RC — Luma Intelligence Atelier

## Direção de produto

A Luma foi reconstruída nas duas superfícies — página dedicada e drawer lateral — a partir da direção **Intelligence Atelier**: uma mesa editorial de leitura e decisão para o negócio, e não um chatbot genérico.

A funcionalidade existente foi preservada. A alteração é de arquitetura visual, hierarquia, composição e comportamento responsivo.

## O que saiu

- avatar de estrelinha / marca genérica de assistente;
- cards de prompts;
- pills de Agenda, Clientes, Financeiro e Resultados;
- bolhas pesadas de conversa;
- drawer com aparência de mini ChatGPT;
- painel arredondado/flutuante como principal linguagem da Luma;
- folha `src/luma-v24.css` antiga.

## Nova linguagem — página

- identidade tipográfica `L` própria e discreta;
- abertura editorial com uma pergunta principal em Fraunces;
- escopo de dados apresentado como metadado, não chips;
- sugestões organizadas como um ledger/index de leituras;
- conversa renderizada como documento analítico;
- perguntas da profissional ganham hierarquia editorial;
- respostas da Luma usam coluna de análise, sem bubble/avatares;
- composer vira uma mesa de consulta com linha editorial, não caixa de chat.

## Nova linguagem — drawer

- drawer encosta na lateral da janela como ferramenta de trabalho, sem card flutuante;
- identidade e contador de uso compactos;
- estado inicial adaptado ao espaço estreito;
- perguntas aparecem como notas da profissional;
- respostas permanecem abertas e legíveis;
- mesmo histórico da página continua compartilhado via `sessionStorage`;
- em mobile o drawer ocupa a tela inteira com contrato próprio.

## Funcionalidade preservada

- histórico curto da sessão;
- histórico limitado enviado ao backend;
- OpenRouter apenas no servidor;
- cota diária existente;
- abort/stop;
- retry sem duplicar mensagem;
- textarea autoexpansível;
- mesma conversa entre página e drawer;
- launcher oculto enquanto a página dedicada já está aberta;
- `prefers-reduced-motion`.

## QA executado

- 17/17 auditoria específica da Luma;
- 26/26 responsividade;
- 16/16 iconografia;
- 22/22 sistema visual;
- 18/18 UX/overlays;
- 12/12 indicações;
- 16/16 onboarding;
- 25/25 experiência pública;
- 15/15 consentimento;
- 26/26 auditoria estrutural;
- 49/49 arquivos TS/TSX de runtime passaram em transpilação sintática isolada;
- `luma-v31.css`: zero `!important` e zero `100vw/100dvw`;
- geometria dedicada em Chromium passou para página e drawer em 1440×900, 1024×768, 390×844 e 320×568, sem overflow horizontal e com composer dentro do viewport.

## Gate externo

`npm ci --ignore-scripts` foi tentado novamente e continua bloqueado pelo registry interno, que retorna `404` para `zod-validation-error@4.0.2`. A release permanece RC até `npm ci && npm run check && npm run preflight` rodar em CI/VPS com registry funcional.
