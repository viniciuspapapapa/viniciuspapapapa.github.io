/* MD5 (RFC 1321) sobre Uint8Array, usado apenas para conferir o código de controle dos arquivos do COAF. */
(function (root) {
  "use strict";
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  function md5(bytes) {
    const n = bytes.length, blocos = ((n + 8) >>> 6) + 1, w = new Int32Array(blocos * 16);
    for (let i = 0; i < n; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
    w[n >> 2] |= 0x80 << ((n % 4) * 8);
    w[blocos * 16 - 2] = (n * 8) | 0; w[blocos * 16 - 1] = Math.floor(n / 536870912) | 0;
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let o = 0; o < w.length; o += 16) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const t = D; D = C; C = B;
        const x = (A + F + K[i] + w[o + g]) | 0;
        B = (B + ((x << S[i]) | (x >>> (32 - S[i])))) | 0; A = t;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    let h = "";
    for (const v of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) h += ((v >>> (i * 8)) & 255).toString(16).padStart(2, "0");
    return h;
  }
  root.CC_MD5 = md5;
})(typeof window !== "undefined" ? window : globalThis);
