# CLAUDE.md — Guia para IAs e Desenvolvedores

> Este arquivo orienta qualquer IA (Claude, GPT, Trae, etc) ou dev novo a navegar
> e modificar o código do LashDesigner 5.13.7 com confiança.

---

## Homologação 5.13.7 — Fable 5.1 e Opus 5

Leia `docs/RELEASE_5_13_7.md`, `docs/RELEASE_5_13_6.md`, `docs/RELEASE_5_13_5.md`, `docs/RELEASE_5_13_4.md`, `docs/RELEASE_5_13_3.md`, `docs/RELEASE_5_13_2.md`, `docs/RELEASE_5_13_1.md` e `docs/RELEASE_5_13_0.md`. Rode também `npm run test:settings-brand-ui`, `npm run test:settings-tabs-ui`, `npm run test:brand-presentation-ui`, `npm run test:product-refinement-ui` e `npm run test:product-form-controls-ui`. A Luma tem um único chat; as ferramentas são acionadas pela conversa, sem abas internas. Faça backup SQLite e teste a migração 47→48 antes do deploy. Rode `npm run check`, os testes de navegador de equipe, suporte, billing e Luma integrada, e o teste HTTP local. Os provedores de IA, Appmax e Evolution dos testes integrados são simulados: homologue separadamente credenciais, compra real, webhook duplicado, estorno, entrega WhatsApp e resposta do modelo em ambiente de testes. No ambiente de testes, confirme que o setup usa o identificador real do modelo principal configurado, aceita imagem e responde com os enums de apresentação da marca. Teste logos com símbolo, logos completas e marcas verticais, transparência, proporções extremas e falha do provedor. Confirme upload, troca e remoção de fotos e redes sociais das profissionais, agendamento específico e qualquer disponível. Após publicar, valide com uma conta de teste todo o fluxo na produção: login, setup, equipe, reserva pública, presença, financeiro, chamados ADMIN/DEV, notificações, preferências, lembretes e créditos. Verifique logs e isolamento entre estúdios; mantenha rollback de aplicação e banco. Registre evidências e limitações. A capacidade desses modelos não substitui execução dos testes nem garante 100% de integridade.

## Atualização 5.12.12

Leia `docs/RELEASE_5_12_10.md` e `docs/REVISAO_RELATORIO_HOMOLOGACAO_5_12_9.md` antes da homologação. Não trate o PDF externo como garantia de 100% ou prova de carga para 1.000 estúdios. A oferta pública sempre usa três planos mensais por equipe; `checkoutAvailable` controla a cobrança, nunca os preços publicados. A migração 44 cria suporte, histórico, anexos e notificações. Não exponha notas internas fora do host DEV. A migração 43 distingue suspensão Appmax de bloqueio manual. O modo de recuperação libera somente autenticação ADMIN, cobrança e rotas de suporte enumeradas no host do estúdio; não remova essa restrição.

## Comece aqui

1. Leia este arquivo inteiro
2. Leia [ARCHITECTURE.md](ARCHITECTURE.md) para detalhes de implementação
3. Leia [README.md](README.md) para visão de produto e releases

---

## Regras de ouro

1. **Nunca rode múltiplas instâncias** gravando no mesmo SQLite
2. **Sempre faça backup** do banco antes de mudanças em produção
3. **Sempre rode `npm run build`** após mudanças — o `dist/` é o que serve em produção
4. **Sempre rode `npm run preflight`** com `.env` carregado antes de reiniciar o serviço
5. **Nunca commite `.env`**, `data/*.db`, `node_modules/` ou `dist/`
6. **Mantenha o padrão de CSS versionado**: mudanças visuais em LP usam `landing-v54.css`, não `landing.css`
7. **Tipos são sagrados**: `ApiResult<T>` é discriminated union — sempre verifica `.ok`
8. **GSAP restrito a reveals**: entrada do hero, reveals tipográficos, parallax leve. Carousels/tabs são **React-driven** (somente o painel ativo montado, pausa 9s na interação, retorno ao início). Transições de estado em CSS respeitando `prefers-reduced-motion`. Toda animação dentro de `gsap.context()` com cleanup (`context.revert()`). Não adicione libs de motion (Tailwind/Magic UI/Aceternity/Magic Bento/pacote Motion)

---

## Mapa rápido: onde mexer?

### Quero mudar a landing page

- **Código**: `src/LandingPage.tsx`
- **CSS**: `src/landing-v54.css` (classes `ld54-*`)
- **Motion**: GSAP só pra reveals (hero + reveals tipográficos); carousels/tabs são React puro (só o painel ativo montado)
- **Seções**: hero, outcome-strip, problem, system (carrossel React), luma, index, pricing (comercial), faq, final
- **Audits**: `npm run test:landing54`

### Quero mudar o painel ADMIN

- **Código**: `src/features/admin/AdminApp.tsx`; as páginas estão em `src/features/`
- **Sub-views**: AdminDashboard(~891), AdminCalendar(~2052), AdminServices(~1286), AdminClients(~2967), AdminFinance(~3593), AdminSettings(~3354)
- **CSS**: `src/dashboard-v24.css`, `src/agenda-v24.css`, `src/finance-v36.css`

### Quero mudar o fluxo de agendamento público

- **Código**: `src/features/booking/BookingPage.tsx`
- **CSS**: `src/booking-v30.css`

### Quero mudar a API (backend)

- **Rotas**: `server/routes/*Routes.ts`; registro por área em `server/routes/registerPlatformRoutes.ts`, `registerBillingAssistantRoutes.ts` e `registerTenantRoutes.ts`; composição em `server/index.ts`
- **Schema/migrações**: `server/migrate.ts` — adicione `apply(N+1, (db) => { ... })`
- **Auth**: `server/auth.ts`, `session.ts`, `mfa.ts`

### Quero mudar a Luma (AI)

- **Servidor**: `server/assistant.ts` (prompt, provider, loop), `server/lumaBridge.ts` (tools)
- **Frontend**: `src/components/LumaConversation.tsx`, `LumaChatLauncher.tsx`
- **CSS**: `src/luma-v35.css`
- **Limites**: `.env` → `LUMA_*` vars

### Quero mudar WhatsApp

- **Servidor**: `server/whatsappWebhook.ts`, `whatsappIntent.ts`, `whatsappMedia.ts`
- **Frontend**: `src/components/WhatsAppCenter.tsx`
- **CSS**: `src/whatsapp-v39.css`

### Quero mudar billing/preços

- **Planos**: `server/plans.ts` → `buildBillingPlans(prices)`
- **Webhook InfinitePay**: `server/routes/infinitePayWebhookRoutes.ts`; registro em `server/routes/registerBillingAssistantRoutes.ts`
- **Frontend billing**: `src/components/BillingCenter.tsx`, `LandingCheckout.tsx`
- **`.env`**: `PLAN_MONTHLY_CENTS`, `PLAN_QUARTERLY_CENTS`, `PLAN_SEMIANNUAL_CENTS`, `PLAN_ANNUAL_CENTS`

### Quero adicionar uma migration

```typescript
// server/migrate.ts — adicione ao final:
apply(38, (db) => {
  db.exec(`ALTER TABLE clients ADD COLUMN new_field TEXT`);
});
```

As migrações rodam automaticamente no startup. O `schema_migrations` table rastreia qual versão está aplicada.

---

## Comandos essenciais

```bash
# Desenvolvimento
npm run dev          # API :3000 + Vite :5173

# Validação
npm run typecheck    # tsc sem emit (frontend + server)
npm run lint         # eslint
npm run test         # testes tsx
npm run build        # vite build + tsc server
npm run preflight    # valida env + config antes de prod

# Audits específicos (todos em scripts/)
npm run test:responsive
npm run test:landing53
npm run test:luma
npm run test:security5
npm run test:whatsapp

# Tudo de uma vez
npm run check
```

---

## Estrutura de arquivos: o que é o quê

### Arquivos grandes (cuidado ao abrir)

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `src/App.tsx` | 5 linhas | Encaminha à composição em `src/app/AppRoutes.tsx` |
| `server/index.ts` | 170 linhas | Compõe serviços e os três registradores de rotas |
| `server/migrate.ts` | ~1011 linhas | 37 migrações de schema |
| `src/landing-v54.css` | CSS 5.4 | Estilos da landing atual (motion classes `ld54-*`) |

### Onde estão os testes

- **Servidor**: `server/*.test.ts` (rodam via `npm run test`)
- **Migrations**: `server/*.test.mjs` (rodam via `npm run test:migrations5`)
- **Security**: `server/session.test.mjs`, `secretCrypto.test.mjs` (`npm run test:security-primitives5`)
- **WhatsApp**: `server/whatsappIntent.test.mjs`, `whatsappWebhook.test.mjs` (`npm run test:whatsapp5`)
- **Audits estáticos**: `scripts/*.mjs` (27 scripts que validam contratos de UI/UX/segurança)

---

## Environment (.env)

Veja `.env.example` para o template completo. Variáveis críticas:

### Obrigatórias (preflight falha sem estas)

| Var | Descrição |
|---|---|
| `NODE_ENV` | `production` ou `development` |
| `PORT` | Porta do Express (default: 3000) |
| `DATABASE_PATH` | Caminho do SQLite |
| `APP_BASE_URL` | Origem da plataforma (ex: `https://app.lashdesigner.space`) |
| `FRONTEND_ORIGIN` | Mesmo valor de APP_BASE_URL |
| `DEV_HOST` | Hostname do console DEV |
| `APP_ENCRYPTION_KEY` | base64url de 32 bytes para criptografia |
| `DEV_BOOTSTRAP_SECRET` | Segredo para criar primeiro DEV |
| `DOMAIN_AUTH_SECRET` | Segredo para autorização de TLS on-demand |
| `INFINITEPAY_HANDLE` | Handle da conta InfinitePay |
| `PLAN_*_CENTS` | Preços dos 4 ciclos em centavos |
| `VITE_SUBSCRIPTION_PRICE_CENTS` | Deve igualar `PLAN_ANNUAL_CENTS` |

### Opcionais (mas importantes)

| Var | Default | Descrição |
|---|---|---|
| `AI_ASSISTANT_ENABLED` | `false` | Habilita Luma |
| `OPENROUTER_API_KEY` | — | Key da Luma (DeepSeek + Gemini) |
| `EVOLUTION_API_URL` | — | URL da Evolution API |
| `EVOLUTION_API_KEY` | — | Key global da Evolution |
| `EVOLUTION_INSTANCE_NAME` | — | Nome da instância global |
| `WHATSAPP_MEDIA_DIR` | `../media` | Diretório de mídia |
| `CUSTOM_DOMAIN_CNAME_TARGET` | — | CNAME target para domínios personalizados |

### Gerar segredos

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # APP_ENCRYPTION_KEY
openssl rand -hex 32     # DEV_BOOTSTRAP_SECRET, DOMAIN_AUTH_SECRET, EVOLUTION_WEBHOOK_SECRET
```

---

## Deploy: checklist rápido

```bash
# 1. Parar + backup
sudo systemctl stop lashdesigner
sudo -u lashdesigner sqlite3 /opt/lashdesigner/db_data/app.db '.backup /opt/lashdesigner/backups/pre-deploy.db'

# 2. Upload do código (sem .env, node_modules, dist, data/*.db)
# scp ou rsync para /opt/lashdesigner/app/

# 3. Na VPS
cd /opt/lashdesigner/app
sudo -u lashdesigner npm ci
sudo -u lashdesigner npm run build
sudo -u lashdesigner bash -lc 'set -a; source ./.env; set +a; npm run preflight'

# 4. Reiniciar
sudo systemctl start lashdesigner

# 5. Verificar
curl -sf http://127.0.0.1:3000/api/ready
```

> **IMPORTANTE**: O `npm run build` é obrigatório após qualquer mudança em `src/` ou `server/`.
> O systemd roda `dist/server/index.js` e serve `dist/client/`. Sem build = mudança não aplicada.

---

## Padrões de código

### Frontend

- Tipos de domínio em `src/types.ts`
- API calls via `api<T>()` de `src/api.ts` — sempre verifica `.ok`
- CSS versionado: `feature-vXX.css` — não editar versões antigas
- Ícones: Phosphor Icons (`@phosphor-icons/react`)
- Charts: Chart.js puro (sem react-chartjs2)
- Sem animation libraries — CSS + IntersectionObserver + APIs nativas
- `prefers-reduced-motion` respeitado em todo motion

### Backend

- Validação de input com Zod schemas
- `HttpError` + `handleError` para erros estruturados
- Sessão sempre via `sessionMiddleware` → `requireAuth` → `requireRole`
- Queries SQL diretas via `db.prepare()` (sem ORM)
- Transações via `db.transaction()`
- Secrets sempre criptografados via `secretCrypto` antes de armazenar

### CSS

- Design system canônico em `docs/DESIGN_SYSTEM_3.3.md`
- Tokens CSS (cores, espaçamento) em `foundation-v24.css` e `design-system.css`
- Responsivo: breakpoints em `docs/RESPONSIVE.md`
- Cada feature tem seu CSS versionado — não misturar

---

## Documentação de referência

| Quando precisar de... | Leia |
|---|---|
| Histórico de mudanças | `docs/RELEASE_*.md` |
| Modelo de segurança | `docs/SECURITY.md` |
| Backup e restore | `docs/OPERATIONS.md` |
| API endpoints | `docs/API.md` |
| Sistema de design | `docs/DESIGN_SYSTEM_3.3.md` |
| Landing page | `docs/LANDING_PAGE.md` |
| Luma AI | `docs/LUMA_ASSISTANT.md` |
| WhatsApp | `docs/WHATSAPP.md` |
| Billing | `docs/BILLING_AND_PIX.md` |
| Domínios | `docs/CUSTOM_DOMAINS.md` |
| Indicações | `docs/REFERRALS_AND_DISCOUNTS.md` |
| Responsividade | `docs/RESPONSIVE.md` |
| Ícones | `docs/ICONOGRAPHY.md` |
| Assets | `docs/ASSET_CATALOG.md` |
| Deploy VPS | `DEPLOY_VPS.md` |

Release atual: `docs/RELEASE_5_12_14.md`; executar `docs/HOMOLOGACAO_INDICACOES_5_12_12.md` para validar provedor externo.

Hotfix visual 5.12.13: `docs/RELEASE_5_12_13.md`. O esquema segue em 45.


## Equipe e suporte — 5.12.14

Leia `docs/RELEASE_5_12_14.md`. A Equipe está em `src/features/team/`, separada do catálogo; o fluxo antigo `ProfessionalManager.tsx` foi removido. Não mova a gestão de equipe de volta para Serviços. Cadastro e acesso ao painel são decisões separadas. Contas ADMIN não podem ser suspensas pelo endpoint de acesso STAFF. Os intervalos da mesma profissional não podem se sobrepor. Folgas seguem o fuso do estúdio.

Na interface da usuária, suporte é “Pedir ajuda” e “Meus pedidos”; o DEV mantém os controles operacionais e as notas internas. Preserve idempotência, versão concorrente, anexos, isolamento e notificações ao modificar a apresentação. Caixas de seleção conservam semântica nativa e navegação pelo teclado, com aparência da plataforma.

Homologação final com Claude Code (Fable 5.1 e Opus 5): execute as suítes locais, teste cadastro/edição/horários/folgas/convite e aceite/login STAFF, suporte com imagem/resposta/notificações/reabertura e permissões. Em homologação externa, valide Evolution, códigos WhatsApp e Appmax com as credenciais corretas. Antes do deploy autorizado, faça backup e confira as duas VPS e seus serviços; após o deploy, repita os fluxos com contas de teste, desktop/celular e outros estúdios para verificar isolamento. Registre resultados reais e falhas. Este ZIP não contém prova de produção nem garantia de integridade absoluta.
