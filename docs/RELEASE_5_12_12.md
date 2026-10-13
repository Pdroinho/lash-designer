# 5.12.12 — Indicações e créditos nos planos por equipe

Base: 5.12.11. Migração aditiva 45. As faixas continuam 1–3 R$74,90, 4–6 R$99,90 e 7–15 R$149,00 por mês, em pagamento avulso.

## Comportamento entregue

- Indicação padrão: 15% no primeiro pagamento do estúdio indicado e crédito de 10% para a renovação de quem indicou. Links DEV existentes usam seus percentuais configurados, respeitando mínimo do gateway.
- Crédito é gerado somente após verificar pedido, vínculo ao link de pagamento e valor líquido exato na API autenticada da Appmax. Notificação recebida, isoladamente, não concede acesso ou recompensa.
- Teto de créditos por compra: 30%. Créditos inteiros mais antigos que cabem no teto são reservados; os demais permanecem disponíveis para compras futuras. Não há cumulatividade do desconto inicial com créditos na mesma compra. Arredondamento preserva a regra existente: arredondar desconto para centavos e subtrair do bruto.
- Cadastro com indicação envia token e impressão da simulação. O servidor calcula preço e desconto. Se o benefício mudar entre simulação e reserva, a contratação exige revisar o valor; nunca aceita preço informado pelo navegador.
- Token inválido/esgotado/expirado bloqueia o desconto. A pessoa pode escolher explicitamente continuar sem indicação; nesse caso, vê o valor normal antes de contratar.
- Autoindicação é bloqueada por estúdio e por e-mail/WhatsApp da administração beneficiária. É uma proteção objetiva de identidade, não promessa de detectar toda fraude com identidades diferentes.
- Reserva de uso do link, vínculo do estúdio indicado, registro de resgate, reserva de créditos e intenção são atômicos. Uma mesma compra pendente reutiliza sua URL e preço; replay de confirmação não estende assinatura nem gera crédito novamente.
- Falha definitiva 4xx do provedor (exceto timeout HTTP 408) libera reservas e permite nova tentativa preservando atribuição. Resposta incerta, timeout, rede ou 5xx mantém a intenção em conferência, sem criar outra cobrança automaticamente. Atendimento deve consultar a Appmax antes de liberar/reconciliar uma criação incerta.
- Uma compra antiga InfinitePay pendente impede abrir outra Appmax. Com Appmax habilitada, o endpoint de novo checkout legado fica bloqueado; histórico e módulos de créditos Luma continuam separados.
- Estorno/chargeback confirmado revoga recompensa não utilizada. Se o benefício já foi usado, registra compensação de percentual em créditos futuros, sem cobrança automática. O painel mostra desconto líquido disponível e compensação aplicável. Reversão enquanto uma renovação já estava pendente honra o preço emitido e registra compensação após seu pagamento.
- Estornar a compra que usou créditos devolve créditos cuja origem segue válida e desfaz a recuperação de compensações realizada naquela compra. Fontes revogadas não se tornam disponíveis por esse estorno.
- Painel de indicações permite criar/copiar links, distingue convite para assinar da URL de agendamento, recupera falhas de carregamento e mantém o link criado mesmo se a cópia automática falhar. Link esgotado/expirado deixa de ser reutilizado na criação.
- Landing e área de assinatura exibem valores líquidos reais da simulação. As faixas normais permanecem claras. O launcher flutuante não cobre o botão de copiar link no celular.

## Limites que exigem operação consciente

A Appmax exige pagamento mínimo de R$5,00 nesse contrato. Links de cortesia 100% e descontos que ficam abaixo disso não geram pagamento por esse fluxo; exigem revisão explícita, sem cobrança fictícia de R$5 nem ativação gratuita silenciosa. O caminho legado de cortesia permanece legado; não considerar essa função migrada ao checkout de equipe.

Criações externas incertas precisam de conferência no provedor; não há ferramenta de cancelamento externo automática no pacote. Reversões encadeadas depois que uma compensação já foi consumida por outra compra podem exigir conciliação do histórico pelo atendimento. Não reescrever preços de links emitidos nem cobrar diferença silenciosamente.

Contratos ativos ainda não mudam de faixa no meio do período pago. Este release integra indicação/renovação, não implementa recorrência automática, troca proporcional de plano ou infraestrutura para 1.000 estúdios.

## Dados e atualização

Migração 45 adiciona preço bruto, percentual e resgate à intenção Appmax, vínculos de indicação e registros de compensação. Registros antigos mantêm montante original; créditos e resgates antigos não são apagados. Não altera schema de suporte, profissionais ou agenda.

Executar backup consistente antes da atualização. Não fazer rollback apenas do binário depois de gerar pagamentos descontados: a versão anterior não interpreta o novo ledger. Pausar novas contratações, reconciliar pedidos externos e restaurar banco/código coerentes, conservando um registro dos pagamentos posteriores ao backup.

## Homologação

`npm run check` inclui testes do serviço com banco realmente migrado, preço líquido, concorrência pelo último uso, replays, identidade, expiração, mínimo, liberação de reservas, estado externo incerto, compensação e reversões. Um teste HTTP usa rotas reais de cadastro/assinatura e o runtime de webhook; autenticação é fixture e provedor é simulado.

`npm run test:referral-team-ui` cobre checkout com indicação nas três faixas em desktop/celular, payload sem preço arbitrário, cupom inválido/removido, créditos na renovação e falha de clipboard. APIs e gateway são fixtures; não realiza pagamentos externos.

Resultados finais e instruções para homologação externa estão em `HOMOLOGACAO_INDICACOES_5_12_12.md`.
