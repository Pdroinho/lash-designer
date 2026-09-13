# Release 5.10.0 — Mobile App Foundation · Parte 1

## Objetivo

A versão mobile deixa de ser apenas o desktop comprimido e passa a adotar uma fundação de navegação e densidade visual familiar a aplicativos móveis. Esta primeira parte cobre o shell da área profissional, Dashboard e Agenda, sem alterar a arquitetura desktop nem o backend.

## Fundação mobile

- nova barra inferior fixa com cinco destinos: Início, Agenda, Clientes, WhatsApp e Mais;
- ícones continuam usando a biblioteca Phosphor já adotada no projeto;
- `Mais` abre o drawer completo, preservando acesso a Serviços, Financeiro, Luma, Indicações, Assinatura, Configurações e Sair;
- topbar mobile passa a mostrar a marca do tenant e o título da tela;
- hamburger do topo deixa de ser a navegação primária quando a tabbar está presente;
- safe areas de iOS/Android são respeitadas;
- launcher da Luma é elevado acima da tabbar;
- troca de área pelo mobile volta o conteúdo ao topo;
- desktop permanece fora das regras de `mobile-app-v510.css`.

## Dashboard mobile

- hero compactado para leitura rápida e toque;
- fotografia vira apoio visual e não disputa espaço com a mensagem;
- quatro métricas passam para grade 2×2 em celulares;
- cards e touch targets seguem densidade de app;
- confirmação do dia ganha métricas compactas;
- cards de próximos agendamentos preservam a versão mobile existente dentro da nova hierarquia.

## Agenda mobile

- Calendário/Horários/Bloqueios viram segmented control full-width;
- toolbar de período e ações é reorganizada para toque;
- criação de agendamento mantém botão compacto;
- legenda de presença vira scroller horizontal de chips;
- semana continua usando a lógica já existente de 1 dia em <520px e 3 dias em layouts intermediários;
- mês deixa de depender do grid desktop de 700px e passa a caber em 7 colunas compactas;
- eventos do mês viram indicadores compactos clicáveis, preservando o `aria-label` completo.

## Fora deste lote

A migração visual detalhada de Clientes, Serviços, WhatsApp, Financeiro, Luma, Assinatura, Configurações, Indicações, onboarding e booking público será feita em partes posteriores sobre esta mesma fundação.

## Compatibilidade

Sem mudanças de banco, autenticação, billing, campanhas, APIs ou regras de negócio.
