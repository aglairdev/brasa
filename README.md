# Brasa ꕤ

Kanban e diário minimalista para o navegador. Sem conta, sem rastreamento. Seus dados ficam no seu dispositivo.

> *Uma brasa não é chama. Ela não precisa ser. Ela só precisa continuar acesa.*

## O que é

Brasa é um app web estático que roda inteiramente no navegador. Foi pensado para pessoas que vivem com depressão, anedonia ou qualquer condição que dificulta organizar pensamentos e tarefas no dia a dia.

Não há backend. Não há login. Não há nuvem.

## Funcionalidades

**Kanban**
- Colunas personalizáveis: criar, renomear, excluir
- Tarefas com título, descrição e prioridade (baixa, média, alta)
- Drag & drop entre colunas
- Filtro por prioridade
- Commits por tarefa: anotações de progresso no estilo desenvolvedor
- Animação de confete e mensagem de encorajamento ao concluir uma tarefa
- Colunas padrão: "A fazer", "Em progresso" e "Concluído"

**Diário**
- Entradas livres de texto com seleção de emoji de humor
- Histórico agrupado por data (hoje, ontem, anteriores)
- Completamente privado: nenhum dado sai do dispositivo

**Som ambiente**
- Player com sons em loop: chuva, floresta, fogo, ruído rosa, ruído marrom ...
- Controle de volume
- Sons personalizados: veja a seção [sons](#sons) como contribuir

**Streak**
- Contador de dias consecutivos de uso, exibido no cabeçalho

**Configurações**
- Troca de idioma
- Ativar/desativar sons de vitória e som ambiente
- Exportar dados como `.json` (backup portátil e legível)
- Importar backup
- Apagar todos os dados permanentemente

## Como rodar

O Brasa é um site estático. A única restrição é que não funciona aberto direto como `file://` - o `fetch` de locales e sons exige um servidor HTTP local, mesmo que mínimo.

A forma mais simples é a extensão [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) do VS Code: abra a pasta do projeto e clique em "Go Live".

> Se você já tinha dados salvos em uma versão anterior (sem criptografia), o app migra automaticamente para o formato criptografado na primeira abertura e remove os dados em texto claro do storage.

## Estrutura

```
brasa/
├── index.html        - marcação, CSP e carregamento de scripts
├── style.css         - todo o visual (tema escuro)
├── app.js            - lógica do app (Kanban, Diário, Streak, Áudio)
├── security.js       - criptografia, sanitização e storage
├── libs/
│   ├── bootstrap.min.css        - bootstrap CSS (servido localmente)
│   └── bootstrap.bundle.min.js  - bootstrap JS + popper (servido localmente)
├── icons/
│   ├── fonts/        - bootstrap-icons.woff / .woff2
│   └── bootstrap-icons.css
├── locales/
│   ├── pt-BR.json    - português Brasil (padrão)
│   └── es.json       - espanhol
└── sounds/
    ├── index.json    - lista de sons disponíveis
    └── *.mp3 / .ogg  - arquivos de som 
```

## Segurança

### Criptografia

Todos os dados (tarefas, diário, streak, preferências) são cifrados com **AES-256-GCM** via [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) nativa do navegador - sem bibliotecas externas.

AES-GCM é autenticado: qualquer adulteração no ciphertext ou no IV resulta em falha na decriptação, sem necessidade de HMAC separado.

Na primeira abertura, o app gera uma chave de 256 bits via `crypto.getRandomValues()` e armazena no `localStorage` como hex (`__brs_k`). A chave nunca sai do dispositivo.

> Se você apagar os dados do navegador ou usar "Apagar todos os dados", a chave é destruída junto com os dados cifrados. Não há recuperação. Exporte um backup antes.

O backup exportado é JSON em texto claro - legível e portátil, mas não criptografado. Guarde em local seguro.

### O que o Brasa protege

**Contra infostealers** - malwares que varrem o `localStorage` em busca de dados sensíveis encontrarão apenas ciphertext opaco. Os nomes das chaves no storage (`__brs_k`, `__brs_d`) são genéricos propositalmente para não chamar atenção de scanners por padrões semânticos.

**Contra XSS** - todo texto inserido pelo usuário passa por `Security.sanitizeText()` antes de qualquer uso em `innerHTML`, escapando `&`, `<`, `>`, `"`, `'` e `/`. Conteúdo simples usa `textContent` diretamente, sem passar por HTML parser.

**Isolamento de rede** - `connect-src 'self'` na CSP impede qualquer `fetch` ou `XMLHttpRequest` para domínios externos. `frame-src 'none'` e `object-src 'none'` bloqueiam iframes e plugins.

### Limitações conhecidas

**`'unsafe-inline'` em `script-src`** - o Bootstrap injeta um script inline ao inicializar, o que exigiu adicionar `'unsafe-inline'` na CSP. Isso significa que a CSP por si só não bloqueia scripts inline arbitrários. A proteção contra XSS depende inteiramente da sanitização de inputs (`Security.sanitizeText()`), que está aplicada em todos os pontos onde dados do usuário chegam ao DOM. Não há `eval()` ou `Function()` no código.

**Backup em texto claro** - o arquivo exportado é JSON legível, não criptografado. É portátil e inspecionável, mas deve ser guardado em local seguro.

**Chave no mesmo dispositivo** - a chave AES fica no `localStorage` do mesmo navegador que os dados cifrados. Se o dispositivo for comprometido com acesso ao perfil do navegador, tanto a chave quanto os dados cifrados estão acessíveis. A criptografia protege contra leitura direta do storage por outros processos ou extensões, não contra comprometimento total do dispositivo.

### O que o Brasa não faz

- Não coleta IP, geolocalização ou qualquer identificador
- Não usa analytics, cookies de terceiros ou meta-tags de redes sociais
- Não tem backend, não faz requests externos além do Google Fonts para carregamento de tipografia. Internamente, usa `fetch` para carregar locales e sons - sempre de `'self'`
- Não usa `eval()`, `Function()` ou qualquer execução dinâmica de código

### Fluxo de criptografia

```
Usuário salva dado
        │
        ▼
  JSON.stringify(state)
        │
        ▼
  IV aleatório (12 bytes) via crypto.getRandomValues()
        │
        ▼
  AES-256-GCM encrypt (chave local + IV)
        │
        ▼
  Base64( hex(IV) + ':' + Base64(ciphertext+GCM-tag) )
        │
        ▼
  localStorage.setItem('__brs_d', ...)


Ao carregar:
  localStorage.getItem('__brs_d')
        │
        ▼
  Extrai IV e ciphertext
        │
        ▼
  AES-256-GCM decrypt → falha silenciosa se adulterado
        │
        ▼
  JSON.parse() → estado restaurado
```

## Dependências

O visual é CSS customizado (`style.css`). O Bootstrap é usado principalmente para utilitários de layout e acessibilidade em alguns componentes - não define a aparência do app.

Todas as dependências JS e CSS são servidas **localmente** - sem requisições a CDNs externos, sem hashes SRI para manter, sem dependência de disponibilidade de terceiros.

| Dependência | Versão | Finalidade |
|---|---|---|
| [Bootstrap](https://getbootstrap.com) | 5.3.3 | Utilitários de layout e alguns componentes (`libs/`) |
| [Bootstrap Icons](https://icons.getbootstrap.com) | 1.11.3 | Ícones da interface (`icons/`) |
| [Google Fonts](https://fonts.google.com) | - | VT323 (display) + IBM Plex Mono + IBM Plex Sans |

Nenhuma dependência para criptografia - usa exclusivamente a Web Crypto API nativa.

> Google Fonts faz um request ao servidor do Google para carregar as fontes. Se precisar de isolamento total de rede, baixe as fontes e sirva localmente.

## Como contribuir

### Tradução

Crie um arquivo em `locales/` seguindo a estrutura de `pt-BR.json`. Todas as chaves precisam ter tradução completa. As mensagens exibidas ao concluir uma tarefa ficam em `VICTORY_MESSAGES` no `app.js` - adicione uma entrada para o novo idioma.

Depois registre o novo idioma em dois lugares no `app.js`:

```js
// 1. lista de idiomas disponíveis (topo do arquivo)
const AVAILABLE_LANGS = ['pt-BR', 'es'];

// 2. nome de exibição, dentro de renderLangSelect()
const names = {
  'pt-BR': 'Português (Brasil)',
  'es': 'Español',
};
```

### Sons

O app descobre sons em dois passos: primeiro lê `sounds/index.json` para saber quais arquivos estão disponíveis, depois verifica quais deles existem de fato na pasta `sounds/`. Sons cujo `key` já consta em `AMBIENT_SOUNDS_CATALOG` (no `app.js`) usam o ícone e a ordem definidos lá; os demais são carregados como extras.

Para adicionar um som localmente:
1. Coloque o arquivo em `sounds/` - máximo 3 MB por arquivo
2. Adicione o nome do arquivo (ex: `ocean.mp3`) em `sounds/index.json`
3. Opcionalmente, registre um ícone em `AMBIENT_SOUNDS_ICONS` no `app.js`
4. Recarregue o web app

Sons sem ícone registrado exibem 🔊.

Para incluir um som nos padrões do app (com ícone e ordem garantidos), adicione uma entrada em `AMBIENT_SOUNDS_CATALOG` no `app.js`:

```js
const AMBIENT_SOUNDS_CATALOG = [
  { key: 'rain',   icon: '🌧', ext: null },
  { key: 'ocean',  icon: '🌊', ext: null }, // novo
  // ...
];
```

### Mensagens de vitória

As mensagens exibidas ao concluir uma tarefa estão em `VICTORY_MESSAGES` no `app.js`, organizadas por idioma.

### O que **não** é aceito

- Autenticação com servidor externo
- Dependências que façam requests externos não documentados
- Funcionalidades que exijam conta ou login
- Remoção ou enfraquecimento da criptografia local
- Frameworks de UI pesados - o projeto é Vanilla JS por escolha

### Acessibilidade

Relatórios de problemas com leitores de tela, navegação por teclado ou contraste são aceitos.

## Créditos

**Bibliotecas**
- [Bootstrap](https://github.com/twbs/bootstrap) - The Bootstrap Authors (MIT)
- [Bootstrap Icons](https://github.com/twbs/icons) - The Bootstrap Authors (MIT)
- [VT323](https://fonts.google.com/specimen/VT323) - Peter Hull (Open Font License)
- [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) - IBM (Open Font License)
- [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans) - IBM (Open Font License)

## Licença

MIT - veja `LICENSE` para detalhes.

Pode usar, modificar e distribuir livremente.

---

*"Se sentir pequeno é libertador." - Fabio Brazza*
