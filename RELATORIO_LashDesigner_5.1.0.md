# Relatório — Lash Designer 5.1.0 RC

**Escopo:** WhatsApp MFA + Evolution Global + Password Policy 8 + Trusted Device 365 dias.

## 1. Decisões aplicadas

### MFA profissional

O TOTP da 5.0 foi removido do produto. ADMIN/DEV agora seguem:

`e-mail + senha → trusted device válido OU OTP WhatsApp → sessão opaca`

O OTP possui 6 dígitos, expira em 5 minutos, é uso único e bloqueia o challenge após 5 tentativas inválidas. O reenvio possui limiter persistente adicional.

O navegador não envia `userId` para o endpoint de OTP. A identidade do usuário é resolvida pelo challenge pré-auth armazenado server-side e referenciado por cookie HttpOnly.

### Usuários antigos sem telefone

Não há bypass. Depois da senha válida, a conta informa o WhatsApp e recebe o código nesse número. O telefone só é persistido após o OTP correto.

### Trusted device

A expiração agora é 365 dias de ponta a ponta. Durante o review foi encontrado que o banco já tinha 365 dias enquanto o cookie ainda tinha 30; ambos agora usam a mesma constante `TRUSTED_DEVICE_TTL_MS`.

### Evolution global

A especificação sugeria criar `platform_settings`, mas a tabela já existia na base 5.0 e já armazenava configuração global. Criar outra implementação seria duplicação e risco de divergência.

A migration 37 evolui a tabela existente e o painel DEV passa a ser o único gerenciamento canônico da configuração global.

A instância de plataforma envia MFA. Instâncias dos tenants continuam separadas. Compartilhar a mesma sessão WhatsApp entre todos os tenants quebraria isolamento de webhook/inbox e não foi implementado.

### Bootstrap

O painel DEV não pode ser a única forma de configurar o provider antes do primeiro MFA, pois o DEV precisaria autenticar antes de conseguir abrir o painel. A 5.1 permite bootstrap opcional por `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_NAME`; depois, configuração persistida no banco tem prioridade.

## 2. Arquivos principais alterados

- `server/mfa.ts`
- `server/auth51Migration.ts`
- `server/auth51Migration.test.mjs`
- `server/mfa.test.ts`
- `server/migrate.ts`
- `server/index.ts`
- `server/env.ts`
- `scripts/preflight.mjs`
- `scripts/security-5-audit.mjs`
- `src/App.tsx`
- `src/components/LandingCheckout.tsx`
- `src/components/Icons.ts`
- `src/styles.css`
- `package.json`
- `package-lock.json`
- documentação operacional ativa.

## 3. Migrações

### 36 — Professional WhatsApp MFA

- `users.phone`;
- novo contrato efêmero de `auth_challenges` para `WHATSAPP_OTP`;
- limpeza dos registros TOTP/recovery legados.

### 37 — Evolution Global

- `platform_settings.encrypted` quando ausente;
- `evolution_instance_name` com insert idempotente;
- preservação de todas as configurações preexistentes.

Teste executável dedicado cobre upgrade e repetição segura.

## 4. Segurança preservada da 5.0

Continuam ativos:

- sessões opacas revogáveis server-side;
- cookies HttpOnly/Secure/__Host em produção;
- `APP_ENCRYPTION_KEY`;
- API key Evolution cifrada em repouso;
- rate limits persistentes de autenticação;
- security events;
- SSRF/DNS validation;
- redirects externos bloqueados;
- migrations WhatsApp seguras;
- InfinitePay com `payment_check` e transição atômica;
- mídia WhatsApp privada;
- receipts e health/reconnect.

## 5. Política de senha

Todos os fluxos profissionais atuais foram harmonizados para mínimo 8 caracteres no backend e frontend. Não ficou validação ativa de 12 caracteres.

## 6. Hot-fixes incorporados

- `ChevronDown` exportado de `CaretDown` no source canônico.
- nenhum bypass temporário de MFA permanece no runtime.
- revogação de sessões/dispositivos agora realmente aguarda confirmação do usuário.

## 7. Validação

### Gates estáticos

- Security 5.1: **43/43**
- Responsividade: **26/26**
- Iconografia: **16/16**
- Visual System: **22/22**
- Design System 3.3: aprovado
- UX: **18/18**
- Indicações: **12/12**
- Onboarding: **16/16**
- Estrutural: **26/26**
- Luma: **33/33**
- Financeiro: **24/24**
- Appointment Lifecycle: **36/36**
- WhatsApp Center: **25/25**
- Product Consistency: **19/19**
- Customer Experience: **25/25**
- Marketing Consent: **15/15**

### Testes independentes da árvore npm completa

**50/50 PASS**: migrations 5.x, sessões, URL/SSRF, intent parser, webhook/receipts e mídia.

### Lockfile

`npm install --package-lock-only --ignore-scripts --offline` concluiu: **471 pacotes / 0 vulnerabilidades conhecidas reportadas**.

### Gate não executável neste ambiente

`npm ci --ignore-scripts --offline` falha com `ENOTCACHED` em `zod-validation-error@4.0.2`. Sem árvore completa não é legítimo declarar `npm run check`, build Vite, lint integral ou preflight de produção como aprovados.

A release, portanto, é **5.1.0 RC** até esses gates rodarem em CI/VPS com registry funcional e credenciais reais.
