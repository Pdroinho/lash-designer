# Lash Designer 5.0.0 — Production Security & Reliability

**Status:** Release Candidate de código-fonte.  
**Base:** Lash Designer 4.0.0 — System Consistency.  
**Objetivo:** substituir fundações frágeis de autenticação/sessão, corrigir o blocker de migrations e endurecer WhatsApp, webhooks, segredos e operação antes do deploy.

> Este documento registra decisões, implementação, riscos corrigidos, limites assumidos e gates necessários para promover a 5.0 a produção. Ele não substitui `docs/RELEASE_CHECKLIST.md`.

---

## 1. Princípios usados nesta major

1. Segurança, integridade de dados e correção têm prioridade sobre redução de código.
2. A 4.0 é preservada como baseline; a 5.0 altera apenas fronteiras necessárias.
3. Não foi criada arquitetura paralela quando o produto já possuía mecanismo adequado.
4. Não foi introduzido Redis, Postgres, WebSocket ou framework multi-provider sem necessidade atual.
5. Auditoria externa foi tratada como input: achados foram conferidos contra a base real antes de qualquer correção.
6. Nenhum gate é considerado aprovado se não tiver sido realmente executado.

---

# 2. Decisões arquiteturais principais

## 2.1 JWT deixa de existir no runtime

A 4.0 usava JWT HS256 com validade longa, mas o middleware já consultava o SQLite em praticamente toda requisição autenticada para conferir usuário, tenant, role e `session_version`.

A 5.0 elimina o bearer JWT e usa **sessão opaca server-side**:

- token aleatório de 256 bits no navegador;
- apenas SHA-256 do token no banco;
- revogação individual real;
- logout revoga no servidor;
- logout-all revoga todas;
- tenant desativado perde sessões;
- troca de senha invalida sessões anteriores;
- timeout absoluto e timeout de inatividade são verificados no servidor.

O cookie em produção é `__Host-session`, `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`.

Tokens JWT antigos deixam de autenticar porque não existem em `auth_sessions`.

## 2.2 Dispositivo confiável é separado da sessão

“Continuar conectado” e “Confiar neste dispositivo” não significam a mesma coisa.

- **Sessão persistente:** controla por quanto tempo a sessão atual pode permanecer válida.
- **Dispositivo confiável:** controla se um login futuro, após senha válida, poderá pular o TOTP.

O dispositivo confiável:

- recebe token aleatório separado;
- banco guarda apenas hash;
- expira em 30 dias;
- pode ser revogado individualmente;
- revogação encerra as sessões vinculadas a ele;
- User-Agent serve apenas para um nome amigável;
- IP/User-Agent nunca são fator de autenticação.

## 2.3 ADMIN/DEV usam senha + TOTP em dispositivo novo

Fluxo profissional:

### Dispositivo confiável

`email + senha -> sessão`

### Dispositivo novo

`email + senha -> TOTP -> sessão`

### Primeiro acesso profissional após 5.0

`email + senha -> enrollment TOTP -> validação do primeiro código -> recovery codes -> sessão`

Antes do segundo fator existe apenas um desafio pré-auth curto persistido no servidor.

TOTP usa biblioteca dedicada OTPAuth e segue o modelo RFC 6238: 6 dígitos, período de 30 segundos e janela curta. O último contador TOTP aceito é persistido para impedir reutilização do mesmo código temporal.

## 2.4 Recovery codes

- 10 códigos por geração;
- 64 bits aleatórios por código;
- exibidos integralmente apenas no momento da geração/regeneração;
- persistidos somente como HMAC derivado;
- uso único;
- consumo é condicional no banco;
- regeneração exige **senha atual + TOTP**;
- regenerar apaga/invalida os códigos anteriores;
- uso/regeneração gera evento de segurança.

## 2.5 CLIENT não usa senha profissional

A identidade moderna de cliente já era telefone + OTP WhatsApp. A 5.0 consolida isso:

- remove `client-fast-login` fisicamente;
- remove `ALLOW_INSECURE_FAST_LOGIN`;
- remove cadastro CLIENT por email/senha do runtime;
- `/api/auth/login` rejeita role CLIENT;
- CLIENT entra por telefone + OTP WhatsApp;
- OTP mantém 6 dígitos, 5 minutos, uso único e limite de tentativas;
- hash do OTP usa chave derivada própria, não `JWT_SECRET`.

---

# 3. Blocker de banco corrigido

## 3.1 Problema real da 4.0

A migration 4 criou `whatsapp_messages` como fila antiga de saída. A migration 28 tentava executar `CREATE TABLE IF NOT EXISTS whatsapp_messages` esperando um schema completamente diferente de inbox e logo depois criar índice em `conversation_id`.

Em banco que carregava a tabela antiga, a migration 28 podia falhar antes de migrations posteriores serem alcançadas.

## 3.2 Correção

Foi criado `server/whatsappInboxMigration.ts` como dono único do invariante.

Comportamento:

- detecta schema de inbox atual;
- detecta fila antiga;
- renomeia fila antiga para `whatsapp_messages_legacy_queue`;
- não apaga dados silenciosamente;
- aborta diante de schema desconhecido;
- aborta se já existir archive legado que seria sobrescrito;
- cria inbox atual idempotentemente.

A migration 28 usa esse helper, portanto fresh install/upgrade não dependem de chegar a uma migration posterior para consertar o passado.

A migration 30 executa reconciliação idempotente como segunda camada.

## 3.3 Novas migrations da 5.0

### 31 — sessões e dispositivos

- `trusted_devices`;
- `auth_sessions`;
- índices de usuário/expiração.

### 32 — MFA e eventos

- `user_mfa`;
- `mfa_recovery_codes`;
- `auth_challenges`;
- `security_events`.

### 33 — rate limit persistente

- `security_rate_limits`.

### 34 — WhatsApp reliability

- health/reconnect em `whatsapp_instances`;
- delivery/media em `whatsapp_messages`;
- `evolution_webhook_events`;
- índices de receipts, media queue e health.

### 35 — observabilidade InfinitePay

- `infinitepay_webhook_events` com hash/metadados do evento.

---

# 4. Sessões server-side

Arquivo principal: `server/session.ts`.

## 4.1 Duração

Sessões não persistentes:

- limite absoluto: 24 h;
- inatividade: 12 h.

Sessões persistentes:

- limite absoluto: 30 dias;
- inatividade: 7 dias.

`last_seen_at` é atualizado com granularidade para evitar escrita em toda request.

## 4.2 Revogação

A 5.0 oferece:

- logout da sessão atual;
- logout-all;
- revogação de sessão ativa individual;
- revogação de dispositivo confiável;
- revogação de todas as sessões de tenant desativado;
- troca de senha com invalidação das sessões anteriores.

A área **Segurança da conta** mostra sessões e dispositivos separadamente.

---

# 5. Criptografia e segredos

## 5.1 Chave raiz

Produção exige:

`APP_ENCRYPTION_KEY=<32 bytes base64url>`

`JWT_SECRET` foi removido do runtime/preflight.

## 5.2 Derivação por finalidade

A 5.0 usa HKDF-SHA256 para separar contextos criptográficos.

Dados reversíveis usam AES-256-GCM autenticado e formato versionado.

Contextos separados incluem:

- TOTP;
- enrollment TOTP;
- Evolution API keys;
- HMAC de OTP CLIENT;
- HMAC de recovery codes.

Sessões, trusted-device tokens e recovery codes não precisam ser descriptografados e portanto não são armazenados reversivelmente.

## 5.3 Evolution

Chaves Evolution que existiam em plaintext são migradas transacionalmente para ciphertext. Ciphertexts existentes são testados durante startup; chave raiz errada causa falha explícita em vez de sobrescrever segredo válido.

## 5.4 Rotação

Não trocar `APP_ENCRYPTION_KEY` diretamente em produção sem procedimento de recriptografia. Uma troca cega torna TOTP/Evolution ilegíveis.

---

# 6. Rate limiting e eventos de segurança

O produto continua single-instance enquanto usa SQLite. Redis não foi adicionado.

Há dois níveis:

- limiter genérico em memória para tráfego comum;
- limiter persistente em SQLite para fronteiras sensíveis.

Proteções persistentes cobrem login, identidade de login, senha, bootstrap, OTP CLIENT e desafios MFA relevantes, com penalidade progressiva.

Eventos registrados incluem:

- falha/sucesso de login;
- MFA requerido/falhou/concluído;
- enrollment;
- recovery code usado;
- recovery codes regenerados;
- trusted device criado/revogado;
- sessão revogada;
- logout/logout-all;
- mudança de senha;
- eventos críticos de integração.

Não são gravados OTP, TOTP, recovery code, cookie/token, API key ou payload sensível integral.

---

# 7. Área Segurança no frontend

ADMIN e DEV compartilham `SecuritySettingsCard`.

A 4.0 renderizava `PasswordSettingsCard` sem definição correspondente; a 5.0 elimina essa inconsistência em vez de recriar componente legado.

A superfície atual oferece:

- troca de senha;
- status do MFA;
- regeneração de recovery codes com senha + TOTP;
- dispositivos confiáveis, com indicação do atual;
- revogação individual/todos os dispositivos;
- sessões ativas, com indicação da atual;
- revogação individual/todas as sessões.

O login profissional possui estados separados de senha, TOTP, enrollment, recovery code e exibição única dos recovery codes iniciais.

---

# 8. WhatsApp / Evolution reliability

A 5.0 não recria a Central. Ela endurece mecanismos já existentes.

## 8.1 Eventos

Webhook configurado para:

- `MESSAGES_UPSERT`;
- `MESSAGES_UPDATE`;
- `CONNECTION_UPDATE`.

## 8.2 Receipts

Status monotônico:

`UNKNOWN -> SENT -> DELIVERED -> READ`

Evento atrasado não regride estado mais forte.

## 8.3 Autenticação do webhook

O endpoint Evolution é tenant-scoped e exige `EVOLUTION_WEBHOOK_SECRET`. O backend registra esse segredo como header customizado `x-webhook-secret` no `webhook/set` da própria instância; a Evolution API atual suporta headers customizados no registro do webhook. O receiver aceita o header esperado e faz comparação em tempo constante.

O segredo não entra na URL do callback e não é persistido em logs.

## 8.4 Health e reconnect

Worker limitado por ciclo, com:

- último check;
- último conectado;
- último erro;
- tentativas;
- cooldown exponencial;
- claim persistente para evitar chamadas duplicadas;
- chamada de reconexão somente após falhas suficientes.

## 8.5 Confirmação de presença

O parser foi reconstruído para frase completa e negativas.

Exemplo crítico:

`não vou conseguir confirmar agora` -> **DECLINE**.

Mensagem normal:

`1` confirma; `2` informa impossibilidade.

Novos envios não expõem `confirmation_code`. O campo permanece apenas para correlação de respostas legadas.

Correlação:

1. mensagem citada/provider id;
2. código legado, quando existe;
3. candidato único no horizonte seguro;
4. mais de um candidato -> `AMBIGUOUS_REPLY` e desambiguação humana.

A janela operacional usada na correlação foi reduzida para 72 horas em vez de selecionar registros distantes.

## 8.6 Consentimento / opt-out

Opt-out promocional reutiliza a fonte de verdade `marketing_whatsapp_opt_in`. Não existe segunda tabela concorrente de opt-out.

Marketing, automação operacional, manual e sistema são tratados como finalidades diferentes. Opt-out de promoção não bloqueia OTP nem comunicação operacional necessária.

## 8.7 Mídia

Mídia não é persistida em base64 no SQLite.

- máximo 8 MB;
- storage privado;
- filename interno gerado;
- MIME normalizado;
- metadata no banco;
- endpoint autenticado/tenant-scoped;
- até 5 tentativas com backoff;
- falha de mídia não perde o registro principal da mensagem.

## 8.8 Reconciliador de automações

O caminho principal continua job-first no write de appointment. O scan periódico deixou de varrer 2.500 appointments indiscriminadamente e busca apenas appointments futuros sem job executável, limitado a 300.

## 8.9 Polling frontend

Intervalo fixo foi substituído por `setTimeout` adaptativo:

- ~6 s ativo;
- ~30 s após inatividade prolongada;
- ~60 s em aba escondida;
- refresh imediato em focus/visibility;
- sem scroll global forçado.

---

# 9. SSRF / URLs externas

`server/externalUrl.ts` valida:

- HTTPS;
- ausência de credenciais;
- ausência de query/fragmento;
- host local bloqueado;
- IP privado/local literal bloqueado;
- resolução DNS e rejeição se qualquer endereço resolvido for privado/local.

Chamadas Evolution usam `redirect: 'error'`.

Em produção, tenants comuns não alteram URL/API key da Evolution. A plataforma/DEV controla o host efetivo.

Limite documentado: a resolução antes do `fetch` não é pinning de DNS contra toda forma possível de rebinding. A redução de superfície em produção e o bloqueio de redirects são parte essencial da defesa.

---

# 10. InfinitePay

A análise anterior que sugeria confiar em um HMAC não documentado foi rejeitada.

A 5.0 mantém o mecanismo servidor-a-servidor do provider como autoridade:

1. schema Zod do webhook;
2. pedido local precisa existir;
3. valor local precisa bater;
4. `/payment_check` precisa confirmar `paid=true` e o valor correto;
5. somente estado local `PENDING` pode transicionar para `PAID`;
6. transação condicionada impede aplicação duplicada;
7. replay já pago é ignorado de forma idempotente;
8. timeout/erro do provider não ativa assinatura/crédito;
9. webhook tem limiter dedicado;
10. log persiste hash/metadados, não payload bruto.

Não foi inventado header de assinatura que o provider não documenta.

---

# 11. SQLite / durabilidade

Produção usa:

- WAL;
- foreign keys;
- `busy_timeout=5000`;
- `synchronous=FULL`.

Desenvolvimento/teste podem usar `NORMAL`.

A 5.0 continua assumindo uma única instância gravadora. Escala horizontal exige migração deliberada de banco/storage/rate limit; não foi antecipada nesta release.

---

# 12. Operação e systemd

Novo diretório privado:

`/opt/lashdesigner/media`

A unit systemd libera escrita somente nos diretórios necessários, incluindo DB/backups/media.

O preflight de produção exige `APP_ENCRYPTION_KEY` forte e deixa de exigir `JWT_SECRET`/flag de fast-login.

`/api/health` usa a versão do `package.json` em vez de string histórica hardcoded.

O startup não imprime o caminho físico do banco.

---

# 13. Dependências

Alterações deliberadas:

- removido `jsonwebtoken`;
- removido `@types/jsonwebtoken`;
- adicionado `otpauth` **9.5.1** fixo;
- `chart.js` permanece **4.5.1** fixo.

`package.json` e `package-lock.json` estão em 5.0.0 e coerentes.

O lockfile foi validado offline com `npm install --package-lock-only --ignore-scripts --offline`, que concluiu e reportou 0 vulnerabilidades conhecidas para a árvore registrada naquele momento.

Isso **não substitui** `npm ci` + `npm audit` em CI/VPS com registry funcional.

---

# 14. Testes executados nesta preparação

## 14.1 Primitives/SQLite executáveis

50/50 testes passaram usando Node 22 e os módulos testáveis sem a árvore npm completa:

- URL externa/SSRF;
- criptografia;
- sessão opaca;
- migration de inbox WhatsApp;
- parser de intenção;
- mídia;
- migration reliability;
- receipts/conexão.

Resultados específicos:

- migration inbox: 5/5;
- sessão: 4/4;
- criptografia: 3/3;
- parser WhatsApp: 25/25;
- mídia: 3/3;
- migration reliability: 3/3;
- webhook status/conexão: 3/3;
- URL externa: 4/4.

## 14.2 Audits de regressão executados

- Responsividade: 26/26;
- Iconografia: 16/16;
- Visual System: 22/22;
- Design System 3.3: aprovado, dívida não aumentou;
- UX: 18/18;
- Indicações: 12/12;
- Onboarding: 16/16;
- Estrutural: 26/26;
- Luma: 33/33;
- Financeiro: 24/24;
- Appointment Lifecycle: 36/36;
- WhatsApp Center: 25/25;
- Product Consistency: 19/19;
- Customer Experience: 25/25;
- Marketing Consent: 15/15;
- Security 5.0: 29/29.

O audit de Appointment foi atualizado de um contrato antigo inseguro (“escolher o pedido mais recente”) para exigir o novo invariante: múltiplos candidatos nunca são resolvidos silenciosamente.

## 14.3 Parse/sintaxe adicional

Os módulos TS novos e `server/index.ts` foram passados por checagens sintáticas disponíveis no ambiente. Uma execução parcial do TypeScript encontrou e permitiu corrigir uma regex quebrada na rota de mídia antes do fechamento.

A checagem TSX isolada não mostrou diagnósticos sintáticos TS1xxx; os demais diagnósticos decorrem da ausência da árvore de módulos.

---

# 15. Gates que NÃO puderam ser concluídos neste ambiente

A árvore completa de `node_modules` não pôde ser materializada porque o cache local não possui `zod-validation-error@4.0.2` e o registry externo não ficou disponível de forma confiável.

Portanto **não são declarados como aprovados** nesta entrega:

- `npm ci` completo;
- `npm run typecheck` completo;
- `npm run lint` completo;
- suíte `npm test` que depende de `tsx`/dependências instaladas;
- `npm run build` Vite + server TypeScript;
- `npm run check` integral;
- `npm run preflight` com ambiente real de produção;
- teste E2E real com Evolution/WhatsApp;
- teste E2E real com InfinitePay;
- teste Caddy/TLS/DNS em VPS;
- Safari/Firefox/dispositivo físico.

Por isso o artefato permanece **5.0.0 RC**.

---

# 16. Gates obrigatórios antes de promoção para produção

Em staging/VPS com registry e credenciais reais:

```bash
npm ci
npm audit --omit=dev
npm run check
set -a
source ./.env
set +a
NODE_ENV=production npm run preflight
```

Também executar:

1. fresh DB -> latest schema;
2. cópia de banco legado real -> latest schema;
3. `PRAGMA integrity_check`;
4. backup e restore smoke test;
5. login ADMIN/DEV novo dispositivo -> enrollment/TOTP;
6. login profissional em trusted device;
7. recovery code de uso único;
8. regeneração de recovery codes;
9. revogação de sessão/dispositivo;
10. login CLIENT por OTP;
11. inbound/outbound/receipt/media WhatsApp real;
12. desconexão/reconexão Evolution;
13. ambiguidade real de confirmação de agendamento;
14. webhook InfinitePay repetido, valor errado e `payment_check` negativo;
15. restart do processo preservando rate limits sensíveis;
16. revisão de logs para ausência de segredo;
17. QA browser/viewport das superfícies de autenticação e Segurança.

---

# 17. Mudanças incompatíveis / comportamento de upgrade

- sessões JWT antigas deixam de autenticar;
- usuários profissionais precisam entrar novamente;
- ADMIN/DEV sem MFA precisam configurar autenticador no primeiro login;
- `client-fast-login` não existe;
- CLIENT não entra pelo formulário de email/senha;
- `JWT_SECRET` deixa de ser configuração ativa;
- produção passa a exigir `APP_ENCRYPTION_KEY`;
- Evolution em produção passa a ser integração gerenciada pela plataforma;
- diretório de mídia privada precisa existir e ter permissão correta.

Essa quebra é intencional e evita carregar compatibilidade insegura da autenticação anterior.

---

# 18. O que deliberadamente não foi adicionado

- Redis;
- Postgres;
- OAuth/social login;
- fingerprint de navegador;
- refresh-token JWT;
- WebSocket/SSE para inbox;
- arquitetura multi-provider de WhatsApp;
- armazenamento base64 de mídia no SQLite;
- broadcast promocional em massa;
- HMAC fictício de InfinitePay;
- refactor amplo de `server/index.ts` ou `src/App.tsx`;
- limpeza global do CSS legado.

Esses itens não são necessários para corrigir os invariantes atuais e adicionariam superfície de manutenção sem ganho imediato.

---

# 19. Limites ainda assumidos

1. SQLite + rate limit persistente continuam single-instance.
2. DNS validation reduz SSRF, mas não equivale a egress firewall/pinning DNS.
3. Health/reconnect da Evolution depende do contrato da versão instalada no deploy e precisa ser homologado contra ela.
4. Download de mídia é best-effort com retry; a mensagem textual/metadata permanece mesmo se o provider não entregar mídia.
5. Recovery de acesso total a ADMIN/DEV ainda exige procedimento operacional caso senha, TOTP e recovery codes sejam perdidos; não há e-mail transacional nesta release.

---

# 20. Checklist de segurança antes do deploy

- [ ] `APP_ENCRYPTION_KEY` forte, única e armazenada fora do repositório.
- [ ] nenhum `JWT_SECRET` sendo usado como requisito ativo.
- [ ] MFA enrollment testado com conta ADMIN e DEV.
- [ ] recovery codes armazenados fora do dispositivo principal.
- [ ] trusted-device revocation testada.
- [ ] session revocation individual/all testada.
- [ ] banco legado migrado com backup anterior preservado.
- [ ] Evolution API key verificada criptografada em repouso.
- [ ] `/opt/lashdesigner/media` privado e gravável apenas pelo serviço.
- [ ] webhook Evolution real envia os três eventos esperados.
- [ ] InfinitePay `payment_check` testado com pedido real de homologação.
- [ ] logs revisados sem tokens/OTP/API keys/payloads sensíveis.
- [ ] `npm ci`, `npm audit`, `npm run check`, build e preflight verdes.
- [ ] rollback/restore testado antes de promoção.

---

# 21. Veredito de release

**O código-fonte 5.0 está em estado RC e fecha as mudanças arquiteturais planejadas de segurança/reliability, mas não deve ser promovido a produção antes dos gates integrais de dependências, compilação, build, preflight e homologação externa listados acima.**
