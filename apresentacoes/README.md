# Apresentação ao Comitê de Tecnologia — IA na Área Criminal

Material de apresentação sobre as ferramentas de IA em operação na área criminal
e as propostas de expansão submetidas ao Comitê.

## Arquivos

| Arquivo | Uso |
|---|---|
| `IA-Area-Criminal-Comite-Tecnologia.pptx` | Versão PowerPoint, identidade visual TPC (20 slides). Editável. |
| `IA-Area-Criminal-Comite-Tecnologia.pdf` | Mesma apresentação em PDF, para envio prévio aos membros do comitê. |
| `gerar-deck-comite-tecnologia.js` | Script que gera o `.pptx`. Regenerar após editar o conteúdo aqui. |
| `../apresentacao-ia-criminal.html` | Versão web navegável (setas para avançar, `i` abre o índice). |

## Regenerar o .pptx

```bash
npm install pptxgenjs
node apresentacoes/gerar-deck-comite-tecnologia.js apresentacoes/IA-Area-Criminal-Comite-Tecnologia.pptx
```

O PowerPoint usa Segoe UI. Em máquina sem essa fonte, o Office substitui por
Calibri sem quebrar o layout.

## Atenção antes de mesclar na `main`

A raiz deste repositório é publicada no GitHub Pages. Ao mesclar
`apresentacao-ia-criminal.html` na `main`, a apresentação fica **acessível
publicamente na internet**. Se a intenção for uso apenas interno, mantenha o
arquivo nesta branch ou mova-o para repositório privado.
