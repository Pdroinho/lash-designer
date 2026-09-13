# Migração de legado — 2.4.0

## Novas primitives/componentes

- `src/components/ModalRoot.tsx` — portal e contrato único de diálogo.
- `src/components/LumaConversation.tsx` — experiência compartilhada da Luma.
- `src/foundation-v24.css` — viewport, scrollbar e regras estruturais base.
- `src/shell-v24.css` — shell, sidebar e drawer mobile.
- `src/overlays-v24.css` — modal/drawer/sheet.
- `src/forms-v24.css` — formulários migrados.
- `src/agenda-v24.css` — Agenda responsiva por contêiner.
- `src/services-v24.css` — apresentação mobile de Serviços.
- `src/dashboard-v24.css` — dashboard e banner.
- `src/finance-v24.css` — financeiro responsivo.
- `src/billing-v24.css` — assinatura compacta.
- `src/luma-v24.css` — Luma unificada.
- `src/whatsapp-v24.css` — experiência WhatsApp simplificada.
- `src/auth-v24.css` — login/acesso.
- `src/landing-v24.css` — header, preço e conversão da landing.
- `src/tour-v24.css` — Product Tour no novo sistema.

## Remoções/consolidações

- múltiplas declarações legadas de `scrollbar-gutter` foram removidas; há um único contrato ativo;
- `ModalRoot` ignora `z-index` inline antigo;
- superfícies 2.4 não calculam largura interna com `100vw`;
- sidebar recolhida não mantém textos invisíveis na geometria;
- Serviços não depende mais da tabela desktop no mobile;
- Agenda não usa largura global da janela como proxy da área útil;
- regras mobile genéricas que comprimiam cabeçalhos foram neutralizadas;
- Product Tour usa o mesmo coordenador de overlays e não concorre com diálogos transacionais.

## Dívida mantida conscientemente

As folhas históricas (`styles.css`, `responsive.css`, `design-system.css`, `setup.css` e `landing.css`) ainda contêm regras de releases anteriores. A 2.4 evita uma remoção em massa sem cobertura funcional, mas as superfícies críticas já foram migradas para contratos próprios. Próxima refatoração recomendada: mover componentes ainda dependentes de estilos inline para primitives e então apagar os blocos legados equivalentes.
