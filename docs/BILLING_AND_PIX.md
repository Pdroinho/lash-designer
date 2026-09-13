# Billing, cartão e Pix

## Modelo adotado no release 2.0

O usuário escolhe o ciclo dentro do Lash Designer e segue para o checkout seguro hospedado pela InfinitePay. O retorno e o webhook ativam o período comprado automaticamente. O fluxo não usa WhatsApp e a plataforma não recebe nem armazena o número completo do cartão.

Ciclos disponíveis:

| Ciclo | Meses | Variável |
|---|---:|---|
| Mensal | 1 | `PLAN_MONTHLY_CENTS` |
| Trimestral | 3 | `PLAN_QUARTERLY_CENTS` |
| Semestral | 6 | `PLAN_SEMIANNUAL_CENTS` |
| Anual | 12 | `PLAN_ANNUAL_CENTS` |

A interface mostra o equivalente mensal e a economia em relação ao plano mensal. O preço anual continua sincronizado com o preço comercial da landing por compatibilidade:

```env
SUBSCRIPTION_PRICE_CENTS=14700
VITE_SUBSCRIPTION_PRICE_CENTS=14700
PLAN_ANNUAL_CENTS=14700
```

O preflight bloqueia divergências.

## Pix recorrente

O release usa **períodos pré-pagos**: Pix ou cartão quita o ciclo escolhido e o webhook acrescenta 1, 3, 6 ou 12 meses. Não é anunciado como débito automático via Pix.

Pix Automático só deve ser habilitado quando a InfinitePay disponibilizar e documentar uma API pública adequada para autorização, cobrança futura, cancelamento, retentativa e conciliação. Até lá, renovação exige novo checkout e pode receber lembretes no produto.

## Idempotência e segurança

- pedido interno criado antes do checkout;
- `order_nsu` único;
- valor, pedido e pagamento confirmados servidor-a-servidor;
- atualização de pedido protegida contra dupla ativação;
- período restante é preservado na renovação;
- checkout precisa ser HTTPS;
- cartão permanece no ambiente do provedor.

## Estratégia comercial recomendada

No lançamento, usar um único produto funcional, **Lash Designer Pro**, com quatro ciclos. Isso reduz confusão, suporte e matriz de permissões. A Luma deve começar como piloto controlado. Um plano “Pro + Luma” só deve ser lançado depois de medir ativação, frequência de uso, retenção e custo real por conta.

A diferença inicial deve ser prazo e desconto, não recursos arbitrariamente bloqueados. Tiering por funcionalidades pode ser adicionado depois que dados reais mostrarem grupos de clientes com disposição de pagamento distinta.
