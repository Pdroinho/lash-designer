# API principal

Todas as respostas de API usam `Cache-Control: no-store`. Rotas mutáveis exigem origem compatível em produção; autenticação usa cookie seguro.

## Públicas

- `GET /api/public/tenant` e `GET /api/public/tenant/:slug`;
- `GET /api/public/services`;
- `GET /api/public/booking`;
- `GET /api/public/availability?date=AAAA-MM-DD`.

## Autenticação

### Profissional — ADMIN / DEV

- `POST /api/auth/login` — e-mail + senha; trusted device válido cria sessão, dispositivo novo abre desafio WhatsApp OTP;
- `POST /api/auth/whatsapp-otp/send` — envia/reenvia o código de 6 dígitos; no primeiro acesso legado também valida o telefone informado contra o desafio pré-auth;
- `POST /api/auth/whatsapp-otp/verify` — valida o código, opcionalmente confia o dispositivo por 365 dias e cria sessão;
- `GET /api/auth/security` — WhatsApp de segurança, dispositivos confiáveis e sessões ativas;
- `PUT /api/auth/security/phone` — altera o WhatsApp de segurança após confirmar a senha atual;
- `DELETE /api/auth/security/devices/:deviceId` — revoga dispositivo e sessões ligadas a ele;
- `POST /api/auth/security/devices/revoke-all` — revoga todos os dispositivos confiáveis;
- `DELETE /api/auth/security/sessions/:sessionId` — revoga uma sessão ativa pertencente ao usuário;
- `POST /api/auth/logout` — revoga a sessão atual no servidor;
- `POST /api/auth/logout-all` — revoga todas as sessões do usuário;
- `POST /api/auth/change-password` — exige senha atual e invalida sessões anteriores;
- `GET /api/auth/me`.

ADMIN/DEV usam sessão opaca persistida no servidor. O cookie contém somente token aleatório; o banco mantém somente o hash. Dispositivo confiável não substitui senha: ele apenas evita o segundo fator em login futuro por até 365 dias. O MFA profissional não usa mais TOTP/recovery codes.

### Cliente

A identidade CLIENT é passwordless e baseada em telefone + OTP WhatsApp. O antigo cadastro CLIENT por e-mail/senha e `client-fast-login` não existem na 5.1.

## Cliente

- `GET /api/client/appointments`;
- `POST /api/client/appointments`.

## Administração do espaço

Serviços, agenda, horários, bloqueios, clientes, financeiro, marca, WhatsApp e configurações ficam sob `/api/admin` e exigem role `ADMIN` e assinatura ativa. As rotas de cobrança necessárias para reativação permanecem acessíveis com assinatura inativa.

### WhatsApp / Evolution API

- `GET /api/admin/whatsapp` retorna configuração efetiva sem revelar API key;
- `PUT /api/admin/whatsapp` mantém configuração de instância; em produção URL e API key são gerenciadas somente pela plataforma/DEV;
- `GET /api/admin/whatsapp/status` e `GET /api/admin/whatsapp/qrcode`;
- `POST /api/admin/whatsapp/send` é somente para envio manual/teste e normaliza o telefone;
- `GET /api/admin/whatsapp/messages/:id/media` entrega mídia privada somente ao tenant autenticado;
- `POST /api/admin/whatsapp/broadcast` permanece bloqueado; consentimento e opt-out existem, mas o pipeline de broadcast em massa não foi liberado.

Credenciais globais são configuradas pelo DEV e armazenadas criptografadas. Em produção o espaço usa a integração gerenciada pela plataforma. Chamadas externas validam HTTPS, resolução DNS pública e bloqueiam redirects. A inbox processa mensagens, receipts, estado de conexão e mídia privada; jobs de agendamento continuam persistentes.

### Domínios

- `GET /api/admin/domains`;
- `POST /api/admin/domains`;
- `POST /api/admin/domains/:id/verify`;
- `POST /api/admin/domains/:id/primary`;
- `DELETE /api/admin/domains/:id`.

Limite atual: cinco domínios por espaço.

## Console DEV

Rotas sob `/api/dev` exigem role `DEV` e o hostname exclusivo configurado em `DEV_HOST`. Bootstrap e backup têm rate limits próprios. A API oferece exportação consistente para backup, mas **não oferece restauração pelo navegador**. A restauração é exclusivamente operacional, com o serviço parado, pelo script `deploy/restore.sh`.

### Evolution API Global

- `GET /api/dev/evolution/config` — URL, nome da instância e presença de API key, sem devolver o segredo;
- `PUT /api/dev/evolution/config` — atualiza URL e/ou API key criptografada;
- `GET /api/dev/evolution/status` — consulta estado da instância global;
- `POST /api/dev/evolution/connect` — conecta/cria a instância e devolve QR quando necessário;
- `DELETE /api/dev/evolution/disconnect` — encerra a sessão global.

A instância global é usada pelo MFA da plataforma. As inboxes dos espaços continuam usando instâncias separadas para preservar o isolamento de mensagens; as credenciais globais da Evolution podem ser reaproveitadas pela configuração gerenciada da plataforma.

## InfinitePay

- `GET /api/admin/billing/overview`;
- `POST /api/admin/subscription/checkout-url`;
- `GET /api/admin/subscription/order-status`;
- `POST /api/webhooks/infinitepay`.

O overview retorna assinatura e pedidos reais do tenant. O checkout aceita somente URL HTTPS válida devolvida pela operadora. O webhook não confia no payload isoladamente: consulta `payment_check`, confere pedido e valor e ativa a assinatura em transação idempotente.

## Operação

- `GET /api/health`;
- `GET /api/ready`;
- `GET /api/internal/domains/authorize/:secret?domain=...` — somente loopback/Caddy.

## Billing 2.0

- `GET /api/public/billing/plans` — catálogo público de ciclos e métodos;
- `GET /api/admin/billing/overview` — assinatura, catálogo e pedidos do tenant;
- `POST /api/admin/subscription/checkout-url` — cria checkout para `MONTHLY`, `QUARTERLY`, `SEMIANNUAL` ou `ANNUAL`;
- `GET /api/admin/subscription/order-status` — consulta o pedido do tenant;
- `POST /api/webhooks/infinitepay` — confirma servidor-a-servidor e ativa o período.

## Luma

- `GET /api/admin/assistant/usage` — disponibilidade e franquia diária;
- `POST /api/admin/assistant/message` — pergunta limitada ao contexto agregado do negócio.

## Onboarding pós-compra

- `GET /api/admin/onboarding` — estado do setup e disponibilidade da assistência visual;
- `POST /api/admin/onboarding/brand-suggestions` — até três sugestões por tenant, com fallback curado;
- `POST /api/admin/onboarding/complete` — grava marca, horários, catálogo inicial e conclusão em uma transação;
- `POST /api/admin/onboarding/skip` — adia o setup sem bloquear o painel.

A imagem é limitada a 450 kB depois da otimização no navegador. O servidor não aceita tipos arbitrários, não aplica sugestões sem confirmação e não duplica serviços quando o tenant já possui catálogo ativo.

## Super admin

- `GET /api/dev/platform-overview` — métricas de tenants, assinaturas, pedidos e uso de IA;
- `POST /api/dev/tenants/:tenantId/permanent-delete` — exclusão definitiva após desativação e confirmação forte.
