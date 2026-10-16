# Lash Designer 5.13.10 — Resíduos do fundo e alinhamento no login

Base completa 5.13.9. Migração permanece 48. Cabeçalho do agendamento e estrutura do login preservados.

## Correções

O processador anterior retirava apenas o fundo conectado às bordas, preservando também áreas brancas fechadas dentro das letras. A remoção de um fundo opaco uniforme agora inclui essas áreas internas. Nas bordas próximas ao fundo, estima o alpha e descontamina a cor misturada com o fundo, evitando manter a cor clara do antialias como um halo opaco. O recorte continua proporcional, sem redesenhar a marca.

Novo preset **Limpar resíduos brancos** (CLEAN_WHITE), disponível tanto no formulário compartilhado de setup/configurações quanto na ferramenta da Luma. Ele trata imagens já transparentes com resíduos brancos internos ou nas bordas, inclusive as salvas pela versão anterior. A descrição informa que também remove detalhes brancos intencionais: usar a prévia para revisar, manter a imagem original ou escolher só o recorte quando esses detalhes forem importantes. Uma marca inteiramente branca não pode ser distinguida desse fundo; o processador rejeita uma saída vazia e conserva o caminho original. Fundos irregulares continuam fora do escopo desta ferramenta local.

A mudança não reprocessa silenciosamente todas as imagens salvas. Para a logo já cadastrada, abrir Configurações → Seu espaço → Fundo e margens → Limpar resíduos brancos, conferir e salvar. O chat também pode preparar uma prévia pelo novo modo e requer confirmação para aplicar. Revisar em fundo claro e escuro.

No login, o object-fit contain centralizava a arte dentro de uma caixa de largura fixa. Como o @ usa a borda esquerda, o desenho parecia deslocado, embora a caixa estivesse alinhada. A regra específica da logo completa no login agora usa object-position left center. A imagem e o @ partem da mesma borda, conservando tamanhos, proporção e composição existente. Outros usos do TenantBrand não foram modificados.

## Validação

- npm run check: TypeScript, lint, 288 testes, auditorias e build de produção.
- Testes de pixels: áreas internas das letras, imagem transparente com resíduos, recorte sem perda do original, antialias opaco e com exterior transparente preto, além de uma logo real do projeto rasterizada sobre branco. As bordas recuperam alpha em vez de manter o halo branco.
- Teste HTTP: CLEAN_WHITE aceito com IA desabilitada, sem créditos cobrados, mantendo controles de ADMIN e rejeição de fontes inválidas.
- 30 verificações de marca em navegador, incluindo logo completa alinhada ao @ no login em S/M/L e 1440/768/390/320 px.
- 16 verificações do fluxo de preparação, incluindo a nova predefinição pelo componente real e salvamento explícito.

Testes visuais usam cliente compilado e análise de IA controlada. Nenhum deploy, chamada ao modelo real ou alteração no banco da produção foi executado. O arquivo original da logo do estúdio não foi fornecido separadamente; a validação de pixels usa fixtures e asset real do projeto, não uma reconstrução do print.

## Homologação com Fable 5.1 e Opus 5

Rodar npm ci em Node 22 e os comandos de CLAUDE.md. Com a logo original do estúdio, preparar a imagem em ambiente de testes, conferir contornos e áreas internas em fundos claro e escuro, salvar e recarregar painel/login/agendamento. Para a imagem antiga, testar Limpar resíduos brancos e a volta ao original antes de salvar. Confirmar alinhamento da arte com o @ em desktop/mobile. Após backup e deploy, repetir com conta de teste em produção e registrar evidências; manter rollback. A aprovação depende dos testes executados, sem garantia de 100% baseada apenas na capacidade dos modelos.
