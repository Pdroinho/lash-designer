# Matriz visual — Lash Designer 2.5.0

Validação de experiência focada em agendamento público, acesso passwordless da cliente e landing page.

| Tela | Viewport | Overflow horizontal | Texto espremido | Resultado |
|---|---:|---:|---:|---|
| `booking1` | 320x568 | não | não | PASS |
| `booking2` | 320x568 | não | não | PASS |
| `booking3` | 320x568 | não | não | PASS |
| `booking4` | 320x568 | não | não | PASS |
| `client` | 320x568 | não | não | PASS |
| `booking1` | 360x800 | não | não | PASS |
| `booking2` | 360x800 | não | não | PASS |
| `booking3` | 360x800 | não | não | PASS |
| `booking4` | 360x800 | não | não | PASS |
| `client` | 360x800 | não | não | PASS |
| `booking1` | 390x844 | não | não | PASS |
| `booking2` | 390x844 | não | não | PASS |
| `booking3` | 390x844 | não | não | PASS |
| `booking4` | 390x844 | não | não | PASS |
| `client` | 390x844 | não | não | PASS |
| `booking1` | 412x915 | não | não | PASS |
| `booking2` | 412x915 | não | não | PASS |
| `booking3` | 412x915 | não | não | PASS |
| `booking4` | 412x915 | não | não | PASS |
| `client` | 412x915 | não | não | PASS |
| `booking1` | 768x900 | não | não | PASS |
| `booking4` | 768x900 | não | não | PASS |
| `booking1` | 1024x768 | não | não | PASS |
| `booking4` | 1024x768 | não | não | PASS |
| `booking1` | 1440x900 | não | não | PASS |
| `booking4` | 1440x900 | não | não | PASS |
| `client` | 1024x768 | não | não | PASS |
| `landing` | 390x844 | não | não | PASS |
| `landing` | 768x900 | não | não | PASS |
| `landing` | 1366x900 | não | não | PASS |
| `landing` | 1920x1080 | não | não | PASS |

**Total: 31 cenários — 31 PASS / 0 FAIL.**

## Cobertura

- mobile crítico: 320×568, 360×800, 390×844 e 412×915;
- etapas 1–4 do agendamento em todos os viewports mobile críticos;
- agendamento em 768×900, 1024×768 e 1440×900;
- acesso da cliente em mobile e 1024×768;
- landing em 390×844, 768×900, 1366×900 e 1920×1080;
- detecção automática de overflow do documento/body e de texto comprimido em colunas estreitas.

## Observação

Esta matriz é de renderização local em Chromium. OTP real por WhatsApp, confirmação via Evolution API e testes em Safari/Firefox/dispositivos físicos continuam como homologação externa.
