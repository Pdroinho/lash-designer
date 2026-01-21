# Arquitetura do Sistema

Este documento descreve a arquitetura técnica do Lash Saas Space, incluindo o modelo de dados, estratégia de multi-tenancy e fluxo de autenticação.

## 🏛️ Visão Geral

O sistema é um **Monólito Modular** construído com React (Frontend) e Express (Backend) no mesmo repositório.
- **Frontend**: Single Page Application (SPA) servida pelo Vite.
- **Backend**: API RESTful stateless.
- **Banco de Dados**: SQLite (com `better-sqlite3`) rodando em modo WAL (Write-Ahead Logging) para performance. Em produção, pode ser migrado para MySQL/PostgreSQL facilmente, pois o código usa SQL padrão.

## 🌐 Multi-Tenancy

A arquitetura utiliza **Database-per-Tenant (Lógico)**, onde todos os dados residem no mesmo banco, mas são segregados pela coluna `tenant_id`.

### Resolução de Tenant
O middleware `resolveTenantFromSubdomain` (em `server/index.ts`) intercepta todas as requisições:
1. Analisa o `Hostname` da requisição.
2. Verifica se é um domínio customizado na tabela `tenant_domains`.
3. Se não, verifica se é um subdomínio do sistema (ex: `slug.lashspace.com.br`).
4. Se encontrar, anexa o objeto `tenant` à requisição (`req.resolvedTenant`).
5. Se não encontrar (e não for rota pública/dev), retorna 404.

## 🗄️ Modelo de Dados (Schema)

O banco de dados é gerenciado via migrações manuais em `server/migrate.ts`.

### Tabelas Principais

- **tenants**: Armazena os estúdios.
  - `id`, `slug` (subdomínio), `name`, `primary_color`, `status`.
- **users**: Usuários do sistema (Devs, Admins e Clientes).
  - `tenant_id` (NULL para Devs), `email`, `password_hash`, `role`.
- **clients**: Perfil do cliente vinculado a um usuário.
  - `tenant_id`, `user_id`, `phone`.
- **services**: Serviços oferecidos pelo estúdio.
  - `tenant_id`, `name`, `price_cents`, `duration_minutes`.
- **appointments**: Agendamentos.
  - `tenant_id`, `service_id`, `client_user_id`, `starts_at`, `ends_at`, `status`.

### Módulos Adicionais

- **Financeiro**: `cash_transactions` (Entradas/Saídas).
- **Configurações**: `tenant_settings` (Timezone, Currency), `business_hours`, `booking_rules`.
- **WhatsApp**: `whatsapp_instances` (Conexão Evolution API), `whatsapp_messages`, `whatsapp_settings`.
- **Pagamentos**: `appmax_subscriptions` (Assinatura do SaaS), `appmax_events`.

## 🔐 Autenticação e Segurança

### JWT (JSON Web Tokens)
A autenticação é baseada em tokens assinados (`HS256`).
- O token é armazenado em um cookie `HttpOnly` (`session`).
- Contém: `userId`, `role`, `tenantId`.

### Roles
- **DEV**: Acesso global. Pode gerenciar qualquer tenant via API `/api/dev`.
- **ADMIN**: Acesso restrito ao `tenant_id` do usuário. Pode gerenciar o próprio estúdio.
- **CLIENT**: Acesso restrito aos próprios dados dentro de um tenant.

### Middleware de Proteção
- `sessionMiddleware`: Verifica e decodifica o cookie de sessão.
- `requireRole(...)`: Garante que o usuário tenha a permissão necessária.

## 🔄 Fluxo de Agendamento

1. **Seleção**: Cliente escolhe serviço.
2. **Disponibilidade**: Backend calcula slots livres baseando-se em:
   - `business_hours` (Horário de funcionamento).
   - `time_off` (Bloqueios/Férias).
   - `appointments` existentes (Conflitos).
   - `booking_rules` (Antecedência mínima, passo de tempo).
3. **Confirmação**: Cliente confirma e o agendamento é criado com status `PENDING` ou `CONFIRMED` (configurável).

## 📦 Deploy e Infraestrutura

O projeto é agnóstico de nuvem, mas foi otimizado para VPS (ex: Hostinger).
- **Processo**: Build do Frontend -> Build do Backend (TS -> JS) -> Execução com Node.js.
- **Proxy Reverso**: Nginx/Apache recomendado para gerenciar SSL e subdomínios wildcard.
