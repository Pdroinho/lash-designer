# Lash Designer 5.13.8 — Correção de escopo no cabeçalho do agendamento

A entrega 5.13.7 alterou indevidamente a estrutura do cabeçalho, colocando a marca numa faixa inteira e deslocando as etapas. Esta versão remove todas essas regras estruturais e restaura a geometria anterior à 5.13.7: marca na coluna original e etapas ao lado no desktop; marca e contador na mesma linha e progresso abaixo no mobile. Mantidos alturas, paddings, tamanhos de logo e fonte, divisórias e breakpoints originais.

Apenas o texto “Agendamento online” permanece removido e o conjunto logo/nome é centralizado dentro da área que já ocupava. Nomes quebram entre palavras quando o espaço exige; não há aumento de fonte nem uma nova faixa de cabeçalho. A ferramenta de preparação de logo da Luma permanece conforme 5.13.7. Banco continua na migração 48.

Validação: build/TypeScript e 30 verificações de navegador para marcas FULL/SYMBOL_NAME em tamanhos S/M/L, 1440, 768, 390 e 320 px. Além de centralização e ausência da legenda, os testes verificam explicitamente etapas ao lado da marca no desktop e contador ao lado da marca no mobile. Não houve deploy.

Homologação com Fable 5.1 e Opus 5: comparar o cabeçalho com a base 5.13.6; confirmar que somente legenda/alinhamento da marca mudaram. Repetir com logos e nomes reais antes e depois do deploy, seguindo CLAUDE.md.
