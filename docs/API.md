# Documentação da API

A API do Lash Saas Space é construída com Express e segue o padrão REST. As respostas são sempre em JSON.

## Autenticação

A maioria das rotas requer autenticação via cookie de sessão (`session`).
- **Middleware `requireRole('ROLE')`**: Protege rotas baseadas no tipo de usuário (`DEV`, `ADMIN`, `CLIENT`).

## Endpoints

### 🌍 Público (`/api/public`)
Rotas acessíveis sem login, usadas principalmente para carregar dados do tenant e agendamento.

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/public/tenant` | Retorna dados do tenant atual (baseado no subdomínio). |
| `GET` | `/api/public/tenant/:slug` | Retorna dados de um tenant específico pelo slug. |
| `GET` | `/api/public/services` | Lista serviços disponíveis para agendamento. |
| `GET` | `/api/public/booking` | Dados para a página de agendamento (regras, horários). |
| `GET` | `/api/public/availability` | Consulta slots disponíveis para uma data/serviço. |

### 🔐 Autenticação (`/api/auth`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/auth/me` | Retorna o usuário logado atual. |
| `POST` | `/api/auth/login` | Realiza login (email/senha). |
| `POST` | `/api/auth/logout` | Encerra a sessão. |
| `POST` | `/api/auth/register-client` | Cria uma nova conta de cliente. |
| `POST` | `/api/auth/client-fast-login` | Login rápido para clientes (ex: via link). |

### 🛠️ Desenvolvedor (`/api/dev`)
Requer role `DEV`. Acessível apenas em hosts de desenvolvimento ou subdomínio `dev`.

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/dev/tenants` | Lista todos os tenants. |
| `POST` | `/api/dev/tenants` | Cria um novo tenant. |
| `GET` | `/api/dev/tenants/:id` | Detalhes de um tenant. |
| `PATCH` | `/api/dev/tenants/:id` | Atualiza um tenant. |
| `DELETE` | `/api/dev/tenants/:id` | Exclui um tenant. |
| `POST` | `/api/dev/bootstrap` | Cria o primeiro usuário DEV (apenas se não existir). |
| `GET` | `/api/dev/users` | Gestão de usuários globais. |
| `GET` | `/api/dev/backup/export` | Exporta o banco de dados. |

### 🏢 Admin (`/api/admin`)
Requer role `ADMIN`. Gestão do próprio estúdio.

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/dashboard` | Estatísticas do painel. |
| `GET` | `/api/admin/appointments` | Lista agendamentos. |
| `POST` | `/api/admin/appointments` | Cria agendamento manual. |
| `PATCH` | `/api/admin/appointments/:id` | Atualiza status/dados do agendamento. |
| `DELETE` | `/api/admin/appointments/:id` | Cancela/Remove agendamento. |
| `GET` | `/api/admin/services` | Lista serviços cadastrados. |
| `POST` | `/api/admin/services` | Cria novo serviço. |
| `GET` | `/api/admin/finance` | Resumo financeiro. |
| `POST` | `/api/admin/finance/transactions` | Lança entrada/saída manual. |
| `GET` | `/api/admin/clients` | Lista de clientes e métricas. |
| `GET` | `/api/admin/whatsapp/status` | Status da conexão Evolution API. |

### 👤 Cliente (`/api/client`)
Requer role `CLIENT`.

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/client/appointments` | Meus agendamentos. |
| `POST` | `/api/client/appointments` | Cria um novo agendamento. |

## Webhooks

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/webhooks/evolution` | Recebe eventos do WhatsApp (Evolution API). |
| `POST` | `/api/webhooks/appmax` | Recebe eventos de pagamento (Appmax). |
