# Informações necessárias para concluir o lançamento

O código está preparado para receber estes dados. Não coloque segredos neste documento nem em commits; preencha apenas no `.env` da VPS ou no gerenciador de segredos da CI.

## P0 — bloqueia o lançamento

### Domínio e DNS da plataforma

- domínio principal definitivo, por exemplo `app.suamarca.com.br`;
- hostname DEV, por exemplo `dev.app.suamarca.com.br`;
- hostname de destino para CNAME dos clientes, por exemplo `domains.app.suamarca.com.br`;
- IP público IPv4 da VPS e IPv6, quando houver;
- acesso ao provedor DNS com MFA.

Registros esperados:

- A/AAAA do domínio principal para a VPS;
- A/AAAA do hostname DEV para a VPS;
- A/AAAA do destino CNAME para a VPS;
- wildcard DNS `*.dominio-principal` para a VPS, caso queira subdomínios automáticos de tenants. O certificado wildcard não é necessário: o Caddy emite por hostname autorizado.

### VPS e infraestrutura

- VPS Ubuntu/Debian atualizada com Node.js 22, npm 10+, Caddy, SQLite CLI e systemd;
- usuário operacional `lashdesigner` sem login administrativo direto;
- acesso SSH por chave, firewall liberando somente SSH, HTTP e HTTPS;
- e-mail para ACME/Let's Encrypt;
- destino externo criptografado para backups;
- monitor externo de `/api/ready`, TLS e espaço em disco.

### Segredos

Gerar valores independentes e aleatórios; `APP_ENCRYPTION_KEY` deve ser base64url com pelo menos 32 bytes. Segredos operacionais não devem reutilizar material criptográfico:

- `APP_ENCRYPTION_KEY`;
- `DEV_BOOTSTRAP_SECRET`;
- `DOMAIN_AUTH_SECRET`;
- `EVOLUTION_WEBHOOK_SECRET`;
- `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` para bootstrap do primeiro MFA DEV, ou configuração global já persistida no banco.

### InfinitePay

- handle/tag oficial de produção;
- confirmação do preço anual em centavos;
- conta apta a criar links e consultar `payment_check`;
- teste real de pagamento de baixo valor/ambiente autorizado;
- política comercial de cancelamento, estorno e renovação.

### Identidade mínima

- logo final e ícones PWA;
- imagem final do login;
- imagem final do agendamento;
- nome comercial exato, razão social e CNPJ/CPF responsável;
- e-mail de suporte e e-mail de segurança;
- telefone/WhatsApp de suporte;
- `VITE_SALES_URL` é apenas fallback legado opcional; a compra principal acontece no checkout interno da landing;
- preço comercial em centavos para `VITE_SUBSCRIPTION_PRICE_CENTS`, idêntico a `SUBSCRIPTION_PRICE_CENTS`;
- URL de política de privacidade e termos;
- decisão sobre recuperação de senha: provedor de e-mail transacional ou procedimento manual de suporte com confirmação de identidade.

Consulte os formatos e prompts em `docs/ASSETS_NEEDED.md`.

## P1 — necessário antes de campanha pública

- pelo menos 3 depoimentos reais autorizados, com origem e consentimento documentados;
- métricas comerciais somente quando houver fonte, período e método de cálculo verificáveis;
- substituição progressiva das fotografias sintéticas por ensaio próprio com model release;

- política de privacidade e termos revisados para LGPD;
- processo de solicitação de acesso, correção e exclusão de dados;
- prazo de suporte e responsáveis por incidentes;
- texto de onboarding e FAQ;
- remetente/domínio de e-mail para recuperação automatizada e notificações, caso essa opção seja escolhida;
- decisão sobre Evolution API global ou por tenant;
- consentimento explícito, opt-out, retenção e trilha de auditoria antes de habilitar lembretes automáticos ou campanhas WhatsApp;
- dados fictícios aprovados para screenshots e demonstração;
- teste de acessibilidade em teclado, contraste e leitor de tela;
- teste de domínio personalizado em Cloudflare e em outro registrador/provedor DNS.

## P2 — melhora a experiência, sem bloquear operação inicial

- seis capas padrão de serviços;
- quatro ilustrações de estado vazio;
- avatar e marca padrão do tenant;
- capa Open Graph;
- screenshots reais para ajuda e Product Tour;
- página pública de status;
- `security.txt` publicado após definir contato e prazo de resposta.

## Valores que precisam de decisão comercial

- preço anual e impostos/taxas absorvidos;
- período de teste, se existir;
- política de suspensão por inadimplência;
- limite de domínios por espaço — atualmente 5;
- retenção de backups — padrão local de 14 dias;
- retenção de logs;
- prazo de exclusão após cancelamento;
- volume máximo esperado de espaços e agendamentos.

## Não enviar por chat ou commit

- senha da VPS;
- chave SSH privada;
- tokens de DNS;
- `APP_ENCRYPTION_KEY` e demais segredos;
- credenciais InfinitePay/Evolution;
- banco ou backup com dados reais.
