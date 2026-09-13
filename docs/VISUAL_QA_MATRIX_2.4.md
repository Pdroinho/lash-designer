# Matriz visual — Lash Designer 2.4.0

Esta matriz registra a execução em Chromium headless com o layout real dos fixtures 2.4. O zoom é modelado pela pressão equivalente no viewport CSS (viewport físico ÷ zoom), evitando o uso artificial de `CSS zoom`.

**Total:** 95 cenários. **Falhas estruturais:** 0.

Critérios automatizados por cenário: overflow horizontal de `html`, `body` e página; cobertura integral de overlay; contenção do diálogo; largura da sidebar recolhida; detecção de textos espremidos/verticais.

## Cobertura por superfície

| Superfície | Cenários |
|---|---:|
| Agenda — semana | 10 |
| Agenda — bloqueios | 3 |
| Agenda — horários | 3 |
| Agenda — mês | 3 |
| Login | 3 |
| Assinatura | 4 |
| Agendamento público | 3 |
| Checkout | 4 |
| Portal da cliente | 3 |
| Dashboard | 11 |
| DEV dark | 2 |
| Drawer mobile | 2 |
| Financeiro | 3 |
| Landing page | 11 |
| Luma | 3 |
| Modal curto | 9 |
| Modal longo | 3 |
| Serviços | 3 |
| Configurações/domínio | 3 |
| Setup pós-compra | 3 |
| Product Tour | 3 |
| WhatsApp | 3 |

## Resultados

| Superfície | Viewport físico | Viewport CSS efetivo | Zoom | Estado | Resultado |
|---|---:|---:|---:|---|---|
| Dashboard | 320x568 | 320x568 | 100% | padrão | PASS |
| Dashboard | 360x800 | 360x800 | 100% | padrão | PASS |
| Dashboard | 390x844 | 390x844 | 100% | padrão | PASS |
| Dashboard | 412x915 | 412x915 | 100% | padrão | PASS |
| Dashboard | 768x900 | 768x900 | 100% | padrão | PASS |
| Dashboard | 1024x620 | 1024x620 | 100% | sidebar recolhida | PASS |
| Dashboard | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Dashboard | 1280x720 | 1280x720 | 100% | padrão | PASS |
| Dashboard | 1366x768 | 1366x768 | 100% | sidebar recolhida | PASS |
| Dashboard | 1366x900 | 1366x900 | 100% | padrão | PASS |
| Dashboard | 1920x1080 | 1920x1080 | 100% | padrão | PASS |
| Agenda — semana | 320x568 | 320x568 | 100% | padrão | PASS |
| Agenda — semana | 375x667 | 375x667 | 100% | padrão | PASS |
| Agenda — semana | 390x844 | 390x844 | 100% | padrão | PASS |
| Agenda — semana | 768x900 | 768x900 | 100% | padrão | PASS |
| Agenda — semana | 1366x900 | 1708x1125 | 80% | padrão | PASS |
| Agenda — semana | 1366x900 | 1518x1000 | 90% | padrão | PASS |
| Agenda — semana | 1366x900 | 1366x900 | 100% | padrão | PASS |
| Agenda — semana | 1366x900 | 1242x818 | 110% | padrão | PASS |
| Agenda — semana | 1366x900 | 1093x720 | 125% | padrão | PASS |
| Agenda — semana | 1366x900 | 911x600 | 150% | padrão | PASS |
| Agenda — mês | 320x568 | 320x568 | 100% | padrão | PASS |
| Agenda — mês | 390x844 | 390x844 | 100% | padrão | PASS |
| Agenda — mês | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Agenda — horários | 320x568 | 320x568 | 100% | padrão | PASS |
| Agenda — horários | 390x844 | 390x844 | 100% | padrão | PASS |
| Agenda — horários | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Agenda — bloqueios | 320x568 | 320x568 | 100% | padrão | PASS |
| Agenda — bloqueios | 390x844 | 390x844 | 100% | padrão | PASS |
| Agenda — bloqueios | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Modal curto | 320x568 | 320x568 | 100% | padrão | PASS |
| Modal curto | 375x667 | 375x667 | 100% | padrão | PASS |
| Modal curto | 1024x768 | 1280x960 | 80% | padrão | PASS |
| Modal curto | 1024x768 | 1138x853 | 90% | padrão | PASS |
| Modal curto | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Modal curto | 1024x768 | 931x698 | 110% | padrão | PASS |
| Modal curto | 1024x768 | 819x614 | 125% | padrão | PASS |
| Modal curto | 1024x768 | 683x512 | 150% | padrão | PASS |
| Modal curto | 1440x900 | 1440x900 | 100% | padrão | PASS |
| Modal longo | 320x568 | 320x568 | 100% | padrão | PASS |
| Modal longo | 390x844 | 390x844 | 100% | padrão | PASS |
| Modal longo | 1024x720 | 1024x720 | 100% | padrão | PASS |
| Product Tour | 320x568 | 320x568 | 100% | padrão | PASS |
| Product Tour | 375x667 | 375x667 | 100% | padrão | PASS |
| Product Tour | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Configurações/domínio | 320x568 | 320x568 | 100% | padrão | PASS |
| Configurações/domínio | 360x800 | 360x800 | 100% | padrão | PASS |
| Configurações/domínio | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Serviços | 320x568 | 320x568 | 100% | padrão | PASS |
| Serviços | 390x844 | 390x844 | 100% | padrão | PASS |
| Serviços | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Assinatura | 320x568 | 320x568 | 100% | padrão | PASS |
| Assinatura | 390x844 | 390x844 | 100% | padrão | PASS |
| Assinatura | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Assinatura | 1366x900 | 1366x900 | 100% | padrão | PASS |
| WhatsApp | 320x568 | 320x568 | 100% | padrão | PASS |
| WhatsApp | 390x844 | 390x844 | 100% | padrão | PASS |
| WhatsApp | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Financeiro | 320x568 | 320x568 | 100% | padrão | PASS |
| Financeiro | 390x844 | 390x844 | 100% | padrão | PASS |
| Financeiro | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Drawer mobile | 320x568 | 320x568 | 100% | padrão | PASS |
| Drawer mobile | 390x844 | 390x844 | 100% | padrão | PASS |
| DEV dark | 1024x620 | 1024x620 | 100% | padrão | PASS |
| DEV dark | 1366x768 | 1366x768 | 100% | padrão | PASS |
| Setup pós-compra | 320x568 | 320x568 | 100% | padrão | PASS |
| Setup pós-compra | 390x844 | 390x844 | 100% | padrão | PASS |
| Setup pós-compra | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Luma | 320x568 | 320x568 | 100% | padrão | PASS |
| Luma | 390x844 | 390x844 | 100% | padrão | PASS |
| Luma | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Login | 320x568 | 320x568 | 100% | padrão | PASS |
| Login | 390x844 | 390x844 | 100% | padrão | PASS |
| Login | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Agendamento público | 320x568 | 320x568 | 100% | padrão | PASS |
| Agendamento público | 390x844 | 390x844 | 100% | padrão | PASS |
| Agendamento público | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Portal da cliente | 320x568 | 320x568 | 100% | padrão | PASS |
| Portal da cliente | 390x844 | 390x844 | 100% | padrão | PASS |
| Portal da cliente | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Checkout | 320x568 | 320x568 | 100% | padrão | PASS |
| Checkout | 390x844 | 390x844 | 100% | padrão | PASS |
| Checkout | 1024x768 | 1024x768 | 100% | padrão | PASS |
| Checkout | 1366x900 | 1366x900 | 100% | padrão | PASS |
| Landing page | 320x568 | 320x568 | 100% | padrão | PASS |
| Landing page | 390x844 | 390x844 | 100% | padrão | PASS |
| Landing page | 768x900 | 768x900 | 100% | padrão | PASS |
| Landing page | 1366x900 | 1708x1125 | 80% | padrão | PASS |
| Landing page | 1366x900 | 1518x1000 | 90% | padrão | PASS |
| Landing page | 1366x900 | 1366x900 | 100% | padrão | PASS |
| Landing page | 1366x900 | 1242x818 | 110% | padrão | PASS |
| Landing page | 1366x900 | 1093x720 | 125% | padrão | PASS |
| Landing page | 1366x900 | 911x600 | 150% | padrão | PASS |
| Landing page | 1440x900 | 1440x900 | 100% | padrão | PASS |
| Landing page | 1920x1080 | 1920x1080 | 100% | padrão | PASS |

## Limites desta matriz

- Chromium foi executado localmente. Firefox e WebKit/Safari continuam como homologação externa obrigatória.
- O runner valida geometria e renderização dos fixtures; credenciais reais de InfinitePay, OpenRouter, DNS/Caddy e Evolution/WhatsApp exigem staging.
- Teclado virtual físico, autofill do navegador e diferenças de viewport de Safari iOS devem ser validados em dispositivos reais.
- Screenshots representativos estão no diretório `docs/qa-2.4/` do pacote final.
