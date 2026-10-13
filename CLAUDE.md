# CLAUDE.md — Guia para IAs e Desenvolvedores

> Este arquivo orienta qualquer IA (Claude, GPT, Trae, etc) ou desenvolvedor a navegar,
> entender a arquitetura e modificar o código do LashDesigner 5.12.12 com segurança.

---

## Versão Atual: 5.12.12 (Consolidada)

A versão **5.12.12** consolida o modelo comercial de planos por equipe com checkout Appmax, sistema atômico de indicações e recompensas com governança de estorno (Migração 45), central de suporte com anexos locais no SQLite (Migração 44) e modo de recuperação de estúdios inadimplentes (Migração 43).

### Documentos de Referência da 5.12.12
- `docs/RELEASE_5_12_12.md`: Release notes oficiais e escopo técnico da versão 5.12.12.
- `docs/HOMOLOGACAO_INDICACOES_5_12_12.md`: Procedimentos de homologação e validação E2E de indicações.
- `docs/APPMAX_INTEGRATION_5_12.md`: Contrato técnico de integração, payloads e webhooks da Appmax.
- `docs/PRODUCT_CHANGE_5_12.md`: Transição de modelo comercial (planos por equipe vs legados).

---

## Regras de Ouro

1. **Nunca rode múltiplas instâncias** gravando no mesmo SQLite (risco de corrupção WAL).
2. **Sempre faça backup** do banco de dados antes de mudanças em produção (`sqlite3 <db> '.backup <destino>'`).
3. **Sempre rode `npm run build`** após qualquer alteração em `src/` ou `server/` — a produção serve exclusivamente `dist/`.
4. **Sempre rode `npm run preflight`** com `.env` carregado antes de reiniciar o serviço em produção.
5. **Nunca commite `.env`**, `data/*.db`, `node_modules/`, `dist/`, arquivos `*.zip`, `*.tar.gz`, `*.pdf` ou relatórios temporários.
6. **Mantenha o padrão de CSS versionado**: não edite folhas de versões antigas; use a folha canônica da funcionalidade.
7. **Tipos são sagrados**: `ApiResult<T>` é discriminated union — sempre verifique `.ok`.
8. **GSAP restrito a reveals**: hero e reveals tipográficos. Carousels e tabs são **React-driven** com transições CSS respeitando `prefers-reduced-motion`. Cleanup obrigatório com `gsap.context()` e `context.revert()`. Nunca adicione bibliotecas externas de animação desnecessárias.

---

## Arquitetura & Módulos Principais

### 1. Cobrança e Checkout (Appmax + InfinitePay)
- **Planos por Equipe (Team Plans)**:
  - `TEAM_3` (até 3 profissionais): R$ 74,90/mês
  - `TEAM_6` (até 6 profissionais): R$ 99,90/mês
  - `TEAM_15` (até 15 profissionais): R$ 149,00/mês
- **Contrato da API Appmax (`server/appmax.ts`)**:
  - Endpoint `/v1/payment-link` exige métodos de pagamento como **array plano de strings**:
    `payments: ['creditcard', 'pix']`
    *(ATENÇÃO: passar arrays aninhados `[['creditcard', 'pix']]` gera erro HTTP 422 na Appmax)*.
  - Credenciais: `APPMAX_MERCHANT_CLIENT_ID` e `APPMAX_MERCHANT_CLIENT_SECRET`.
  - Ativação controlada por `APPMAX_CHECKOUT_ENABLED=true`.

### 2. Sistema de Indicações & Compensação de Estornos (Migração 45)
- **Desconto na Primeira Mensalidade**: 15% para a nova assinante indicada (ex: TEAM_3 de R$ 74,90 sai por R$ 63,66).
- **Recompensa da Indicadora**: 10% de crédito por indicação confirmada, acumulável até o teto de 30% de desconto na renovação.
- **Segurança Criptográfica (`quoteFingerprint`)**: Hash SHA-256 gerado a partir do valor bruto, valor líquido, percentual de desconto e token de indicação. Impede adulteração de valores no checkout.
- **Anti-Autoindicação**: Validação cruzada por telefone normalizado em E.164, e-mail e tenant ID (`appmaxBilling.validateReferral`).
- **Governança de Estornos (`appmax_referral_debts`)**: Caso uma assinatura indicada seja estornada/revertida após o crédito ter sido usufruído pela indicadora, o sistema cria uma dívida percentual deduzida automaticamente de recompensas futuras, sem cobranças inesperadas no cartão.

### 3. Banco de Dados SQLite & Migrações (`server/migrate.ts`)
- `better-sqlite3` operando em modo WAL (`journal_mode = WAL`), foreign keys habilitadas e busy timeout de 5000ms.
- **Migrações Recentes**:
  - `Migração 43`: Distinção de `suspension_reason` ('APPMAX' vs bloqueio administrativo manual).
  - `Migração 44`: Central de Suporte (`support_tickets`, `support_messages`, `support_attachments`, `support_notifications`). Anexos binários seguros no SQLite com download autenticado.
  - `Migração 45`: Ledger financeiro de indicações (`gross_amount_cents`, `discount_percent`, `referral_redemption_id` em `appmax_checkout_intents`, mais tabelas `appmax_referral_memberships`, `appmax_referral_debts`, `appmax_referral_debt_allocations`).

### 4. Roteamento Modular de Backend
O backend em `server/index.ts` é desacoplado através de registradores de domínio:
- `server/routes/registerPlatformRoutes.ts`: Rotas públicas, autenticação, portal da cliente, documentação legal e console DEV.
- `server/routes/registerBillingAssistantRoutes.ts`: Onboarding público, checkout Appmax, webhook InfinitePay, rotas da Luma AI e webhooks Evolution.
- `server/routes/registerTenantRoutes.ts`: Painel ADMIN (dashboard, agenda, serviços, clientes, finanças, equipe, configurações, whatsapp, suporte, indicações).

### 5. WhatsApp & Evolution API
- **Instância Global da Plataforma (`EVOLUTION_INSTANCE_NAME`)**:
  - Instância dedicada para tráfego operacional da plataforma: envio de códigos OTP/MFA, onboarding e suporte.
  - Conectada à Evolution API (`EVOLUTION_API_URL`, ex: `https://evo.lashdesigner.space`).
  - Totalmente isolada das instâncias multi-tenant de estúdios.

---

## Mapa Rápido: Onde Mexer?

| Objetivo | Arquivos Principais | CSS Canônico |
|---|---|---|
| **Landing Page** | `src/LandingPage.tsx` | `src/landing-v54.css` (classes `ld54-*`) |
| **Painel ADMIN** | `src/features/admin/AdminApp.tsx`, `src/features/*` | `src/dashboard-v24.css`, `src/agenda-v24.css`, `src/finance-v36.css` |
| **Equipe & Multi-Staff** | `src/features/staff/StaffPage.tsx` | `src/staff-v512.css` |
| **Booking Público** | `src/features/booking/BookingPage.tsx` | `src/booking-v30.css` |
| **Checkout & Onboarding** | `server/routes/publicOnboardingRoutes.ts`, `src/components/LandingCheckout.tsx` | `src/setup.css` |
| **Appmax & Indicações** | `server/appmax.ts`, `server/appmaxBillingService.ts`, `server/appmaxReferralService.ts` | `src/components/billing-center.css` |
| **Central de Suporte** | `server/support/*`, `src/features/support/SupportCenter.tsx` | `src/components/report-review.css` |
| **Luma AI** | `server/assistant.ts`, `server/lumaBridge.ts`, `src/components/LumaConversation.tsx` | `src/luma-v35.css` |
| **WhatsApp Center** | `server/whatsappWebhook.ts`, `src/components/WhatsAppCenter.tsx` | `src/whatsapp-v39.css` |
| **Migrações de Banco** | `server/migrate.ts`, `server/appmaxReferralSchema.ts` | — |

---

## Comandos Essenciais

```bash
# Desenvolvimento local
npm run dev               # API Express :3000 + Vite :5173

# Validação e Checagens
npm run typecheck         # Verificação de tipos TypeScript (frontend + server)
npm run lint              # ESLint em todo o repositório
npm run test              # Suíte completa de testes unitários e de integração
npm run build             # Build de produção (Vite client + tsc server)
npm run preflight         # Validação de variáveis de ambiente e integridade antes do deploy

# Auditorias de Qualidade e Arquitetura
npm run test:architecture # Validação de limites arquiteturais e isolamento de rotas
npm run test:responsive   # Auditoria de layouts responsivos
npm run test:security5    # Auditoria de segurança e autenticação
npm run test:recovery-ui  # Auditoria de UI do modo de recuperação
npm run test:support-ui   # Auditoria de UI da Central de Suporte
npm run test:landing-team-ui # Auditoria de UI da landing por equipe
npm run test:billing-ui   # Auditoria de UI de cobrança e planos
npm run test:referral-team-ui # Auditoria de UI do programa de indicações

# Suite Completa de Verificação
npm run check             # Executa typecheck, lint, todos os testes e build
```

---

## Procedimento de Deploy em Produção (VPS)

```bash
# 1. Conectar na VPS e parar o serviço com segurança
sudo systemctl stop lashdesigner

# 2. Realizar backup consistente do banco SQLite em WAL
sudo -u lashdesigner sqlite3 /opt/lashdesigner/db_data/app.db '.backup /opt/lashdesigner/backups/pre-deploy.db'

# 3. Atualizar o código na pasta da aplicação (sem sobrescrever .env ou db_data)
cd /opt/lashdesigner/app
sudo -u lashdesigner git pull origin main
sudo -u lashdesigner npm ci
sudo -u lashdesigner npm run build

# 4. Validar pré-requisitos com o .env carregado
sudo -u lashdesigner bash -lc 'set -a; source ./.env; set +a; npm run preflight'

# 5. Iniciar o serviço
sudo systemctl start lashdesigner

# 6. Confirmar integridade
curl -sf http://127.0.0.1:3000/api/ready
```

---

## Padrões de Código

### Frontend
- Tipos de domínio estritos em `src/types.ts`.
- Chamadas de API via `api<T>()` de `src/api.ts` — sempre verificar discriminated union `.ok`.
- Ícones: exclusivamente Phosphor Icons (`@phosphor-icons/react`).
- Gráficos: Chart.js nativo (sem wrappers react-chartjs2).
- Zero bibliotecas externas desnecessárias de motion.

### Backend
- Schemas de validação Zod em todas as entradas de requisição (`req.body`, `req.query`, `req.params`).
- Erros estruturados via `HttpError`, `badRequest()`, `unauthorized()`, `notFound()`.
- Sessão e autenticação sempre via middlewares de pipeline: `sessionMiddleware` → `requireAuth` → `requireRole`.
- Acesso a banco de dados com queries preparadas nativas `db.prepare()` e transações atômicas `db.transaction()`.
- Segredos e tokens criptografados em repouso com `secretCrypto` antes da persistência.
