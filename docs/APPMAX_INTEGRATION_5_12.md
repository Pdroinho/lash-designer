# Appmax: contrato técnico e limite desta etapa

## Implementado

- `server/appmax.ts`: autenticação OAuth2 com credenciais **merchant** da instalação; URLs fixas de sandbox ou produção; token temporário somente em memória.
- Criação de link hospedado `POST /v1/payment-link`, valor inteiro em centavos, serviço digital, Pix/cartão, uma venda por link e HTTPS obrigatório na resposta.
- Confirmação por API autenticada: o pedido precisa pertencer ao link (`GET /v1/payment-link/{id}/orders`), estar aprovado ou integrado e apresentar `total_paid` idêntico ao preço registrado (`GET /v1/orders/{id}`). Um webhook isolado jamais é prova de pagamento.
- Migração 40: `appmax_checkout_intents` separa pedidos Appmax dos pedidos InfinitePay e registra faixa, valor, link e pedido; `appmax_webhook_inbox` reserva idempotência por evento e pedido. A migração é aditiva; as duas tabelas ainda não recebem dados em produção.
- Migração 41: marca a última consulta autenticada de cada pedido pago para reverificá-lo em rodízio. Estorno integral e chargeback confirmados pela API suspendem a assinatura somente se o pedido ainda for o dono do acesso; um webhook isolado não suspende a conta. Eventos de aprovação atrasados não reativam pedido revertido.
- `server/appmaxBillingService.ts`: cria uma intenção por estúdio, reaproveita um link pendente para a mesma faixa e só confirma `plan_code` e um mês de acesso após consultar a Appmax pelo link e pelo pedido. Confirmações repetidas não estendem o prazo; pedido alheio ao estúdio ou valor/status divergente não ativa assinatura. Assinaturas antigas ainda ativas são recusadas **antes** de criar um novo link, pois a regra de migração dos períodos pagos não foi definida.
- Rotas ADMIN para catálogo, link e consulta de status; rota de webhook que guarda somente tipo, identificadores e hash antes de responder. Um runtime verifica eventos em segundo plano e consulta periodicamente links pendentes para recuperar pagamentos mesmo se o webhook for perdido. A tela de assinatura oferece as três faixas apenas quando o checkout de homologação estiver habilitado.
- Com o flag ativo na homologação, o catálogo público oferece as três faixas, a landing e o cadastro usam `/api/public/onboarding/team-checkout` e as compras novas pelo checkout InfinitePay são bloqueadas. O cadastro persiste estúdio, ADMIN e aceites; somente a confirmação autenticada do pedido ativa a assinatura. Indicações não geram desconto neste fluxo, como informado antes da compra.
- `APPMAX_CHECKOUT_ENABLED=false` por padrão. Nesta etapa a ativação é aceita somente com credenciais merchant de **sandbox** em ambiente não produtivo. Em produção, iniciar o servidor com essa chave ativa falha explicitamente.
- `.env.example` separa credenciais merchant e ambiente. Sem elas o checkout público por equipe fica desabilitado. Valores definidos em `server/teamPlans.ts`.

## Pendente antes de habilitar vendas

1. Obter credenciais merchant de sandbox para a conta que recebe os pagamentos e testar um pagamento real. Credenciais de **app** não servem para os endpoints transacionais. Confirmar se o endpoint de link de pagamento, documentado em fase beta, está liberado para essa conta.
2. Definir como períodos já pagos nos quatro ciclos antigos serão preservados num upgrade/downgrade; enquanto isso, o serviço recusa novas compras de contas com assinatura ativa. Resolver link criado no gateway caso a gravação local falhe, evitando cobrança sem rastreabilidade. Quando o link falhar após criar o estúdio, a conta fica pendente e o ADMIN pode tentar de novo na área Assinatura.
3. Homologar estorno e chargeback reais e definir estorno **parcial** e recuperação de disputa: ambos exigem avaliação financeira específica e não reativam uma assinatura automaticamente. Validar o contrato exato do link hospedado na conta merchant. Não gravar informações de cartão ou dados pessoais desnecessários.
4. Resolver indicação e descontos com limites financeiros antes de expor as novas mensalidades em produção. A landing e o checkout de homologação já exibem os preços por equipe; revisar termos comerciais e política de migração. Manter contratos InfinitePay anteriores sem alteração silenciosa.
5. Homologar Pix, cartão, falhas, duplicidades, reembolso, reconciliação, atualização de banco antigo e rollback em sandbox/staging; verificar no navegador e depois da publicação autorizada.

## Fontes oficiais consultadas em 24/09/2026

- [Autenticação merchant](https://docs.appmax.com.br/guides/autenticacao)
- [Criar link hospedado](https://docs.appmax.com.br/api-reference/payment-links/criar-link-pagamento)
- [Consultar pedidos de um link](https://docs.appmax.com.br/api-reference/payment-links/consultar-link-pagamento)
- [Consultar pedido](https://docs.appmax.com.br/api-reference/orders/consultar-pedido)
- [Webhooks e ausência de assinatura HMAC](https://docs.appmax.com.br/guides/webhooks)
