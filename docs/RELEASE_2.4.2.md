# Lash Designer 2.4.2 — Luma Experience Rebuild

## Motivo

A 2.4.1 corrigiu o estiramento do drawer, mas a Luma ainda tinha aparência de chat genérico: sugestões permanentes ocupando estrutura, mensagens dentro de cards pesados, composer separado da conversa e duas superfícies que pareciam implementações diferentes da mesma assistente.

A 2.4.2 reconstrói a experiência da Luma como uma superfície de produto, mantendo o mesmo backend seguro e a mesma cota diária.

## Experiência visual

- estado inicial editorial com uma pergunta central: “O que você quer entender hoje?”;
- contexto explícito de Agenda, Clientes, Financeiro e Resultados;
- três pontos de partida curados em vez de uma lista genérica de sugestões;
- respostas da Luma em fluxo aberto, com marca discreta, sem bolha pesada;
- mensagens da profissional em bubble suave e curta;
- composer integrado, com botão de envio por ícone e metadado de privacidade;
- contador passa a comunicar consultas restantes, em vez de “0/12” como placar técnico;
- ação “Nova conversa” aparece somente quando existe um histórico;
- drawer e página usam exatamente o mesmo sistema visual;
- launcher não é exibido quando a profissional já está na página da Luma;
- mobile usa tela cheia para o drawer e preserva o composer no limite inferior seguro.

## Conversa real, não fachada

Antes desta versão, a UI mantinha mensagens na tela, porém cada chamada ao modelo recebia somente a pergunta atual. A 2.4.2 passa as últimas mensagens relevantes como contexto curto e limitado:

- até 8 mensagens anteriores;
- máximo agregado de 6.000 caracteres de histórico;
- histórico continua restrito ao tenant atual;
- chave do OpenRouter continua exclusivamente no servidor;
- o contexto de negócio continua agregado;
- a cota diária permanece em 12 chamadas;
- o histórico visual usa `sessionStorage`, evitando persistência indefinida no navegador.

O retry de falha também não duplica mais a mensagem da usuária.

## Composer

- textarea começa com uma linha e cresce automaticamente;
- Enter envia;
- Shift + Enter quebra linha;
- botão de envio fica embutido na caixa;
- durante geração, o mesmo controle vira “parar resposta”;
- hint de teclado some em superfícies estreitas;
- auto-scroll respeita `prefers-reduced-motion`.

## Escopo

A revisão não altera preços, billing, referrals, Agenda, domínio, WhatsApp ou regras comerciais. O único contrato de backend alterado é o endpoint da Luma, que passou a aceitar um histórico opcional e limitado.
