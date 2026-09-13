# Lash Designer 5.1.1 — Password Guidance

Patch de UX sobre a 5.1.0.

## Mudança

A política real de senha continua sendo mínimo de 8 caracteres. A interface agora explica essa exigência em tempo real com um componente compartilhado, em vez de depender de placeholder ou erro após envio.

Superfícies cobertas:

- checkout público;
- criação de tenant;
- criação de usuário DEV;
- bootstrap DEV;
- troca de senha na área Segurança.

Na troca de senha, o checklist também informa quando a confirmação coincide com a nova senha.

Estado pendente é neutro. Uma regra atendida recebe confirmação visual verde usando tokens do Design System 3.3. Nenhuma regra nova foi adicionada ao backend.

## Regressão evitada

`npm run test:password-ui` valida que todas as superfícies continuam usando o componente canônico e que o checklist legado hardcoded não retorna.
