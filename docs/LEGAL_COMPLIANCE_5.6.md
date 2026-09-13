# Legal, privacidade e campanhas — Lash Designer 5.6

## Objetivo

A 5.6 adiciona a infraestrutura técnica necessária para apresentar, versionar e provar o aceite dos documentos legais da plataforma e para liberar campanhas promocionais por WhatsApp somente para audiência com autorização registrada.

Este documento descreve a implementação técnica. Os textos jurídicos incluídos são uma base de produção alinhada ao funcionamento atual do produto e devem receber revisão de advogado brasileiro antes do lançamento público. Nenhuma cláusula cria imunidade contra responsabilidade obrigatória por lei.

## Identidade jurídica obrigatória em produção

Preencha no ambiente real:

- `LEGAL_PROVIDER_NAME`
- `LEGAL_PROVIDER_TAX_ID`
- `LEGAL_PROVIDER_ADDRESS`
- `LEGAL_CONTACT_EMAIL`
- `PRIVACY_CONTACT_EMAIL`

O servidor e o preflight rejeitam produção sem esses dados. Não use placeholders no ambiente comercial.

## Termos de Uso e Política de Privacidade

As páginas públicas internas são:

- `/termos`
- `/privacidade`

O conteúdo canônico vive em `server/legal.ts`. O frontend não mantém uma cópia divergente do texto.

Cada conjunto vigente possui:

- versão explícita de Termos;
- versão explícita de Privacidade;
- data de atualização;
- SHA-256 do conjunto exato, incluindo identidade do fornecedor e conteúdo;
- snapshot JSON preservado no momento do aceite.

Ao alterar qualquer texto legal ou identidade do fornecedor, atualize também as constantes `TERMS_VERSION` e/ou `PRIVACY_VERSION`. O hash muda independentemente da versão e força nova validação quando o conteúdo não for exatamente o mesmo.

## Evidência de aceite

`user_legal_acceptances` é append-only e registra:

- usuário e tenant;
- versão do conjunto;
- hash SHA-256 do documento exato;
- versões individuais;
- origem do aceite;
- fingerprint HMAC do IP e do user-agent, sem armazenar os valores brutos;
- snapshot integral dos documentos e identidade jurídica;
- instante do aceite.

O checkout rejeita versões ou hashes desatualizados. Contas ADMIN existentes ficam em gate fail-closed até aceitar o conjunto vigente.

Em Segurança, a profissional pode abrir a versão exata que aceitou em `/termos?accepted=<hash>` e `/privacidade?accepted=<hash>` e usar a função de impressão/salvamento em PDF do navegador.

## Marketing do próprio Lash Designer

A autorização de promoções do Lash Designer é separada do contrato e começa `false`.

O sistema registra em `platform_marketing_consent_events` concessão, retirada ou recusa, incluindo versão, texto, origem e data. A profissional pode ativar ou desativar a autorização em Segurança sem afetar o serviço contratado.

Comunicações essenciais sobre autenticação, segurança, contratação, cobrança, suporte, alterações materiais e manutenção são tratadas separadamente de publicidade.

## Marketing do estúdio para clientes

A infraestrutura anterior de consentimento continua sendo a fonte de verdade:

- `clients.marketing_whatsapp_opt_in`;
- versão e origem do consentimento;
- `client_marketing_consent_events`;
- opt-in no booking começa desmarcado;
- cliente pode alterar no portal;
- `SAIR`, `PARE`, `PARAR` ou `STOP` recebidos via webhook retiram a autorização.

Um novo booking desmarcado não revoga silenciosamente um consentimento anterior. A retirada é uma ação própria e inequívoca.

## Campanhas promocionais

A 5.6 substitui qualquer ideia de broadcast direto por uma fila auditável.

A criação da campanha:

1. exige `WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED=true`;
2. exige o modelo promocional habilitado;
3. impede campanhas paralelas no mesmo tenant;
4. captura somente clientes com `marketing_whatsapp_opt_in = 1` e telefone válido;
5. rejeita audiência acima do limite configurado;
6. acrescenta instrução explícita de opt-out quando o texto não possui uma instrução equivalente;
7. cria destinatários individuais em fila.

Antes de cada envio o worker consulta novamente o consentimento e o telefone atual. Uma cliente que retirou a autorização depois da criação da campanha é marcada como `SKIPPED` e não recebe a mensagem.

O envio usa `purpose: 'MARKETING'`, que faz uma segunda checagem de consentimento imediatamente antes da chamada ao provedor.

Há:

- processamento unitário;
- intervalo configurável;
- até 3 tentativas;
- backoff;
- claim com recuperação somente de claims realmente expirados;
- progresso e histórico;
- cancelamento da fila pendente;
- registro de mensagem do provedor quando disponível.

Uma mensagem já entregue ao provedor não pode ser "desenviada". Por isso cancelamento não falsifica o estado de um envio que já estava em voo.

## Configuração segura de campanhas

Valores padrão:

```env
WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED=false
WHATSAPP_CAMPAIGN_MAX_RECIPIENTS=50
WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS=15
```

A flag deve permanecer `false` até validar o número/instância de produção, o fluxo de opt-out e as regras do provedor usado para WhatsApp.

## Mudanças jurídicas futuras

Para cada mudança material:

1. alterar o texto canônico em `server/legal.ts`;
2. atualizar a versão correspondente;
3. executar `npm run test:legal56`;
4. revisar o diff jurídico;
5. publicar;
6. contas existentes receberão novo gate porque a versão/hash vigente será diferente.

Não reutilize texto de versão antiga alterando somente CSS ou frontend. O aceite é vinculado ao conteúdo real retornado pelo servidor.
