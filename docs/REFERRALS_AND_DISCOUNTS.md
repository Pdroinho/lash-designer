# Indicações e links de desconto — estratégia 2.2

## Objetivo

Transformar clientes satisfeitas em aquisição mensurável sem criar passivo financeiro, saldo sacável ou cupons fáceis de enumerar.

## Regra padrão

- a indicada recebe **15% na primeira compra**;
- quem indicou recebe **10% de crédito para uma renovação futura**, somente depois da confirmação do pagamento da indicada;
- o desconto aplicado a uma renovação é limitado a **30%**; créditos excedentes ficam disponíveis para ciclos seguintes;
- crédito não é dinheiro, não é transferível e não pode ser sacado;
- autoindicação é bloqueada pelo e-mail administrativo do tenant;
- preço, elegibilidade e desconto são calculados no servidor. O navegador envia apenas ciclo e token.

Esse desenho mantém receita positiva na aquisição padrão e limita o custo máximo de retenção por renovação. A política deve ser revisada quando margem, CAC, chargeback e custo de suporte reais estiverem disponíveis.

## Links administrativos

O DEV pode definir desconto da primeira compra de 0% a 100%, recompensa de 0% a 30%, validade e máximo de usos.

Proteções adicionais para 100%:

- confirmação textual exata `GERAR 100%`;
- máximo de um uso, mesmo que o frontend envie número maior;
- validade máxima de sete dias;
- token aleatório de 192 bits;
- criação restrita ao host DEV, papel DEV e rate limit;
- ativação gratuita registrada como pedido `PAID` com `capture_method=ADMIN_DISCOUNT`, sem simular webhook externo.

## Estados e idempotência

- links: ativo/revogado, validade, contador e máximo de usos;
- resgates: `PENDING`, `PAID`, `CANCELLED` ou `REVOKED`;
- créditos: `AVAILABLE`, `RESERVED`, `APPLIED` ou `REVOKED`;
- recompensa nasce na mesma transação que confirma o pagamento;
- webhook repetido não duplica assinatura nem crédito;
- crédito reservado volta a `AVAILABLE` após 24 horas se o checkout não for concluído;
- falha ao criar checkout cancela o resgate e devolve o uso ao link.

## Métricas para decisão

O superadmin acompanha links ativos, cadastros iniciados, pagamentos confirmados, desconto concedido e créditos disponíveis. Para evoluir a regra, monitore também:

- conversão por origem;
- receita líquida por indicada;
- payback de CAC;
- taxa de renovação das indicadas;
- chargeback/estorno;
- desconto médio efetivamente aplicado;
- margem de contribuição por ciclo.

## Política comercial recomendada

Mantenha 15%/10%/30% até haver pelo menos dois ciclos completos de dados. Não aumente o desconto público apenas porque o uso está baixo: primeiro revise mensagem, distribuição e fricção do checkout. Links acima de 30% devem ser campanhas pontuais, com validade curta e limite explícito.
