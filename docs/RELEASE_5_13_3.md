# Lash Designer 5.13.3 — Marca e profissionais

Base: projeto completo da entrega 5.13.2. Identidade e estrutura existentes preservadas.

## Entrega

- Escolha de profissional por cartões com avatar, nome completo e rádio nativo. A opção “Qualquer profissional disponível” mantém a busca por disponibilidade da equipe. Uma profissional única aparece identificada, sem escolha desnecessária.
- Em Equipe → Configurar → Editar cadastro, foto opcional: adicionar, trocar ou remover. Imagens PNG/JPG/WebP de até 12 MB são validadas pelo navegador e reduzidas para até 480 px / 125 kB antes do envio. Sem foto ou com falha de carregamento, entram as iniciais. A imagem não é cortada no arquivo; a miniatura usa enquadramento circular central.
- Instagram e TikTok opcionais no mesmo cadastro, recolhidos por padrão. Aceita usuário com ou sem @ na interface; armazena somente o identificador validado. O agendamento mostra “Conheça o trabalho de…” para a profissional selecionada (ou única), com links externos seguros. Não expõe telefone, e-mail, dados de acesso ou agenda privada.
- Setup assistido analisa automaticamente a logo enviada. O modelo recebe a imagem em detalhe alto, as preferências e o nome do espaço; sugere três paletas e apresentação da marca. A cliente revisa tudo antes de concluir e pode ajustar manualmente.
- Duas apresentações: `SYMBOL_NAME` (símbolo + nome digitado) e `FULL` (logo com nome integrado). Três tamanhos: `S`, `M`, `L`, adaptados e limitados em cada contexto. O modelo não pode gerar CSS, HTML ou dimensões arbitrárias. A logo é exibida proporcionalmente com `object-fit: contain`, sem recorte da marca.
- Componente compartilhado no painel ADMIN/CLIENT, topo mobile, login, agendamento e prévias do setup. Configurações → Identidade visual permite alterar apresentação e tamanho posteriormente. A ausência de logo mantém o nome e a marca padrão. O painel STAFF atual não tinha logo e mantém seu cabeçalho existente.
- Paleta do setup persistida: cor principal conserva a geração existente de tons e proteção de contraste; cor de fundo e secundária entram suavemente nas superfícies e acentos. Nenhuma cor sugerida substitui estados semânticos de erro/sucesso nem libera estilos arbitrários.

## Modelo e fallback

`LUMA_SETUP_USE_PRIMARY_MODEL=true` por padrão: o setup acompanha o modelo principal configurado, inclusive quando existe um antigo `OPENROUTER_SETUP_MODEL`. Isso evita continuar usando o modelo antigo no setup depois de atualizar o principal. Não inventamos um identificador de provedor para “Haiku 5.5”: o identificador efetivamente configurado em `OPENROUTER_MODEL` é enviado ao gateway. Para escolher um modelo separado explicitamente, use `LUMA_SETUP_USE_PRIMARY_MODEL=false` e `OPENROUTER_SETUP_MODEL`. No provedor legado compatível, usa `OPENAI_MODEL`.

Limite existente de três tentativas por setup, reserva atômica, registro de uso e fallback de curadoria mantidos. Requisição visual tem timeout de 25 s e saída limitada a 850 tokens. Falha do modelo, JSON inválido ou dimensões fora dos enums aciona fallback; o caminho manual não exige uma análise bem-sucedida. Upload e análise em andamento bloqueiam o avanço para impedir salvamento de uma marca incompleta. A resposta antiga não substitui uma logo mais recente.

## Auditoria de interface

| Achado | Causa | Correção e cobertura |
| --- | --- | --- |
| Dois checks no consentimento | Marca geral em `::before` e marca local em `::after` | Removida a marca local; um único desenho compartilhado. Alternância testada em 1440, 390 e 320 px. |
| Mesmo conflito no estilo de autenticação | Outro `::after` duplicava o indicador geral | Removido o desenho local; cores do indicador respeitam a superfície do controle. |
| Rádio quadrado | Regra geral com `:not()` tinha prioridade sobre o raio do rádio | Corrigida a especificidade da regra compartilhada, sem inventar outro controle. Seleção única e setas do teclado verificadas. |
| Avatar deformado / ausência de foto | Identidade sem componente compartilhado | Avatar com largura/altura e espaço reservado iguais, foto opcional e fallback. |
| Marca completa tratada como ícone | Mesmo contêiner quadrado para toda logo | Apresentação validada e componente proporcional; sem duplicar o nome na logo completa. |
| Prévia da logo em configurações podia cortar imagem | `object-fit: cover` | Ajustado para `contain`. |
| “Preciso de ajuda” quebrava em várias linhas no setup mobile | Ação ocupava coluna estreita de ícone | Ação recebe área própria, texto em uma linha e validação de altura no navegador. |
| Setup podia avançar enquanto a imagem ainda era processada | Upload sem estado bloqueante | Estado de processamento, guarda de avanço/conclusão e controle de resposta da análise. |

## Banco e atualização

Migração 48 adiciona `photo_url`, `instagram`, `tiktok` em `professionals`; `logo_layout`, `logo_size`, `brand_background`, `brand_secondary` em `tenants`. Padrões preservam a apresentação anterior dos estúdios existentes. As alterações dos perfis permanecem restritas à administradora do próprio estúdio; fotos e redes são públicas somente para profissionais ativas, agendáveis e habilitadas ao serviço.

Antes da atualização: backup consistente de SQLite e dos arquivos do ambiente, aplicação da nova versão, inicialização com Node 22 e verificação de prontidão. Rollback deve restaurar aplicação e backup da base juntos; não apagar colunas manualmente. A suíte de atualização confirma abertura da base 47 pela versão 48 e restauração do backup em processo novo.

## Validação

- `npm run check`: TypeScript, lint, 276 testes automatizados, auditorias estruturais e build de produção.
- Suítes de navegador: refinamento do produto (70), marca e setup (30), formulários (11), equipe (25), suporte (16), Luma integrada (18), cobrança (11), recuperação (4), UX do relatório (14), landing/planos (11): 210 verificações.
- 61 verificações HTTP com servidor real e SQLite temporário, incluindo perfil público, redes, marca, limites, isolamento e reservas concorrentes por profissional.
- Quatro verificações de atualização, backup e restauração 47→48.
- Inspeção visual de capturas de desktop e mobile, além das asserções de layout. Setup e marcas em 1440, 768, 390 e 320 px; seleção com até 15 profissionais e nomes longos.

As APIs das suítes de interface do produto/marca são fixtures; equipe, suporte e Luma possuem suítes adicionais com rotas e SQLite reais. A resposta de IA é simulada nos testes: isto comprova o contrato e o fluxo, não a qualidade de análise de um provedor real. Appmax e Evolution externos também não foram acionados. Não houve deploy nem homologação de produção nesta entrega.

## Homologação com Fable 5.1 e Opus 5

Seguir `CLAUDE.md`: executar localmente em ambiente de testes, com as credenciais e o identificador real do modelo principal. Confirmar que o modelo aceita imagens; comparar sugestões para logos somente símbolo, completas, verticais, muito claras/escuras, transparentes e com margem excessiva. Revisar resultado com a cliente e verificar todos os tamanhos/contextos. Testar limites/fallback, remoção e troca de fotos, redes sociais e agendamento específico/qualquer profissional. Homologar também compra/estorno real controlados, webhooks duplicados, WhatsApp e todo o fluxo de chamados.

Após publicar, repetir com contas de teste: login, setup, equipe, reserva, presença, financeiro, chamados ADMIN/DEV, notificações, lembretes, créditos e identidade após recarregar a página. Registrar evidências, logs e rollback. A capacidade dos modelos não substitui executar esses passos e não equivale a garantia de 100%.

O ZIP contém o projeto completo e todos os assets da base; exclui dependências, build, bancos, credenciais e capturas internas.
