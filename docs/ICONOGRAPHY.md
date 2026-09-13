# Sistema de iconografia — release 2.1.0

A iconografia do Lash Designer usa **Phosphor Icons React 2.1.10**, fixado no manifesto e lockfile, com uma camada semântica interna em `src/components/Icons.ts`.

A decisão substitui os SVGs próprios do release 1.7.0, que criavam inconsistência de desenho e aparência artesanal. A biblioteca fornece uma família madura, legível e com múltiplos pesos, enquanto o mapa semântico impede que cada tela escolha glyphs arbitrariamente.

## Regras

1. **Ícone só entra quando melhora reconhecimento ou velocidade.** Botões textuais não recebem símbolo por decoração.
2. **Uma ação, uma metáfora.** Lixeira significa excluir; `+` e `−` representam entrada e saída; engrenagem significa configuração.
3. **Texto continua sendo a fonte da verdade.** Ações somente com ícone exigem `aria-label`.
4. **Peso regular por padrão.** A navegação ativa usa `duotone`; estados críticos podem usar `fill` apenas quando documentado.
5. **Tamanho previsível.** Navegação usa 18 px; cabeçalho 20 px; ações compactas 16–18 px.
6. **Cor herdada.** O pictograma usa `currentColor`; componentes não recebem cores soltas sem significado de estado.
7. **Sem SVG manual na aplicação.** Exceções são logotipo e ilustrações de marca aprovadas como assets.

## Arquitetura

As telas importam nomes de produto:

```tsx
import { Calendar, Users, Settings } from './components/Icons'
```

O mapa aponta para entry points individuais da biblioteca:

```ts
export { CalendarBlankIcon as Calendar } from '@phosphor-icons/react/dist/csr/CalendarBlank'
```

Isso mantém a nomenclatura estável caso o glyph seja trocado e evita que o servidor de desenvolvimento transpile o catálogo completo.

## Navegação

`SidebarItem` aplica `regular` ao estado comum e `duotone` ao estado ativo. O desenho não depende apenas da cor: fundo, texto e peso do pictograma mudam juntos.

## Proibido

- misturar outra biblioteca;
- copiar SVG de um site para dentro do JSX;
- usar ícone para preencher espaço vazio;
- colocar o mesmo check em todos os bullets;
- usar lixeira para representar despesa;
- usar brilho para qualquer recurso “premium”;
- usar ícone sem rótulo quando a ação não for universal.

## QA

Execute:

```bash
npm run test:icons
```

O script verifica versão fixada, exports `Icon` atuais, ausência dos SVGs rejeitados, imports modulares, uso semântico e regras essenciais.
