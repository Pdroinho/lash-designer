# 5.13.2 — Revisão final de interface e recuperação de erros

Base: 5.13.1. Identidade, preços, permissões, histórico, integração Appmax e chat único da Luma preservados. Banco continua na migração 47; esta release não cria migração.

## O que mudou

- Serviços: falha de carregamento não aparece como catálogo vazio. Falha ao criar, editar ou excluir mantém o formulário e os dados, com mensagem e nova tentativa. Feedback de sucesso só após resposta positiva. Campos e fechamento ficam protegidos durante o envio. Valores usam formato brasileiro.
- Clientes: erro de carregamento tem recuperação; busca aceita telefone formatado; nomes e contatos no celular ficam mais legíveis. Avatares usam a identidade do estúdio, sem paletas aleatórias.
- Dashboard e agenda: falhas de atualização são explícitas, sem inventar um estado vazio ou números zerados. Financeiro tem nova tentativa e sinaliza dados anteriores quando uma atualização falha.
- Botões e tons profundos do tema claro são calculados para manter leitura com cores personalizadas muito claras. Estados inativos do switch têm trilha visível. A medição automatizada cobre a ação principal em seis cores, incluindo rosa claro, verde claro, amarelo e branco; não é uma certificação de todos os pares de cor possíveis.
- Data e horário: os controles já usados pela equipe foram compartilhados com setup, lançamento e extrato financeiro, novo agendamento, bloqueios da agenda e área da profissional. Calendário devolve o foco ao botão ao fechar. Controles de horário usam a mesma lista de intervalos da equipe.
- Financeiro: a tabela acessível do gráfico foi preservada dentro de um contêiner visualmente oculto; ela já não provoca rolagem horizontal em 320px. Leitura dos indicadores e legenda foi refinada, incluindo valores monetários longos em 320px. A atualização de tamanho não usa mais um timer que sobrevivia à desmontagem do gráfico e podia gerar erro ao trocar de tela.
- Configurações: identidade e segurança precedem o domínio personalizado opcional. Cabeçalhos móveis identificam Início, Agenda e Clientes. A Luma continua com apenas um acesso contextual no header, sem flutuante duplicado.
- Landing: descrição da Luma alinhada ao chat operacional atual, mantendo planos, estrutura e identidade.
- Capa de serviço: ações disponíveis também por foco e em dispositivos sem hover. Mensagens e espaçamentos preservam os componentes existentes.

## Matriz de revisão

O teste `test:product-refinement-ui` renderiza o build real com respostas API controladas. Contém telas populadas, vazias, erros e formulários preservados. Dashboard, Serviços, Clientes, Agenda, Financeiro, Configurações, Luma e Assinatura passam por 1440, 1024, 768, 390 e 320px. Login, quatro etapas visuais de agendamento e área da profissional passam por desktop e dois celulares. Setup manual, controles de horário, busca, recuperação e contraste têm verificações específicas.

O teste `test:product-form-controls-ui` verifica os controles e formulários de movimentação, novo atendimento e bloqueio em 1440, 390 e 320px.

Outras suítes cobrem equipe, suporte ADMIN/DEV/cliente, recuperação de conta, WhatsApp conectado/desconectado/erro, indicação, checkout, landing e ações integradas da Luma. Capturas são usadas para inspeção interna e não entram no ZIP.

## Validação

- `npm run check`: TypeScript, lint, testes, auditorias e build de produção.
- 271 testes automatizados, incluindo períodos da profissional em fuso explícito e transições de horário de verão.
- 167 verificações de navegador nas suítes descritas, além de 53 verificações HTTP locais.
- Upgrade da base e restauração de backup SQLite, mantendo 47 migrações.

As suítes de interface usam fixtures em algumas APIs; equipe, suporte e Luma possuem suítes adicionais com SQLite e rotas reais. Os serviços externos de IA, Appmax e Evolution são simulados. A revisão não comprova pagamento real, entrega externa de WhatsApp ou saúde da VPS de produção.

## Antes da abertura ao público

Seguir CLAUDE.md com Fable 5.1 e Opus 5: backup, configuração dos serviços externos, preflight, execução em ambiente de testes, compra/estorno real controlados, webhooks duplicados, envio e recebimento WhatsApp, chamados ADMIN/DEV e verificações após publicação. Registrar evidências e manter rollback. Não converter testes locais em promessa de 100% de integridade.

Node 22; npm ci; npm run check. Para navegador: build com VITE_DEV_HOST=dev.localhost e Playwright/Chromium disponíveis. O ZIP contém o projeto completo e assets; exclui dependências, dist, bancos, credenciais e capturas internas.
