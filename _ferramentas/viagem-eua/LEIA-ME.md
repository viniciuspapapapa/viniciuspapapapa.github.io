# App da viagem EUA 2027

O app público fica em `eua2027/`. Todo o conteúdo pessoal (roteiro, voos, fotos, contrato, passagens) está cifrado
em `eua2027/dados.bin` e `eua2027/docs/*.bin` com AES-256-GCM; a chave deriva da senha do grupo (PBKDF2-SHA256,
310 mil iterações). A senha não está no repositório.

Para editar o conteúdo:

1. Recuperar a fonte: `VIAGEM_SENHA='...' node _ferramentas/viagem-eua/cifrar.mjs --decifrar eua2027 /tmp/fonte`
   (gera `dados.json` e a pasta `docs/`).
2. Converter `dados.json` em `dados.mjs` (`export default {...}`), salvar as fotos em `fotos/` e editar.
3. Cifrar de novo: `VIAGEM_SENHA='...' node _ferramentas/viagem-eua/cifrar.mjs /tmp/fonte eua2027`.
   Documentos que não mudaram são mantidos, para não inflar o histórico.

Gastos, checklist, reservas, votos e voos cadastrados no app ficam no aparelho de cada um e são trocados pelo link
de sincronização (também cifrado com a chave do grupo).
