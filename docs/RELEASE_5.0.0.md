# Release 5.0.0 RC — Production Security & Reliability

A 5.0 é uma major de segurança e confiabilidade sobre a 4.0.0 System Consistency.

## Principais mudanças

- JWT removido; sessões opacas revogáveis no servidor;
- TOTP obrigatório para ADMIN/DEV em dispositivo não confiável;
- trusted devices com token separado e hash no banco;
- recovery codes de uso único e regeneração autenticada;
- sessão individual/todas as sessões revogáveis;
- `client-fast-login` e CLIENT por senha removidos;
- rate limits sensíveis persistentes em SQLite;
- `APP_ENCRYPTION_KEY` + AES-256-GCM/HKDF para segredos;
- Evolution API keys criptografadas em repouso;
- correção do conflito histórico de `whatsapp_messages`;
- receipts, health/reconnect, mídia privada, parser/matching e polling adaptativo no WhatsApp;
- SSRF reduzido com DNS público, redirects bloqueados e integração Evolution gerenciada pela plataforma em produção;
- InfinitePay endurecido com schema, `payment_check`, `PENDING -> PAID` e replay idempotente;
- SQLite `synchronous=FULL` em produção;
- documentação e preflight atualizados.

## Status de validação local

- 50/50 testes executáveis de primitives/migrations/WhatsApp;
- matriz histórica de audits aprovada;
- Security 5.0 audit: 29/29;
- Design System 3.3: dívida não aumentou;
- lockfile coerente e validação offline reportou 0 vulnerabilidades conhecidas na árvore registrada.

## Gate pendente

O ambiente atual não materializou `node_modules` completo porque faltou o tarball transitivo `zod-validation-error@4.0.2` no cache e o registry não ficou disponível. Assim, `npm ci`, typecheck/lint completos, build e preflight de produção permanecem obrigatórios em CI/VPS antes do deploy.

Consulte `SECURITY_AND_RELIABILITY_5.0.md` para o registro completo.
