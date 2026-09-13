> **DEPRECADO:** este documento permanece apenas como histórico. O contrato vigente de produto é `docs/DESIGN_SYSTEM_3.3.md`.

# Design System 2.1 — clareza, marca e contraste

`src/design-system.css` é carregado depois de `styles.css` e `responsive.css` e funciona como contrato final de interface. Ele substitui a antiga camada de patches por um conjunto coerente de tokens e componentes.

## Tipografia

- **Manrope:** interface, navegação, formulários, tabelas e textos operacionais;
- **Fraunces:** títulos de marketing e momentos editoriais específicos;
- fallbacks de sistema continuam disponíveis se a fonte externa falhar.

Não use a fonte display em tabelas, modais administrativos ou campos. A personalidade da marca vem do contraste entre poucos momentos editoriais e uma interface utilitária estável.

## Superfícies

O modo claro usa marfim frio, branco e grafite. O modo escuro usa carvão quente — não azul-marinho — para manter relação com o vinho da marca.

Tokens principais:

- `--surface-canvas`;
- `--surface-panel`;
- `--surface-raised`;
- `--surface-soft`;
- `--ink-strong`, `--ink-body`, `--ink-soft`;
- `--brand-wine`, `--brand-action`, `--brand-soft`;
- `--line-soft`, `--line-strong`.

## Contraste em dark mode

`theme.ts` calcula `--primary-on-dark` e `--primary-on-dark-soft`. Isso evita que cores de tenant muito escuras desapareçam sobre superfícies carvão. No console DEV, o tema inicial é claro; o tema escuro permanece opt-in e persiste por navegador.

## Navegação

- sidebar de 268 px no desktop e drawer no mobile;
- seção ativa usa fundo suave, cor de marca e ícone duotone;
- rótulos de grupo têm baixa ênfase;
- nenhuma sombra pesada ou bloco de gradiente na navegação operacional.

## Modais

- overlay: `z-index: 11000`;
- tour: `z-index: 8000`;
- toasts: `z-index: 12000`;
- desktop: diálogo central com altura limitada;
- celular: bottom sheet com ações persistentes;
- `OverlayCoordinator` bloqueia scroll, contém Tab, trata Escape e fecha o tour quando um diálogo abre;
- toda `.modal-content` deve ter `role="dialog"` e `aria-modal="true"`.

## Cards e formulários

- cards usam borda discreta e sombra mínima;
- hover não deve fazer o layout “flutuar” sem necessidade;
- labels ficam sempre visíveis;
- ajuda e erro ocupam linha própria;
- prefixos e sufixos não comprimem o texto do input;
- ações destrutivas usam uma zona e uma confirmação separadas.

## Responsividade

O contrato anterior permanece em `responsive.css`; `design-system.css` resolve superfícies e componentes após os breakpoints. Validar no mínimo 320, 375, 768, 900, 1024, 1280 e 1440 px.
