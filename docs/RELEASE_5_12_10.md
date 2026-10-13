# 5.12.10 — Correções após revisão de homologação

Base: 5.12.9. Esquema do banco permanece na migração 44. A landing, preços de equipe e central de suporte estão preservados.

## Correções

1. **Atendimento DEV:** Configurações passa a exigir a aba `settings`; o suporte deixa de montar a administração de usuários e segurança. Cabeçalho identifica Atendimento e o tour genérico não interfere nessa aba. Cobertura inclui a URL `/?view=support&ticket=...` usada no print.
2. **Assinatura ADMIN:** três planos mensais atuais em todos os estados do gateway. Falha de catálogo ou Appmax desabilitada não expõe os ciclos/preços antigos. Cobrança fica bloqueada; tentativa novamente recarrega catálogo. Contratos ativos e limite de profissionais continuam protegidos. CTA móvel preservado.
3. **Histórico de pagamento:** catálogo ADMIN retorna intenções Appmax do próprio estúdio; registros antigos continuam consultáveis sem alterar seus valores históricos ou usá-los como oferta atual.
4. **Ticket inválido:** erro claro com retorno à lista no celular, em vez de carregamento permanente.
5. **WhatsApp:** confirmações e lembretes resolvem `{{profissional}}`. Templates existentes sem a variável recebem a identificação em linha adicional, sem substituir o texto personalizado. Join sempre inclui o estúdio; agendamentos legados sem pessoa não inventam nomes.
6. **Portal da cliente:** mostra a profissional no desktop/celular e respeita o fuso retornado pelo servidor. O endpoint de criação aceita `professionalId` e usa a regra central de disponibilidade. Falhas de API são exibidas com tentativa novamente; não se apresentam como agenda vazia.
7. **Contato do WhatsApp:** agendamento sincroniza o contato do mesmo estúdio, sem duplicar a conversa, apagar mensagens, alterar não lidos, consentir marketing ou enviar texto automaticamente.
8. **Atomicidade:** reserva, sincronização do contato e persistência dos jobs compartilham a transação. Erros revertem seus registros; não deixam reserva parcial após resposta de falha.
9. **Visual móvel:** preferências de comunicação da cliente recebem layout próprio e controle acessível. A assinatura reserva espaço para o CTA persistente; na conta restrita, ele não deixa um vazio destinado a uma tabbar inexistente.
10. **QA por data:** o teste da agenda STAFF usa datas futuras relativas ao dia local, evitando que o cenário de requisição atrasada se torne o carregamento inicial quando a data real muda.

## Validação local

Verificações de código: `npm run check`, incluindo testes, auditorias, TypeScript, ESLint e build. Os testes adicionais cobrem template de profissional, isolamento, contato/consentimento e rollback de reserva e efeitos laterais. O teste do portal valida nome, fuso e seleção de profissional.

Navegador:

- `test:support-ui`: cliente compilado + rotas reais de suporte/portal, SQLite migrado e sessões opacas. Endpoints auxiliares de dashboard/documentos são fixtures; o tour da cliente é pulado nesse cenário. Cobre o bug do DEV, ticket inválido, agenda CLIENT e os fluxos de suporte existentes.
- `test:billing-ui`: fixtures de API, desktop/celular; Appmax ligada/desligada, erro de catálogo, resposta antiga e contrato ativo. Não inicia pagamentos externos.
- `test:recovery-ui`: agenda STAFF em três viewports e área restrita de cobrança.
- `check-multistaff-live.py`: servidor compilado, banco descartável e HTTP real; inclui contatos da inbox sem mensagens ou marketing inventados.

Não foi feito deploy ou teste de pagamento/WhatsApp externo nesta execução. Testes locais não comprovam desempenho para 1.000 estúdios ou integridade absoluta. Consulte `REVISAO_RELATORIO_HOMOLOGACAO_5_12_9.md` para o confronto das afirmações do PDF com as evidências.

## Instalação e conferência

Resultado em 12/10/2026: 227 testes automatizados aprovados, 53 verificações HTTP locais, 30 verificações de navegador (15 suporte/portal, 11 assinatura e 4 recuperação), além de 4 verificações de atualização/backup/restauração entre 5.12.9 e 5.12.10. Revisão visual concluída no celular e desktop. Os cenários com fixtures estão identificados acima; esses números não representam testes de produção.

Fazer backup consistente e comparar eventuais alterações realizadas diretamente na VPS antes de instalar. A versão 5.12.10 corrige o código do pacote 5.12.9; não incorpora alterações externas que não foram fornecidas. Não exige apagar dados ou recriar os estúdios.

Após implantação autorizada, repetir os casos corrigidos com contas de teste isoladas e registrar as saídas. Mudanças comerciais de contratos em período ativo, homologação real de Appmax/Evolution, capacidade/infraestrutura e separação física das VPS não são consideradas concluídas por este release.
