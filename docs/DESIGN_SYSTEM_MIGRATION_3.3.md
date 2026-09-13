# Migração visual — baseline 3.2 → Design System 3.3

A Landing Page está explicitamente fora desta matriz.

## Status

- **A — alinhado:** estrutura boa; migrar tokens quando tocar.
- **B — parcial:** visual funcional, mas ainda possui inconsistências locais.
- **C — legado:** precisa de migração estrutural, não novos overrides.

| Área | Status | Leitura atual | Próxima ação |
|---|---|---|---|
| Shell/sidebar/topbar | A | arquitetura 2.4 sólida | trocar aliases antigos por tokens 3.3 gradualmente |
| Overlays/modais | A | portal/scroll lock e geometria maduros | normalizar raios 24/12 e remover exceções |
| Agenda | A | responsividade baseada no container | consolidar tabs/controls e eventos na escala de radius |
| Serviços | A | desktop table + mobile cards | migrar radius 15/11 para 18/12 |
| Financeiro | A | boa hierarquia de números | migrar radius 17 e validar gráficos |
| WhatsApp | A/B | layout claro e responsivo | normalizar QR/painéis e microcopy |
| Dashboard | B | boa base, hero ainda tem linguagem própria forte | validar hero como único momento expressivo da tela |
| Clientes | B | depende bastante de classes legadas em styles.css | migrar tabela/lista/ações para primitives |
| Configurações/domínios | B | funcional, vários padrões herdados | consolidar settings layout, status e forms |
| Billing | B | narrativa boa, hero/plan cards locais | migrar para accent/tokens e reduzir gradiente |
| Setup | B/C | funcional, muitos valores locais | reconstruir steps/cards/ações com escala canônica |
| Login/Auth | B | estrutura robusta, CTA ainda usa gradiente | migrar CTA e superfícies para sistema 3.3 |
| Booking 3.0 | A visual / B técnico | direção forte, mas usa `--b30-*` próprios | mapear para tokens 3.3 sem perder composição |
| Área da cliente | B | precisa herdar mais do booking/sistema público | padronizar controls/status/spacing |
| Luma 3.2 | A visual / B técnico | integração visual melhorou, mas usa `--l32-*` | remover ilha de tokens e usar core diretamente |
| ADMIN | B | operação funciona, mistura estilos antigos | migrar data display, actions e forms |
| DEV | B | dark mode correto, vários componentes antigos | consolidar dark tokens e densidade |
| Product Tour | A/B | overlay sólido | alinhar card/controls à geometria 3.3 |
| `styles.css` | C | 5.768 linhas e alto acoplamento | esvaziar por módulo; não adicionar novas features aqui |
| `responsive.css` | C | ainda concentra 1.362 linhas e overrides | mover responsividade para cada módulo migrado |
| `design-system.css` 2.1 | C | 346 `!important`; contrato por especificidade | aposentar conforme componentes migram para 3.3 |

## Ordem recomendada de migração

1. **Primitives/forms/actions** — afeta quase toda tela;
2. **Settings + Clientes + ADMIN/DEV** — maior herança visual;
3. **Setup + Auth + Billing** — superfícies especiais inconsistentes;
4. **Booking e Luma** — remover tokens locais sem alterar direção aprovada;
5. **Dashboard/Agenda/Financeiro/Serviços** — consolidação final;
6. reduzir `styles.css`, `responsive.css` e `design-system.css` até virarem apenas compatibilidade temporária;
7. remover compatibilidade após toda rota relevante entrar na matriz visual.

## Regra de migração

Não fazer “redesign global em um commit” só para reduzir números. A migração deve acontecer por componente/fluxo, com screenshot baseline e QA funcional.
