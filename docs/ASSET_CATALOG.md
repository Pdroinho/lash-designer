# Catálogo de assets — release 5.7.0

Assets visuais ativos da landing e catálogo de produto regenerados em 2026-08-14.

| Arquivo | Dimensões | Peso |
|---|---:|---:|
| `public/landing/mobile-booking-1440.webp` | 1440×960 | 33.3 KB |
| `public/landing/mobile-booking-720.webp` | 720×480 | 14.7 KB |
| `public/landing/planning-1440.webp` | 1440×960 | 62.7 KB |
| `public/landing/planning-720.webp` | 720×480 | 26.3 KB |
| `public/landing/result-640.webp` | 640×400 | 15.1 KB |
| `public/landing/studio-1672.webp` | 1672×941 | 82.0 KB |
| `public/landing/studio-960.webp` | 960×540 | 42.1 KB |
| `public/landing/treatment-1440.webp` | 1440×960 | 53.7 KB |
| `public/landing/treatment-720.webp` | 720×480 | 23.0 KB |
| `public/landing/product/agenda.webp` | 1440×900 | 32.8 KB |
| `public/landing/product/booking.webp` | 390×844 | 21.2 KB |
| `public/landing/product/dashboard.webp` | 1440×900 | 51.0 KB |
| `public/landing/product/finance.webp` | 1440×900 | 32.0 KB |
| `public/landing/product/luma.webp` | 1440×900 | 48.4 KB |
| `public/landing/product/mobile-dashboard.webp` | 390×844 | 21.5 KB |
| `public/landing/product/product-flow.mp4` | 1280×800 | 404.9 KB |
| `public/landing/product/product-flow.webm` | 1280×800 | 234.1 KB |
| `public/landing/product/whatsapp.webp` | 1440×900 | 53.6 KB |

## Fonte canônica

A interface usa `Manrope` como `--font-ui`, com fallback para `Segoe UI Variable`, `Segoe UI`, `Inter` e sans-serif. O pipeline 5.7 lê a mesma cascata CSS da aplicação e aceita `ASSET_CAPTURE_MANROPE_FILE` para embutir Manrope apenas durante a captura, sem distribuir o arquivo da fonte.

Para captura canônica, use `ASSET_CAPTURE_STRICT_FONT=1`; o script falha se Manrope não estiver realmente disponível.

## Assets legados removidos

Foram removidos hero/community/owner/reveal/result-alt antigos e os quatro `proof-*` demonstrativos sem uso no runtime. `public/landing/result-640.webp` foi preservado porque continua sendo fallback real do booking.
