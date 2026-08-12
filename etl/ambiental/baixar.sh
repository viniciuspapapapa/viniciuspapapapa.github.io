#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Download resiliente dos Dados Abertos do CNPJ (Receita Federal do Brasil)
# ---------------------------------------------------------------------------
# Fonte oficial: https://arquivos.receitafederal.gov.br/
#   A RFB publica os arquivos em um compartilhamento público SERPRO+
#   (Nextcloud), acessível por WebDAV sem credencial pessoal — o "usuário" do
#   basic-auth é o token público do compartilhamento, divulgado pela própria
#   RFB no endereço acima. Uma competência por mês, em
#   Dados/Cadastros/CNPJ/AAAA-MM.
#
# Uso:
#   ./baixar.sh --tudo                      # competência inteira (~7,7 GB)
#   ./baixar.sh Estabelecimentos0.zip ...   # arquivos específicos
#   COMP=2026-07 ./baixar.sh --tudo         # outra competência
#   ./baixar.sh --listar                    # lista o que há na competência
#
# Os downloads são retomáveis (curl -C -): reexecutar o script continua de
# onde parou, sem rebaixar o que já veio.
# ---------------------------------------------------------------------------
set -u

AQUI="$(cd "$(dirname "$0")" && pwd)"
COMP="${COMP:-2026-08}"
DEST="${DEST:-$AQUI/data/raw/$COMP}"
LOGDIR="$AQUI/logs"
TOKEN="gn672Ad4CF8N6TK"
BASE="https://arquivos.receitafederal.gov.br/public.php/webdav/Dados/Cadastros/CNPJ/$COMP"

mkdir -p "$DEST" "$LOGDIR"

if [ "${1:-}" = "--listar" ]; then
  curl -sS -X PROPFIND -u "$TOKEN:" -H "Depth: 1" "$BASE/" \
    | grep -o '<d:href>[^<]*</d:href>' | sed 's|<[^>]*>||g;s|.*/||' | grep -v '^$'
  exit 0
fi

if [ "${1:-}" = "--tudo" ]; then
  set -- Cnaes.zip Municipios.zip Naturezas.zip Qualificacoes.zip Motivos.zip Paises.zip \
         $(for i in 0 1 2 3 4 5 6 7 8 9; do echo "Estabelecimentos$i.zip"; done) \
         $(for i in 0 1 2 3 4 5 6 7 8 9; do echo "Empresas$i.zip"; done) \
         $(for i in 0 1 2 3 4 5 6 7 8 9; do echo "Socios$i.zip"; done)
fi

for f in "$@"; do
  out="$DEST/$f"
  for try in 1 2 3 4 5 6 7 8 9 10; do
    curl -sS --fail -C - -u "$TOKEN:" "$BASE/$f" -o "$out" \
         --max-time 7200 --connect-timeout 60 2>>"$LOGDIR/download.err"
    rc=$?
    sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
    if [ "$rc" = "0" ]; then
      echo "$(date +%T) OK    $f ($sz bytes)"
      break
    fi
    echo "$(date +%T) RETRY $f tentativa $try rc=$rc ($sz bytes)"
    sleep $((try * 5))
  done
done
echo "$(date +%T) FIM"
