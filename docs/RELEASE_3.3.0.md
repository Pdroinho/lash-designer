# Lash Designer 3.3.0 — Product Design System Foundation

## Objetivo

Criar um contrato visual explícito para toda a plataforma antes da próxima rodada de redesigns. A Landing Page comercial foi deliberadamente excluída e será tratada separadamente.

## Entregue

- `src/product-system-v33.css` com tokens canônicos de produto;
- escala tipográfica Manrope/Fraunces;
- paleta neutra, accent e semântica;
- escala única de spacing, radii, elevation e motion;
- primitives novas e prefixadas para componentes migrados;
- `docs/DESIGN_SYSTEM_3.3.md` com direção de arte e regras de componentes;
- `docs/DESIGN_SYSTEM_MIGRATION_3.3.md` com dívida e ordem de migração;
- `docs/DESIGN_SYSTEM_BASELINE_3.3.json` com baseline automática;
- `scripts/design-system-contract.mjs` para impedir aumento de dívida visual;
- `visual-fixtures/design-system-v33.html` como living specimen;
- `npm run test:design-system` adicionado ao pipeline de `check`;
- documentação anterior 2.1 marcada como histórica/deprecada.

## Importante

Esta release **não redesenha silenciosamente as telas existentes**. O novo CSS define tokens `--ld-*` e primitives `.ld-ds-*`, mas não sobrescreve os tokens antigos da aplicação. A migração visual será feita fluxo a fluxo, com QA e screenshot baseline.

## Baseline encontrada (LP excluída)

Antes da migração completa, a plataforma ainda possui dívida relevante:

- 18 folhas CSS de produto na baseline original;
- aproximadamente 10,8 mil linhas de CSS de produto;
- 459 `!important`;
- 19 usos de `100vw/100dvw` em CSS legado;
- 414 ocorrências de cores hex em folhas de produto + camada canônica;
- muitas escalas concorrentes de `border-radius`;
- `styles.css`, `responsive.css` e `design-system.css` 2.1 como maiores fontes de legado;
- Booking e Luma visualmente mais maduros, porém ainda com ilhas de tokens próprios.

## Direção

**Quiet Beauty Utility**: produto beauty-tech refinado, feminino sem clichê, editorial em momentos seletivos e operacional no restante.

## Landing Page

**Não incluída.** A LP atual não é referência para este design system e não deve ser “normalizada” pela 3.3. Ela terá repaginação comercial completa em uma etapa própria.
