# Segurança — Lash Designer 5.1

## Modelo de autenticação

### ADMIN / DEV

- senha bcrypt;
- sessão opaca server-side em `auth_sessions`;
- cookie `__Host-session` em produção, `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`;
- dispositivo não confiável exige código de 6 dígitos enviado ao WhatsApp cadastrado;
- contas ADMIN/DEV legadas sem telefone passam por cadastro + verificação do WhatsApp antes da primeira sessão;
- o OTP profissional expira em 5 minutos, aceita no máximo 5 tentativas e é consumido uma única vez;
- não existe TOTP, QR de autenticador nem recovery code no runtime 5.1;
- dispositivo confiável usa token aleatório em cookie separado, somente hash no banco e validade de 365 dias;
- IP e User-Agent são metadados de auditoria, nunca fator de autenticação;
- logout revoga a sessão atual no servidor; logout-all revoga todas; sessões também podem ser revogadas individualmente na área Segurança;
- troca de senha revoga sessões anteriores.

### CLIENT

CLIENT usa telefone + OTP WhatsApp. O OTP expira, possui limite de tentativas, uso único e hash com chave derivada específica. Não existe `client-fast-login` nem cadastro CLIENT por senha no runtime 5.1.

## Criptografia de segredos

`APP_ENCRYPTION_KEY` é a chave raiz de produção. Contextos independentes são derivados para credenciais Evolution e HMACs de autenticação/OTP. Dados reversíveis usam AES-256-GCM versionado; tokens de sessão e trusted device são somente hash.

Não troque `APP_ENCRYPTION_KEY` diretamente em produção sem migrar/recriptografar os ciphertexts existentes.

## Rate limiting

- limiter geral em memória para tráfego de aplicação na arquitetura single-instance;
- limites sensíveis de login, senha, MFA, bootstrap e OTP persistidos em SQLite;
- penalidade progressiva sobre abuso;
- webhook InfinitePay possui limiter dedicado;
- envios WhatsApp possuem limiter por usuário.

## Isolamento multi-tenant

O tenant é derivado do hostname/sessão e rotas ADMIN continuam filtradas por `tenant_id`. Nunca aceite `tenantId` do corpo como fonte de autorização. DEV é a única role com alcance de plataforma.

## InfinitePay

O payload do webhook não ativa assinatura/crédito sozinho. O servidor:

1. valida o schema;
2. exige pedido local existente e valor correspondente;
3. consulta `/payment_check` no provedor;
4. exige `paid=true` e valor confirmado;
5. aplica somente transição `PENDING -> PAID` dentro de transação;
6. trata replay como idempotente;
7. registra somente hash/metadados do evento, não payload bruto.

Não existe assinatura HMAC inventada fora do contrato documentado pelo provedor.

## Evolution / WhatsApp

- API keys globais e por tenant legadas são criptografadas em repouso;
- em produção URL e API key são gerenciadas pela plataforma/DEV;
- URLs externas exigem HTTPS sem credenciais/query/hash;
- IPs locais/privados são bloqueados tanto em literal quanto após resolução DNS;
- redirects são recusados nas chamadas Evolution;
- webhook escuta `MESSAGES_UPSERT`, `MESSAGES_UPDATE` e `CONNECTION_UPDATE`;
- logs de webhook persistem hash/metadados, nunca payload integral;
- receipts são monotônicos (`SENT -> DELIVERED -> READ`);
- health/reconnect possui cooldown, claim e limite de tentativas;
- mídia fica fora do SQLite, em diretório privado, com limite de tamanho e path gerado pelo servidor;
- arquivos de mídia são entregues somente por endpoint autenticado e tenant-scoped;
- opt-out promocional atualiza a fonte de consentimento existente; não bloqueia OTP/comunicação operacional;
- confirmação de agendamento usa correlação explícita primeiro e não escolhe silenciosamente entre múltiplos candidatos.

## SQLite e arquivos

Produção usa WAL, foreign keys, `busy_timeout` e `synchronous=FULL`. Enquanto o produto usar SQLite, rode uma única instância gravadora. Mídia privada usa diretório separado autorizado explicitamente no systemd.

## Logs

Nunca registrar:

- cookie/token de sessão;
- trusted-device token;
- OTP de autenticação;
- `APP_ENCRYPTION_KEY`;
- API key Evolution;
- payload integral de webhook contendo dados pessoais;
- caminho físico do banco quando não necessário.

Eventos de segurança guardam somente metadados necessários para investigação.

## Controles web

- validação Zod em fronteiras críticas;
- proteção de origem para métodos mutáveis;
- CORS restrito;
- Helmet/CSP/HSTS;
- request ID e tratamento de erros sem stack pública;
- endpoint interno de autorização de domínio restrito a loopback/Caddy;
- URLs públicas e externas validadas;
- timeouts explícitos em providers.

## Gates obrigatórios da 5.1

Antes de produção:

```bash
npm ci
npm run check
NODE_ENV=production npm run preflight
```

Além da suíte histórica, `npm run check` executa os gates 5.1 de segurança, migrations, primitives e WhatsApp. Fresh DB e upgrade de banco legado precisam ser testados no ambiente de staging/VPS antes da promoção. O primeiro login profissional também depende da Evolution API Global estar configurada no banco ou pelas variáveis de bootstrap `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`.

## Resposta a incidente

Revogue sessões/dispositivos no servidor. Rotacione apenas os segredos atingidos. Em exposição de `APP_ENCRYPTION_KEY`, planeje recriptografia dos dados antes de substituir a chave. Preserve logs e backup antes de qualquer alteração destrutiva.
