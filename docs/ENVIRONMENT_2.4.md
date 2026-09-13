# Ambiente — Lash Designer 2.4.0

Use `.env.example` como contrato canônico. Segredos nunca devem entrar no repositório ou no ZIP distribuído.

## Plataforma

- `NODE_ENV=production`
- `PORT`
- `LOG_LEVEL`
- `DATABASE_PATH`
- `APP_BASE_URL`
- `VITE_APP_BASE_URL`
- `FRONTEND_ORIGIN`

## Console DEV e autenticação

- `DEV_HOST`
- `VITE_DEV_HOST`
- `DEV_BOOTSTRAP_SECRET`
- `JWT_SECRET`
- `ALLOW_INSECURE_FAST_LOGIN=false`

## Comercial e legal

- `VITE_SUPPORT_URL`
- `VITE_PRIVACY_URL`
- `VITE_TERMS_URL`
- `VITE_SALES_URL` é somente fallback legado opcional.

## InfinitePay e planos

- `INFINITEPAY_HANDLE`
- `INFINITEPAY_BASE_URL`
- `SUBSCRIPTION_PRICE_CENTS`
- `VITE_SUBSCRIPTION_PRICE_CENTS`
- `PLAN_MONTHLY_CENTS`
- `PLAN_QUARTERLY_CENTS`
- `PLAN_SEMIANNUAL_CENTS`
- `PLAN_ANNUAL_CENTS`

O preflight exige consistência entre o preço anual do backend, frontend e catálogo de planos.

## Luma / OpenRouter

- `AI_ASSISTANT_ENABLED`
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_MODEL=google/gemini-2.5-flash-lite`
- `OPENROUTER_VISION_MODEL=google/gemini-2.5-flash-lite`
- `OPENROUTER_BATCH_MODEL=google/gemini-2.5-flash-lite`

As variáveis `OPENAI_*` permanecem apenas para compatibilidade temporária com instalações antigas. Não configure as duas chaves simultaneamente.

## Domínios

- `CUSTOM_DOMAIN_CNAME_TARGET` ou `CUSTOM_DOMAIN_IPV4`/`CUSTOM_DOMAIN_IPV6`
- `DOMAIN_AUTH_SECRET`
- `DOMAIN_VERIFY_INTERVAL_MINUTES`
- `DOMAIN_ACTIVE_REVERIFY_HOURS`

## WhatsApp

- `EVOLUTION_WEBHOOK_SECRET`

Credenciais de infraestrutura ficam no backend/DEV. A profissional vê apenas o fluxo de conexão por QR Code.
