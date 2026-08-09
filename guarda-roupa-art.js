/* ============================================================================
   CLOSET — Reprodução digital das peças
   Em vez de recortar a peça da foto (que quase nunca sai limpo quando a roupa
   está vestida), o app desenha uma versão vetorial da peça nas cores extraídas
   da imagem. O resultado é um catálogo consistente, no espírito de um desenho
   técnico de moda.
   ========================================================================= */
'use strict';

const Art = (() => {

  /* ---------------------------------------------------------------- cores */
  const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const shade = (c, t) => mix(c, '#000000', t);
  const tint  = (c, t) => mix(c, '#ffffff', t);
  const lum   = c => { const [r, g, b] = hex2rgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  /* contorno que funciona tanto em peça clara quanto escura */
  const edge  = c => lum(c) < .22 ? tint(c, .28) : shade(c, .45);

  /* ------------------------------------------------------------- geometria
     Todas as peças são desenhadas num quadro 200×200, centradas, com a mesma
     linguagem: silhueta preenchida + costuras finas por cima.
  ------------------------------------------------------------------------ */

  /* ---- parte de cima ---- */
  function top({ sleeve = 'short', hem = 172, W = 38, W2 = 40, neck = 16, neckD = 15, open = false }) {
    const sy = 48, oy = sy - 8;
    const arm = sleeve === 'long'
      ? `L 176 74 L 166 152 L 140 148 L ${100 + W} ${sy + 38}`
      : sleeve === 'none'
        ? `Q ${100 + W - 12} ${sy + 26} ${100 + W} ${sy + 54}`
        : `L ${100 + W + 34} ${sy + 18} L ${100 + W + 16} ${sy + 52} L ${100 + W - 2} ${sy + 38}`;
    const armL = sleeve === 'long'
      ? `L ${100 - W} ${sy + 38} L 60 148 L 34 152 L 24 74`
      : sleeve === 'none'
        ? `L ${100 - W} ${sy + 54} Q ${100 - W + 12} ${sy + 26} ${100 - W - 20} ${oy}`
        : `L ${100 - W + 2} ${sy + 38} L ${100 - W - 16} ${sy + 52} L ${100 - W - 34} ${sy + 18}`;
    const shoulderR = sleeve === 'none' ? `L ${100 + neck + 6} ${oy - 2}` : `L ${100 + neck + 14} ${oy}`;
    const shoulderL = sleeve === 'none' ? `L ${100 - neck - 6} ${oy - 2}` : `L ${100 - neck - 14} ${oy}`;
    return `M ${100 - neck} ${sy - 2} Q 100 ${sy + neckD} ${100 + neck} ${sy - 2} ${shoulderR} ${arm}
            L ${100 + W2} ${hem} L ${100 - W2} ${hem} ${armL} ${shoulderL} Z`;
  }

  /* ---- parte de baixo ---- */
  function bottom({ hem = 184, crotch = 102, WT = 44, WH = 22, gap = 12 }) {
    return `M ${100 - WT} 42 L ${100 + WT} 42 L ${100 + WT + 6} ${hem} L ${100 + gap - 2} ${hem}
            L 100 ${crotch} L ${100 - gap + 2} ${hem} L ${100 - WT - 6} ${hem} Z`;
  }

  /* ---- calçado (perfil) ---- */
  const soleP = (y = 152) => `M 26 ${y} Q 20 ${y + 14} 38 ${y + 16} L 168 ${y + 16} Q 182 ${y + 14} 178 ${y} L 176 ${y - 8} L 28 ${y - 10} Z`;

  /* --------------------------------------------------------------- peças
     Cada entrada devolve { d, details, accents } — d é a silhueta principal.
  ------------------------------------------------------------------------ */
  const P = {
    /* ============================ PARTE DE CIMA ============================ */
    camiseta: c => ({
      d: top({ sleeve: 'short' }),
      det: [`M 84 46 Q 100 63 116 46`, `M 62 162 L 138 162`]
    }),
    regata: c => ({
      d: top({ sleeve: 'none', neck: 20, neckD: 18, W: 38 }),
      det: [`M 80 44 Q 100 64 120 44`]
    }),
    camisa: c => ({
      d: top({ sleeve: 'long', hem: 176 }),
      det: [`M 100 60 L 100 176`, `M 90 168 L 110 168`, `M 140 148 L 166 152`, `M 34 152 L 60 148`],
      acc: [{ d: `M 80 40 L 100 62 L 120 40 L 126 48 L 100 74 L 74 48 Z`, o: .55 }],
      dots: [[100, 88], [100, 108], [100, 128], [100, 148]]
    }),
    polo: c => ({
      d: top({ sleeve: 'short' }),
      det: [`M 100 62 L 100 96`, `M 92 92 L 108 92`],
      acc: [{ d: `M 82 40 L 100 60 L 118 40 L 124 47 L 100 71 L 76 47 Z`, o: .55 }],
      dots: [[100, 78], [100, 90]]
    }),
    moletom: c => ({
      d: top({ sleeve: 'long', hem: 168, W: 40, W2: 42 }),
      det: [`M 60 156 L 140 156`, `M 140 148 L 166 152`, `M 34 152 L 60 148`],
      acc: [{ d: `M 78 44 Q 100 20 122 44 Q 100 66 78 44 Z`, o: .7 }],
      lines: [`M 88 66 Q 100 76 112 66`]
    }),
    trico: c => ({
      d: top({ sleeve: 'long', hem: 168 }),
      det: [`M 60 158 L 140 158`, `M 82 46 Q 100 64 118 46`,
            `M 76 80 L 76 156`, `M 100 80 L 100 156`, `M 124 80 L 124 156`]
    }),
    blusa: c => ({
      d: top({ sleeve: 'long', hem: 172, W: 36, W2: 38 }),
      det: [`M 84 46 L 100 76 L 116 46`]
    }),
    'camisa-time': c => ({
      d: top({ sleeve: 'short' }),
      det: [`M 62 162 L 138 162`],
      acc: [{ d: `M 84 46 Q 100 62 116 46 L 116 52 Q 100 68 84 52 Z`, o: 1 },
            { d: `M 146 84 L 166 70 L 172 82 L 152 96 Z`, o: 1 },
            { d: `M 54 84 L 34 70 L 28 82 L 48 96 Z`, o: 1 }],
      crest: [86, 82]
    }),

    /* ============================ PARTE DE BAIXO ============================ */
    calca: c => ({
      d: bottom({ hem: 186, crotch: 104 }),
      det: [`M 56 60 L 144 60`, `M 100 60 L 100 104`],
      acc: [{ d: `M 56 42 L 144 42 L 144 60 L 56 60 Z`, o: .35 }]
    }),
    alfaiataria: c => ({
      d: bottom({ hem: 186, crotch: 100, WT: 42, gap: 14 }),
      det: [`M 58 58 L 142 58`, `M 78 58 L 74 186`, `M 122 58 L 126 186`],
      acc: [{ d: `M 58 42 L 142 42 L 142 58 L 58 58 Z`, o: .35 }]
    }),
    jeans: c => ({
      d: bottom({ hem: 186, crotch: 104, WT: 45 }),
      det: [`M 55 62 L 145 62`, `M 100 62 L 100 104`,
            `M 62 66 Q 76 84 62 96`, `M 138 66 Q 124 84 138 96`,
            `M 58 180 L 92 180`, `M 108 180 L 142 180`],
      acc: [{ d: `M 55 42 L 145 42 L 145 62 L 55 62 Z`, o: .32 }]
    }),
    bermuda: c => ({
      d: bottom({ hem: 142, crotch: 98, WT: 44, gap: 12 }),
      det: [`M 56 60 L 144 60`, `M 100 60 L 100 98`, `M 50 132 L 90 132`, `M 110 132 L 150 132`],
      acc: [{ d: `M 56 42 L 144 42 L 144 60 L 56 60 Z`, o: .32 }]
    }),
    short: c => ({
      d: bottom({ hem: 118, crotch: 92, WT: 44, gap: 12 }),
      det: [`M 56 58 L 144 58`, `M 100 58 L 100 92`],
      acc: [{ d: `M 56 42 L 144 42 L 144 58 L 56 58 Z`, o: .32 }],
      lines: [`M 92 58 Q 100 70 108 58`]
    }),
    saia: c => ({
      d: `M 62 44 L 138 44 L 164 150 Q 100 164 36 150 Z`,
      det: [`M 62 62 L 138 62`, `M 84 62 L 74 154`, `M 116 62 L 126 154`],
      acc: [{ d: `M 62 44 L 138 44 L 138 62 L 62 62 Z`, o: .32 }]
    }),
    legging: c => ({
      d: bottom({ hem: 186, crotch: 106, WT: 38, gap: 8 }),
      det: [`M 62 58 L 138 58`, `M 100 58 L 100 106`],
      acc: [{ d: `M 62 42 L 138 42 L 138 58 L 62 58 Z`, o: .32 }]
    }),

    /* ============================ PEÇA INTEIRA ============================ */
    vestido: c => ({
      d: `M 84 46 Q 100 62 116 46 L 130 40 L 158 60 L 142 88 L 132 80 L 152 168 Q 100 182 48 168 L 68 80 L 58 88 L 42 60 L 70 40 Z`,
      det: [`M 84 46 Q 100 62 116 46`, `M 62 116 Q 100 124 138 116`]
    }),
    macacao: c => ({
      d: `M 84 40 Q 100 54 116 40 L 128 36 L 150 52 L 140 74 L 134 68 L 140 118 L 146 184 L 108 184 L 100 128 L 92 184 L 54 184 L 60 118 L 66 68 L 60 74 L 50 52 L 72 36 Z`,
      det: [`M 100 54 L 100 128`, `M 62 96 L 138 96`]
    }),
    terno: c => ({
      d: top({ sleeve: 'long', hem: 176, W: 40, W2: 42 }),
      det: [`M 100 46 L 100 176`],
      acc: [{ d: `M 82 42 L 100 46 L 100 104 L 74 72 Z`, o: .5 }, { d: `M 118 42 L 100 46 L 100 104 L 126 72 Z`, o: .5 }],
      dots: [[100, 116], [100, 134]]
    }),

    /* ============================ SOBREPOSIÇÃO ============================ */
    jaqueta: c => ({
      d: top({ sleeve: 'long', hem: 166, W: 41, W2: 43 }),
      det: [`M 100 46 L 100 166`, `M 58 156 L 142 156`, `M 140 148 L 166 152`, `M 34 152 L 60 148`],
      dots: [[100, 74], [100, 96], [100, 118], [100, 140]]
    }),
    blazer: c => ({
      d: top({ sleeve: 'long', hem: 178, W: 40, W2: 42 }),
      det: [`M 100 50 L 100 178`, `M 66 130 L 84 130`, `M 116 130 L 134 130`],
      acc: [{ d: `M 80 42 L 100 50 L 100 108 L 70 74 Z`, o: .5 }, { d: `M 120 42 L 100 50 L 100 108 L 130 74 Z`, o: .5 }]
    }),
    casaco: c => ({
      d: top({ sleeve: 'long', hem: 184, W: 43, W2: 46 }),
      det: [`M 100 48 L 100 184`, `M 68 132 L 86 132`, `M 114 132 L 132 132`],
      acc: [{ d: `M 80 42 L 100 48 L 100 100 L 72 72 Z`, o: .45 }, { d: `M 120 42 L 100 48 L 100 100 L 128 72 Z`, o: .45 }],
      dots: [[100, 116], [100, 142]]
    }),
    colete: c => ({
      d: top({ sleeve: 'none', hem: 164, neck: 18, neckD: 16 }),
      det: [`M 100 56 L 100 164`],
      dots: [[100, 86], [100, 108], [100, 130]]
    }),
    sobretudo: c => ({
      d: top({ sleeve: 'long', hem: 192, W: 44, W2: 48 }),
      det: [`M 100 48 L 100 192`, `M 68 140 L 88 140`, `M 112 140 L 132 140`],
      acc: [{ d: `M 78 42 L 100 48 L 100 106 L 70 74 Z`, o: .45 }, { d: `M 122 42 L 100 48 L 100 106 L 130 74 Z`, o: .45 }]
    }),
    'corta-vento': c => ({
      d: top({ sleeve: 'long', hem: 162, W: 42, W2: 44 }),
      det: [`M 100 46 L 100 162`, `M 56 152 L 144 152`],
      acc: [{ d: `M 78 44 Q 100 22 122 44 Q 100 64 78 44 Z`, o: .6 }, { d: `M 56 96 L 144 96 L 144 108 L 56 108 Z`, o: .5 }]
    }),

    /* ============================ CALÇADOS ============================ */
    tenis: c => ({
      d: `M 32 150 L 34 108 Q 36 92 52 88 L 74 83 Q 86 81 92 92 L 106 116
          Q 132 128 160 138 L 176 147 Q 180 151 174 153 L 38 153 Z`,
      det: [`M 72 96 L 96 108`, `M 68 110 L 100 124`, `M 66 124 L 106 138`,
            `M 146 134 Q 156 143 166 146`],
      lines: [`M 56 138 Q 96 130 134 144`],
      sole: `M 26 146 L 178 142 Q 187 144 185 155 Q 183 166 168 166 L 40 166 Q 24 166 24 156 Z`
    }),
    sapato: c => ({
      d: `M 34 150 L 36 120 Q 38 110 52 107 L 74 104 Q 88 105 98 118 L 118 134
          Q 146 144 170 148 Q 179 150 174 153 L 38 153 Z`,
      det: [`M 58 112 Q 74 118 84 126`, `M 132 140 Q 142 147 152 149`],
      sole: `M 28 148 L 176 144 Q 185 146 183 154 Q 181 162 168 162 L 42 162 Q 27 162 27 155 Z`
    }),
    mocassim: c => ({
      d: `M 32 150 L 34 122 Q 36 111 51 108 L 74 105 Q 89 106 99 119 L 120 135
          Q 147 145 171 149 Q 180 151 174 153 L 36 153 Z`,
      det: [`M 128 141 Q 139 148 149 150`],
      acc: [{ d: `M 86 114 Q 106 128 128 136 L 124 145 Q 100 137 80 122 Z`, o: .85 }],
      sole: `M 28 148 L 176 145 Q 185 147 183 155 Q 181 163 168 163 L 42 163 Q 27 163 27 156 Z`
    }),
    bota: c => ({
      d: `M 54 44 L 116 44 L 118 112 Q 122 124 140 132 Q 162 141 174 147
          Q 181 150 175 152 L 56 152 Q 46 100 54 44 Z`,
      det: [`M 55 70 L 117 70`, `M 52 98 L 118 98`, `M 140 134 Q 152 142 164 146`],
      sole: `M 44 148 L 178 145 Q 187 147 185 156 Q 183 166 168 166 L 56 166 Q 42 166 42 156 Z`
    }),
    chinelo: c => ({
      d: `M 30 132 Q 26 122 44 120 L 158 120 Q 178 122 174 136 L 172 146 L 32 146 Z`,
      det: [],
      acc: [{ d: `M 56 122 Q 100 86 144 122 L 134 130 Q 100 102 66 130 Z`, o: 1 }],
      sole: `M 26 144 Q 22 158 40 160 L 164 160 Q 182 158 178 144 Z`
    }),
    sandalia: c => ({
      d: `M 30 134 Q 26 124 44 122 L 158 122 Q 178 124 174 138 L 172 146 L 32 146 Z`,
      det: [],
      acc: [{ d: `M 52 122 Q 96 92 136 116 L 128 126 Q 96 106 62 130 Z`, o: 1 },
            { d: `M 44 104 L 152 104 L 152 113 L 44 113 Z`, o: .85 }],
      sole: `M 26 144 Q 22 158 40 160 L 164 160 Q 182 158 178 144 Z`
    }),

    /* ============================ BOLSAS ============================ */
    mochila: c => ({
      d: `M 58 74 Q 58 58 76 58 L 124 58 Q 142 58 142 74 L 146 158 Q 146 170 132 170 L 68 170 Q 54 170 54 158 Z`,
      det: [`M 60 120 L 140 120`, `M 72 58 Q 72 40 100 40 Q 128 40 128 58`],
      acc: [{ d: `M 68 128 L 132 128 L 134 158 L 66 158 Z`, o: .45 }],
      lines: [`M 78 138 L 122 138`]
    }),
    shoulder: c => ({
      d: `M 50 92 L 150 92 L 154 156 Q 154 166 142 166 L 58 166 Q 46 166 46 156 Z`,
      det: [`M 46 116 L 154 116`],
      lines: [`M 56 92 Q 60 44 100 44 Q 140 44 144 92`]
    }),
    bolsa: c => ({
      d: `M 54 96 L 146 96 L 152 158 Q 152 168 140 168 L 60 168 Q 48 168 48 158 Z`,
      det: [`M 90 96 L 90 112`, `M 110 96 L 110 112`],
      lines: [`M 72 96 Q 74 52 100 52 Q 126 52 128 96`],
      acc: [{ d: `M 92 112 L 108 112 L 108 124 L 92 124 Z`, o: .8 }]
    }),
    tote: c => ({
      d: `M 58 82 L 142 82 L 152 168 L 48 168 Z`,
      det: [],
      lines: [`M 74 82 Q 76 46 100 46 Q 124 46 126 82`],
      acc: [{ d: `M 58 82 L 142 82 L 144 96 L 56 96 Z`, o: .3 }]
    }),
    pochete: c => ({
      d: `M 52 106 Q 52 94 66 94 L 134 94 Q 148 94 148 106 L 150 142 Q 150 154 136 154 L 64 154 Q 50 154 50 142 Z`,
      det: [`M 52 122 L 148 122`],
      lines: [`M 50 110 L 24 118`, `M 150 110 L 176 118`]
    }),

    /* ============================ ACESSÓRIOS ============================ */
    oculos: c => ({
      d: `M 30 90 L 92 90 L 92 98 Q 92 122 70 122 Q 46 122 42 102 L 30 98 Z
          M 170 90 L 108 90 L 108 98 Q 108 122 130 122 Q 154 122 158 102 L 170 98 Z`,
      det: [`M 92 94 L 108 94`],
      lines: [`M 30 92 L 14 104`, `M 170 92 L 186 104`]
    }),
    bone: c => ({
      d: `M 60 116 Q 60 62 100 62 Q 140 62 140 116 Z`,
      det: [`M 100 62 L 100 116`, `M 78 68 Q 84 92 82 116`, `M 122 68 Q 116 92 118 116`],
      acc: [{ d: `M 58 116 L 176 116 Q 182 130 168 132 L 58 130 Z`, o: .8 }]
    }),
    chapeu: c => ({
      d: `M 66 118 Q 66 66 100 66 Q 134 66 134 118 Z`,
      det: [],
      acc: [{ d: `M 24 118 Q 100 104 176 118 Q 100 140 24 118 Z`, o: .85 },
            { d: `M 66 106 L 134 106 L 134 118 L 66 118 Z`, o: 1 }]
    }),
    cinto: c => ({
      d: `M 18 88 L 150 88 Q 156 88 156 96 L 156 112 Q 156 120 150 120 L 18 120 Q 12 120 12 112 L 12 96 Q 12 88 18 88 Z`,
      det: [],
      acc: [{ d: `M 150 82 L 188 82 L 188 126 L 150 126 Z M 160 92 L 178 92 L 178 116 L 160 116 Z`, o: .9, evenodd: 1 }],
      dots: [[40, 104], [62, 104], [84, 104]]
    }),
    relogio: c => ({
      d: `M 76 62 L 124 62 L 120 84 L 80 84 Z M 80 130 L 120 130 L 124 156 L 76 156 Z`,
      det: [],
      acc: [{ d: `M 100 62 m -38 45 a 38 38 0 1 0 76 0 a 38 38 0 1 0 -76 0`, o: .95 }],
      ring: [100, 107, 38]
    }),
    colar: c => ({
      d: `M 46 56 Q 46 140 100 152 Q 154 140 154 56 L 146 56 Q 146 132 100 143 Q 54 132 54 56 Z`,
      det: [],
      acc: [{ d: `M 100 150 m -13 0 a 13 13 0 1 0 26 0 a 13 13 0 1 0 -26 0`, o: .95 }]
    }),
    cachecol: c => ({
      d: `M 66 34 Q 96 60 96 100 L 96 168 L 62 168 L 62 100 Q 62 62 40 40 Z
          M 134 34 Q 104 60 104 100 L 104 168 L 138 168 L 138 100 Q 138 62 160 40 Z`,
      det: [`M 62 152 L 96 152`, `M 104 152 L 138 152`]
    }),
    meia: c => ({
      d: `M 56 46 L 92 46 L 92 118 Q 92 138 68 142 Q 44 146 40 128 Q 38 112 56 106 Z
          M 108 46 L 144 46 L 160 106 Q 178 112 176 128 Q 172 146 148 142 Q 124 138 124 118 L 108 46 Z`,
      det: [`M 56 62 L 92 62`, `M 108 62 L 144 62`]
    }),
    outro: c => ({
      d: `M 54 58 L 146 58 Q 154 58 154 68 L 154 152 Q 154 162 146 162 L 54 162 Q 46 162 46 152 L 46 68 Q 46 58 54 58 Z`,
      det: [`M 46 84 L 154 84`]
    })
  };

  /* ------------------------------------------------------------ padronagem */
  function patternLayer(pattern, acc) {
    if (pattern === 'listrado')
      return [40, 60, 80, 100, 120, 140, 160, 180].map(y =>
        `<rect x="0" y="${y}" width="200" height="9" fill="${acc}" opacity=".55"/>`).join('');
    if (pattern === 'xadrez')
      return [30, 60, 90, 120, 150, 180].map(v =>
        `<rect x="0" y="${v}" width="200" height="6" fill="${acc}" opacity=".4"/>` +
        `<rect x="${v}" y="0" width="6" height="200" fill="${acc}" opacity=".4"/>`).join('');
    if (pattern === 'estampado') {
      let o = '';
      for (let y = 26; y < 200; y += 26)
        for (let x = (y / 26) % 2 ? 20 : 33; x < 200; x += 26)
          o += `<circle cx="${x}" cy="${y}" r="5" fill="${acc}" opacity=".5"/>`;
      return o;
    }
    return '';
  }

  /* ---------------------------------------------------------------- render */
  function svg(catId, colors, pattern = 'liso') {
    const spec = (P[catId] || P.outro)();
    const base = colors?.[0]?.hex || '#8a8d92';
    const second = colors?.[1];
    const acc = second && second.ratio > .14 ? second.hex
      : (lum(base) < .5 ? tint(base, .3) : shade(base, .25));
    const ink = edge(base);
    const id = Math.random().toString(36).slice(2, 8);

    const parts = [];
    // silhueta
    parts.push(`<path d="${spec.d}" fill="url(#g${id})" stroke="${ink}" stroke-width="2.6"
                 stroke-linejoin="round" stroke-linecap="round" fill-rule="evenodd"/>`);
    // padronagem recortada pela silhueta
    const pat = patternLayer(pattern, acc);
    if (pat) parts.push(`<g clip-path="url(#c${id})">${pat}</g>`);
    // acentos (golas, solados, fivelas…)
    for (const a of (spec.acc || []))
      parts.push(`<path d="${a.d}" fill="${acc}" opacity="${a.o ?? 1}" stroke="${ink}"
                   stroke-width="1.8" stroke-linejoin="round" ${a.evenodd ? 'fill-rule="evenodd"' : ''}/>`);
    if (spec.sole)
      parts.push(`<path d="${spec.sole}" fill="${acc}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>`);
    if (spec.ring)
      parts.push(`<circle cx="${spec.ring[0]}" cy="${spec.ring[1]}" r="${spec.ring[2] - 8}"
                   fill="none" stroke="${ink}" stroke-width="2"/>`);
    if (spec.crest)
      parts.push(`<circle cx="${spec.crest[0]}" cy="${spec.crest[1]}" r="9" fill="${acc}" stroke="${ink}" stroke-width="1.6"/>`);
    // costuras
    for (const d of (spec.det || []))
      parts.push(`<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round" opacity=".85"/>`);
    for (const d of (spec.lines || []))
      parts.push(`<path d="${d}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`);
    for (const [x, y] of (spec.dots || []))
      parts.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${ink}" opacity=".9"/>`);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <defs>
        <linearGradient id="g${id}" x1="0" y1="0" x2=".45" y2="1">
          <stop offset="0" stop-color="${tint(base, .12)}"/>
          <stop offset=".55" stop-color="${base}"/>
          <stop offset="1" stop-color="${shade(base, .16)}"/>
        </linearGradient>
        <clipPath id="c${id}"><path d="${spec.d}" fill-rule="evenodd"/></clipPath>
      </defs>
      ${parts.join('')}
    </svg>`;
  }

  /* SVG → canvas, para virar blob e ser guardado igual a uma foto */
  function toCanvas(catId, colors, pattern, size = 512) {
    const markup = svg(catId, colors, pattern);
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, size, size);
        res(c);
      };
      img.onerror = rej;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    });
  }

  return { svg, toCanvas, mix, shade, tint, edge, lum, has: id => !!P[id] };
})();

window.Art = Art;
