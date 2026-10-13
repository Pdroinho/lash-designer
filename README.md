# Lash Designer

SaaS multi-tenant de agenda, clientes, serviços, finanças, equipe, suporte, billing e assistência de negócio para estúdios e profissionais de extensão de cílios.

**Release atual: 5.12.14 — Módulo independente de Equipe, Central de Suporte simplificada para usuárias, planos por equipe com Appmax e indicações com compensação de estorno.**

Consulte [Release 5.12.14](docs/RELEASE_5_12_14.md), [Release 5.12.13](docs/RELEASE_5_12_13.md), [Release 5.12.12](docs/RELEASE_5_12_12.md) e [Guia de Homologação de Indicações](docs/HOMOLOGACAO_INDICACOES_5_12_12.md).

## Stack

- **Frontend**: React 19, Vite, TypeScript, Phosphor Icons, Chart.js nativo;
- **Backend**: Node.js, Express 5, TypeScript, Zod;
- **Banco de Dados**: SQLite local via `better-sqlite3` com WAL habilitado, foreign keys, busy timeout de 5000ms e backups consistentes online;
- **Autenticação**: Sessões opacas revogáveis no servidor (cookie `__Host-session` `HttpOnly`/`Secure` em produção), MFA via WhatsApp com dispositivos confiáveis por 365 dias;
- **Segurança**: Criptografia de segredos e credenciais em repouso via `APP_ENCRYPTION_KEY`;
- **Rede & TLS**: Caddy com certificados on-demand para subdomínios e domínios personalizados;
- **Gateways de Pagamento**: Appmax (checkout primário com planos por equipe) e InfinitePay (webhook e fallback);
- **Mensageria**: Evolution API para WhatsApp multi-tenant dos estúdios e instância global dedicada para a plataforma.

## Gestão de Equipe & Central de Suporte (5.12.14)

- **Módulo de Equipe Independente (`src/features/team/`)**:
  - Aba e rota própria `/admin?view=team` acessível no menu da administradora e em "Mais" no mobile.
  - Cadastro guiado em 3 etapas (dados, serviços habilitados com preços/duração e horários).
  - Gestão de folgas com timezone explícito do estúdio e controle de acesso staff (`ProfessionalAccess.tsx`).
  - Validação estrita no backend contra períodos sobrepostos no mesmo dia e proteção da conta ADMIN.
- **Central de Suporte Amigável (`src/features/support/`)**:
  - Interface simplificada com validação inline imediata sem balões nativos do navegador.
  - Campos opcionais (categoria/urgência) em sanfona e histórico visual em formato de chat.
  - Notas internas e controles de prioridade estritamente isolados no painel DEV.

## Planos por Equipe (Team Plans)

A partir da versão 5.12.12, o modelo de assinatura adota faixas dimensionadas por capacidade de equipe:
- **TEAM_3**: Até 3 profissionais — R$ 74,90/mês
- **TEAM_6**: Até 6 profissionais — R$ 99,90/mês
- **TEAM_15**: Até 15 profissionais — R$ 149,00/mês

### Ecossistema de Indicações
- **Para a indicada**: 15% de desconto na primeira mensalidade (ex: TEAM_3 por R$ 63,66).
- **Para a indicadora**: 10% de crédito por indicação confirmada, acumulável até 30% na renovação.
- **Proteção Anti-Estorno**: Governança em `appmax_referral_debts` que compensa automaticamente estornos em créditos futuros.

## Desenvolvimento

```bash
cp .env.example .env
# Configure NODE_ENV=development, segredos locais e portas
npm ci
npm run dev
```

## Validação de Release

```bash
npm run typecheck         # Checagem de tipos frontend e server
npm run lint              # Análise estática ESLint
npm run test              # Suíte completa de testes unitários e de integração
npm run test:team-ui      # Verificação de fluxos e interface da aba de Equipe
npm run test:support-ui   # Verificação de fluxos e interface da Central de Suporte
npm run build             # Compilação para dist/
npm run preflight         # Validação de variáveis de ambiente e integridade operacional
```

Comando unificado de verificação:
```bash
npm run check
```

## Endpoints Operacionais

- `GET /api/health`: Checagem básica de vida do processo Node;
- `GET /api/ready`: Checagem profunda de prontidão (processo + integridade do SQLite);
- `GET /api/internal/domains/authorize/:secret`: Endpoint interno de autorização de domínios para o Caddy.

## Documentação Técnica

- `docs/RELEASE_5_12_14.md`: Release notes da versão 5.12.14 (Equipe independente e Suporte);
- `docs/RELEASE_5_12_13.md`: Hotfix visual dos marcadores de atividade no dashboard;
- `docs/RELEASE_5_12_12.md`: Release notes da versão 5.12.12;
- `docs/HOMOLOGACAO_INDICACOES_5_12_12.md`: Guia de homologação e testes práticos de indicações;
- `docs/APPMAX_INTEGRATION_5_12.md`: Contrato de integração, endpoints e webhooks da Appmax;
- `docs/PRODUCT_CHANGE_5_12.md`: Documentação da transição de modelo comercial;
- `docs/RELEASE_5_12_10.md`: Correções visuais e homologação responsiva;
- `docs/RELEASE_5_12_8.md`: Implementação da Central de Suporte e chamados internos;
- `docs/SECURITY.md`: Modelo de segurança, controle de acesso e criptografia;
- `docs/OPERATIONS.md`: Procedimentos operacionais, rotinas de backup e disaster recovery;
- `DEPLOY_VPS.md`: Guia passo a passo de implantação em servidor VPS.

## Estrutura do Repositório

```text
src/                 Aplicação frontend (React, Vite, CSS versionado)
src/features/        Módulos funcionais (admin, booking, team, staff, client, support)
server/              Backend Express, serviços de domínio e runtimes
server/routes/       Rotas desacopladas por domínio (platform, billing, tenant)
server/support/      Central de suporte, tickets, anexos e notificações
deploy/              Configurações do Caddy, systemd e scripts de infraestrutura
scripts/             Scripts de auditoria, preflight e QA automatizado
docs/                Base documental e especificações técnicas
```
