# Homologação das indicações — 5.12.12

## Validação externa no Claude Code

Fable 5.1 e Opus 5 devem conferir os resultados e executar o fluxo em ambiente local de testes e depois no ambiente implantado autorizado. A aprovação depende de evidência reproduzível; o nome do modelo não garante integridade.

1. Comparar ZIP/código com eventuais alterações realizadas diretamente na VPS. Conferir Node 22, configurações Appmax, credenciais merchant, callbacks e seleção explícita do ambiente. Nunca registrar segredos ou dados completos de pagamento nas evidências.
2. Fazer backup consistente; subir 5.12.12; conferir 45 migrações e `foreign_key_check`. Registrar versão, comandos e saídas. Não usar contas ou agendamentos reais como fixtures.
3. Criar estúdio indicador com assinatura válida. Gerar link e conferir percentuais. Confirmar que o convite é para assinar a plataforma, não para agendar um procedimento.
4. Abrir link em navegador/dispositivo diferente. Conferir as três faixas, desconto inicial e total líquido. Efetuar pagamento no valor previsto no ambiente escolhido e confirmar que o evento sozinho não libera acesso.
5. Após confirmação autenticada, verificar acesso do indicado, resgate PAID e um único crédito de 10% do indicador. Reenviar evento para provar idempotência. Não usar compra fictícia de R$5 para representar a mensalidade padrão.
6. Na renovação do indicador, conferir crédito reservado, valor líquido emitido e consumo apenas depois de pagar. Testar acúmulo acima de 30%, excedente preservado e assinatura ativa protegida.
7. Testar estorno autorizado no ambiente apropriado: crédito não usado revogado; benefício utilizado compensado em créditos futuros; acesso do estúdio ligado ao pedido cancelado quando aplicável. Conferir que outro estúdio e pedido mais recente permanecem protegidos.
8. Testar cupom inválido/expirado/esgotado, duas tentativas pelo último uso, mudança do desconto entre simulação e contratação, autoindicação e falha de provedor. Resultado incerto não deve abrir segundo link automaticamente; resolver pelo atendimento após consulta real ao provedor.
9. Testar retorno ao painel, recarregamento da compra pendente, ausência de sobreposição no celular, clipboard indisponível e distinção entre link de convite e agendamento.
10. Repetir regressões de agendamento/equipe, WhatsApp, portal, assinatura e suporte com dados isolados. Registrar quais chamadas foram reais e quais foram simuladas. Declarar falhas e pendências, sem “100%” baseado apenas em prints.

O pacote não contém acesso à VPS nem credenciais do provedor. Nenhum deploy, pagamento, mensagem WhatsApp externa ou teste de carga foi realizado nesta execução local.

## Resultados locais em 13/10/2026

- `npm run check`: aprovado, incluindo TypeScript, ESLint, auditorias e build. 241 testes: 181 principais + 14 migrações + 11 primitivas + 35 WhatsApp.
- 12 cenários novos no serviço de indicações, incluindo um fluxo HTTP real com provedor/auth simulados; mais a proteção de cobrança Appmax contra compra legada pendente.
- 69 verificações em Chromium: 14 indicações, 15 suporte/portal, 11 assinatura, 11 landing, 4 recuperação e 14 revisão de UX. Fixtures e chamadas reais são identificadas nos scripts.
- 53 verificações HTTP com servidor compilado e SQLite descartável aprovadas.
- 4 verificações de atualização 5.12.11 → 5.12.12, backup e restauração aprovadas; esquema 44 → 45.
- Conferência visual do desconto inicial, renovação e painel de indicações no celular concluída; capturas usadas apenas na inspeção interna.

Não há resultado de cobrança Appmax externa nem implantação em produção nesta execução.
