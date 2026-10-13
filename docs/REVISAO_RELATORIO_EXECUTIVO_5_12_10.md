# Revisão do relatório executivo 5.12.10

Fonte: RELATORIO_HOMOLOGACAO_5_12_10_EXECUTIVO.pdf, 17 páginas. Revisão de 13/10/2026.

Os prints foram extraídos do PDF e inspecionados. O documento chama todos os módulos de “100% homologado”, porém suas próprias capturas mostram defeitos. Capturar uma tela não comprova ações, permissões ou integração ponta a ponta. Não foram fornecidos logs de carga, resultados brutos de pagamento, patch de produção ou acesso ao ambiente externo.

| Página / módulo | Constatação | Tratamento / limite |
| --- | --- | --- |
| 1–2 Dashboard | Captura permite avaliar composição; não comprova área de toque de todos os controles ou métricas consistentes com banco. | Não há defeito adicional inequívoco nesse print; manter testes de fluxo e conferir dados reais após implantação. |
| 3 Agenda | Print estático não mostra cancelamento/alteração nem persistência do filtro. | Testes locais existentes cobrem isolamento e disponibilidade. Repetir ações com contas de teste após implantação. |
| 4 Clientes | Telefone aparece nos cards; o texto do relatório promete mascaramento e debounce sem apresentar prova. | Verificar implementação e não anunciar como segurança uma ocultação visual. Dados pessoais permanecem restritos por papel/estúdio. |
| 5 Serviços | Equipe aparece na mesma área de catálogo. Isso é gestão de profissionais, não criação de usuários do sistema. | A função e seus limites precisam ser explicados ao operador; não há fundamento para excluir a gestão de equipe. |
| 6 Financeiro | Percentual é progresso da meta, não lucro. Crescimento contra mês sem entrada não tem base válida; meta zero também não. | 5.12.11 corrige ausência de base; saldo continua descrito como entradas menos saídas, sem promessa de lucro contábil. |
| 7 WhatsApp | Print mostra Desconectado e diagnóstico “A conexão existe”. Texto afirma instância global conectada. | 5.12.11 corrige leitura de status e só mostra diagnóstico de recebimento depois da conexão. Instância do estúdio e instância global da plataforma são contextos distintos. |
| 8 Luma | Número “38” aparece sem explicação visível no celular. | 5.12.11 mantém “consultas hoje” visível; limites de custo não são prova de disponibilidade/resposta real do provedor. |
| 9 Indicações | Não é fidelidade de clientes nem desconto numa sessão. Checkout atual não aplica automaticamente indicação ou crédito. | Painel 5.12.11 explicita limitação e histórico. Integração de descontos aos planos atuais ainda precisa de implementação financeira e testes de pagamento/estorno. |
| 10 Assinatura | Launcher Luma sobrepõe CTA persistente. Print não prova renovação automática; produto atual usa pagamento avulso. | 5.12.11 remove launcher dessa aba. Não habilita recorrência nem troca comercial de plano no período ativo. |
| 11 Configurações | “DNS verificado” junto de “Nenhum domínio conectado”. | 5.12.11 calcula estado real e diferencia erro de listagem de ausência de domínio. |
| 12 Suporte | Listagem vazia de conversa à direita é seleção ainda não feita. | Não significa que respostas/anexos falharam. Fluxos reais de suporte têm script próprio; conferir caso escolhido e erro de ticket. |
| 13 Agendamento | Print começa pelos serviços, mas descrição diz que começa pela profissional. | Fluxo atual: serviço, profissional e data/horário. Não é necessário alterar fluxo funcional para coincidir com uma legenda errada. |
| 14 Portal | Formulário visivelmente sem estilo. Print é acesso público, não portal autenticado. Texto promete remarcação/cancelamento que essa tela não demonstra. | 5.12.11 restaura CSS, formulário e feedback. Portal atual lista agendamentos; não considerar remarcação/cancelamento self-service entregues por esse print. |
| 15 Landing hero | Print permite conferir copy/composição; não prova contraste de todos os estados ou limpeza de toda animação. | Manter validação específica da landing; não substituir testes por alegação de 100%. |
| 16 Landing preços | Texto ainda diz Mensal/Trimestral/Anual; cards mostram faixas profissionais. | Valores atuais: 1–3 R$74,90, 4–6 R$99,90, 7–15 R$149,00 por mês, em pagamento avulso. |
| 16 Appmax | Documento afirma correção externa de `payments` para array plano. ZIP usa array aninhado e seus testes usam fetch simulado. | Não incorporar patch não fornecido nem repetir criação financeira como tentativa automática. A documentação oficial consultada em 13/10/2026 mostra array aninhado no exemplo; há divergência com a alegação do relatório. Obter requisição/resposta sanitizadas do 422 e patch exato antes de mudar contrato. |
| 17 Capacidade | Demanda alegada 80–100 GB para 1.000 conexões; proposta de 2 nós de 32 GB soma 64 GB, ainda sem margem de sistema. Não há medição de 120 req/s, p95/p99, RAM ou teste de restauração em carga. | Não tratar 1.000 estúdios, <80 ms ou “zero degradação” como validados. Dimensionar com carga representativa e orçamento de memória observado; separar plano de infraestrutura de implantação concluída. |

Referência primária Appmax consultada: https://docs.appmax.com.br/api-reference/payment-links/criar-link-pagamento . O exemplo publicado contém `payments: [["creditcard", "boleto", "pix"]]`. Foi mantido o contrato do código em vez de alterar a cobrança com base somente na narrativa do PDF. Homologação real continua necessária.

## Próxima homologação com evidência

Fable 5.1 e Opus 5 podem executar a revisão e os scripts no Claude Code, mas a aprovação deve vir dos resultados, não do nome do modelo. Registrar versão/commit, comandos, ambiente, dados de teste, saídas e evidências de ações. No ambiente externo: repetir acesso cliente, QR/recebimento de mensagens, pagamento na faixa correta, confirmação autenticada de pedido, estorno, isolamento entre estúdios e suporte. Teste de capacidade deve declarar cenários e métricas observadas. Não marcar funções pendentes como concluídas.
