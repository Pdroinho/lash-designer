# Entrega de Produção — 5.10.2

Parte 1 da migração mobile-app: shell, navegação inferior, Dashboard e Agenda. Sem mudanças de backend ou banco.

## Gate obrigatório no deploy

Este ambiente continua sem `node_modules/vite/client`; rode `npm ci && npm run check` no VPS/CI antes da promoção.

---

# Entrega de Produção — 5.9.0

Personalização visual do tenant corrigida na raiz: superfícies, shell, dashboard, setup e booking agora derivam da identidade escolhida. Sem mudanças de banco, autenticação, billing ou campanhas.

## Gate obrigatório no deploy

Este ambiente continua sem `node_modules/vite/client`; rode `npm ci && npm run check` no VPS/CI antes da promoção.

---

# Entrega de Produção — 5.8.0

Landing comercial reconstruída; demais contratos de produção preservados.

# Entrega — Lash Designer 5.7.0

## Estado

A 5.7.0 preserva integralmente a base funcional/legal da 5.6.0 e atualiza o catálogo visual da landing para refletir a plataforma atual. Termos/Privacidade, prova de aceite e campanhas WhatsApp permanecem como na 5.6.0.

## Gates executados nesta sessão

- Legal/compliance 5.6: 38/38;
- matriz estática de produto: aprovada;
- migrations: 14/14;
- security primitives: 11/11;
- WhatsApp executável: 35/35;
- grupos executáveis independentes: 60/60;
- `npm audit --omit=dev --offline`: 0 vulnerabilidades reportadas.

## Identidade jurídica obrigatória

Antes de produção, preencher no `.env` real:

- `LEGAL_PROVIDER_NAME`;
- `LEGAL_PROVIDER_TAX_ID`;
- `LEGAL_PROVIDER_ADDRESS`;
- `LEGAL_CONTACT_EMAIL`;
- `PRIVACY_CONTACT_EMAIL`.

O preflight e o servidor em produção recusam a ausência desses valores.

## Campanhas promocionais

A implementação está pronta, mas a feature flag nasce desligada:

```env
WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED=false
WHATSAPP_CAMPAIGN_MAX_RECIPIENTS=50
WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS=15
```

Só ativar após homologar a instância/número real, o envio pequeno e o opt-out.

## Gate obrigatório no ambiente de deploy

Este ambiente não possui a árvore npm íntegra. `npm run typecheck` foi tentado e parou em `vite/client` ausente. Antes da promoção:

```bash
npm ci
npm run check
set -a; source ./.env; set +a
NODE_ENV=production npm run preflight
```

Depois, validar checkout, aceite legal, versão histórica aceita, campanha pequena e opt-out `SAIR`.

## Documentação

- `docs/RELEASE_5.7.0.md`;
- `docs/RELEASE_5.6.0.md`;
- `docs/LEGAL_COMPLIANCE_5.6.md`;
- `RELATORIO_LashDesigner_5.7.0.md`;
- `RELATORIO_LashDesigner_5.6.0.md`;
- `VALIDATION.md`.
