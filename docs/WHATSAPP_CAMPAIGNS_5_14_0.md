# Campanhas WhatsApp — operação e limites da versão 5.14.0

## O que esta entrega resolve

O editor aceita texto e uma imagem PNG, JPG ou WebP, com prévia e confirmação explícita antes de criar a fila. A imagem é validada e otimizada no navegador e decodificada/regravada no servidor; URLs externas e SVG não são aceitos. O servidor armazena a imagem na campanha, sem publicá-la em uma URL aberta e sem devolvê-la na listagem. O transporte Evolution envia a mídia e o texto personalizado juntos, por `message/sendMedia`, em uma única mensagem.

As campanhas continuam desativadas por padrão. Somente ADMIN pode criar ou cancelar campanhas do próprio estúdio. A configuração de instalação `WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED` permanece necessária; a usuária não vê flags ou instruções de servidor no editor.

## Proteções implementadas

- Consentimento promocional ativo na seleção e novamente imediatamente antes do envio. Alterações de telefone e retirada da autorização retiram a cliente da fila. A saída por SAIR/PARE/PARAR/STOP mantém o mecanismo existente.
- Um destinatário por número, sem grupos, importação de listas externas ou rotação de contas.
- Até 50 destinatários por campanha e até 50 tentativas promocionais por estúdio em uma janela móvel de 24 horas. O limite configurado pode ser menor. Audiências maiores são divididas em lotes; a próxima campanha usa clientes ainda elegíveis.
- Um contato não recebe outra campanha durante sete dias após uma tentativa de envio, inclusive quando a aceitação ficou incerta.
- Intervalo efetivo de pelo menos 60 segundos, mesmo se uma configuração antiga pedir menos. Uma trava persistida no SQLite impede sobreposição de processos que usam esse mesmo banco. Ela não coordena cópias independentes do banco em VPS diferentes.
- Conta e assinatura devem estar ativas e a configuração promocional habilitada. O worker verifica a conexão antes do envio e revalida cancelamento/consentimento após essa consulta.
- O primeiro envio sem confirmação do provedor interrompe a campanha. Não há retentativa automática de mensagem promocional incerta. Uma confirmação sem identificador de mensagem também é tratada como não confirmada.
- Após reinício, uma tentativa que ficou em andamento por mais de cinco minutos é marcada como não confirmada e interrompe a campanha; ela não volta para a fila.
- Campanhas não concluídas expiram depois de 24 horas, sem iniciar mensagens antigas. Uma mensagem já em envio pode terminar; cancelar não recolhe mensagens aceitas pelo WhatsApp.
- Texto final, após personalização e instrução de saída, limitado pelo produto a 1.024 caracteres com imagem e 4.096 sem imagem. O servidor verifica antes de criar a fila e o worker verifica novamente, caso nomes tenham mudado.

Esses números são limites internos conservadores do Lash Designer, não limites homologados pela Meta e não uma receita para evitar detecção. Não foram adicionados recursos para simular uso humano, contornar fiscalização ou trocar números após bloqueios.

## O que continua dependendo do provedor

A conexão Evolution por WhatsApp Web/Baileys não se torna uma integração oficial por adicionar pausas, consentimento ou limites. Não há garantia de ausência de bloqueios, nem confirmação de entrega só porque a API aceitou uma mensagem. A qualidade e a expectativa das destinatárias continuam relevantes.

Para campanhas comerciais em escala, a recomendação de arquitetura é usar a WhatsApp Business Platform oficial. Ela exige seu próprio cadastro, consentimento, modelos aprovados e aplicação das regras de janela de atendimento. Custos e aprovação dependem da Meta/provedor. A Evolution suporta os canais Baileys e Cloud API, mas isso não significa que o atual transporte livre de texto/mídia implemente envio de modelos aprovados.

Esta entrega **não implementa nem homologa um fluxo Cloud API de templates**. Não basta trocar a instância atual para Cloud e ligar a flag de campanhas. Antes de operar campanhas por esse canal, é necessário implementar/homologar templates, mídia do modelo, idioma, parâmetros, eventos de qualidade e falhas com a conta real. A equipe deve confirmar a versão da Evolution instalada e testar o contrato `sendMedia` em ambiente de testes antes de liberar a integração por QR atualmente existente.

## Publicação e reversão

1. Fazer backup consistente do SQLite e manter campanhas desativadas durante a atualização.
2. Aplicar a migração 49→50. Ela adiciona imagem, timestamp de tentativa e trava de envio. Envios anteriores com tentativa registrada recebem o timestamp histórico para preservar a regra de frequência após a atualização.
3. Homologar envio de texto e imagem para números de teste com consentimento; conferir o recebimento no aparelho, evento/ID do provedor, descadastro antes e depois de enfileirar, perda de conexão, erro, reinício e cancelamento de itens pendentes.
4. Manter um único banco autoritativo para os processos de envio; não iniciar workers sobre réplicas independentes.
5. Só habilitar campanhas depois da validação operacional. Monitorar erros e qualidade pelo provedor. Não liberar uma conta bloqueada/restrita repetindo a fila automaticamente.
6. Para rollback, desativar campanhas e preservar/reconciliar os registros de aceitação e as travas antes de restaurar um banco antigo. Restaurar uma fila PENDING de antes de um envio real pode causar duplicidade, especialmente ao voltar para o worker antigo com retentativas.

## Fontes oficiais consultadas em 16/10/2026

- [Política de mensagens do WhatsApp Business](https://business.whatsapp.com/policy): consentimento, saída, proibição de mensagens indesejadas e regras de templates/janela da plataforma oficial.
- [Evolution API — repositório oficial](https://github.com/evolution-foundation/evolution-api): distinção entre WhatsApp Web/Baileys e WhatsApp Cloud API.
- [Documentação da Evolution Foundation](https://docs.evolutionfoundation.com.br/).

Os testes desta entrega não enviaram mensagens para contatos reais e não homologam bloqueios, reputação de número, aprovação de template ou capacidade comercial de produção.
