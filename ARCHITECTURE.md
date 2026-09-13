# Arquitetura — Lash Designer 5.6.0

Documento canônico de arquitetura. Qualquer IA ou dev novo deve ler isto antes de mexer no código.

---

## 1. Visão geral

```
Browser → Nginx (TLS wildcard) → Express (porta 3000)
                                   ├── /api/*          → rotas JSON
                                   ├── /api/webhooks/* → InfinitePay + Evolution
                                   └── /*              → dist/client (SPA)
```

- **Single process**: uma instância Node.js serve API + SPA
- **SQLite**: um arquivo (`db_data/app.db`), WAL mode, better-sqlite3 síncrono
- **Multi-tenant por hostname**: o subdomínio identifica o tenant
- **Build**: `vite build` → `dist/client/` | `tsc -p server/tsconfig.json` → `dist/server/`

---

## 2. Frontend (`src/`)

### 2.1 Entry point

`src/main.tsx` monta:
- `<AppErrorBoundary>` — captura erros fatais
- `<BrowserRouter>` — roteamento client-side
- `<OverlayCoordinator>` — orquestra modais/overlays globais
- `<FeedbackCenter>` — toasts + confirm dialogs globais
- `<App />` — aplicação

### 2.2 Router (`src/App.tsx`)

Arquivo monolítico de ~360KB / ~6700 linhas. Estrutura:

```typescript
// Detecta se é DEV_HOST (console plataforma) ou tenant (subdomínio)
const isDevHost = window.location.hostname === VITE_DEV_HOST

// DEV_HOST → rotas DEV
<Routes>
  <Route path="/" element={<RootEntry />} />
  <Route path="/dev" element={<Dev />} />
  <Route path="/login" element={<UnifiedLogin />} />
  <Route path="/landing" element={<LandingPage />} />
</Routes>

// Tenant → rotas tenant
<Routes>
  <Route path="/" element={<LandingPage />} />
  <Route path="/login" element={<UnifiedLogin />} />
  <Route path="/agendar" element={<BookingPage />} />
  <Route path="/admin/*" element={<Admin />} />
  <Route path="/cliente/*" element={<ClientPortal />} />
  <Route path="/:tenantSlug/*" element={<SlugToSubdomainRedirect />} />
</Routes>
```

### 2.3 Views principais

| Componente | Linha aprox | Descrição |
|---|---|---|
| `UnifiedLogin` | 5617 | Login unificado ADMIN/CLIENT/DEV com WhatsApp OTP MFA |
| `Dev` | 4774 | Console DEV: tenants CRUD, users, settings, backups, referrals, Evolution |
| `Admin` | 3880 | Shell ADMIN com sidebar: dashboard, calendar, services, clients, finance, settings, billing, Luma, WhatsApp, referrals |
| `AdminDashboard` | 891 | KPIs, gráficos Chart.js, próximos agendamentos |
| `AdminCalendar` | 2052 | Calendário com drag-to-create, time-off, bloqueios |
| `AdminServices` | 1286 | CRUD de serviços com produtos, duração, preço |
| `AdminClients` | 2967 | Lista de clientes, histórico, marketing consent |
| `AdminFinance` | 3593 | Fluxo de caixa, metas, extrato, gráfico Chart.js |
| `AdminSettings` | 3354 | Config do tenant: brand, horários, regras de booking |
| `AdminEvolutionAPI` | 3079 | Config WhatsApp Evolution por tenant |
| `BookingPage` | 6165 | Fluxo público de agendamento em etapas |
| `ClientPortal` | 6436 | Portal do cliente: WhatsApp OTP, histórico, preferências |
| `RootEntry` | 6658 | Gate: redireciona baseado em auth status |

### 2.4 Componentes (`src/components/`)

| Arquivo | Export | Função |
|---|---|---|
| `BillingCenter.tsx` | `BillingCenter({ locked })` | Gestão de assinatura InfinitePay |
| `BusinessAssistant.tsx` | `BusinessAssistant()` | Container da página da Luma |
| `ColorPicker.tsx` | `ColorPicker` | Seletor de cor para brand |
| `CustomDomainsSettings.tsx` | `CustomDomainsSettings()` | Config de domínios personalizados |
| `DevReferrals.tsx` | `DevReferrals()` | Gestão DEV de links de indicação |
| `FeedbackCenter.tsx` | `notify()`, `confirmAction()`, `FeedbackCenter` | Toasts + modais globais |
| `FinanceFlowChart.tsx` | `FinanceFlowChart({ data, ... })` | Gráfico de fluxo (Chart.js) |
| `HistoryIcon.tsx` | `HistoryIcon` | Ícone customizado |
| `LandingCheckout.tsx` | `LandingCheckout({ open, ... })` | Modal de checkout na LP |
| `LumaBrand.tsx` | `LumaMark`, `LumaWordmark` | Identidade visual da Luma |
| `LumaChatLauncher.tsx` | `LumaChatLauncher()` | FAB + drawer de chat |
| `LumaConversation.tsx` | `LumaConversation({ variant, ... })` | Conversa com anexos |
| `LumaMarkdown.tsx` | `LumaMarkdown({ text })` | Render markdown sanitizado |
| `ModalRoot.tsx` | `ModalRoot({ children })` | Portal base para modais |
| `OverlayCoordinator.tsx` | `OverlayCoordinator()` | Orquestra z-index de overlays |
| `PasswordChecklist.tsx` | `PasswordChecklist({ password, ... })` | Validação visual de senha |
| `ProductSelect.tsx` | `ProductSelect(...)` | Select estilizado |
| `ProductTour.tsx` | `ProductTour`, `shouldAutoStartTour()` | Tour guiado de onboarding |
| `ReferralCenter.tsx` | `ReferralCenter()` | Área ADMIN de indicações |
| `WhatsAppCenter.tsx` | `WhatsAppCenter()` | Inbox de conversas WhatsApp |
| `WorkspaceSetup.tsx` | `WorkspaceSetup({ tenant, onComplete })` | Onboarding pós-compra |

### 2.5 CSS

23 arquivos CSS versionados por feature/release:
- `foundation-v24.css`, `design-system.css` — base
- `landing-v54.css` — landing atual 5.4.1 (classes `ld54-*`)
- `shell-v24.css`, `dashboard-v24.css`, `agenda-v24.css` — app shell
- `booking-v30.css` — fluxo de agendamento
- `whatsapp-v39.css` — WhatsApp center
- `luma-v35.css` — assistente Luma
- `finance-v36.css` — financeiro
- `product-system-v33.css`, `product-controls-v40.css` — componentes

### 2.6 Motion — Landing 5.4.1 (React-led, GSAP restrito)

**React é a única fonte de verdade de estado/UI** na landing. GSAP fica restrito a reveals:

- **Hero**: `SplitText.create('.ld54-hero-title', { type: 'words', wordsClass: 'ld54-hero-word' })` — **sem `mask`**; CSS usa `overflow: visible` pra não cortar acentos/descendentes
- **Reveals**: elementos entram com `gsap.from()` via ScrollTrigger
- **Carousels/tabs de produto**: 100% React — **somente o painel ativo é montado** (sem overlap da última tela); seleção manual pausa auto-rotação 9s; retorno automático ao início
- **Transições de estado**: CSS puro, respeitam `prefers-reduced-motion`; GSAP não controla estado de UI
- **Pricing**: economia dos ciclos calculada contra o valor mensal retornado pela API
- **Cleanup**: `context.revert()` no unmount — sempre use `gsap.context()` pra evitar leaks

`prefers-reduced-motion` tratado via `gsap.matchMedia()`.

### 2.7 Client API (`src/api.ts`)

```typescript
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function api<T>(path, options?): Promise<ApiResult<T>>
```
- Timeout 20s, header `X-Requested-With`, `credentials: 'include'`
- Retorna discriminated union — sempre verifica `.ok`

---

## 3. Backend (`server/`)

### 3.1 Entry (`server/index.ts`, ~7200 linhas)

```
Imports + helpers
↓
Bootstrap: crypto at-rest, env validation
↓
Express app:
  requestId → Permissions-Policy → CORS dinâmico → Helmet/CSP
  → express.json(2mb) → cookieParser → resolveTenantFromSubdomain
  → sessionMiddleware → requireSameOrigin → Cache-Control
  → Rate limiters (api 600/min, auth 12/min, webhooks 120/min, otp 4/15min)
↓
~139 rotas organizadas por prefixo:
  /api/health, /api/ready
  /api/public/*         (tenant info, services, booking, availability)
  /api/auth/*           (login, logout, otp, sessions, devices)
  /api/dev/*            (bootstrap, tenants CRUD, users, settings, referrals, evolution)
  /api/admin/*          (subscription guard → services, appointments, clients, finance, domains, whatsapp, assistant)
  /api/webhooks/*       (infinitepay, evolution/:tenantId)
  /api/onboarding/*     (checkout pós-compra)
  /api/client-access/*  (portal do cliente)
↓
Static serving (prod): express.static(dist/client, { index: false })
  + catch-all /* → renderClientIndexHtml (SEO meta injection)
↓
app.listen(PORT, 127.0.0.1)
↓
Background timers (.unref()):
  domainVerification    10min
  appointmentAutomation  60s
  whatsappHealth         2min
  whatsappMedia          30s
  securityStatePrune     6h
↓
Graceful shutdown: SIGTERM/SIGINT → stop timers → closeIdleConnections → closeAllConnections(10s)
```

### 3.2 Database (`server/db.ts` + `server/migrate.ts`)

- better-sqlite3 síncrono
- `PRAGMA journal_mode = WAL`
- `PRAGMA foreign_keys = ON`
- `PRAGMA busy_timeout = 5000`
- `PRAGMA synchronous = FULL` em produção

**37 migrações** aplicadas automaticamente na inicialização via tabela `schema_migrations`.

Principais tabelas:
- `tenants`, `tenant_settings`, `tenant_onboarding`, `tenant_domains`
- `users` (DEV/ADMIN/CLIENT), `auth_sessions`, `trusted_devices`
- `user_mfa`, `mfa_recovery_codes`, `auth_challenges`, `security_events`, `security_rate_limits`
- `clients`, `client_login_codes`, `client_marketing_consent_events`
- `services`, `products`, `stock_movements`
- `appointments`, `appointment_confirmation_events`, `appointment_automation_jobs`
- `business_hours`, `time_off`, `booking_rules`
- `cash_transactions`, `subscriptions`, `payment_events`, `infinitepay_orders`, `infinitepay_webhook_events`
- `whatsapp_instances`, `whatsapp_messages`
- `platform_settings`, `assistant_usage`, `assistant_pending_actions`, `assistant_action_audit`
- `referral_links`, `referral_redemptions`, `referral_credits`

### 3.3 Autenticação (`server/auth.ts`, `session.ts`, `security.ts`, `mfa.ts`)

```typescript
type Role = 'DEV' | 'ADMIN' | 'CLIENT'

// Middleware chain:
sessionMiddleware  → resolve cookie __Host-session → carrega user + tenant
requireAuth        → 401 se não logado
requireRole(roles) → 403 se role não permitida
requireActiveSubscription → 402 se tenant sem assinatura ativa (test_mode bypass)
```

**Sessão**:
- Cookie `__Host-session` (prod) / `session` (dev)
- Token opaco, hash SHA-256 no DB
- Absolute timeout 24h / Idle timeout 12h (ou 30d/7d com trusted device)
- Revogável por tenant ou user

**MFA**:
- WhatsApp OTP via Evolution API
- TOTP (Google Authenticador) — opcional
- Trusted devices: 365 dias (ADMIN/DEV), persistente
- Recovery codes
- Rate limit: 4 OTP envios / 15 min

### 3.4 Billing (`server/billing.ts`, `plans.ts`)

- **InfinitePay**: checkout Pix, webhook confirma pagamento
- **4 ciclos**: mensal, trimestral, semestral, anual
- `subscriptions` table: status, period_start, period_end, cycle
- `infinitepay_orders`: order_id, status, amount, webhook events
- `test_mode`: bypass de subscription guard para homologação

### 3.5 WhatsApp (`server/whatsappIntent.ts`, `whatsappWebhook.ts`, `whatsappMedia.ts`)

- **Evolution API**: instância global (plataforma) + instância por tenant
- **Webhook** (`/api/webhooks/evolution/:tenantId`): valida secret, normaliza eventos
- **Eventos**: MESSAGE_RECEIVE, MESSAGE_UPDATE, CONNECTION_UPDATE
- **Delivery status**: SENT, DELIVERED, READ, FAILED
- **Intent detection**: `confirmationReplyIntent()` detecta confirmar/recusar por texto + código 4 chars
- **Mídia**: download via Evolution API media endpoint

### 3.6 Luma AI (`server/assistant.ts`, `lumaBridge.ts`)

```
Frontend (LumaConversation)
  → POST /api/admin/assistant/message
    → lumaAssistantLimiter (rate limit + cost cap)
    → generateAssistantAnswer():
        loop até MAX_AGENT_STEPS (3):
          → requestCompletion() → OpenRouter (DeepSeek) ou OpenAI fallback
          → se tool_calls → executeLumaTool() → append result → continue
          → se content → return answer
    → response com optional pendingAction
```

**7 tools** (`lumaBridge.ts`):
1. `get_business_snapshot` — KPIs do tenant
2. `get_finance_overview` — resumo financeiro
3. `list_services` — serviços ativos
4. `find_appointments` — busca agendamentos
5. `find_clients` — busca clientes
6. `prepare_create_service` — criação pendente (requer confirmação)
7. `prepare_confirm_appointment` — confirmação pendente (requer confirmação)

**Guardrails econômicos**:
- `LUMA_DAILY_REQUEST_LIMIT` (40), `LUMA_MONTHLY_REQUEST_LIMIT` (500)
- `LUMA_DAILY_COST_CAP_USD` (0.10), `LUMA_MONTHLY_COST_CAP_USD` (0.75)
- `LUMA_MAX_REQUEST_COST_USD` (0.01), `LUMA_MAX_AGENT_STEPS` (3)
- `LUMA_MAX_OUTPUT_TOKENS` (700), `LUMA_MAX_IMAGE_BYTES` (1MB)

### 3.7 Custom Domains (`server/domains.ts`)

- Tenant adiciona domínio → sistema verifica DNS:
  - TXT record com token de verificação
  - CNAME para `CUSTOM_DOMAIN_CNAME_TARGET` ou A/AAAA records
- Verificação paralela (Promise.all) com timeout
- Background job revalida a cada 10min (active) / 24h (reverify)
- TLS on-demand: o proxy consulta `/api/internal/domains/authorize/:secret` antes de emitir certificado

---

## 4. Integrações externas

| Serviço | Uso | Config |
|---|---|---|
| **InfinitePay** | Pagamentos Pix, webhooks | `INFINITEPAY_HANDLE`, `INFINITEPAY_BASE_URL` |
| **Evolution API** | WhatsApp send/receive | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME` |
| **OpenRouter** | Luma AI (DeepSeek + Gemini) | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL` |
| **OpenAI** (legacy) | Fallback Luma AI | `OPENAI_API_KEY`, `AI_API_BASE_URL` |

> **GSAP 3.15** é a única dependência de runtime de motion (`gsap/all` com ScrollTrigger + SplitText), restrito a entrada/reveal/parallax leve. Nenhum Tailwind/Magic UI/Aceternity/pacote Motion no projeto. (A 5.5 experimentou Magic Bento e foi revertida.)

---

## 5. Build e deploy

### 5.1 Build

```bash
npm run build
# = vite build (→ dist/client/) + tsc -p server/tsconfig.json (→ dist/server/)
```

### 5.2 Preflight (`scripts/preflight.mjs`)

Valida antes de iniciar em produção:
- 22 variáveis de ambiente obrigatórias (inclui `LEGAL_*`, `PRIVACY_CONTACT_EMAIL` e `WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED`)
- Coerência de preços (VITE_SUBSCRIPTION_PRICE_CENTS = SUBSCRIPTION_PRICE_CENTS = PLAN_ANNUAL_CENTS)
- Segredos sem valores placeholder
- DATABASE_PATH e WHATSAPP_MEDIA_DIR existem e são graváveis
- `dist/client/index.html` existe
- `.env` com permissão <= 0640

### 5.3 Produção (systemd)

```
systemd → ExecStartPre: node scripts/preflight.mjs
        → ExecStart: node dist/server/index.js
        → ProtectSystem=strict, ReadWritePaths=db_data/backups/media
```

O Express serve `dist/client/` como SPA com catch-all, injetando meta tags SEO via `renderClientIndexHtml`.

### 5.4 Deploy flow

1. `sudo systemctl stop lashdesigner`
2. Backup SQLite
3. Upload código (sem `.env`, `node_modules`, `dist`, `data/*.db`)
4. `npm ci && npm run build`
5. Carregar `.env` + `npm run preflight`
6. `sudo systemctl start lashdesigner`
7. `curl http://127.0.0.1:3000/api/ready`

---

## 6. Segurança

- **Segredos at-rest**: chaves de API (Evolution, OpenRouter) criptografadas com AES-256-GCM
- **Rate limiting**: por IP e por usuário, stored no DB (`security_rate_limits`)
- **CORS dinâmico**: valida origin contra tenants ativos no DB
- **CSP/Helmet**: restrictive Content Security Policy em produção
- **Cookie security**: `__Host-` prefix, HttpOnly, Secure, SameSite=Lax
- **Graceful shutdown**: SIGTERM aguarda connections close, fallback 10s
- **systemd hardening**: NoNewPrivileges, ProtectSystem=strict, PrivateTmp, etc
