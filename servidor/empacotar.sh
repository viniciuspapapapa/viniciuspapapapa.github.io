#!/usr/bin/env bash
# Gera o pacote de instalação para a Hostinger: servidor/dist/honorarios-hostinger.zip
# Uso: bash servidor/empacotar.sh   (a partir da raiz do repositório)
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; P="$TMP/honorarios-hostinger"
mkdir -p "$P/public_html/api" "$P/public_html/img"
cp "$RAIZ/contratos.html" "$P/public_html/index.html"
cp "$RAIZ/contratos-app.js" "$P/public_html/"
cp "$RAIZ/img/tpc-logo.png" "$P/public_html/img/"
cp "$RAIZ/servidor/raiz.htaccess" "$P/public_html/.htaccess"
cp "$RAIZ/servidor/api/"{index.php,lib.php,asaas.php,instalar.php,cron.php,.htaccess} "$P/public_html/api/"
cp "$RAIZ/servidor/config.exemplo.php" "$P/config-honorarios.php"
cp "$RAIZ/servidor/LEIA-ME.md" "$P/LEIA-ME.md"
mkdir -p "$RAIZ/servidor/dist"; rm -f "$RAIZ/servidor/dist/honorarios-hostinger.zip"
(cd "$P" && zip -qr -X "$RAIZ/servidor/dist/honorarios-hostinger.zip" .)
rm -rf "$TMP"; echo "Pacote gerado: servidor/dist/honorarios-hostinger.zip"
