# Activity Manager

Versão local e sem backend do módulo "Trabalho" do SabeTudo — pra usar quando
a VPN da empresa bloqueia o site publicado. Roda 100% na sua máquina, sem
login, sem banco: tudo fica salvo em [`data.json`](data.json), na raiz do
projeto.

Três seções:

- **Credenciais** — cards de APP/usuário/senha, com copiar e mostrar/esconder.
- **Atalhos** — grade de ícones (link, imagem opcional, nome), abre em nova guia.
- **Atividades** — cola o link de uma issue do Jira, extrai a chave (ex.
  `SGE-17040`) automaticamente e deixa marcar o status por ícones (a fazer →
  na máquina → no repositório → para deploy → testando → no ar).

## Como rodar

Precisa de Node 22.22.3+ (o Angular 22 exige essa versão mínima).

```bash
npm install
npm run build
npm run server
```

Abre em <http://localhost:3000>. O `server.js` é só um servidor HTTP puro
(sem framework) que serve o build do Angular e lê/escreve o `data.json` — sem
banco, sem autenticação, sem nada rodando fora da sua máquina.

Pra rodar de novo depois de já ter feito o build:

```bash
npm run server
```

Ou os dois passos de uma vez:

```bash
npm run serve:prod
```

## Desenvolvimento (hot reload)

Em dois terminais:

```bash
npm run server   # API + persistência, porta 3000
npm start        # ng serve com proxy pro /api, porta 4200
```

Abre em <http://localhost:4200> — as mudanças no código recarregam sozinhas;
as chamadas pra `/api` são redirecionadas pro `server.js` via
[`proxy.conf.json`](proxy.conf.json).

## Dados

Tudo fica em `data.json`, que **não é commitado** (está no `.gitignore`) —
como a seção de credenciais guarda senhas em texto puro, esse arquivo é só
seu, só na sua máquina. Se quiser migrar de computador, é só copiar o
`data.json` junto.
