# Experiência da cliente — 2.5.0

## Princípio de produto

A cliente final não precisa criar uma conta para marcar um horário. O agendamento público coleta apenas **nome + WhatsApp** na confirmação.

A identidade usada para o histórico é diferente do ato de agendar:

- reservar horário: sem login, sem e-mail e sem senha;
- consultar o próprio histórico em navegador já autenticado: sessão persistente;
- abrir o histórico em dispositivo/navegador novo: código curto enviado ao WhatsApp;
- infraestrutura Evolution, tokens e detalhes do provedor permanecem invisíveis para a cliente.

Isso reduz fricção comercial sem transformar conhecimento de nome/telefone em credencial de acesso.

## Fluxo de agendamento

1. Escolher serviço.
2. Escolher data.
3. Escolher horário.
4. Informar nome e WhatsApp e confirmar.

Cada seleção avança automaticamente. O Product Tour foi removido do fluxo público e o rodapé fixo gigante deixou de existir.

## Acesso passwordless

O endpoint de solicitação usa resposta genérica para não revelar se um telefone existe. Para clientes existentes, um código de seis dígitos é criado com expiração curta, armazenado de forma derivada e invalidado após uso. Há limite de tentativas e rate limit por origem/telefone.

Após confirmação válida, é criada uma sessão persistente no navegador. Um novo navegador precisa confirmar o WhatsApp novamente.

### Limitação consciente da 2.5

A versão 2.5 trata **novo navegador/sessão ausente** como evento de revalidação. Fingerprinting avançado, score de risco, mudança de geolocalização e detecção comportamental não foram adicionados nesta release para evitar coleta excessiva e complexidade prematura.

## Segurança de identidade no booking

Quando um número já pertence a uma cliente existente, um novo agendamento público pode reutilizar esse registro, mas não pode sobrescrever a identidade verificada existente a partir de dados anônimos enviados pelo formulário público.

## Evolution API

O código de acesso é enviado usando a configuração server-side já existente da Evolution API. A ausência/configuração inválida do provedor afeta apenas o acesso passwordless em dispositivo novo; o agendamento público continua disponível.
