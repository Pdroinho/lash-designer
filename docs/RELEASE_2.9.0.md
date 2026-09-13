# Lash Designer 2.9.0 RC — Booking Product Polish

## Objetivo

Corrigir a direção visual experimental da 2.8 sem abandonar a estrutura de booking que já funcionava. A 2.9 trata a tela como produto: menos cenografia, menos repetição e menos altura artificial.

## Mudanças principais

- lateral desktop reconstruída como rail compacto de marca;
- sem SVG decorativo, sem shape abstrato e sem fotografia ocupando meia tela;
- imagem contextual usa a capa do serviço selecionado quando disponível;
- a imagem possui função de contexto, não de preenchimento;
- a lateral repete somente data/horário quando já escolhidos;
- preço e duração ficam no resumo principal de confirmação;
- shell desktop não força altura de dashboard; cresce pelo conteúdo;
- progresso mostra etapa atual e quatro segmentos simples;
- títulos e microcopy reduzidos;
- confirmação mobile permanece em uma coluna, com CTA full-width;
- telefone e consentimento de marketing não foram alterados funcionalmente.

## Não regressões obrigatórias

- números locais, `55` e `+55` continuam normalizados;
- opt-in promocional continua desmarcado por padrão;
- `Ler mais` continua progressivo;
- opt-in anterior não é revogado por booking futuro desmarcado;
- cliente continua podendo alterar a preferência depois;
- broadcast permanece bloqueado até existir pipeline operacional seguro.

## Gate externo

`npm ci --ignore-scripts` foi tentado e o registry interno devolveu `404` para `zod-validation-error@4.0.2`. Por isso a release permanece RC até CI/VPS executar o pipeline completo.
