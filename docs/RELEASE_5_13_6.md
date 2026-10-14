# Lash Designer 5.13.6 — Troca de logo com análise automática da Luma

Base completa: 5.13.5. Banco permanece na migração 48; nenhuma migração adicional necessária.

## Fluxo em Configurações → Seu espaço

Ao escolher uma nova logo, o navegador valida e otimiza PNG/JPG/WebP antes de chamar a Luma. A análise usa o modelo configurado para o setup, que por padrão acompanha o modelo principal. A Luma sugere apresentação símbolo+nome ou marca completa, um dos tamanhos seguros S/M/L e três paletas. A primeira paleta entra nos campos; a cliente pode revisar a prévia e alterar manualmente antes de clicar em Salvar Alterações.

A apresentação se propaga pelo componente compartilhado ao painel, login e agendamento depois de salvar. Cor principal, secundária e fundo são persistidos no mesmo update validado da marca; o tema conserva suas proteções existentes de contraste e superfícies suaves. A prévia não altera a marca persistida antes do salvamento.

Upload/análise bloqueiam os campos da marca e o botão de salvar, evitando gravar um resultado parcial. O formulário informa que a análise usa uma mensagem da Luma. Uma falha ou limite esgotado preserva a imagem enviada e permite ajustar/salvar manualmente. Remover a logo não faz chamada à IA. O limite de arquivos continua 12 MB, com redução pelo processador compartilhado e teto de 450 kB no campo do servidor. Timeout do cliente 30 s, superior ao timeout de 25 s da análise; aplicado também à chamada visual do setup inicial.

## Uso compartilhado e proteção contra abuso

Novo endpoint ADMIN `/api/admin/assistant/brand-suggestions`, protegido pelo mesmo limitador de requisições do chat. Não há nova franquia independente nem reaproveitamento do endpoint de setup após sua conclusão.

Chat e análise visual chamam a mesma função `reserveUsage`, extraída do fluxo existente, com transação SQLite `immediate`. A reserva acontece antes do provedor e inclui a previsão de custo. Os mesmos limites configurados de mensagens diárias/mensais e orçamento de custo são aplicados no fuso do estúdio. As análises aparecem no mesmo contador de `/assistant/usage`.

Mensagens incluídas são usadas primeiro; esgotada a franquia, um crédito extra já existente pode ser usado, como no chat. Não há compra automática. Uma análise concluída consome uma mensagem. Falha do provedor ou resposta inválida marca a reserva ERROR, libera o uso incluído e estorna eventual crédito extra uma única vez. Uma entrada inválida ou IA desabilitada não chama o provedor nem reserva crédito. A cota e os registros permanecem isolados por tenant, e usuários STAFF/CLIENT não podem analisar a marca por esta rota.

Setup inicial continua com sua proteção anterior de três tentativas. A troca posterior nas configurações não fica presa ao estado COMPLETED do onboarding. O modelo não recebe permissão para emitir CSS, HTML ou tamanhos livres: resposta é validada por enums e cores hexadecimais antes de concluir o uso.

## Validação

- `npm run check`: TypeScript, lint, 280 testes automatizados, auditorias estruturais e build aprovados.
- Quatro novos testes de API com Express/SQLite e provedor simulado: uso compartilhado chat/marca, isolamento, autenticação/roles, limites diário/mensal, créditos extras, falha e saída inválida com estorno, duas solicitações concorrentes disputando a última mensagem incluída e IA desabilitada.
- `npm run test:settings-brand-ui`: dez verificações em 1440, 768, 390 e 320 px; upload dispara uma análise, resposta retida comprova bloqueio de salvamento antecipado, sugestões e paleta são salvas, marca atualiza no painel, limite esgotado mantém o caminho manual e arquivo inválido não faz requisição de IA.
- `npm run test:settings-tabs-ui`: 13 verificações de abas, rascunhos, teclado e responsividade preservadas.
- `npm run test:luma-integrated-ui`: 18 verificações de chat, ações, créditos e recuperação preservadas, com SQLite/rotas reais e provedores simulados.
- 64 verificações HTTP com servidor real/SQLite temporário, incluindo persistência da paleta, validação de cores, isolamento e montagem da nova rota com IA desabilitada.

A análise com Haiku/modelo principal real não foi executada nesta entrega: os testes usam respostas locais controladas. Nenhuma credencial, mensagem WhatsApp ou cobrança real foi utilizada. Não houve deploy.

## Homologação com Fable 5.1 e Opus 5

Seguir `CLAUDE.md` em ambiente de testes com o identificador real do modelo principal. Trocar logos símbolo/completa/vertical/transparentes, revisar paleta e tamanhos, salvar e recarregar painel/login/agendamento. Confirmar uma unidade no contador da Luma, cota compartilhada com chat, limite sem créditos, uso de crédito disponível, estorno em falha, concorrência e isolamento. Repetir após publicação com contas de teste, registrar evidências e manter backup/rollback.

ZIP completo com assets da base; sem dependências, build, bancos, credenciais ou capturas internas.
