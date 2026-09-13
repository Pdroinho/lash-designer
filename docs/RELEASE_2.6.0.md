# Release 2.6.0 — Booking Brand Polish & Phone Normalization

A 2.6.0 mantém a arquitetura pública estabelecida na 2.5 e refina a experiência de agendamento em vez de reconstruí-la novamente. O foco foi remover a aparência genérica, reduzir ruído visual, corrigir composição tipográfica e fechar a normalização do WhatsApp de ponta a ponta.

## WhatsApp

O booking e o acesso passwordless da cliente agora usam a mesma regra de entrada:

- `(35) 99916-7985` → `5535999167985`;
- `5535999167985` → `5535999167985`;
- `+55 35 99916-7985` → `5535999167985`;
- `035999167985` → `5535999167985`;
- DDI internacional diferente de `+55` é rejeitado.

A interface aplica máscara progressiva durante a digitação. Quando o DDI é explicitamente informado, a apresentação fica em `+55 (DD) XXXXX-XXXX`; quando a pessoa informa apenas DDD + número, a apresentação fica em `(DD) XXXXX-XXXX`. O backend normaliza novamente antes de usar o telefone como identidade, e os rate limits por telefone usam a forma canônica para evitar contorno do limite apenas mudando pontuação ou DDI.

## Booking 2.6

- copy encurtada em todas as quatro etapas;
- headline lateral reduzida e protegida contra quebras de palavra artificiais;
- stepper redesenhado como trilha editorial de largura total com rótulos `Serviço`, `Data`, `Horário` e `Confirmar`;
- resumo mobile removido da etapa final para não duplicar a revisão do agendamento;
- cards e campos compactados sem reduzir alvos de toque;
- rodapé remove microcopy redundante e mantém somente a navegação necessária;
- revisão final virou uma única superfície compacta em vez de dois cards soltos;
- texto de privacidade foi reduzido ao necessário;
- CTA final passa a usar `Confirmar horário`;
- lateral ganhou hierarquia editorial mais clara e resumo em linhas, sem card translúcido genérico;
- novo motivo gráfico `public/booking/booking-signature.svg` adiciona textura sutil às superfícies sem competir com o conteúdo;
- o mesmo motivo é reaproveitado de forma mais leve no acesso da cliente;
- breakpoints dedicados preservam leitura em 320 px, tablet e desktop.

## O que foi preservado

- quatro etapas automáticas do booking;
- reserva pública sem conta, e-mail ou senha;
- identidade por nome + WhatsApp;
- acesso passwordless por OTP;
- regras de disponibilidade e agenda;
- billing, Luma, indicações, setup e integrações existentes;
- landing 2.5, fora de ajustes relacionados aos testes estruturais.

## Arquivos principais alterados

- `src/App.tsx`;
- `src/phone.ts`;
- `server/phone.ts`;
- `server/index.ts`;
- `src/booking-v26.css`;
- `public/booking/booking-signature.svg`;
- `scripts/customer-experience-audit.mjs`;
- `scripts/v26-experience-qa.py`.

A folha `booking-v25.css` foi substituída pela `booking-v26.css`; não foi adicionada uma nova camada de override sobre o módulo antigo.
