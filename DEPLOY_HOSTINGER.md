# Tutorial de Deploy Simplificado - Hostinger (VPS ou Cloud Node.js)

Este guia foi preparado para deixar o deploy da sua aplicação **Lash Saas Space** extremamente simples e "Plug and Play".

## Pré-requisitos
- Uma hospedagem Hostinger com **Node.js 18** ou superior (VPS ou Plano Cloud/Shared Node.js).
- Acesso ao terminal (SSH) ou ao painel de controle da Hostinger.

---

## Opção 1: Deploy via Git (Recomendado e Mais Rápido)
Se você usa GitHub/GitLab, esta é a forma mais fácil.

1. **Clone o repositório na sua hospedagem:**
   ```bash
   git clone https://seu-repositorio.git
   cd lash-saas-space
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```
   *Isso instalará tudo e executará automaticamente o comando de build (`npm run build`).*

3. **Configure as Variáveis de Ambiente:**
   Crie um arquivo `.env` na raiz do projeto:
   ```bash
   nano .env
   ```
   Cole o seguinte conteúdo (ajuste conforme necessário):
   ```env
   PORT=3000
   NODE_ENV=production
   SESSION_SECRET=coloque-uma-senha-secreta-e-longa-aqui-123
   ```
   *(Salve com Ctrl+O, Enter e saia com Ctrl+X)*

4. **Inicie a Aplicação (Plug and Play):**
   Para rodar em segundo plano e reiniciar automaticamente se cair, use o PM2 (geralmente já instalado na Hostinger):
   ```bash
   pm2 start npm --name "lash-saas" -- start
   ```
   
   Ou se preferir rodar direto (para teste):
   ```bash
   npm start
   ```

   **Pronto!** Sua aplicação estará rodando. O servidor automaticamente servirá o Frontend e a API.

---

## Opção 2: Deploy via Upload de Arquivos (Manual)
Se você não usa Git, pode subir os arquivos manualmente.

1. **Prepare os arquivos:**
   - No seu computador, apague a pasta `node_modules`, `dist` e `.git` (se houver).
   - **IMPORTANTE:** Apague a pasta `data` do seu zip ou certifique-se de não incluí-la. Se você subir a pasta `data` do seu computador, **ela irá sobrescrever o banco de dados de produção e você perderá seus usuários!**
   - Zipe todos os arquivos restantes do projeto em um arquivo `projeto.zip`.

2. **Upload:**
   - Acesse o Gerenciador de Arquivos da Hostinger.
   - Faça upload do `projeto.zip` na pasta `public_html` ou onde desejar.
   - Extraia o zip (selecione "Sobrescrever arquivos existentes" com cuidado - o ideal é não sobrescrever a pasta `data` se ela já existir no servidor).

3. **Instalação:**
   - Acesse o terminal da hospedagem (SSH).
   - Navegue até a pasta: `cd public_html` (ou onde extraiu).
   - Rode:
     ```bash
     npm install
     ```

4. **Configuração:**
   - Crie o arquivo `.env` conforme explicado na Opção 1.

5. **Iniciar:**
   - Rode `npm start` ou configure no painel da Hostinger apontando para o arquivo `app.js` (que criamos na raiz para facilitar).

---

## Verificação Pós-Deploy

1. Acesse seu domínio (ex: `http://seu-site.com`).
2. Você deve ver a tela de Login.
3. Se for o primeiro acesso, vá para `/login` e tente logar.
4. Para criar o primeiro usuário Admin/Dev, verifique se a rota `/api/auth/me` retorna `allowDevBootstrap: true` (se não houver usuários).

## Resolução de Problemas Comuns

- **Erro de Permissão:** Se tiver problemas com permissão, rode `chmod +x node_modules/.bin/vite` ou `chmod +x node_modules/.bin/tsc`.
- **Porta em Uso:** Se a porta 3000 estiver ocupada, mude no arquivo `.env` para outra (ex: 8080 ou 4000).
- **Banco de Dados:** O sistema usa SQLite. Em produção, ele será salvo automaticamente em `../db_data/app.db` (fora da pasta `public_html`). Isso garante que seus dados **não sejam apagados** quando você fizer um novo deploy do código.
  - A pasta `db_data` será criada automaticamente no nível superior do seu domínio.

---

**Arquivos Importantes Criados para o Deploy:**
- `app.js`: Ponto de entrada simplificado na raiz.
- `package.json`: Scripts ajustados para produção (`start` roda o servidor otimizado).
- `server/index.ts`: Configurado para servir o frontend estático automaticamente em produção.
