@echo off
echo ============================================
echo  Construindo Controle Financeiro - Vinicius
echo ============================================
echo.

echo [1/3] Instalando dependencias...
pip install pywebview pyinstaller --quiet
if %errorlevel% neq 0 (
    echo ERRO: Falha ao instalar dependencias.
    echo Verifique se o Python esta instalado corretamente.
    pause
    exit /b 1
)

echo [2/3] Gerando executavel...
pyinstaller --onefile --noconsole --name "ControleFinanceiro" --add-data "financas.html;." main.py
if %errorlevel% neq 0 (
    echo ERRO: Falha ao gerar o executavel.
    pause
    exit /b 1
)

echo.
echo [3/3] Copiando para a pasta raiz...
copy /Y "dist\ControleFinanceiro.exe" "ControleFinanceiro.exe" >nul

echo.
echo ============================================
echo  Pronto! Arquivo gerado: ControleFinanceiro.exe
echo  Pode abrir direto aqui na pasta.
echo ============================================
echo.
pause
