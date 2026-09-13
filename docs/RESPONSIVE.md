# Sistema responsivo

A versão 1.6.0 centraliza as correções responsivas em `src/responsive.css`, carregado depois do CSS legado. O objetivo é evitar correções isoladas por tela e aplicar o mesmo contrato de layout em ADMIN, DEV, CLIENT, login, agendamento público e landing page.

## Breakpoints de conteúdo

- **Acima de 1100 px:** layout amplo, grids laterais e painéis sticky.
- **901–1100 px:** desktop compacto; grids laterais viram uma coluna quando necessário.
- **Até 900 px:** menu lateral vira drawer; cabeçalho compacto; Product Tour vira painel inferior.
- **Até 640 px:** cartões, formulários e modais seguem o contrato de celular.
- **Até 380 px:** ações críticas empilham e o tour usa uma ação por linha.
- **Altura até 620 px:** tratamento específico para celular em landscape e janelas divididas.

## Áreas auditadas

- shell, sidebar, cabeçalho e notificações;
- Product Tour e spotlight;
- dashboard e cards de métricas;
- tabelas, listas móveis e menus contextuais;
- agenda semanal, mensal, horários e bloqueios;
- serviços, clientes e formulários;
- financeiro, filtros, gráficos e extratos;
- Evolution API e prévia de celular;
- configurações, senha, assinatura e domínios;
- console DEV, tenants, integrações e backups;
- login, portal da cliente e agendamento público;
- landing page comercial;
- modais, confirmações, toasts e safe areas.

## Regras importantes

1. Tabelas não desaparecem genericamente no celular. Quando existe uma lista móvel dedicada, apenas aquela tabela é ocultada; nas demais telas há rolagem horizontal controlada.
2. Modais viram bottom sheets no celular, com conteúdo rolável e ações acessíveis.
3. Botões não quebram palavras letra por letra. Ações longas ocupam a largura disponível ou empilham.
4. O menu lateral vira drawer antes de comprimir o conteúdo principal.
5. Inputs usam 16 px no celular para evitar zoom automático no iOS.
6. Safe areas são respeitadas em cabeçalho, drawer, modais, toasts e controles fixos.
7. O Product Tour usa `visualViewport`, recalcula posição em rotação/redimensionamento e evita sair da tela.

## Matriz de validação visual

Foram renderizados fixtures representativos nas larguras 320, 375, 640, 768, 900, 901, 1024, 1213 e 1440 px, incluindo:

- shell com sidebar e cabeçalho;
- Product Tour;
- dashboard, métricas, tabela e formulário;
- modal comum e modal de assinatura;
- login;
- agendamento público;
- domínios personalizados;
- landing page.

Nenhum fixture apresentou overflow horizontal do documento. Elementos de rolagem intencional, como tabelas e agenda semanal, permanecem contidos no próprio componente.

## Verificação automatizada

```bash
npm run test:responsive
```

O script executa 23 verificações: importação do CSS, breakpoints, cobertura dos componentes críticos, semântica de 135 botões e 18 imagens, neutralização da regra legada que escondia tabelas, proteção contra layouts inline em rodapés de modal e regras específicas do Product Tour.

## Homologação final

Na VPS ou CI, além dos testes automáticos, validar em navegadores reais:

- 320 × 568;
- 360 × 800;
- 375 × 812;
- 390 × 844;
- 412 × 915;
- 768 × 1024;
- 820 × 1180;
- 1024 × 768;
- 1366 × 768;
- 1440 × 900.

Testar também teclado aberto no iOS/Android, orientação landscape, zoom de 200%, textos longos, e-mails extensos e dados financeiros com valores grandes.
