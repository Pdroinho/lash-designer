# Auditoria UX 2.1

## Falhas tratadas

### Product Tour sobre pagamento ou modal

O tour agora possui três barreiras independentes:

1. `Shell` não habilita o tour para tenant sem assinatura;
2. `ProductTour` observa overlays e fecha ao detectar um diálogo;
3. CSS oculta a camada educativa enquanto qualquer overlay transacional existe.

A cobrança tem prioridade sobre onboarding. O tour administrativo só inicia no dashboard de uma assinatura ativa.

### Diálogos inconsistentes

As dez superfícies modais do frontend receberam semântica de diálogo. `OverlayCoordinator` normaliza:

- bloqueio da rolagem de fundo;
- foco inicial;
- contenção de Tab;
- Escape quando existe controle de fechamento;
- notificação global para que tours sejam encerrados.

### Iconografia rejeitada

`BrandIcons.tsx` foi removido. A interface usa Phosphor por entry point individual e um mapa semântico controlado.

### Dark mode do console DEV

- tema padrão alterado para claro;
- superfícies reconstruídas em carvão quente;
- cor de tenant recebe variante clara própria;
- estados ativo, hover, foco, inputs e botões primários têm contraste explícito.

### Tipografia

A mistura anterior de fontes de sistema, Inter e Georgia foi substituída por papéis claros de Manrope e Fraunces.

## Gates automatizados

```bash
npm run test:responsive
npm run test:icons
npm run test:visual
npm run test:ux
```

`test:ux` verifica modais, foco, prioridade de camadas, gating de assinatura, dark mode e política de tour.

## Homologação manual obrigatória

- primeiro login de ADMIN com assinatura inativa;
- pagamento pendente, aprovado e falho;
- abrir modal durante tour em cada perfil;
- reabrir tour pelo botão de ajuda;
- console DEV claro e escuro com cores de tenant claras e escuras;
- navegação por Tab, Shift+Tab e Escape;
- iPhone SE/320 px, Android 360–412 px, tablet e desktop;
- zoom do navegador em 200%;
- `prefers-reduced-motion`.
