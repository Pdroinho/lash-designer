# Lash Designer 2.8.0 RC — Booking Art Direction Refinement

## Objetivo

A 2.8.0 responde diretamente à revisão visual do booking 2.7: a estrutura funcional estava boa, mas a linguagem visual ainda parecia genérica, excessivamente asséptica e dependente de ornamentação abstrata.

## Mudanças principais

- removido por completo `public/booking/booking-signature.svg`;
- removidas as referências do booking e do acesso da cliente ao ornamento abstrato;
- nova direção editorial para o agendamento, usando fotografia humana já presente no acervo visual do produto;
- lateral reconstruída com fundo vinho sólido, fotografia e resumo de reserva sobreposto;
- headline lateral reduzida para `Agende no seu tempo.`;
- stepper reconstruído como jornada numerada em largura total, sem quatro barras genéricas;
- headings de todas as etapas reduzidos e reescritos para quebrar melhor;
- resumo final saiu do card arredondado genérico e virou uma faixa editorial com divisórias;
- campos e botões foram compactados e tiveram a densidade refinada;
- superfícies deixaram de depender de vários efeitos decorativos e passaram a usar hierarquia, proporção e fotografia;
- mobile recebeu a mesma direção, sem simular a sidebar desktop;
- consentimento promocional 2.7 foi preservado, assim como máscara/normalização de telefone da 2.6.

## O que foi preservado

- fluxo público em quatro etapas;
- agendamento apenas com nome + WhatsApp;
- suporte a telefone local, 55 e +55;
- opt-in promocional explícito e desmarcado por padrão;
- revogação posterior do consentimento;
- regras de booking, disponibilidade e tenant;
- segurança e rate limits anteriores.

## Validação local

- 35/35 cenários visuais Chromium da matriz 2.8 sem overflow ou texto espremido;
- 26/26 auditoria responsiva;
- 16/16 iconografia;
- 22/22 sistema visual;
- 18/18 UX/overlays;
- 12/12 indicações;
- 16/16 onboarding;
- 26/26 auditoria estrutural 2.4;
- 12/12 Luma;
- 25/25 experiência pública;
- 15/15 consentimento;
- 34 arquivos TS/TSX de runtime passaram na transpilação sintática isolada.

## Gate externo

`npm ci` continua bloqueado no ambiente de execução porque o registry interno retorna 404 para `zod-validation-error@4.0.2`. Portanto o pacote permanece RC até passar, em VPS/CI com registry funcional:

```bash
npm ci
npm run check
npm run preflight
```
