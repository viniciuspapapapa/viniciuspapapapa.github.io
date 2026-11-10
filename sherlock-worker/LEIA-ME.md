# Serviço da busca de perfis (sherlock-tpc)

Porte em JavaScript da lógica do projeto aberto [Sherlock](https://github.com/sherlock-project/sherlock) (licença MIT, ver `LICENSE-sherlock.txt`) para um Cloudflare Worker. A ferramenta 17 do HUB (`_hub/usuarios/`) envia o nome de usuário e uma lista de sites; o serviço consulta cada site e devolve somente o resultado. Nada é armazenado.

- `sherlock.js`: regras de verificação do `sherlock.py`. Inclui `regexCheck`, `urlProbe`, `request_method`, `request_payload`, cabeçalhos, HEAD para `status_code`, sem redirecionamento para `response_url`, detecção de WAF e as decisões por `message`, `status_code` e `response_url`. Há um refinamento conservador: 401, 403, 429 e 5xx viram "inconclusivo".
- `data.json`: base de sites do Sherlock. `exclusoes.json`: lista de falsos positivos mantida pelo projeto.
- `worker.js`: rotas `/status`, `/sites` e `/verificar` (POST, até 8 sites por chamada), com CORS e token opcional.

## Implantação (uma vez)

1. No Cloudflare, abra Workers & Pages, clique em Create e depois em Import a repository. Escolha `viniciuspapapapa.github.io`.
2. Nome do projeto: `sherlock-tpc`. Em configurações avançadas, informe `sherlock-worker` como diretório raiz (Path) e `npx wrangler deploy` como comando de implantação. Salve e implante.
3. O endereço será `https://sherlock-tpc.viniciuspapapapa.workers.dev`, que já é o padrão do HUB.
4. Recomendado: em Settings, Variables and Secrets, crie o segredo `APP_TOKEN`. Depois, no GitHub (Settings, Secrets and variables, Actions), crie o segredo `HUB_SHERLOCK_TOKEN` com o mesmo valor e execute o fluxo "Proteger HUB".

Este projeto não interfere no serviço do DataJud, que continua sendo implantado pelo `wrangler.toml` da raiz.

## Atualizar a base de sites

Substitua `data.json` pelo arquivo `sherlock_project/resources/data.json` do repositório do Sherlock. Atualize também `exclusoes.json` a partir do ramo `exclusions`, arquivo `false_positive_exclusions.txt`.
