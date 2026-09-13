# Checklist de homologação e liberação

Use este documento como gate. Não publique apenas porque o processo iniciou: cada item P0 precisa de evidência registrada (comando, screenshot, log ou ticket).

## 1. Código e cadeia de dependências — P0

- [ ] `npm ci` conclui em máquina limpa, usando o `package-lock.json` do release.
- [ ] `npm audit --omit=dev` foi revisado; vulnerabilidades relevantes têm correção ou aceite documentado.
- [ ] `npm run check` passa integralmente.
- [ ] `npm run preflight` passa com o `.env` real e o build recém-gerado.
- [ ] O pacote publicado não contém `.env`, banco, backup, log, `node_modules` ou build antigo.
- [ ] O SHA-256 do pacote/release foi registrado.

## 2. Infraestrutura — P0

- [ ] Node.js 22, npm 10+, Caddy 2, `sqlite3` e systemd instalados.
- [ ] Serviço roda como usuário `lashdesigner`, sem root.
- [ ] Node escuta somente em `127.0.0.1:3000`.
- [ ] Firewall publica apenas SSH restrito, 80 e 443.
- [ ] `.env`, banco e backups têm permissões mínimas.
- [ ] `caddy validate --config /etc/caddy/Caddyfile` passa.
- [ ] `/api/ready` retorna 200 local e externamente por HTTPS.
- [ ] Reinício da VPS recupera automaticamente Caddy, aplicação e timer de backup.

## 3. Identidade, legal e suporte — P0

- [ ] Logo, favicon/PWA, imagem do login e hero público finais foram aplicados.
- [ ] Nome comercial, razão social, CNPJ/CPF responsável e contatos estão corretos.
- [ ] Política de privacidade e termos foram revisados e publicados.
- [ ] URLs `VITE_SUPPORT_URL`, `VITE_PRIVACY_URL` e `VITE_TERMS_URL` apontam para destinos HTTPS reais.
- [ ] Processo LGPD de acesso, correção, exclusão e incidente está definido.
- [ ] Recuperação de senha perdida tem processo aprovado: e-mail transacional ou suporte com confirmação de identidade.

## 4. Autenticação e isolamento — P0

- [ ] Bootstrap cria somente o primeiro DEV e rejeita tentativas posteriores.
- [ ] ADMIN/DEV: senha válida em dispositivo novo exige OTP WhatsApp antes da sessão.
- [ ] ADMIN/DEV: trusted device válido por até 365 dias pula somente o OTP; senha continua obrigatória.
- [ ] ADMIN/DEV sem telefone legado cadastra e verifica o WhatsApp antes da primeira sessão.
- [ ] CLIENT: acesso ocorre por telefone + OTP WhatsApp; login profissional rejeita role CLIENT.
- [ ] `client-fast-login`, cadastro CLIENT por senha, `JWT_SECRET` e `ALLOW_INSECURE_FAST_LOGIN` não existem no runtime ativo.
- [ ] Logout revoga a sessão atual no servidor; logout-all revoga todas.
- [ ] Sessão individual pode ser revogada pela área Segurança.
- [ ] Troca de senha invalida sessões anteriores e mantém somente a nova sessão atual.
- [ ] Revogar trusted device encerra as sessões vinculadas a ele.
- [ ] “Continuar conectado” e “Confiar neste dispositivo” foram testados separadamente.
- [ ] Sessão de um tenant é rejeitada no hostname de outro.
- [ ] Tenant suspenso perde acesso sem apagar dados.
- [ ] Cookies de produção são `__Host-session`, `__Host-preauth`/`__Host-device` quando aplicável, `Secure`, `HttpOnly` e `SameSite=Lax`.
- [ ] `APP_ENCRYPTION_KEY` é forte, única e não aparece em logs/repositório.
- [ ] Rate limits de login/MFA/OTP continuam efetivos após restart do processo.

## 5. Fluxos do produto — P0

- [ ] ADMIN: dashboard, serviços, agenda, bloqueios, clientes, financeiro, WhatsApp, cobrança, domínio, conta e Segurança.
- [ ] Evolution API Global possui URL/key, status, conexão/QR, reconexão e desconexão no painel DEV; API key não aparece em respostas/logs e permanece criptografada no banco.
- [ ] Primeiro login DEV funciona com fallback de bootstrap `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` antes de existir sessão para abrir o painel.
- [ ] Webhook Evolution real entrega `MESSAGES_UPSERT`, `MESSAGES_UPDATE` e `CONNECTION_UPDATE`.
- [ ] Envio/recebimento manual, receipts, health/reconnect e mídia privada foram testados em aparelho real.
- [ ] Dois agendamentos ambíguos para o mesmo telefone não confirmam/cancelam registro automaticamente.
- [ ] Opt-out promocional é respeitado sem bloquear OTP e comunicação operacional.
- [ ] Endpoint de campanha em massa permanece bloqueado mesmo com consentimento implementado.
- [ ] CLIENT: booking público, telefone + OTP, conflito, visualização e preferências de marketing.
- [ ] Público: disponibilidade, timezone, preço, resumo, confirmação, mobile e desktop.
- [ ] DEV: criação/edição/suspensão de tenant, integrações, usuários DEV, backup e configurações.
- [ ] Product Tour foi testado em todas as abas, teclado, tema claro/escuro e viewport mobile.
- [ ] Estados vazios, loading, erros de rede e ações destrutivas foram revisados.

## 6. Cobrança InfinitePay — P0

- [ ] Handle, preço e URLs são de produção.
- [ ] Checkout abre somente HTTPS e retorna ao hostname real do tenant.
- [ ] Pagamento aprovado é confirmado por `payment_check` e aparece no histórico real.
- [ ] Webhook repetido não duplica renovação.
- [ ] Valor/pedido divergente é rejeitado.
- [ ] Renovação preserva o período restante e acrescenta 12 meses.
- [ ] Política de estorno, cancelamento, inadimplência e suporte está publicada.

## 7. Domínios personalizados — P0

- [ ] Fluxo completo testado em Cloudflare e em um segundo provedor DNS.
- [ ] TXT incorreto não ativa domínio.
- [ ] CNAME/A/AAAA incorreto não ativa domínio.
- [ ] DNS correto ativa, recebe TLS e resolve o tenant certo.
- [ ] Timeout/SERVFAIL temporário não derruba domínio ativo.
- [ ] Remoção/revogação impede novas emissões e deixa de resolver o tenant.
- [ ] Endpoint interno de autorização não responde pela internet.

## 8. Dados, backup e recuperação — P0

- [ ] Fresh DB percorre todas as migrations até latest sem erro.
- [ ] Cópia de banco 4.0/legado percorre upgrade até latest sem perder a fila antiga de `whatsapp_messages`.
- [ ] `whatsapp_messages_legacy_queue` é preservada quando a tabela antiga existe e nunca é sobrescrita silenciosamente.
- [ ] `PRAGMA integrity_check` passa após fresh install e upgrade.
- [ ] Backup automático executa, gera checksum e respeita retenção.
- [ ] Cópia criptografada sai da VPS para outro provedor/região.
- [ ] Restauração foi executada em ambiente separado e passou `PRAGMA integrity_check` e `/api/ready`.
- [ ] Rollback automático do script de restauração foi testado.
- [ ] Alertas cobrem falha de backup e espaço em disco.
- [ ] Não existe rota de restauração pelo navegador.

## 9. Compatibilidade, acessibilidade e observabilidade — P0

- [ ] Chrome, Firefox, Safari e navegadores móveis principais testados.
- [ ] Fluxos críticos funcionam por teclado; foco, labels, contraste e leitor de tela foram verificados.
- [ ] Monitor externo cobre uptime, `/api/ready`, TLS e disco.
- [ ] Logs têm request ID e não registram senha, cookie, segredo ou payload sensível.
- [ ] Responsáveis e canais de alerta/incidente foram testados.
- [ ] Teste de carga representativo foi executado dentro do limite de uma instância SQLite.

## 10. Landing page e aquisição — P0

- [ ] A raiz do domínio principal entrega a landing; tenants e hostname DEV não são confundidos com a página comercial.
- [ ] Hero, navegação, CTA, plano, FAQ e rodapé foram testados em 390, 768, 1280, 1440 e 1920 px.
- [ ] Todos os CTAs abrem o checkout direto, não forçam pagamento por WhatsApp e geram `landing_cta_click` quando `dataLayer` existe.
- [ ] O preço, período e ausência de recorrência automática correspondem à oferta vigente.
- [ ] Nenhum depoimento, logo de cliente, avaliação ou métrica foi publicado sem evidência e autorização.
- [ ] `curl` da raiz retorna `index,follow` e canônica; login, painéis e DEV continuam `noindex,nofollow`.
- [ ] Lighthouse/WebPageTest, navegação por teclado e leitura de tela foram registrados.
- [ ] Fotos sintéticas não são apresentadas como clientes reais; imagens próprias têm licença e model release.
- [ ] Compra direta cria tenant `ONBOARDING`, usa preço do servidor e só ativa após confirmação real ou link DEV de 100% válido.
- [ ] Galeria de demonstração não é publicada como depoimento real; relatos reais possuem consentimento e evidência.

## 11. Indicações e descontos — P0

- [ ] Link padrão aplica 15% somente na primeira compra e recompensa 10% apenas após pagamento confirmado.
- [ ] Autoindicação é rejeitada e o frontend não controla valor/desconto final.
- [ ] Créditos de renovação são limitados a 30%, reservados por pedido e aplicados de forma idempotente.
- [ ] Link de 100% exige `GERAR 100%`, aceita um uso e expira em até sete dias.
- [ ] DEV consegue criar, copiar, revogar e auditar links; ADMIN visualiza somente dados do próprio tenant.
- [ ] Falha de checkout cancela o resgate e devolve a capacidade do link.

## Comandos finais

```bash
cd /opt/lashdesigner/app
sudo -u lashdesigner npm ci
sudo -u lashdesigner npm audit --omit=dev
sudo -u lashdesigner npm run check
sudo -u lashdesigner bash -lc 'set -a; source ./.env; set +a; npm run preflight'
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart lashdesigner
curl --fail http://127.0.0.1:3000/api/ready
curl --fail https://SEU_DOMINIO/api/ready
```

## Aprovação

- Release/commit: ____________________
- SHA-256: __________________________
- Homologado por: ___________________
- Data/hora e fuso: _________________
- Rollback testado: [ ] sim
- Todos os P0: [ ] sim

- [ ] `VITE_SUBSCRIPTION_PRICE_CENTS` é igual a `SUBSCRIPTION_PRICE_CENTS`, evitando divergência entre oferta e checkout.
