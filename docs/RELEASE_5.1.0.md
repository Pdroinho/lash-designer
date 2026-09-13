# Lash Designer 5.1.0 RC — WhatsApp MFA + Evolution Global + Password Policy

## Objetivo

A 5.1.0 adapta a fundação de segurança da 5.0 ao público real do produto: ADMIN/DEV deixam de depender de aplicativo autenticador e passam a usar código de verificação pelo WhatsApp, mantendo sessões opacas, trusted devices e revogação server-side.

Esta release permanece **RC** até o pipeline integral (`npm ci`, `npm run check`, `npm run preflight`) ser executado em VPS/CI com registry e credenciais reais.

## Mudanças de autenticação

- TOTP/OTPAuth removidos do runtime e do lockfile.
- Recovery codes removidos do fluxo e da UI.
- ADMIN/DEV usam e-mail + senha e, em dispositivo não confiável, OTP de 6 dígitos via WhatsApp.
- OTP profissional expira em 5 minutos, aceita no máximo 5 tentativas e é uso único.
- Reenvio possui rate limit persistente e challenge-scoped.
- Trusted device passa a 365 dias no banco **e no cookie**.
- Usuários ADMIN/DEV passam a possuir `phone` E.164.
- Contas legadas sem telefone entram em enrollment seguro: senha válida → informar WhatsApp → validar OTP → persistir telefone → criar sessão.
- O endpoint de envio não aceita `userId` fornecido pelo navegador: a identidade vem do challenge pré-auth HttpOnly.
- Alteração posterior do WhatsApp de segurança exige a senha atual.

## Password policy

O mínimo do produto foi reduzido de 12 para 8 caracteres em todos os fluxos profissionais atuais e suas validações de frontend.

## Evolution API Global

A 5.0 já possuía `platform_settings` e credenciais Evolution globais cifradas. Por isso a 5.1 **não cria uma segunda tabela concorrente**. As migrations apenas evoluem a estrutura existente.

A configuração canônica fica no painel DEV:

- Base URL;
- API Key cifrada com `APP_ENCRYPTION_KEY` e nunca retornada ao frontend;
- nome da instância global de plataforma;
- status;
- conexão/QR;
- reconexão real via restart da instância;
- logout/desconexão.

A instância global é usada para MFA profissional. As instâncias de WhatsApp de cada tenant continuam separadas para preservar isolamento de conversas, webhooks e inboxes. Novos tenants reutilizam o provider global (URL/API key) sem compartilhar a sessão WhatsApp da plataforma.

### Bootstrap do primeiro DEV

Para evitar deadlock no primeiro login em produção, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_NAME` podem fornecer a configuração inicial por ambiente. Valores persistidos pelo painel DEV têm prioridade.

Em produção, o bootstrap por ambiente é rejeitado se URL/key forem configurados parcialmente ou se a URL não for uma origem HTTPS limpa.

## Migrations

### 036

- adiciona `users.phone` quando ausente;
- substitui o schema efêmero de `auth_challenges` pelo contrato `WHATSAPP_OTP`;
- invalida dados TOTP/recovery legados sem criar um segundo modelo de MFA.

### 037

- adiciona `encrypted INTEGER NOT NULL DEFAULT 0` à `platform_settings` existente quando necessário;
- cria a configuração `evolution_instance_name` sem destruir outras configurações globais.

As tabelas históricas `user_mfa`/`mfa_recovery_codes` permanecem vazias para evitar DDL destrutivo desnecessário durante o upgrade. Não possuem caller de runtime na 5.1.

## Correções adicionais

- `ChevronDown` entrou definitivamente em `src/components/Icons.ts` usando o entry point individual do Phosphor.
- removido o bypass temporário de MFA; não existe caminho de login profissional que pule o challenge fora de trusted device válido.
- corrigido bug preexistente da área Segurança em que revogações não aguardavam o modal assíncrono de confirmação.
- painel DEV deixou de reutilizar CSS privado do WhatsApp Center para o QR global.

## Validação executada neste ambiente

- Security 5.1: **43/43**;
- migrations + primitives + WhatsApp independentes: **50/50**;
- Responsividade: **26/26**;
- Iconografia: **16/16**;
- Visual System: **22/22**;
- Design System 3.3: aprovado sem aumento de dívida;
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
- Marketing Consent: **15/15**.

`npm install --package-lock-only --ignore-scripts --offline` concluiu e auditou 471 pacotes com 0 vulnerabilidades conhecidas reportadas pelo metadata disponível.

## Gate externo obrigatório

O cache deste ambiente não contém `zod-validation-error@4.0.2`, dependência transitiva necessária para materializar a árvore completa. `npm ci --ignore-scripts --offline` termina com `ENOTCACHED` antes de instalar todas as dependências.

Logo, ainda não são declarados aprovados aqui:

```bash
npm ci
npm run check
NODE_ENV=production npm run preflight
```

Também devem ser homologados com infraestrutura real:

- login ADMIN/DEV em dispositivo novo → OTP WhatsApp;
- enrollment de conta legada sem telefone;
- trusted device em segundo login;
- configuração/QR/status/reconexão da Evolution Global;
- criação de tenant com senha de 8 caracteres e WhatsApp válido;
- upgrade de banco real + backup/restore.
