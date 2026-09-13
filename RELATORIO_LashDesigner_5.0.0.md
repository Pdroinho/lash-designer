# Lash Designer 5.0.0 RC — Production Security & Reliability

**Data do checkpoint:** 11/08/2026  
**Base:** Lash Designer 4.0.0 — System Consistency  
**Status:** Release Candidate. Não promover para produção sem concluir os gates dependentes da árvore npm e homologação real dos providers.

## 1. Objetivo da release

A 5.0 substitui fundações frágeis de autenticação/sessão e endurece migrations, segredos, integrações externas e WhatsApp sem reescrever áreas estáveis do produto.

A implementação seguiu o plano de `docs/SECURITY_AND_RELIABILITY_5.0.md` e a análise prévia 4.0 → 5.0.

## 2. Banco e migrations

- Corrigida a colisão histórica de `whatsapp_messages` entre a fila antiga e a inbox atual.
- A fila antiga é preservada como `whatsapp_messages_legacy_queue`; não há drop silencioso.
- Schema desconhecido aborta a migração em vez de tentar adivinhar transformação.
- Reconciliação é idempotente para o schema suportado.
- Migrations adicionais incluem sessões/MFA/rate limit e hardening de WhatsApp/InfinitePay.

Teste dedicado da reconciliação do WhatsApp: **5/5**.

## 3. Autenticação e sessão

### Removido

- JWT de 30 dias;
- `jsonwebtoken` e tipos;
- `/api/auth/client-fast-login`;
- `ALLOW_INSECURE_FAST_LOGIN`;
- cadastro CLIENT concorrente por e-mail/senha.

### Novo modelo

- sessão opaca aleatória;
- banco armazena somente SHA-256 do token;
- revogação server-side individual;
- logout revoga a sessão atual;
- logout-all revoga todas;
- expiração absoluta e por inatividade;
- troca de senha derruba sessões anteriores e cria nova sessão autenticada;
- CLIENT acessa por telefone + OTP WhatsApp;
- ADMIN/DEV acessam por senha e, em dispositivo não confiável, TOTP.

Teste de sessão: **4/4**.

## 4. MFA, recovery codes e dispositivos confiáveis

- TOTP RFC 6238 via `otpauth` 9.5.1 fixo;
- enrollment obrigatório para ADMIN/DEV sem MFA;
- challenge pré-auth curto persistido no servidor;
- prevenção de reutilização do mesmo contador TOTP;
- recovery codes de 64 bits, uso único e armazenados somente como HMAC;
- regeneração exige senha atual + TOTP e invalida códigos anteriores;
- trusted device usa token aleatório separado da sessão;
- somente hash do token fica no banco;
- fingerprint/IP/User-Agent não autenticam ninguém;
- revogar dispositivo revoga sessões vinculadas;
- UI permite listar/revogar dispositivo, sessão individual e todas as sessões.

## 5. Criptografia e segredos

- produção exige `APP_ENCRYPTION_KEY` base64url forte;
- HKDF-SHA256 separa contextos;
- AES-256-GCM protege dados reversíveis;
- HMAC separado por finalidade para materiais não reversíveis;
- TOTP secret não fica em plaintext;
- Evolution API keys globais/por tenant são migradas de plaintext para ciphertext autenticado;
- OTP da cliente não depende mais de `JWT_SECRET`;
- startup não imprime o caminho físico do banco.

Testes criptográficos: **3/3**.

## 6. Rate limiting e eventos de segurança

- limites sensíveis de login/MFA/recovery/OTP persistem em SQLite e sobrevivem a restart;
- penalidade/cooldown progressivos;
- limpeza periódica de rate limits, challenges, sessões e trusted devices inativos/expirados;
- trilha estruturada para eventos de autenticação e segurança;
- OTP, recovery code, cookie, API key e segredo não são deliberadamente registrados em log.

## 7. WhatsApp / Evolution

### Webhook

- `MESSAGES_UPSERT`;
- `MESSAGES_UPDATE`;
- `CONNECTION_UPDATE`;
- segredo compartilhado em `x-webhook-secret` configurado no webhook da instância;
- receiver tenant-scoped e comparação em tempo constante;
- payload integral não vira log operacional;
- configuração mantém `base64: false`.

A capacidade de headers customizados no webhook foi conferida no código/changelog oficial da Evolution API antes do fechamento deste RC.

### Receipts

Progressão monotônica:

`UNKNOWN -> SENT -> DELIVERED -> READ`

Evento atrasado não regride `READ` para `DELIVERED`.

### Confirmações

- parser usa a frase completa;
- negativas têm precedência;
- `não vou conseguir confirmar agora` é recusa;
- novos envios não expõem código aleatório;
- correlação prioriza mensagem citada, fallback legado e candidato único;
- múltiplos candidatos geram ambiguidade em vez de escolher o “mais recente”.

Teste de intenção: **25/25**.

### Consentimento

- opt-out promocional reutiliza `marketing_whatsapp_opt_in`;
- não foi criada uma fonte de verdade concorrente;
- marketing é separado de OTP/comunicação operacional.

### Mídia

- base64 não é persistido no SQLite;
- limite de 8 MB;
- arquivo privado com nome gerado no servidor;
- MIME normalizado;
- endpoint autenticado e tenant-scoped;
- retry limitado;
- falha de mídia não perde a mensagem principal.

Teste de mídia: **3/3**.

### Health / reconnect

- worker limitado;
- cooldown;
- contador de falhas;
- claim persistente;
- diagnóstico de último check/sucesso/erro;
- sem loop de reconexão agressivo.

### Scheduler / polling

- agendamentos continuam job-first;
- reconciliador periódico foi reduzido a registros realmente sem job executável e limite menor;
- inbox usa polling adaptativo por atividade/visibilidade;
- sem `scrollIntoView()` global.

## 8. SSRF / Evolution URL

- HTTPS obrigatório;
- credenciais/query/hash proibidos;
- hosts/IPs locais e privados bloqueados;
- DNS resolvido antes da chamada e qualquer endereço privado rejeita a URL;
- redirects externos bloqueados com `redirect: 'error'`;
- em produção, ADMIN não controla URL/API key do provider; plataforma/DEV controla o endpoint efetivo.

Testes de URL externa: **4/4**.

## 9. InfinitePay

- nenhum HMAC fictício foi inventado;
- webhook usa schema explícito;
- pedido e valor locais precisam coincidir;
- `/payment_check` continua sendo a confirmação autoritativa;
- somente `PENDING` pode transicionar para `PAID`;
- atualização é transacional/condicional;
- replay já processado é idempotente;
- timeout/erro do provider não ativa assinatura/crédito;
- limiter dedicado;
- log do evento usa hash/metadados, não payload bruto.

## 10. SQLite e operação

- produção usa `synchronous=FULL`;
- WAL, foreign keys e busy timeout preservados;
- systemd ganha acesso gravável apenas ao diretório privado de mídia necessário;
- preflight usa `APP_ENCRYPTION_KEY` e não `JWT_SECRET`;
- `/api/health` usa a versão atual do pacote.

## 11. Consistência de produto

A 5.0 não criou um novo Design System nem refez áreas estáveis. O contrato 3.3 continua sendo a fonte visual.

Auditorias finais:

- Responsividade: **26/26**;
- Iconografia: **16/16**;
- Visual System: **22/22**;
- Design System 3.3: **aprovado; dívida visual não aumentou**;
- UX: **18/18**;
- Indicações: **12/12**;
- Onboarding: **16/16**;
- Estrutural: **26/26**;
- Luma: **33/33**;
- Financeiro: **24/24**;
- Appointment Lifecycle: **36/36**;
- WhatsApp Center: **25/25**;
- Product Consistency: **19/19**;
- Customer Experience: **25/25**;
- Marketing Consent: **15/15**;
- Security 5.0: **29/29**.

## 12. Testes executáveis

Suite independente executada com Node:

- external URL/SSRF: 4;
- secret crypto: 3;
- opaque session: 4;
- WhatsApp inbox migration: 5;
- WhatsApp intent/parser: 25;
- WhatsApp media: 3;
- WhatsApp reliability migration: 3;
- webhook/receipts: 3.

**Total: 50/50, 0 falhas.**

`server/index.ts` também passou no parser TypeScript do Node.

A varredura sintática de `App.tsx` e `WhatsAppCenter.tsx` não produziu diagnóstico TS1xxx. Ela ainda produz erros de resolução/tipos porque a árvore completa de dependências não está materializada neste ambiente; portanto isso **não é** apresentado como typecheck.

## 13. Lockfile / supply chain

`package.json` e `package-lock.json` estão alinhados em 5.0.0.

`npm install --package-lock-only --ignore-scripts --offline` concluiu e reportou:

- **473 pacotes auditados**;
- **0 vulnerabilidades conhecidas** na árvore registrada naquele gate.

## 14. Gates ainda bloqueados neste ambiente

O RC **não** é chamado de production-ready neste checkpoint.

`npm ci --ignore-scripts --offline` falha porque o cache local não contém:

`zod-validation-error@4.0.2`

Erro observado: `ENOTCACHED`.

Sem uma árvore íntegra de `node_modules`, não foi possível afirmar aprovação de:

- typecheck completo;
- lint completo;
- test suite npm que dependa da árvore inteira;
- build Vite/produção;
- preflight real com `dist` e ambiente de staging/produção.

Além disso, os fluxos Evolution/InfinitePay ainda exigem homologação real no ambiente conectado antes da promoção.

## 15. Gate obrigatório antes do deploy

Em VPS/CI com acesso íntegro ao registry e variáveis reais:

```bash
npm ci
npm run check
npm run preflight
```

Também executar a homologação operacional descrita em `docs/WHATSAPP.md` e validar webhook/payment em ambiente real.

## 16. Conclusão do checkpoint

A implementação 5.0 está fechada como **Release Candidate de segurança e confiabilidade**, com fundação de autenticação substituída, migrations protegidas, segredos criptografados, integração WhatsApp endurecida e regressões estáticas/testes independentes verdes.

A promoção para produção permanece deliberadamente bloqueada até os gates completos de dependências/build/preflight/homologação passarem em ambiente apropriado.
