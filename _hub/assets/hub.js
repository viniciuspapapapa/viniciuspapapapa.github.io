/* Utilidades comuns do HUB: tema, toast e escape de HTML. */
(function () {
  "use strict";
  const CHAVE = "hub_tema";
  function aplicar(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  try { aplicar(localStorage.getItem(CHAVE)); } catch (e) { /* armazenamento indisponível */ }
  function atual() {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  window.HUB = {
    alternarTema() {
      const novo = atual() === "dark" ? "light" : "dark";
      aplicar(novo);
      try { localStorage.setItem(CHAVE, novo); } catch (e) { /* ignora */ }
      document.querySelectorAll("[data-tema-icone]").forEach(el => el.textContent = novo === "dark" ? "☀" : "☾");
    },
    iconeTema() { return atual() === "dark" ? "☀" : "☾"; },
    esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },
    sair() {
      try { sessionStorage.removeItem("hub_chave"); localStorage.removeItem("hub_chave"); } catch (e) { /* ignora */ }
      location.href = "/hub/login/";
    },
    toast(msg, ms) {
      let el = document.getElementById("hub-toast");
      if (!el) { el = document.createElement("div"); el.id = "hub-toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
      el.textContent = msg; el.classList.add("on");
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), ms || 2600);
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-tema-icone]").forEach(el => el.textContent = window.HUB.iconeTema());
  });

  /* O login guarda a senha com o usuário fixo "HUB Criminal TPC". Nos navegadores que salvaram a senha, o
     preenchimento automático cola esse usuário no primeiro campo de texto das páginas (por exemplo, a busca da
     ferramenta de PDF, que deixava de listar as ferramentas). Aqui os campos recusam o preenchimento e, se o
     navegador insistir, o valor é apagado e o campo avisa a página da mudança. */
  const USUARIO_LOGIN = "HUB Criminal TPC";
  function limparAutofill() {
    if (/\/login\/?$/.test(location.pathname)) return;
    document.querySelectorAll('input:not([type]), input[type="text"], input[type="search"], input[type="email"]').forEach(el => {
      if (!el.hasAttribute("autocomplete")) el.setAttribute("autocomplete", "off");
      if (el.value.trim() === USUARIO_LOGIN) {
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
  const vigiarAutofill = () => { limparAutofill(); [150, 600, 1500, 3000].forEach(ms => setTimeout(limparAutofill, ms)); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vigiarAutofill); else vigiarAutofill();
  window.addEventListener("pageshow", vigiarAutofill);
  document.addEventListener("input", e => { const el = e.target; if (el && el.tagName === "INPUT" && el.type !== "password" && el.value.trim() === USUARIO_LOGIN) setTimeout(limparAutofill, 0); }, true);
})();
