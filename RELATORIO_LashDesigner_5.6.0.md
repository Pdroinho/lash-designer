# Relatório técnico — Lash Designer 5.6.0

## Resultado

A 5.6.0 fecha a infraestrutura jurídica/comercial que ainda não existia de forma completa no produto e libera o pipeline seguro de campanhas promocionais por WhatsApp.

## Implementado

### Contrato e privacidade

- Termos de Uso e Política de Privacidade internos e imprimíveis;
- conteúdo único/canônico servido pelo backend;
- dados legais reais obrigatórios em produção;
- aceite obrigatório no checkout, separado de marketing;
- versão + hash SHA-256 + snapshot exato do documento aceito;
- eventos de aceite append-only;
- fingerprints HMAC de IP e user-agent;
- reaceite fail-closed para contas existentes quando o bundle muda;
- recuperação autenticada do snapshot histórico aceito;
- controle independente de comunicações promocionais do Lash Designer.

### Campanhas

- UI de campanhas no WhatsApp Center;
- audiência consentida;
- fila persistida;
- limite por campanha;
- throttling;
- retries/backoff;
- rechecagem de consentimento por destinatário;
- opt-out automático por palavras de saída;
- instrução de saída no texto promocional;
- cancelamento e histórico;
- broadcast legado bloqueado;
- feature flag desligada por padrão.

## Decisão de consentimento

A opção promocional não foi pré-marcada. Do ponto de vista de prova, um opt-in positivo, separado e auditável é mais forte do que tentar inferir consentimento por omissão. O projeto preserva a autorização opcional sem amarrá-la à contratação.

## Testes

- Legal/compliance: 38/38;
- Responsividade: 26/26;
- Iconografia: 16/16;
- Visual System: 22/22;
- Design System: aprovado;
- UX: 18/18;
- Indicações: 12/12;
- Onboarding: 16/16;
- Estrutural: 26/26;
- Luma: 33/33;
- Financeiro: 24/24;
- Appointment Lifecycle: 36/36;
- WhatsApp Center: 26/26;
- Product Consistency: 19/19;
- Customer Experience: 25/25;
- Marketing Consent: 16/16;
- Security 5.x: 43/43;
- Password UI: 11/11;
- Landing 5.4.1 baseline: 19/19;
- migrations: 14/14;
- security primitives: 11/11;
- WhatsApp executável: 35/35;
- independentes: 60/60;
- audit de dependências offline: 0 vulnerabilidades reportadas.

## Limitação do ambiente

`npm run typecheck` foi executado e falhou antes da checagem do projeto por ausência de `vite/client` na árvore npm local. Foi executada transpilações sintáticas isoladas dos arquivos TS/TSX alterados sem diagnóstico de sintaxe. `npm ci`, typecheck, lint, testes dependentes de `tsx`, build e preflight com credenciais reais permanecem obrigatórios no servidor/CI antes da promoção.

## Antes da primeira venda

1. preencher a identidade jurídica real no `.env`;
2. revisão final dos textos por advogado;
3. `npm ci && npm run check`;
4. `NODE_ENV=production npm run preflight` com o ambiente real;
5. validar checkout/cancelamento/reembolso;
6. validar opt-in, envio de campanha pequena e opt-out `SAIR` em número real;
7. só então definir `WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED=true`.
