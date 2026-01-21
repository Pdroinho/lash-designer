# Atualizações de Segurança (Backend) — Lash Saas Space

Este documento descreve, de forma consolidada, as atualizações de segurança implementadas no backend (Express) do Lash Saas Space.

## 1) Objetivo

- Reduzir risco de invasão, vazamento e abuso (bruteforce, flooding, webhooks falsos, CSRF, sequestro de sessão).
- Preparar a base para escala (ex.: ~2000 usuários) sem abrir brechas por aumento de tráfego.
- Manter compatibilidade com o comportamento atual sempre que possível.

## 2) Resumo das mudanças

- Endurecimento HTTP com Helmet (CSP/HSTS/Referrer Policy) e remoção de `x-powered-by`.
- CORS com validação por origem, suportando subdomínios e domínios customizados do tenant.
- Proteção de “same-origin” para chamadas mutáveis da API em produção (mitigação de CSRF via cookie).
- Rate limiting em múltiplas camadas (API geral, webhooks e endpoints de autenticação).
- Rate limiting por usuário (e-mail/telefone) além de IP para mitigar ataques distribuídos.
- Webhooks protegidos por segredo opcional (backward-compatible) com comparação timing-safe.
- Cookie de sessão com duração reduzida (30 dias) e flags seguras (`HttpOnly`, `SameSite=Lax`, `Secure` em produção).
- Revogação imediata de sessão via `session_version` no banco, incluindo endpoint de “logout em todos os dispositivos”.
- Validação de variáveis sensíveis em produção (bloqueio de JWT_SECRET default).

## 3) Detalhamento técnico (por área)

### 3.1) Headers e hardening HTTP

Implementado no bootstrap do servidor:

- `app.disable('x-powered-by')` remove uma pista de tecnologia.
- `helmet(...)` aplica políticas de segurança, com configurações diferentes para produção:
  - CSP ativado somente em produção.
  - HSTS ativo somente em produção (com `includeSubDomains` e `preload`).
  - `referrerPolicy: no-referrer`.

Referência:
- server/index.ts

### 3.2) CORS multi-tenant (origem permitida)

O CORS foi configurado para permitir somente origens válidas, considerando:

- Quando `FRONTEND_ORIGIN` não está configurado: permite (comportamento típico de desenvolvimento).
- Quando `FRONTEND_ORIGIN` está configurado:
  - Permite a origem exata configurada.
  - Permite subdomínios do host configurado (ex.: `*.lashspace.com.br`).
  - Permite domínios customizados presentes na tabela `tenant_domains`.

Observação: `credentials: true` está habilitado para suportar cookie de sessão.

Referência:
- server/index.ts

### 3.3) Mitigação de CSRF (Same-Origin para chamadas mutáveis)

Como a autenticação usa cookie `HttpOnly`, existe risco clássico de CSRF se uma origem externa conseguir disparar requisições mutáveis usando o cookie do navegador.

Foi adicionado um guard de same-origin em produção:

- Aplica somente para métodos mutáveis (não afeta GET/HEAD/OPTIONS).
- Aplica somente em rotas `/api/*`.
- Exceção para `/api/webhooks/*`.
- Exige `Origin` ou `Referer`.
- Valida se o hostname de `Origin/Referer` é exatamente igual ao `req.hostname`.

Referência:
- server/index.ts (middleware `requireSameOrigin`)

### 3.4) Rate limiting (anti-abuso)

Foi implementado um rate limiter em memória com:

- Janela temporal (`windowMs`) e limite (`max`).
- Chave por IP (default) com opção de chave alternativa (ex.: e-mail/telefone).
- Resposta 429 com header `Retry-After`.

Camadas configuradas:

1) Geral da API
- Aplica em `/api/*` (exceto `'/webhooks/'`), protegendo a plataforma contra flood.

2) Webhooks
- Aplica em `/api/webhooks/*`, para reduzir risco de spam/DoS via webhooks.

3) Autenticação
- Limites por IP em endpoints de login/registro/fast-login.
- Limites adicionais por “identidade”:
  - Login por e-mail (normalizado) para mitigar bruteforce distribuído.
  - Registro por e-mail (normalizado).
  - Fast-login por telefone (normalizado).

4) Rotas DEV sensíveis
- Rate limit específico para bootstrap e export/import de backup.

Observação de escala:
- Como o limiter atual é em memória do processo, em cenário multi-instância (vários processos/containers) o limite não é global. Para produção com múltiplas instâncias, o ideal é migrar o armazenamento das contagens para Redis (ou equivalente) ou aplicar rate limiting na borda (Nginx/Cloudflare/WAF).

Referência:
- server/index.ts (createRateLimiter + aplicações em rotas)

### 3.5) Segurança de webhooks (Appmax / Evolution)

Foi adicionada autenticação opcional de webhooks baseada em segredo:

- Se o segredo não estiver configurado no ambiente, a validação não bloqueia (backward-compatible).
- Se configurado, o webhook precisa enviar o segredo.
- O segredo pode ser enviado via:
  - Header `x-webhook-secret`.
  - Header `Authorization: Bearer <secret>`.
  - Querystring `?secret=<secret>`.
- A comparação é feita com `timingSafeEqual` para reduzir risco de timing attacks.

Variáveis de ambiente:
- `APPMAX_WEBHOOK_SECRET`
- `EVOLUTION_WEBHOOK_SECRET`

Referência:
- server/index.ts (requireWebhookSecret)
- server/env.ts

### 3.6) Sessão/JWT e cookies

O backend usa JWT assinado (HS256) armazenado em cookie `session`.

Melhorias aplicadas:

- Cookie com flags:
  - `HttpOnly: true`
  - `SameSite: lax`
  - `Secure: true` em produção
  - `Path: /`
- Duração de cookie reduzida para 30 dias.
- O JWT também expira em 30 dias.

Referência:
- server/index.ts (login/register/fast-login)
- server/security.ts

### 3.7) Revogação imediata de sessão (logout global)

Problema resolvido:
- JWT puro é stateless; se um token vazar, ele fica válido até expirar.

Solução implementada:

- Coluna `users.session_version` (default 0).
- Token passa a carregar `sessionVersion`.
- Em cada request, o `sessionMiddleware` valida:
  - Token é válido e decodificado.
  - Usuário existe no banco.
  - `users.session_version` é igual ao `sessionVersion` do token.
  - Role válida.
  - O `req.sessionUser` passa a refletir role/tenant vindos do banco.

Novo endpoint:
- `POST /api/auth/logout-all`
  - Incrementa `session_version` do usuário logado.
  - Limpa o cookie `session`.
  - Resultado: todos os tokens antigos passam a ser inválidos imediatamente.

Compatibilidade:
- Tokens antigos (sem `sessionVersion`) são tratados como `0`.

Referência:
- server/migrate.ts (migração 13)
- server/security.ts
- server/auth.ts
- server/index.ts

### 3.8) Regras de host/tenant no login

Regras aplicadas para reduzir risco de acesso indevido por host errado:

- Usuário DEV só autentica em host DEV.
- Usuário não-DEV precisa estar no subdomínio do tenant correspondente (checagem de mismatch entre tenant resolvido e tenant do usuário).

Referência:
- server/index.ts (rota `/api/auth/login`)

### 3.9) Proteções adicionais

- `Cache-Control: no-store` para rotas `/api/*`, reduzindo risco de cache de respostas sensíveis.
- Limites de payload:
  - JSON padrão limitado a 2MB.
  - URL-encoded limitado a 64KB.
  - Exceção controlada para import de backup DEV (50MB) com rota protegida.

Referência:
- server/index.ts

## 4) Configuração de produção (checklist)

- Definir `JWT_SECRET` forte (mínimo 16 chars). Em produção, o servidor falha ao iniciar se estiver com o valor default.
- Definir `FRONTEND_ORIGIN` para restringir CORS.
- Definir `APPMAX_WEBHOOK_SECRET` e `EVOLUTION_WEBHOOK_SECRET` para autenticar webhooks.
- Garantir HTTPS na borda (necessário para cookie `Secure`).
- Se houver proxy reverso (Nginx/Cloudflare), manter `trust proxy` habilitado em produção (já configurado) para IP correto no rate limiting.

Referência:
- server/env.ts
- server/index.ts

## 5) Observações operacionais

- Rate limiting em memória é suficiente para single-instance. Para multi-instance, usar armazenamento compartilhado (Redis) ou rate limiting/WAF na borda.
- A validação de same-origin em produção pressupõe uso do frontend no mesmo hostname do tenant. Se houver arquitetura com domínio separado (ex.: api.*), será necessário ajustar a política.

