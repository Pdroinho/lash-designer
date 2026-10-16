# Lash Designer 5.13.11 — Recuperação de senha pelo WhatsApp global

Base completa 5.13.10. Nova migração aditiva 49; fazer backup SQLite antes de atualizar. Assets, marca, planos, agendamento, equipe e demais funcionalidades preservados.

## Experiência

O login tem “Esqueci minha senha”. A usuária informa o e-mail da conta; se ele estiver vinculado a um WhatsApp cadastrado, recebe um código. Na mesma tela, preenche código, nova senha e confirmação. “Salvar senha e entrar” atualiza a senha e cria uma nova sessão, usando o redirecionamento existente para ADMIN, STAFF ou DEV. A preferência “Continuar conectado” do login é respeitada.

O formulário reutiliza inputs, botões, mostrar/ocultar senha, checklist e feedbacks da plataforma; tem foco no campo da etapa, validação inline, reenvio com contagem de 60 segundos, correção de e-mail e volta ao login. Não há campos de telefone novos nesse fluxo, nem alertas nativos. A interface orienta a procurar suporte/administração quando a usuária perdeu acesso ao número cadastrado. Contas CLIENT continuam no acesso sem senha por código já existente.

## Evolution global

O envio usa exclusivamente `platformEvolution.sendPlatformWhatsappText`, a mesma integração global de autenticação já existente. Não usa as credenciais, a instância ou o estado de conexão Evolution do tenant. No painel DEV, manter a Evolution global configurada e conectada; isso atende todos os estúdios, mesmo aqueles sem WhatsApp conectado à plataforma.

Se a configuração global estiver ausente, o endpoint informa indisponibilidade de forma igual para qualquer e-mail, antes de criar o desafio. Com configuração presente, a resposta é genérica para não revelar contas ou números cadastrados. O envio ocorre de forma assíncrona no processo, sem fazer a resposta variar com a latência do provedor. Uma falha de entrega invalida o desafio e gera evento de segurança. Uma interrupção do processo durante esse envio não tem reenvio durável automático: a usuária pode solicitar novamente após o intervalo. O sucesso depende da Evolution global ativa e da entrega ao número cadastrado.

Depois da troca, uma notificação da alteração é enviada pelo mesmo canal global, sem incluir a senha. Falha dessa notificação não desfaz uma recuperação já concluída.

## Segurança e persistência

- Endpoints: POST `/api/auth/password-reset/request` e POST `/api/auth/password-reset/confirm`.
- Código criptograficamente aleatório de 6 dígitos, validade de 5 minutos, uso único e até cinco tentativas incorretas. Um código correto depois de quatro erros ainda é aceito.
- Token de navegador aleatório com 32 bytes, guardado em cookie HTTP-only, SameSite=Lax e Secure/`__Host-` em produção. Cookie separado do MFA e da sessão. O banco guarda apenas hash do token e HMAC do código, com domínio próprio de recuperação e ID do desafio.
- Escopo obrigatório do estúdio resolvido no servidor; DEV somente no host DEV. STAFF suspenso/removido não pode recuperar acesso. ADMIN em recuperação de billing mantém apenas as permissões de recuperação já existentes.
- Somente o telefone já cadastrado na conta recebe o código. Snapshot de telefone e impressão do hash da senha invalidam o desafio se esses dados mudarem. Nenhuma informação de conta é alterada ao apenas pedir o código.
- Intervalo de 60 segundos e limite de três envios por conta a cada 15 minutos, compartilhados entre navegadores/IPs. Mantido também o limitador de login por IP; a confirmação passa pelo limitador de senhas. Reenvio cria outro desafio e invalida o anterior.
- A transação de confirmação verifica novamente validade e snapshots depois do bcrypt. Atualiza senha, consome os desafios de recuperação/MFA, revoga sessões e dispositivos confiáveis antigos e cria uma única sessão nova. Confirmações concorrentes não podem concluir duas trocas.
- Senhas seguem a política existente de 8 a 128 caracteres, com hash bcrypt. Não são enviadas ao WhatsApp nem registradas nos eventos de segurança.
- Migração 49 cria `password_reset_challenges`, com chaves estrangeiras, índices e limpeza após expiração/consumo pela rotina de segurança. Os registros também são limpos no caminho de solicitação. Não adiciona nenhuma conta nem altera telefones.

Referência de revisão: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). A entrada automática após trocar a senha é uma escolha explícita de produto solicitada nesta entrega; exige o código de recuperação e usa uma sessão nova, revogando as anteriores.

## Validação local executada

- `npm run check`: TypeScript, lint, 299 testes automatizados, auditorias e build de produção.
- Testes HTTP/SQLite reais: caminho completo sem Evolution do tenant, hash e cookie, revogação de sessão/dispositivo/MFA, conta inexistente ou sem telefone, isolamento entre estúdios, separação de código MFA, limite de erros, expiração, troca de telefone/senha, STAFF suspenso, STAFF ativo, DEV e CLIENT, reenvio e limite por conta, configuração global ausente, falha do provedor, limpeza e confirmações concorrentes.
- `npm run test:password-recovery-ui`: 13 verificações com cliente compilado, rotas reais, sessão real e SQLite temporário. O transporte global de WhatsApp é simulado. Testa 1440, 768, 390 e 320 px, erro de código, confirmação de senha, cookie e entrada automática. A tela de destino ADMIN é uma fixture fora do escopo do teste; autenticação e recuperação são reais.
- Migração real 48→49: inicialização da versão anterior, backup, abertura pela nova versão com dados preservados e restauração do backup em outro processo.

Nenhuma mensagem foi enviada a números reais e não houve deploy. As capturas internas não integram o ZIP. Homologar o transporte Evolution real antes de liberar a recuperação em produção.

## Homologação com Fable 5.1 e Opus 5

Seguir CLAUDE.md com Node 22 e npm ci. Rodar testes e migração com backup. Em ambiente de testes, configurar a Evolution global no DEV; deixar a Evolution do tenant desconectada e recuperar uma conta com telefone controlado. Conferir chegada do código e da notificação, expiração, reenvio, nova senha e entrada automática. Verificar que cookies/sessões antigas deixam de funcionar e que não é possível trocar o número no fluxo de recuperação. Repetir com STAFF, contas em outro estúdio, número ausente, código errado, limite, indisponibilidade global e billing restrito. Após publicar, repetir o fluxo com contas de teste em produção, registrar evidências e manter rollback. A capacidade dos modelos não substitui execução nem garante 100% de integridade.
