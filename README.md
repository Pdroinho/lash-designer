# Lash Designer

SaaS multi-tenant de agenda, clientes, serviços, finanças, billing e assistência de negócio para profissionais de extensão de cílios.

**Release atual: 5.10.3 — Mobile App Foundation · Parte 4.**

## Stack

- React 19, Vite e TypeScript;
- Express 5 e TypeScript;
- SQLite com `better-sqlite3` (WAL, foreign keys, busy timeout e backup consistente);
- sessões opacas revogáveis no servidor; em produção, cookie `__Host-session` `HttpOnly`/`Secure`;
- MFA por código WhatsApp e dispositivos confiáveis por 365 dias para ADMIN/DEV;
- segredos sensíveis criptografados em repouso com `APP_ENCRYPTION_KEY`;
- Caddy para HTTPS, subdomínios e domínios personalizados;
- InfinitePay para checkout e confirmação servidor-a-servidor.

## Desenvolvimento

```bash
cp .env.example .env
# Ajuste NODE_ENV=development, URLs e hosts locais
npm ci
npm run dev
```

## Validação de release

```bash
npm run typecheck
npm run lint
npm run test
npm run build
# Com o .env real carregado e NODE_ENV=production:
npm run preflight
```

Atalho completo: `npm run check`.

## Endpoints operacionais

- `GET /api/health`: processo online;
- `GET /api/ready`: processo e banco prontos;
- `GET /api/internal/domains/authorize/:secret`: endpoint local usado pelo Caddy; não deve ser exposto pelo proxy.

## Produção

Siga `DEPLOY_VPS.md`. Arquivos de serviço, proxy, backup, restauração e health check ficam em `deploy/`.

Documentação:

- `docs/RELEASE_5.10.3.md` — Mobile App Foundation Parte 4: Configurações, Indicações, Setup/Onboarding e Booking público;
- `docs/RELEASE_5.10.2.md` — Mobile App Foundation Parte 3: Financeiro, Luma e Assinatura;
- `docs/RELEASE_5.10.1.md` — Mobile App Foundation Parte 2: Clientes, Serviços e WhatsApp;
- `docs/RELEASE_5.10.0.md` — fundação mobile app, Dashboard e Agenda;
- `docs/RELEASE_5.9.0.md` — personalização sistêmica de paleta, logo dinâmica, setup e booking brand-aware;
- `docs/RELEASE_5.7.0.md` — refresh canônico de screenshots, vídeo, OG e pipeline de captura;
- `docs/RELEASE_5.6.0.md` — Termos/Privacidade versionados, evidência de aceite e campanhas promocionais consent-aware;
- `docs/LEGAL_COMPLIANCE_5.6.md` — operação jurídica/técnica, versionamento, prova e liberação segura de campanhas;
- `docs/RELEASE_5.4.1.md` — correção de estados da landing, clipping tipográfico e pricing comercial preservando a direção visual 5.4;
- `docs/RELEASE_5.3.0.md` — histórico da reconstrução sales-first da landing;
- `docs/RELEASE_5.2.0.md` — histórico da primeira reconstrução editorial da landing;
- `docs/RELEASE_5.1.1.md` — feedback visual compartilhado da política de senha;
- `docs/RELEASE_5.1.0.md` — mudanças de autenticação, Evolution Global e gates da 5.1;
- `docs/SECURITY.md` — modelo de segurança operacional atual;
- `docs/SECURITY_AND_RELIABILITY_5.0.md` — histórico da major 5.0;
- `docs/RELEASE_5.0.0.md` — histórico da major 5.0;

- `docs/RELEASE_2.4.2.md` — reconstrução da experiência da Luma;
- `docs/VISUAL_QA_LUMA_2.4.2.md` — matriz visual específica da Luma 2.4.2;
- `docs/RELEASE_2.7.0.md` — opt-in promocional, auditoria de consentimento e preferências da cliente;
- `docs/MARKETING_CONSENT_2.7.md` — contrato técnico de consentimento e opt-out;
- `docs/RELEASE_2.6.0.md` — refinamento visual do booking e normalização completa de WhatsApp;
- `docs/VISUAL_QA_MATRIX_2.6.md` — matriz Chromium da experiência pública refinada;
- `docs/RELEASE_2.5.0.md` — reconstrução do agendamento público, área CLIENT e superfícies comerciais;
- `docs/CUSTOMER_EXPERIENCE_2.5.md` — modelo passwordless e decisões de identidade da cliente;
- `docs/VISUAL_QA_MATRIX_2.5.md` — matriz Chromium da experiência 2.5;
- `docs/CUSTOM_DOMAINS.md` — DNS, verificação e TLS;
- `docs/PRODUCT_TOUR.md` — onboarding e manutenção dos tours;
- `docs/LANDING_PAGE.md` — arquitetura comercial, CTA, SEO, provas sociais e homologação;
- `docs/WHATSAPP.md` — escopo seguro, credenciais e homologação da Evolution API;
- `docs/SECURITY.md` — controles e limites;
- `docs/OPERATIONS.md` — backup, restauração e incidentes;
- `docs/ASSETS_NEEDED.md` — assets finais, tamanhos e prompts;
- `docs/LAUNCH_INPUTS.md` — dados externos ainda necessários;
- `docs/API.md` — superfície principal da API;
- `docs/RELEASE_CHECKLIST.md` — gate de homologação e publicação;
- `docs/MERGE_1.5.0.md` — decisões da fusão seletiva entre 1.3.0 e 1.4.0;
- `docs/RESPONSIVE.md` — breakpoints, contratos de layout e matriz de homologação;
- `docs/ICONOGRAPHY.md` — Phosphor Icons, mapa semântico e regras de uso;
- `docs/VISUAL_OVERHAUL_2.0.md` — contratos visuais e matriz de homologação;
- `docs/BILLING_AND_PIX.md` — ciclos, checkout, Pix e estratégia comercial;
- `docs/REFERRALS_AND_DISCOUNTS.md` — regras, limites e estratégia econômica das indicações;
- `docs/LUMA_ASSISTANT.md` — arquitetura, limites e operação segura da Luma;
- `docs/ASSET_ROADMAP_2.1.md` — primeira rodada de assets humanizados;
- `docs/ASSET_ROADMAP_2.2.md` — fotos reais, screenshots e identidade final da Luma;
- `docs/IMAGEGEN_PROMPTS_2.2.md` — prompts, destinos e critérios dos assets gerados;
- `docs/DESIGN_SYSTEM_3.3.md` — sistema canônico de produto (LP excluída);
- `docs/DESIGN_SYSTEM_MIGRATION_3.3.md` — mapa de migração visual e dívida legada;
- `docs/DESIGN_SYSTEM_2.1.md` — histórico/deprecado;
- `docs/UX_AUDIT_2.1.md` — falhas encontradas, correções e homologação;
- `docs/VISUAL_QA_MATRIX_2.1.md` — matriz obrigatória de telas, estados e viewports;
- `docs/VISUAL_QA_MATRIX_2.2.md` — execução da matriz manual e achados corrigidos nesta entrega;
- `docs/VISUAL_QA_MATRIX_2.3.md` — landing, checkout, setup inteligente e sidebar recolhível;
- `docs/VISUAL_QA_MATRIX_2.4.md` — matriz visual real da consolidação responsiva;
- `docs/VISUAL_QA_LUMA_2.4.1.md` — matriz específica do drawer e página da Luma;
- `docs/RELEASE_2.4.1.md` — hotfix visual e estrutural da Luma lateral;
- `docs/ROOT_CAUSES_2.4.md` — causas-raiz corrigidas;
- `docs/LEGACY_MIGRATION_2.4.md` — componentes e estilos migrados;
- `docs/RELEASE_2.1.0.md` — fundações de marca, tour e UX;
- `docs/RELEASE_2.2.0.md` — conversão, Luma e indicações;
- `docs/RELEASE_2.3.0.md` — reconstrução comercial e onboarding pós-compra;
- `docs/RELEASE_2.3.1.md` — revisão comercial, responsiva e operacional;
- `docs/RELEASE_2.0.0.md` — escopo do rebuild anterior;
- `VALIDATION.md` — validações realizadas nesta entrega.

## Estrutura

```text
src/                 frontend
src/components/      componentes reutilizáveis
server/              API, autenticação, banco e migrações
deploy/              Caddy, systemd, backup e health check
scripts/             validações de release
docs/                documentação técnica e operacional
public/               assets públicos
```

## Limite arquitetural

SQLite é apropriado para uma única VPS e carga inicial moderada. Não rode múltiplas instâncias gravando no mesmo arquivo. Para alta disponibilidade ou escala horizontal, migre banco, arquivos e rate limits para serviços compartilhados.

## Site comercial e kit visual

O release 2.4.0 consolida shell, sidebar, overlays, Agenda, mobile e experiências externas em contratos responsivos próprios. Consulte [`docs/RELEASE_2.4.0.md`](docs/RELEASE_2.4.0.md), [`docs/VISUAL_QA_MATRIX_2.4.md`](docs/VISUAL_QA_MATRIX_2.4.md) e [`docs/ROOT_CAUSES_2.4.md`](docs/ROOT_CAUSES_2.4.md).

> O preço anual exibido no frontend usa `VITE_SUBSCRIPTION_PRICE_CENTS` e deve coincidir com `SUBSCRIPTION_PRICE_CENTS` e `PLAN_ANNUAL_CENTS`. Os demais ciclos usam `PLAN_MONTHLY_CENTS`, `PLAN_QUARTERLY_CENTS` e `PLAN_SEMIANNUAL_CENTS`; o preflight valida o catálogo.
