# 5.13.1 — Luma em uma única conversa

A área Luma agora tem apenas o chat. Foram removidas as abas de rotina, financeiro, chamados, lembretes e preferências. As ferramentas de consulta e preparação de alterações continuam disponíveis para o modelo através da conversa, com revisão explícita da usuária para alterações.

Quatro exemplos de entrada apresentam agenda, financeiro, suporte e lembretes. O controle “O que posso pedir à Luma?” explica outras possibilidades sem poluir a conversa. Escolher um exemplo inicia uma mensagem no mesmo chat. O tour foi atualizado e o prompt instrui a Luma a consultar ferramentas e perguntar informações faltantes, sem encaminhar para abas que não existem mais.

As confirmações concluídas usam fundo neutro, texto e ícone de estado, evitando a mistura de cartões verdes com botões rosados. No ADMIN, apenas o acesso contextual do header aparece: o flutuante duplicado foi retirado. O componente opcional de flutuante usa ícone compacto e tooltip em hover/foco, mas não é exibido nesse painel. Fechar a conversa devolve o foco ao controle que a abriu.

A altura do chat no celular considera a navegação inferior e mantém o campo de mensagem acessível. Compras de créditos permanecem como um controle secundário. Na equipe, as ações de desativar e remover ficam separadas e explicadas; mudar de seção reinicia a rolagem do formulário, sem abas sobrepondo campos. Não há mudança de migração: o banco continua em 47. Os ajustes de telefone e remoção da equipe da 5.13.0 estão preservados.

Validação: npm run check (269 testes e auditorias, TypeScript, lint e build); 18 verificações integradas do chat e 22 da equipe, com rotas reais, SQLite e sessões, em 1440/768/390/320px. IA, Evolution e Appmax usam provedores simulados nesses testes; homologação externa e produção continuam necessárias. A interface não garante que um modelo nunca erre ou que tenha permissão para qualquer operação da plataforma.

Referências de interface: https://mui.com/material-ui/react-floating-action-button/ e https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html . O teste de contraste mede os textos do cartão concluído no tema do teste; não certifica todos os temas personalizados da aplicação.
