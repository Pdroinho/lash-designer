# Lash Saas Space

Plataforma SaaS White-label para gestão de estúdios de beleza e agendamentos, com suporte a múltiplos inquilinos (multi-tenancy), painel administrativo completo e área do cliente.

![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-yellow)
![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20SQLite-blue)

## 📋 Visão Geral

O **Lash Saas Space** é uma solução completa para profissionais de beleza que desejam gerenciar seus negócios. A plataforma oferece:
- **Multi-tenancy Real**: Cada cliente (estúdio) possui seu próprio subdomínio (ex: `studiobella.lashspace.com.br`) e banco de dados lógico isolado.
- **Painel Administrativo**: Gestão de agenda, serviços, clientes, financeiro e configurações do espaço.
- **Portal do Cliente**: Área exclusiva para clientes finais realizarem agendamentos, visualizarem histórico e gerenciarem seu perfil.
- **Painel do Desenvolvedor (Super Admin)**: Gestão centralizada de todos os inquilinos (tenants) e configurações globais da plataforma.

## 🚀 Tecnologias

### Frontend
- **React 19**: Biblioteca UI moderna e performática.
- **Vite**: Build tool ultrarrápida.
- **TypeScript**: Segurança de tipos em todo o código.
- **React Router v7**: Roteamento avançado.
- **Lucide React**: Ícones modernos e leves.
- **CSS Modules / Custom CSS**: Estilização limpa e performática (`src/styles.css`).

### Backend
- **Node.js + Express**: Servidor API robusto.
- **Better-SQLite3**: Banco de dados local de alta performance (compatível com MySQL para produção).
- **Zod**: Validação de esquemas e tipos.
- **JWT (JSON Web Tokens)**: Autenticação segura e stateless.

## 🛠️ Instalação e Execução

### Pré-requisitos
- Node.js (v18 ou superior)
- NPM ou Yarn

### Passo a Passo

1. **Clone o repositório**
   ```bash
   git clone https://github.com/seu-usuario/lash-saas-space.git
   cd lash-saas-space
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Inicie o ambiente de desenvolvimento**
   Este comando inicia tanto o servidor backend quanto o frontend em paralelo.
   ```bash
   npm run dev
   ```

4. **Acesse a aplicação**
   - **Painel Dev (Super Admin)**: `http://localhost:5173/login` (ou configure hosts para `dev.localhost`)
   - **Espaço Exemplo**: `http://exemplo.localhost:5173`

## 📂 Estrutura do Projeto

```
lash-saas-space/
├── server/                 # Backend (API e Banco de Dados)
│   ├── index.ts            # Ponto de entrada do servidor
│   ├── auth.ts             # Lógica de autenticação e middlewares
│   ├── db.ts               # Conexão e queries do banco de dados
│   └── migrate.ts          # Migrações e esquema do banco
├── src/                    # Frontend (React)
│   ├── App.tsx             # Componente raiz e rotas principais
│   ├── styles.css          # Estilos globais e componentes visuais
│   ├── api.ts              # Cliente HTTP para comunicação com o backend
│   └── types.ts            # Tipos TypeScript compartilhados
├── public/                 # Assets estáticos
└── scripts/                # Scripts de build e deploy
```

## 🔑 Funcionalidades Principais

### 1. Sistema Multi-Tenancy
A aplicação detecta automaticamente o subdomínio acessado (ex: `studio.dominio.com`) e carrega o contexto do tenant correspondente (logo, cores, dados).
- **Isolamento de Dados**: Garante que um estúdio não veja dados de outro.
- **Personalização**: Cada tenant tem sua própria cor primária, logo e slug.

### 2. Painel Administrativo (`/admin`)
- **Dashboard**: Visão geral de agendamentos do dia, receita e novos clientes.
- **Agenda**: Visualização de agendamentos (lista ou calendário).
- **Serviços**: Cadastro de serviços com preço, duração e imagem.
- **Clientes**: Base de clientes com histórico e métricas (LTV).
- **Financeiro**: Controle de entradas e saídas, metas mensais.

### 3. Portal do Cliente (`/agendar` e `/cliente`)
- **Agendamento Online**: Fluxo intuitivo para escolha de serviço, data e horário.
- **Minha Área**: Histórico de agendamentos e status (Confirmado, Pendente, Cancelado).
- **Login Unificado**: Clientes podem se cadastrar e logar facilmente.

### 4. Painel do Desenvolvedor (`/dev`)
Acessível apenas para usuários com role `DEV`.
- Criação e suspensão de Tenants.
- Configurações globais do sistema.
- Acesso direto a qualquer tenant para suporte.

## 🔐 Permissões e Roles

O sistema utiliza 3 níveis de permissão (`src/types.ts`):
- **DEV**: Super usuário. Acesso total ao sistema e gestão de tenants.
- **ADMIN**: Dono do estúdio. Acesso total ao painel do seu próprio tenant.
- **CLIENT**: Cliente final. Acesso apenas aos seus próprios agendamentos e perfil.

## 🎨 Design System

O projeto utiliza um sistema de design próprio definido em `src/styles.css`, focado em:
- **Variáveis CSS**: Cores (`--primary-500`), espaçamentos e fontes.
- **Componentes Reutilizáveis**: `PortalMenu`, `Shell`, `Card`, `Button`.
- **Responsividade**: Layout adaptável para Mobile e Desktop.

## 📦 Deploy

Para deploy em produção (ex: Hostinger VPS), consulte o arquivo:
[DEPLOY_HOSTINGER.md](./DEPLOY_HOSTINGER.md)

---
"Desenvolvido" por Pdroinho.
