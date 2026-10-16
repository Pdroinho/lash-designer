# Lash Designer 5.13.9 — Logo preparada no envio e carregamento legível

Base completa 5.13.8. Banco permanece na migração 48. Nenhuma alteração na estrutura do cabeçalho do agendamento, na navegação ou na identidade visual existente.

## Logo: um fluxo integrado no setup e nas configurações

A versão anterior deixava a ferramenta de remoção de fundo disponível apenas no chat da Luma; o envio normal da logo não usava essa ferramenta. Agora tanto o setup, inclusive no modo manual, quanto Configurações → Seu espaço preparam a imagem enviada antes da análise visual da Luma:

1. O navegador valida e otimiza o arquivo no fluxo existente.
2. O processador local remove fundo liso e recorta margens vazias, com transparência real em PNG.
3. Essa imagem preparada é exibida na prévia e enviada à análise visual, que sugere apresentação, tamanho e paleta.
4. A usuária pode revisar a imagem e escolher as predefinições no mesmo formulário.
5. A alteração só é persistida ao salvar ou concluir o setup.

O componente compartilhado usa o ProductSelect da plataforma. Além das opções existentes de apresentação (símbolo + nome ou logo completa) e tamanho (Discreto, Equilibrado ou Em destaque), há “Fundo e margens”, com “Sem fundo e sem margens”, “Só cortar margens” e “Usar original”. A prévia mantém a proporção. O recorte muda os pixels da imagem, removendo o espaço vazio que antes fazia o desenho parecer pequeno mesmo com tamanho maior.

Esses ajustes também podem preparar uma logo já salva em formato inline, sem exigir nova conversa com a Luma. Logos antigas hospedadas por URL externa precisam ser reenviadas para processamento, evitando downloads arbitrários. A opção original neste formulário conserva a imagem otimizada anterior aos ajustes durante a edição; não constitui um histórico permanente do arquivo bruto após salvar/recarregar. O fluxo de restauração das edições feitas pelo chat continua conforme 5.13.7.

## Processamento e limites

Novo endpoint ADMIN `/api/admin/brand/prepare-image`, com o limitador existente, validação de payload e isolamento da sessão. A operação é local com Sharp, não altera o banco, não envia pixels a outro provedor e não consome mensagens ou créditos de IA. Funciona com a IA desabilitada; a análise de paleta/apresentação continua respeitando a franquia anterior. Os campos ficam bloqueados durante a preparação/análise, inclusive o salvamento antecipado.

PNG/JPEG/WebP estáticos são aceitos; campo de entrada até 450 kB, imagem decodificada até 8 milhões de pixels e saída até 450 kB. Não há acesso a URLs externas. Detalhes e cores não são redesenhados. A remoção trata fundos lisos conectados às bordas, conservando detalhes claros internos e alpha já existente; o recorte deixa apenas uma pequena margem de proteção. Fundos fotográficos/irregulares podem ser recusados; nesses casos a imagem original continua disponível. Não é um serviço de segmentação neural de fotografias. Em falha da análise de IA, a preparação local permanece utilizável e o formulário permite revisão manual.

## Carregamento e login

O quadrado branco era o skeleton vazio usado enquanto tenant, sessão e módulos eram carregados. O componente PageLoading substitui esses cartões no início da aplicação, na verificação de sessão e nas áreas administrativas carregadas sob demanda, com indicador e mensagem visível “Preparando seu espaço…”, acessível por role=status/aria-live. As requisições continuam necessárias; não há simulação de progresso ou promessa de carregamento instantâneo.

O título foi reduzido para “Entrar na conta”, com tamanho responsivo e uma linha. A regra é específica desse título, preservando os demais textos e a estrutura do login.

## Validação

- `npm run check`: TypeScript, lint, 285 testes automatizados, auditorias e build de produção.
- Nova cobertura HTTP do processador: ADMIN/401/403, pixels transparentes reais, crop, IA desabilitada, nenhum crédito consumido, rejeição de URL externa, imagem inválida e modo inválido.
- `npm run test:logo-preparation-ui`: 16 verificações em Chromium com cliente compilado, API visual controlada e processamento real de pixels. Carregamento retido sem cartão vazio, título em uma linha em 1440/768/390/320 px, preparação antes da análise, original, crop, remoção e salvamento; setup em 1440/320 px.
- `npm run test:settings-brand-ui`: dez verificações preservadas de cota, falha, arquivo inválido e bloqueio de salvamento enquanto a análise está pendente.
- `npm run test:brand-presentation-ui`: 30 verificações de setup/marca em diferentes telas, larguras e tamanhos, incluindo a geometria original do cabeçalho do agendamento.

As respostas da análise visual nos testes são controladas. Não houve chamada ao modelo real, cobrança Appmax, envio Evolution ou deploy nesta entrega. Capturas internas não integram o ZIP.

## Homologação com Fable 5.1 e Opus 5

Seguir CLAUDE.md em Node 22 com npm ci. Em ambiente de testes, usar credenciais reais e reenviar a logo do estúdio com fundo branco. Conferir transparência e recorte antes da análise, as três predefinições de fundo/margens, os três tamanhos e símbolo/nome versus marca completa. Salvar e recarregar painel, login e agendamento. Testar sem créditos, com IA desabilitada e com falha de provedor, além de imagens transparentes e fundos recusados. Simular rede lenta ao atualizar login e painel; confirmar feedback visível e recuperação, e título em uma linha no mobile. Após publicar com backup/rollback preparado, repetir o fluxo em produção com contas de teste e registrar evidências. A capacidade de um modelo não equivale a testes executados nem garante 100% de integridade.
