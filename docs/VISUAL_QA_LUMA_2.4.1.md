# Visual QA — Luma 2.4.1

## Drawer

| Estado | Viewport físico | Pressão de zoom | Resultado |
| --- | ---: | ---: | --- |
| Drawer | 320×568 | 100% | PASS |
| Drawer | 390×844 | 100% | PASS |
| Drawer | 995×907 | 100% | PASS |
| Drawer | 1024×768 | 100% | PASS |
| Drawer | 1440×900 | 100% | PASS |
| Drawer | 1024×768 | equivalente a 80% | PASS |
| Drawer | 1024×768 | equivalente a 90% | PASS |
| Drawer | 1024×768 | equivalente a 110% | PASS |
| Drawer | 1024×768 | equivalente a 125% | PASS |
| Drawer | 1024×768 | equivalente a 150% | PASS |

Critérios verificados automaticamente: overflow de `html/body/page`, overlay ocupando o viewport, drawer contido, ausência de texto suspeito comprimido verticalmente e geometria estável após a animação.

## Página da Luma

| Viewport | Resultado |
| ---: | --- |
| 320×568 | PASS |
| 390×844 | PASS |
| 1024×768 | PASS |

## Evidências

- `docs/qa-2.4.1/luma-drawer-desktop-995x907.png`
- `docs/qa-2.4.1/luma-drawer-mobile-320x568.png`
