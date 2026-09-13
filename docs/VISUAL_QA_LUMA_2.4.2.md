# Visual QA — Luma 2.4.2

## Resultado consolidado

Foram executados **29 cenários Chromium / 29 PASS / 0 FAIL** para as superfícies da Luma.

A matriz verifica overflow de documento e página, contenção do drawer, overlay, texto comprimido verticalmente e comportamento sob pressão equivalente de zoom.

## Página dedicada

Estados testados:

- primeira conversa / estado vazio;
- thread já iniciada.

Viewports principais:

| Estado | Viewport | Resultado |
| --- | ---: | --- |
| Empty | 320×568 | PASS |
| Empty | 390×844 | PASS |
| Empty | 1024×768 | PASS |
| Thread | 320×568 | PASS |
| Thread | 390×844 | PASS |
| Thread | 1024×768 | PASS |

A thread também foi submetida à pressão equivalente de zoom em 80%, 90%, 110%, 125% e 150%.

## Drawer

Estados testados:

- primeira conversa;
- conversa em andamento.

Viewports principais:

| Estado | Viewport | Resultado |
| --- | ---: | --- |
| Empty | 320×568 | PASS |
| Empty | 390×844 | PASS |
| Empty | 995×907 | PASS |
| Empty | 1024×768 | PASS |
| Empty | 1440×900 | PASS |
| Thread | 320×568 | PASS |
| Thread | 390×844 | PASS |
| Thread | 1024×768 | PASS |

Drawer vazio e thread foram submetidos à pressão equivalente de zoom de até 150%.

## Evidências

- `docs/qa-2.4.2/luma-page-empty-desktop.png`
- `docs/qa-2.4.2/luma-page-thread-desktop.png`
- `docs/qa-2.4.2/luma-drawer-empty-desktop.png`
- `docs/qa-2.4.2/luma-drawer-thread-desktop.png`
- `docs/qa-2.4.2/luma-page-empty-mobile.png`
- `docs/qa-2.4.2/luma-drawer-thread-mobile.png`
