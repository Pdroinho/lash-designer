# Operações e recuperação

## Sinais vitais

- processo: `systemctl status lashdesigner`;
- exposição: o Node deve escutar somente em `127.0.0.1:3000`; apenas o Caddy publica 80/443;
- logs: `journalctl -u lashdesigner -f`;
- aplicação: `curl -f http://127.0.0.1:3000/api/health`;
- prontidão/banco: `curl -f http://127.0.0.1:3000/api/ready`;
- proxy: `journalctl -u caddy -f`;
- disco: `df -h /opt/lashdesigner`.

Configure um monitor externo em `/api/ready`, certificado TLS e espaço em disco. Alertas devem chegar a pelo menos duas pessoas/canais.

## Backup

`deploy/backup.sh` usa o comando `.backup` do SQLite, comprime, gera SHA-256 e remove cópias locais antigas. O timer roda diariamente às 03:15 UTC, com atraso aleatório de até 15 minutos. Mantenha ao menos uma cópia criptografada fora da VPS.

Teste restauração mensalmente em máquina separada:

```bash
sudo DATABASE_PATH=/opt/lashdesigner/db_data/app.db deploy/restore.sh /opt/lashdesigner/backups/arquivo.sqlite.gz
```

O script para o serviço, preserva uma cópia anterior, valida integridade, remove sidecars WAL/SHM antigos, restaura, inicia e testa `/api/ready`. Se o serviço não ficar pronto, ele reinstala automaticamente o banco anterior e tenta subir a aplicação novamente. Não apague o arquivo `*.before-restore-*` até concluir a validação funcional.

## Incidente

1. Preserve logs e horário exato.
2. Se houver exposição, retire o serviço do ar no Caddy antes de alterar evidências.
3. Revogue sessões/dispositivos pela aplicação ou, em incidente amplo, invalide os registros de `auth_sessions` e `trusted_devices` de forma controlada.
4. Se houver exposição de segredos em repouso, rotacione `APP_ENCRYPTION_KEY` somente com procedimento de recriptografia planejado; trocar a chave sem migrar ciphertext torna as credenciais Evolution ilegíveis.
5. Rotacione chaves de DNS, VPS, Git, InfinitePay, Evolution e domínio conforme o vetor.
6. Restaure somente de backup validado.
7. Documente impacto, causa raiz, correção e prevenção.

## Capacidade

SQLite deve rodar em uma única instância. Monitore latência, tamanho do arquivo, duração de backup e quantidade de escrita. Antes de escalar horizontalmente, migre banco e rate limit para serviços compartilhados.


## Recuperação de acesso

A troca de senha existe para ADMIN/DEV e invalida as sessões anteriores. CLIENT não possui senha: o acesso é por telefone + OTP WhatsApp. Como esta versão não envia e-mail transacional para recuperação profissional, uma pessoa ADMIN/DEV que perdeu a senha ou o acesso ao WhatsApp cadastrado precisa passar por procedimento de suporte com confirmação de identidade e troca controlada do número de segurança. Não envie senha provisória por canal aberto e não altere hashes diretamente sem registrar o incidente.

Antes de campanha pública, escolha uma das opções e documente o responsável:

1. integrar provedor de e-mail e fluxo de token único com expiração; ou
2. manter recuperação manual, com checklist de identidade, dupla aprovação para contas DEV/ADMIN, senha temporária forte e troca obrigatória no primeiro acesso.
