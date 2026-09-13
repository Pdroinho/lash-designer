# Product Tour

O tour é um componente próprio, sem dependência externa, em `src/components/ProductTour.tsx`.

## Recursos

- spotlight sobre o elemento real e fallback central quando o alvo não existe;
- tooltip reposicionado para permanecer dentro da viewport;
- progresso, próximo, voltar, pular, concluir e reabrir;
- navegação por `←`, `→` e `Esc`;
- foco inicial, foco preso dentro do diálogo, retorno ao elemento anterior, `role="dialog"`, `aria-modal` e bloqueio de scroll;
- rolagem suave, transições e layout responsivo;
- botão de ajuda no cabeçalho;
- conclusão persistida no navegador, com fallback quando `localStorage` está bloqueado.

## Cobertura

- painel ADMIN: dashboard, agenda, clientes, serviços, financeiro, WhatsApp, configurações, domínios e segurança da conta;
- console DEV: tenants, configurações, integrações e backups;
- portal CLIENT: agendamentos e ações principais;
- agendamento público: marca, resumo, escolha e confirmação.

Cada aba usa uma chave própria, portanto o primeiro acesso apresenta o contexto daquela tela. O botão `?` permite repetir o tour.

## Adicionar uma etapa

1. Marque o elemento:

```tsx
<div data-tour="finance-summary">...</div>
```

2. Acrescente a etapa:

```ts
{
  selector: '[data-tour="finance-summary"]',
  title: 'Resumo financeiro',
  description: 'Acompanhe recebimentos, pendências e desempenho.',
}
```

Evite mais de sete etapas por tela e textos longos. Seletores ausentes não quebram a interface: a etapa aparece centralizada.

## QA

- teste desktop e celular;
- navegue por teclado;
- confirme que o destaque não cobre ações críticas;
- verifique tema claro/escuro e cores de tenant;
- limpe as chaves `lashdesigner:tour:` do armazenamento local para simular primeiro acesso.

## Comportamento responsivo 1.6

- a partir de 900 px o card tenta ficar ao lado do alvo, usando a altura real do diálogo para não sair da viewport;
- abaixo de 900 px o card vira painel inferior centralizado;
- `visualViewport` é usado para reagir ao teclado virtual;
- rotação e resize recalculam spotlight e posição;
- o rodapé muda de duas colunas para uma coluna conforme a largura interna do card;
- em telas muito estreitas os botões ficam empilhados;
- rótulos de ação usam `white-space: nowrap` e `word-break: keep-all`, impedindo que “Próximo” ou “Voltar” quebrem letra por letra;
- o conteúdo usa altura máxima e rolagem interna em celulares landscape.

## Política de prioridade — release 2.1

O tour é uma camada educativa e nunca pode concorrer com uma tarefa transacional.

- ADMIN sem assinatura ativa: tour desabilitado e launcher oculto;
- ADMIN ativo: auto início somente no dashboard;
- modal, confirmação, checkout bloqueante ou `dialog[open]`: tour fechado imediatamente;
- sidebar móvel e notificações: tour fechado;
- overlay aberto: CSS impede coexistência visual mesmo antes da atualização do estado React;
- fechamento por `X`, `Esc`, “Pular” ou “Concluir” persiste a decisão localmente.

`OverlayCoordinator` emite `lashdesigner:overlay-open`; o `ProductTour` também mantém um `MutationObserver` como segunda barreira.
