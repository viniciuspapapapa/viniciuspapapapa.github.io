const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const file = 'file://' + path.resolve(__dirname, 'vaga-crc.html');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
  await page.goto(file, { waitUntil: 'networkidle0' });
  // garante que as fontes carregaram
  await page.evaluate(async () => { await document.fonts.ready; });

  // neutraliza o min-height:100vh / flex centering do body para que o
  // documento tenha exatamente a altura do card (evita 2ª página em branco)
  await page.addStyleTag({ content: `
    html, body { min-height: 0 !important; height: auto !important;
                 display: block !important; padding: 0 !important; margin: 0 !important; }
  ` });

  // mede a caixa exata do card
  const box = await page.evaluate(() => {
    const el = document.querySelector('.card');
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });

  const margin = 24; // respiro ao redor do card
  const pxToIn = px => `${px / 96}in`;

  await page.pdf({
    path: path.resolve(__dirname, 'vaga-crc-clara-odontologia.pdf'),
    printBackground: true,
    width: pxToIn(box.w + margin * 2),
    height: pxToIn(box.h + margin * 2 + 4), // +4px de folga p/ não vazar p/ pág. 2
    margin: {
      top: pxToIn(margin), bottom: pxToIn(margin),
      left: pxToIn(margin), right: pxToIn(margin),
    },
    pageRanges: '1', // garante saída em página única
  });

  await browser.close();
  console.log(`PDF gerado: card ${Math.round(box.w)}x${Math.round(box.h)}px`);
})();
