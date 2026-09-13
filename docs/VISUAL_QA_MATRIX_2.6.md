# Matriz visual — Lash Designer 2.6.0

A rodada 2.6 repetiu a matriz Chromium da experiência pública e passou em **31/31 cenários** sem overflow horizontal ou texto comprimido a largura crítica.

## Booking mobile

Cada uma das quatro etapas foi verificada em:

- 320×568;
- 360×800;
- 390×844;
- 412×915.

## Booking tablet/desktop

Estados críticos foram verificados em:

- 768×900;
- 1024×768;
- 1440×900.

A etapa final foi testada com conteúdo realista nos campos, incluindo `Pedro Henrique` e `+55 (35) 99916-7985`, para conferir largura, máscara e composição visual.

## Área da cliente

- 320×568;
- 360×800;
- 390×844;
- 412×915;
- 1024×768.

## Landing — regressão

A landing, que não foi redesenhada nesta release, permaneceu na matriz para detectar regressões de CSS global:

- 390×844;
- 768×900;
- 1366×900;
- 1920×1080.

## Critérios automáticos

Cada cenário reprova quando:

- `documentElement.scrollWidth` excede a largura útil;
- `body.scrollWidth` excede a largura útil;
- um texto relevante fica comprimido em menos de 30 px e cresce verticalmente como coluna de letras.

Além da geometria, as capturas representativas foram inspecionadas visualmente após a inclusão do novo motivo gráfico.

## Capturas preservadas

A pasta `docs/qa-2.6/` contém estados representativos de serviço, data, horário, confirmação e área CLIENT em desktop e mobile.
