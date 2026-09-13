# Deploy em VPS — produção

Referência: Ubuntu 24.04, Node.js 22 LTS, Caddy 2 e **uma única instância** da aplicação enquanto o banco for SQLite.

## 1. DNS da plataforma

No provedor DNS, aponte para o IP público da VPS:

- domínio principal definido em `APP_BASE_URL` → A/AAAA;
- `*.<domínio-principal>` → A/AAAA;
- hostname definido em `DEV_HOST` → A/AAAA;
- hostname definido em `CUSTOM_DOMAIN_CNAME_TARGET` → A/AAAA.

O wildcard DNS encaminha subdomínios de espaços à VPS. O Caddy **não usa certificado wildcard**: o domínio principal recebe TLS normal; cada hostname DEV, tenant ou domínio personalizado é autorizado individualmente pelo endpoint local `ask`.

## 2. Sistema e usuário

```bash
sudo apt update
sudo apt install -y curl ca-certificates sqlite3
sudo adduser --system --group --home /opt/lashdesigner lashdesigner
sudo mkdir -p /opt/lashdesigner/{app,db_data,backups,media}
sudo chown -R lashdesigner:lashdesigner /opt/lashdesigner
sudo chmod 750 /opt/lashdesigner /opt/lashdesigner/{app,db_data,backups,media}
```

Instale Node.js 22 LTS e Caddy pelos repositórios oficiais dos fornecedores. Confirme:

```bash
node --version
npm --version
caddy version
```

## 3. Aplicação e ambiente

Envie o projeto para `/opt/lashdesigner/app`, sem `.env`, `data/*.db`, backups, `node_modules` ou builds de outra máquina.

```bash
cd /opt/lashdesigner/app
sudo -u lashdesigner npm ci
sudo chmod +x deploy/*.sh
```

Crie `/opt/lashdesigner/app/.env` a partir de `.env.example`. Gere segredos independentes. `APP_ENCRYPTION_KEY` precisa ser base64url de 32 bytes; use hexadecimal para o segredo presente na URL interna do Caddy:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # APP_ENCRYPTION_KEY
openssl rand -hex 32     # DEV_BOOTSTRAP_SECRET
openssl rand -hex 32     # DOMAIN_AUTH_SECRET
```

Nunca reutilize `APP_ENCRYPTION_KEY`, `DEV_BOOTSTRAP_SECRET`, `DOMAIN_AUTH_SECRET` ou segredos de webhook. Ajuste a permissão:

```bash
sudo chown lashdesigner:lashdesigner .env
sudo chmod 600 .env
```

Valide e gere o release:

```bash
sudo -u lashdesigner npm run typecheck
sudo -u lashdesigner npm run lint
sudo -u lashdesigner npm run test
sudo -u lashdesigner npm run build
sudo -u lashdesigner bash -lc 'set -a; source ./.env; set +a; npm run preflight'
```

`VITE_APP_BASE_URL`, `VITE_DEV_HOST`, `VITE_SALES_URL`, URLs legais e `VITE_SUBSCRIPTION_PRICE_CENTS` são incorporadas ao frontend no build. Sempre refaça o build após alterá-las.

## 4. Serviço systemd

```bash
sudo cp deploy/lashdesigner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lashdesigner
sudo systemctl status lashdesigner
curl --fail http://127.0.0.1:3000/api/ready
```

O serviço executa o preflight antes de iniciar e grava somente em `db_data`, `backups` e no diretório privado `media`.

## 5. Caddy e HTTPS

Copie `deploy/Caddyfile` para `/etc/caddy/Caddyfile`. Defina em `/etc/default/caddy`:

```bash
ACME_EMAIL=operacoes@seudominio.com.br
APP_DOMAIN=app.seudominio.com.br
DOMAIN_AUTH_SECRET=o-mesmo-valor-do-env-da-aplicacao
```

`APP_DOMAIN` é apenas o hostname, sem `https://`, porta ou caminho. Proteja e valide:

```bash
sudo chown root:root /etc/default/caddy
sudo chmod 600 /etc/default/caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

A rota `/api/internal/*` é bloqueada no proxy público. O Caddy acessa o endpoint de autorização diretamente por `127.0.0.1`.

## 6. Primeiro usuário DEV

Abra o hostname definido em `DEV_HOST`. Informe e-mail, WhatsApp com DDD, senha com pelo menos 8 caracteres e `DEV_BOOTSTRAP_SECRET`. O bootstrap deixa de criar usuários depois que o primeiro DEV existe.

Antes do primeiro login, configure a Evolution API Global pelo `.env` (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e opcionalmente `EVOLUTION_INSTANCE_NAME`) para que o DEV consiga receber o primeiro OTP. Depois do acesso, a configuração pode ser salva e gerenciada pelo painel DEV. Mantenha o segredo de bootstrap em cofre de credenciais; não o salve no navegador nem em mensagem compartilhada.

## 7. Backups automáticos

```bash
sudo chmod +x deploy/backup.sh deploy/restore.sh deploy/healthcheck.sh
sudo cp deploy/lashdesigner-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lashdesigner-backup.timer
sudo systemctl start lashdesigner-backup.service
sudo systemctl list-timers lashdesigner-backup.timer
```

Envie cópias criptografadas para outro provedor/região. Backup no mesmo disco não cobre perda da VPS.

## 8. Checklist de lançamento

- `npm ci` e `npm run check` aprovados na VPS;
- preflight aprovado com o `.env` real;
- `/api/ready` retorna 200 localmente e pelo domínio público;
- login DEV/ADMIN testado em navegador limpo com OTP WhatsApp, trusted device de 365 dias, reenvio e revogação;
- acesso CLIENT testado por telefone + OTP WhatsApp;
- criação, remarcação, cancelamento, horários e bloqueios testados no fuso real;
- checkout e webhook InfinitePay testados com valor e conta de produção;
- renovação de assinatura testada sem perder período restante;
- domínio personalizado testado do zero, incluindo remoção e revalidação;
- backup restaurado em ambiente separado;
- monitor de uptime, TLS, disco e backup configurado;
- assets finais substituíram placeholders;
- política de privacidade, termos, suporte, razão social e fluxo LGPD publicados.

## 9. Atualização e rollback

```bash
sudo systemctl stop lashdesigner
sudo -u lashdesigner /opt/lashdesigner/app/deploy/backup.sh
# envie o novo código para um diretório de release
cd /opt/lashdesigner/app
sudo -u lashdesigner npm ci
sudo -u lashdesigner npm run check
sudo -u lashdesigner bash -lc 'set -a; source ./.env; set +a; npm run preflight'
sudo systemctl start lashdesigner
curl --fail http://127.0.0.1:3000/api/ready
```

Preserve o release anterior. Migrações são automáticas; restauração de banco deve seguir `docs/OPERATIONS.md`.
