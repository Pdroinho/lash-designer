# Lash Designer 5.6.0 — Legal Compliance & Promotional Campaigns

## Escopo

Release focada no que faltava para comercialização: Termos de Uso, Política de Privacidade, prova de aceite, controle promocional da própria plataforma e campanhas WhatsApp consent-aware para clientes dos estúdios.

A direção visual da landing permanece a 5.4.1; esta release não reabre o redesign da LP.

## Legal e privacidade

- páginas internas `/termos` e `/privacidade`;
- conteúdo canônico no servidor;
- identidade jurídica obrigatória em produção;
- aceite necessário no checkout profissional;
- promoções da plataforma em checkbox separado e desmarcado;
- Termos/Privacidade versionados;
- SHA-256 do bundle exato;
- snapshot integral append-only por aceite;
- fingerprints HMAC de IP/user-agent em vez dos valores brutos;
- gate de reaceite para ADMIN quando o documento vigente muda;
- acesso autenticado à versão histórica exata aceita;
- Termos cobrem evolução do serviço, manutenção, terceiros, pagamentos, Luma, propriedade intelectual, uso permitido, suspensão e limitações apenas onde a lei permitir;
- Privacidade cobre papéis LGPD, dados, finalidades, bases, compartilhamento, transferências internacionais, retenção, segurança, IA, direitos e contatos.

## Campanhas WhatsApp

- nova aba Campanhas no WhatsApp Center;
- feature flag de produção começa desativada;
- audiência apenas com consentimento promocional ativo;
- limite máximo por campanha;
- fila persistida por destinatário;
- rechecagem de consentimento imediatamente antes do envio;
- segunda guarda no `sendWhatsappTextForTenant(... purpose: 'MARKETING')`;
- opt-out explícito anexado à mensagem quando necessário;
- `SAIR`, `PARE`, `PARAR`, `STOP` retiram autorização;
- retries limitados e backoff;
- claims expiram apenas em campanhas ainda ativas;
- cancelamento interrompe pendentes sem fingir recolher mensagem já em envio;
- broadcast legado permanece bloqueado.

## Operação

Produção passa a exigir:

- `LEGAL_PROVIDER_NAME`
- `LEGAL_PROVIDER_TAX_ID`
- `LEGAL_PROVIDER_ADDRESS`
- `LEGAL_CONTACT_EMAIL`
- `PRIVACY_CONTACT_EMAIL`

Campanhas:

- `WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED=false` por padrão;
- `WHATSAPP_CAMPAIGN_MAX_RECIPIENTS=50` por padrão;
- `WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS=15` por padrão.

## Validação desta sessão

- Legal/compliance 5.6: 38/38;
- Marketing Consent: 16/16;
- WhatsApp Center: 26/26;
- Customer Experience: 25/25;
- Security 5.x: 43/43;
- Landing 5.4.1 baseline: 19/19;
- migrations: 14/14;
- security primitives: 11/11;
- WhatsApp executable tests, agora incluindo campanhas: 35/35;
- total dos três grupos executáveis independentes: 60/60;
- `npm audit --omit=dev --offline`: 0 vulnerabilidades reportadas.

`npm run typecheck` foi tentado e parou em `TS2688: Cannot find type definition file for 'vite/client'`, porque a árvore `node_modules` não está instalada neste ambiente. Build/check integral continuam sendo gates do ambiente de deploy.

## Revisão jurídica

Os documentos são uma implementação técnica e textual coerente com o produto atual, não um parecer jurídico. Antes da venda pública, preencher os dados jurídicos reais e submeter Termos/Privacidade a advogado brasileiro que conheça o modelo operacional e tributário da empresa.
