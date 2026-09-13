# Matriz visual — Lash Designer 2.7.0

A 2.7.0 repetiu a matriz Chromium da experiência pública com o novo opt-in renderizado na etapa final. Resultado: **35/35 cenários aprovados**, sem overflow horizontal nem texto comprimido em coluna.

## Booking mobile

As quatro etapas foram verificadas em:

- 320×568;
- 360×800;
- 390×844;
- 412×915.

A confirmação foi renderizada com:

- nome preenchido;
- WhatsApp em `+55 (35) 99916-7985`;
- checkbox de promoções **desmarcado por padrão**;
- link `Ler mais` no mesmo bloco;
- CTA imediatamente abaixo.

## Booking tablet/desktop

Estados críticos foram verificados em:

- 768×900;
- 1024×768;
- 1440×900.

O opt-in preservou a densidade da etapa final e não alterou a largura dos campos ou da revisão do agendamento.

## Área da cliente

O acesso passwordless permaneceu na matriz em:

- 320×568;
- 360×800;
- 390×844;
- 412×915;
- 1024×768.

Além do acesso passwordless, o controle autenticado de preferências foi renderizado em 390×844 e 1024×768 para validar o opt-out fora do booking.

## Landing — regressão

A landing permaneceu na matriz para detectar regressões globais:

- 390×844;
- 768×900;
- 1366×900;
- 1920×1080.

## Critérios automáticos

Cada cenário reprova quando:

- `documentElement.scrollWidth` excede a largura útil;
- `body.scrollWidth` excede a largura útil;
- um texto relevante é comprimido em menos de 30 px e cresce verticalmente como coluna de letras.

Além da geometria, a etapa final mobile e desktop foi inspecionada visualmente com o novo consentimento, inclusive com o `Ler mais` expandido.

## Capturas preservadas

A pasta `docs/qa-2.7/` contém confirmação mobile/desktop, disclosure expandido e preferência de comunicação da cliente.
