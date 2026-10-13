# 5.12.13 — Marcadores da atividade recente

Base: 5.12.12. Correção visual no dashboard; esquema permanece na migração 45.

O marcador circular estava sujeito a `flex-shrink` quando a descrição consumia espaço. Agora usa base fixa de 12px, dimensões 12 × 12px, proporção 1:1 e alinhamento no início da linha. O conteúdo textual usa `min-width: 0` e quebra palavras extensas para não comprimir o marcador ou vazar da área disponível.

O conector vertical agora aparece entre todos os eventos consecutivos, encerrando antes do último. Marcadores decorativos recebem `aria-hidden`.

Validação desta correção: TypeScript, ESLint e build aprovados. Cliente compilado inspecionado em Chromium com fixtures de atividades contendo descrição longa e nome sem espaços; todos os marcadores medidos em 12 × 12px, `flex-shrink: 0`, sem overflow horizontal nas larguras 1440, 1024, 768, 390 e 320px. Nenhum erro não tratado no navegador; inspeção visual da lista concluída.

Não foi repetida a suíte financeira neste hotfix visual. Resultados e homologação externa das indicações permanecem documentados no release 5.12.12. Não houve deploy nesta execução.
