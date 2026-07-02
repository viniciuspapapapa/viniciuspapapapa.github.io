/* =========================================================================
   SABOR — app de receitas (100% offline, localStorage)
   ========================================================================= */

const ST = {
  load(k,d){try{const v=JSON.parse(localStorage.getItem('sabor_'+k));return v===null||v===undefined?d:v}catch(e){return d}},
  save(k,v){localStorage.setItem('sabor_'+k, JSON.stringify(v))}
};

let favoritos = ST.load('fav', []);          // array de ids
let planner   = ST.load('planner', {});      // {dia:{mealKey:recipeId}}
let compras   = ST.load('compras', []);      // [{t,done}]
let filt = {ref:'all', dif:'all', tag:'all'};
const DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

const R = id => RECIPES.find(r=>r.id===id);
const persistFav = ()=>ST.save('fav', favoritos);
const persistPlanner = ()=>ST.save('planner', planner);
const persistCompras = ()=>ST.save('compras', compras);

/* =========================================================================
   NAVEGAÇÃO
   ========================================================================= */
function go(v){
  document.querySelectorAll(".view").forEach(s=>s.classList.remove("active"));
  document.getElementById("view-"+v).classList.add("active");
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  window.scrollTo(0,0);
  if(v==="home")renderHome();
  if(v==="receitas")renderReceitas();
  if(v==="planner")renderPlanner();
  if(v==="compras")renderCompras();
  if(v==="mais")renderMais();
}

function openSheet(html){document.getElementById("sheet").innerHTML=`<div class="grip"></div>`+html;document.getElementById("overlay").classList.add("show");}
function closeSheet(){document.getElementById("overlay").classList.remove("show");clearInterval(kTimer);}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),2200);}

/* =========================================================================
   HELPERS
   ========================================================================= */
function tagChip(t){return `<span class="tag">${TAGL[t]||t}</span>`}
function difChip(dif){return `<span class="tag ${dif}">${DIFS[dif].l}</span>`}
function currentMealSuggestion(){
  const h = new Date().getHours();
  if(h>=6 && h<10) return 'cafe';
  if(h>=10 && h<11.5) return 'lancheM';
  if(h>=11.5 && h<15) return 'almoco';
  if(h>=15 && h<18) return 'lancheT';
  if(h>=18 && h<21) return 'jantar';
  return 'ceia';
}
function greeting(){
  const h = new Date().getHours();
  if(h<12) return 'Bom dia! ☀️';
  if(h<18) return 'Boa tarde! 🌤️';
  return 'Boa noite! 🌙';
}
function scaleIng(text, factor){
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
  if(!m || factor===1) return text;
  let num = parseFloat(m[1].replace(',','.'));
  let out = Math.round(num*factor*100)/100;
  let str = Number.isInteger(out) ? String(out) : out.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  str = str.replace('.',',');
  return `${str} ${m[2]}`;
}
function recMatchesFilters(rc, q){
  if(filt.ref!=='all' && !rc.ref.includes(filt.ref)) return false;
  if(filt.dif!=='all' && rc.dif!==filt.dif) return false;
  if(filt.tag!=='all' && !rc.tags.includes(filt.tag)) return false;
  if(q){
    const hay = (rc.nome+' '+rc.ing.join(' ')+' '+rc.tags.map(t=>TAGL[t]||t).join(' ')).toLowerCase();
    if(!hay.includes(q.toLowerCase())) return false;
  }
  return true;
}

/* =========================================================================
   RECIPE CARD RENDER
   ========================================================================= */
function recItemHtml(rc){
  const fav = favoritos.includes(rc.id);
  return `<div class="rec-item" onclick="openRecipe('${rc.id}')">
    <div class="rec-thumb">${rc.emoji}</div>
    <div class="meta">
      <h4>${rc.nome}</h4>
      <div class="tags">
        ${difChip(rc.dif)}
        <span class="tag">⏱ ${rc.min} min</span>
        <span class="tag kcal">${rc.kcal} kcal</span>
      </div>
    </div>
    <button class="rec-fav ${fav?'on':''}" onclick="event.stopPropagation();toggleFav('${rc.id}')">${fav?'❤️':'🤍'}</button>
  </div>`;
}

/* =========================================================================
   HOME
   ========================================================================= */
function renderHome(){
  document.getElementById("favNum").textContent = favoritos.length;
  document.getElementById("heroTitle").textContent = greeting();
  const sug = currentMealSuggestion();
  document.getElementById("heroSub").textContent = `Que tal algo para o(a) ${CATS.find(c=>c.k===sug).l.toLowerCase()} agora?`;
  document.getElementById("heroBtn").onclick = ()=>{filt.ref=sug;filt.dif='all';filt.tag='all';go('receitas');};
  document.getElementById("heroBtn").textContent = `🍽️ Sugestões para agora`;

  document.getElementById("stTotal").textContent = RECIPES.length;
  document.getElementById("stFav").textContent = favoritos.length;
  const planned = Object.values(planner).reduce((s,d)=>s+Object.values(d).filter(Boolean).length,0);
  document.getElementById("stPlan").textContent = planned;

  document.getElementById("homeCats").innerHTML = CATS.map(c=>
    `<button class="chip" onclick="filt.ref='${c.k}';filt.dif='all';filt.tag='all';go('receitas')">${c.ic} ${c.l}</button>`
  ).join('');

  const dayIdx = Math.floor(Date.now()/86400000) % RECIPES.length;
  const rod = RECIPES[dayIdx];
  document.getElementById("rodCard").innerHTML = `
    <div class="rod" onclick="openRecipe('${rod.id}')">
      <div class="rod-emoji">${rod.emoji}</div>
      <div class="info">
        <h3>${rod.nome}</h3>
        <p>${difChip(rod.dif)} · ⏱ ${rod.min} min · ${rod.kcal} kcal</p>
      </div>
    </div>`;

  const favWrap = document.getElementById("favSection");
  if(favoritos.length){
    favWrap.innerHTML = `<div class="section-title"><h2>Favoritas</h2><span class="swap-x" onclick="go('mais')">Ver todas →</span></div>
      <div class="strip">${favoritos.slice(0,8).map(id=>R(id)).filter(Boolean).map(recItemHtml).join('')}</div>`;
  } else {
    favWrap.innerHTML = '';
  }
}

function randomRecipe(){
  const rc = RECIPES[Math.floor(Math.random()*RECIPES.length)];
  openRecipe(rc.id);
}

/* =========================================================================
   RECEITAS (busca/filtro)
   ========================================================================= */
function renderReceitas(){
  document.getElementById("chipsRef").innerHTML = ['all',...CATS.map(c=>c.k)].map(k=>{
    const c = CATS.find(c=>c.k===k);
    const label = k==='all' ? 'Todas' : `${c.ic} ${c.l}`;
    return `<button class="chip ${filt.ref===k?'on':''}" onclick="filt.ref='${k}';renderReceitas()">${label}</button>`;
  }).join('');

  document.getElementById("chipsDif").innerHTML = ['all',...Object.keys(DIFS)].map(k=>{
    const label = k==='all' ? 'Todas' : DIFS[k].l;
    return `<button class="chip ${filt.dif===k?'on':''}" onclick="filt.dif='${k}';renderReceitas()">${label}</button>`;
  }).join('');

  document.getElementById("chipsTag").innerHTML = ['all',...TAG_FILTERS].map(k=>{
    const label = k==='all' ? 'Todas' : (TAGL[k]||k);
    return `<button class="chip ${filt.tag===k?'on':''}" onclick="filt.tag='${k}';renderReceitas()">${label}</button>`;
  }).join('');

  const q = document.getElementById("recSearch").value.trim();
  const results = RECIPES.filter(rc=>recMatchesFilters(rc,q));
  document.getElementById("recCount").textContent = `${results.length} receita${results.length===1?'':'s'}`;
  const list = document.getElementById("recList");
  if(!results.length){
    list.innerHTML = `<div class="empty"><div class="big">🍽️</div><h3>Nenhuma receita encontrada</h3><p>Tente ajustar a busca ou os filtros.</p></div>`;
    return;
  }
  list.innerHTML = results.map(recItemHtml).join('');
}

function toggleFav(id){
  const i = favoritos.indexOf(id);
  if(i>=0) favoritos.splice(i,1); else favoritos.push(id);
  persistFav();
  document.getElementById('favNum').textContent = favoritos.length;
  renderReceitas();
  const btn = document.getElementById('detailFav');
  if(btn){const on=favoritos.includes(id);btn.classList.toggle('on',on);btn.textContent=on?'❤️ Favoritada':'🤍 Favoritar';}
  if(document.getElementById('view-home').classList.contains('active')) renderHome();
  if(document.getElementById('view-mais').classList.contains('active')) renderMais();
}

/* =========================================================================
   DETALHE DA RECEITA
   ========================================================================= */
let curServ = {}; // multiplicador de porções por receita (sessão)
function openRecipe(id){
  const rc = R(id); if(!rc) return;
  if(!(id in curServ)) curServ[id] = rc.porc;
  renderRecipeSheet(id);
}
function renderRecipeSheet(id){
  const rc = R(id);
  const mult = curServ[id] / rc.porc;
  const fav = favoritos.includes(id);
  openSheet(`
    <div class="rd-hero">${rc.emoji}</div>
    <h3>${rc.nome}</h3>
    <div class="rd-meta">
      ${difChip(rc.dif)}
      <span class="tag">⏱ ${rc.min} min</span>
      <span class="tag kcal">${rc.kcal} kcal/porção</span>
      ${rc.tags.map(tagChip).join('')}
    </div>
    <div class="rd-serv">
      <span style="font-weight:800;font-size:13px;color:var(--mut);text-transform:uppercase">Porções</span>
      <div class="stepper">
        <button class="stepbtn" onclick="changeServ('${id}',-1)">−</button>
        <span style="font-weight:900;font-size:16px;min-width:20px;text-align:center">${curServ[id]}</span>
        <button class="stepbtn" onclick="changeServ('${id}',1)">+</button>
      </div>
    </div>
    <button class="btn block ${fav?'alt':''}" id="detailFav" onclick="toggleFav('${id}')">${fav?'❤️ Favoritada':'🤍 Favoritar'}</button>
    <div class="list-head">Ingredientes</div>
    <div id="ingList">${rc.ing.map((t,i)=>`
      <div class="ing-row" id="ingr-${i}">
        <div class="ing-check" onclick="toggleIng(${i})">✓</div>
        <span>${scaleIng(t,mult)}</span>
      </div>`).join('')}</div>
    <div class="list-head">Modo de preparo</div>
    <div>${rc.modo.map((s,i)=>`
      <div class="step-item"><div class="step-n">${i+1}</div><p>${s}</p></div>`).join('')}</div>
    ${rc.dica ? `<div class="dica-box">💡 <b>Dica:</b> ${rc.dica}</div>` : ''}
    <button class="btn alt block" style="margin-top:16px" onclick="startCookMode('${id}')">▶ Iniciar modo cozinha</button>
  `);
}
function changeServ(id,d){
  curServ[id] = Math.max(1, curServ[id]+d);
  renderRecipeSheet(id);
}
function toggleIng(i){
  const el = document.getElementById('ingr-'+i);
  if(el){el.classList.toggle('done');const c=el.querySelector('.ing-check');c.classList.toggle('on');}
}

/* modo cozinha: passo a passo */
let cookState = {id:null, step:0};
function startCookMode(id){
  cookState = {id, step:0};
  renderCookMode();
}
function renderCookMode(){
  const rc = R(cookState.id);
  const total = rc.modo.length;
  const i = cookState.step;
  const pct = Math.round(((i+1)/total)*100);
  openSheet(`
    <h3 style="text-align:center">${rc.emoji} ${rc.nome}</h3>
    <div class="cook-wrap">
      <div class="cook-count">Passo ${i+1} de ${total}</div>
      <div class="progress-bar"><i style="width:${pct}%"></i></div>
      <div class="cook-text">${rc.modo[i]}</div>
      <div class="cook-nav">
        <button class="btn ghost block" onclick="cookPrev()" ${i===0?'style="opacity:.4;pointer-events:none"':''}>← Anterior</button>
        ${i===total-1
          ? `<button class="btn green block" onclick="closeSheet();toast('Receita concluída! Bom apetite 🍽️')">✓ Concluir</button>`
          : `<button class="btn block" onclick="cookNext()">Próximo →</button>`}
      </div>
      <button class="pill" style="margin-top:14px" onclick="startKitchenTimer(300)">⏱ Timer 5 min para este passo</button>
    </div>
  `);
}
function cookNext(){cookState.step++;renderCookMode();}
function cookPrev(){cookState.step=Math.max(0,cookState.step-1);renderCookMode();}

/* =========================================================================
   TIMER DE COZINHA
   ========================================================================= */
let kTimer = null;
function startKitchenTimer(sec){
  let left = sec, total = sec;
  const R_ = 44, C = 2*Math.PI*R_;
  openSheet(`
    <h3 style="text-align:center">Timer de cozinha</h3>
    <div class="timer-wrap">
      <div class="timer-ring">
        <svg width="200" height="200" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="${R_}" stroke="#2a2016" stroke-width="7" fill="none"/>
          <circle id="ringFg" cx="50" cy="50" r="${R_}" stroke="url(#tg1)" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0"/>
          <defs><linearGradient id="tg1"><stop offset="0" stop-color="#ff6b35"/><stop offset="1" stop-color="#ffb400"/></linearGradient></defs>
        </svg>
        <div class="num" id="kNum">${fmtTime(left)}</div>
      </div>
      <div class="pill-row">
        <button class="pill" onclick="addKTime(-30)">−30s</button>
        <button class="pill" id="kPause" onclick="toggleKPause()">⏸ Pausar</button>
        <button class="pill" onclick="addKTime(30)">+30s</button>
      </div>
      <button class="btn block" onclick="closeSheet()">Fechar</button>
    </div>
  `);
  clearInterval(kTimer);
  let paused = false;
  const ring = document.getElementById("ringFg");
  kTimer = setInterval(()=>{
    if(paused) return;
    left--;
    const num = document.getElementById("kNum");
    if(!num){clearInterval(kTimer);return;}
    num.textContent = fmtTime(Math.max(0,left));
    if(ring) ring.style.strokeDashoffset = C*(1-left/total);
    if(left<=0){clearInterval(kTimer);kBeep();}
  },1000);
  window._kPauseToggle = ()=>{
    paused = !paused;
    const btn = document.getElementById('kPause');
    if(btn) btn.textContent = paused ? '▶ Retomar' : '⏸ Pausar';
  };
  window._kAdd = (d)=>{left=Math.max(0,left+d);total=Math.max(total,left);const num=document.getElementById("kNum");if(num)num.textContent=fmtTime(left);};
}
function toggleKPause(){window._kPauseToggle && window._kPauseToggle();}
function addKTime(d){window._kAdd && window._kAdd(d);}
function fmtTime(s){return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function kBeep(){try{const a=new(window.AudioContext||window.webkitAudioContext)();const o=a.createOscillator();const g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;o.start();g.gain.setValueAtTime(.2,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.6);o.stop(a.currentTime+.6);}catch(e){}if(navigator.vibrate)navigator.vibrate([200,100,200]);toast('⏱ Tempo finalizado!');}

/* =========================================================================
   PLANEJADOR SEMANAL
   ========================================================================= */
function renderPlanner(){
  const wrap = document.getElementById("plannerDays");
  wrap.innerHTML = DAYS.map(day=>{
    if(!planner[day]) planner[day] = {};
    return `<div class="day-block card">
      <h3>${day}</h3>
      ${CATS.map(c=>{
        const rid = planner[day][c.k];
        const rc = rid ? R(rid) : null;
        return `<div class="meal-slot" onclick="pickMeal('${day}','${c.k}')">
          <div class="ic">${c.ic}</div>
          <div class="lbl">${c.l}</div>
          <div class="val ${rc?'':'empty'}">${rc ? rc.nome : '+ Adicionar receita'}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}
function pickMeal(day, mealKey){
  const cat = CATS.find(c=>c.k===mealKey);
  const options = RECIPES.filter(rc=>rc.ref.includes(mealKey));
  const current = planner[day] && planner[day][mealKey];
  openSheet(`
    <h3>${cat.ic} ${cat.l} — ${day}</h3>
    <p class="note" style="margin-bottom:12px">Escolha uma receita para este horário.</p>
    ${current ? `<button class="btn ghost block" style="color:#ff6b8a;margin-bottom:12px" onclick="removeMeal('${day}','${mealKey}')">🗑 Remover receita atual</button>` : ''}
    <div>${options.map(rc=>`
      <div class="rec-item" onclick="assignMeal('${day}','${mealKey}','${rc.id}')">
        <div class="rec-thumb">${rc.emoji}</div>
        <div class="meta"><h4>${rc.nome}</h4><div class="tags">${difChip(rc.dif)}<span class="tag">⏱ ${rc.min} min</span></div></div>
      </div>`).join('')}</div>
  `);
}
function assignMeal(day, mealKey, id){
  if(!planner[day]) planner[day] = {};
  planner[day][mealKey] = id;
  persistPlanner();
  closeSheet();
  renderPlanner();
  toast('Receita adicionada ao planejador');
}
function removeMeal(day, mealKey){
  if(planner[day]) delete planner[day][mealKey];
  persistPlanner();
  closeSheet();
  renderPlanner();
}
function clearPlanner(){
  if(!confirm('Limpar todo o planejador da semana?')) return;
  planner = {};
  persistPlanner();
  renderPlanner();
  toast('Planejador limpo');
}
function generateFromPlanner(){
  let added = 0;
  Object.entries(planner).forEach(([day,meals])=>{
    Object.values(meals).forEach(rid=>{
      if(!rid) return;
      const rc = R(rid); if(!rc) return;
      rc.ing.forEach(ingText=>{
        const label = `${ingText} — ${rc.nome}`;
        if(!compras.some(it=>it.t===label)){
          compras.push({t:label, done:false});
          added++;
        }
      });
    });
  });
  persistCompras();
  toast(added ? `${added} itens adicionados à lista` : 'Nenhum item novo (planeje refeições primeiro)');
  go('compras');
}

/* =========================================================================
   LISTA DE COMPRAS
   ========================================================================= */
function renderCompras(){
  document.getElementById("buyCount").textContent = `${compras.length} item${compras.length===1?'':'s'}`;
  const list = document.getElementById("buyList");
  if(!compras.length){
    list.innerHTML = `<div class="empty"><div class="big">🛒</div><h3>Lista vazia</h3><p>Adicione itens manualmente ou gere a partir do planejador semanal.</p></div>`;
    return;
  }
  list.innerHTML = compras.map((it,i)=>`
    <div class="buy-row ${it.done?'done':''}">
      <div class="ing-check ${it.done?'on':''}" onclick="toggleBuy(${i})">✓</div>
      <span class="buy-txt">${it.t}</span>
      <button class="buy-x" onclick="removeBuy(${i})">×</button>
    </div>`).join('');
}
function addBuyItem(){
  const inp = document.getElementById("buyInput");
  const v = inp.value.trim();
  if(!v) return;
  compras.push({t:v, done:false});
  inp.value = '';
  persistCompras();
  renderCompras();
}
function toggleBuy(i){compras[i].done = !compras[i].done;persistCompras();renderCompras();}
function removeBuy(i){compras.splice(i,1);persistCompras();renderCompras();}
function clearBoughtItems(){compras = compras.filter(it=>!it.done);persistCompras();renderCompras();}
function clearAllBuy(){
  if(!compras.length) return;
  if(!confirm('Limpar toda a lista de compras?')) return;
  compras = [];persistCompras();renderCompras();
}

/* =========================================================================
   MAIS (favoritas, técnicas, conversor, backup)
   ========================================================================= */
function renderMais(){
  const list = document.getElementById("favList");
  if(!favoritos.length){
    list.innerHTML = `<div class="empty" style="padding:24px 20px"><div class="big">🤍</div><p>Você ainda não favoritou nenhuma receita.</p></div>`;
  } else {
    list.innerHTML = favoritos.map(id=>R(id)).filter(Boolean).map(recItemHtml).join('');
  }
  populateConv();
}
function populateConv(){
  const sel = document.getElementById("convIng");
  if(sel.options.length) { calcConv(); return; }
  sel.innerHTML = Object.keys(CONV).map(k=>`<option value="${k}">${k}</option>`).join('');
  calcConv();
}
function calcConv(){
  const ing = document.getElementById("convIng").value;
  const un = document.getElementById("convUn").value;
  const qtd = parseFloat((document.getElementById("convQtd").value||'0').replace(',','.')) || 0;
  const g = (CONV[ing] && CONV[ing][un] || 0) * qtd;
  document.getElementById("convOut").textContent = `${Math.round(g*10)/10} g`;
}

/* =========================================================================
   BACKUP
   ========================================================================= */
function exportData(){
  const blob = new Blob([JSON.stringify({favoritos, planner, compras}, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sabor-backup.json";
  a.click();
  toast("Backup exportado");
}
function importData(ev){
  const file = ev.target.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const d = JSON.parse(r.result);
      if(d.favoritos) favoritos = d.favoritos;
      if(d.planner) planner = d.planner;
      if(d.compras) compras = d.compras;
      persistFav();persistPlanner();persistCompras();
      go('home');
      toast("Backup importado ✓");
    }catch(e){toast("Arquivo inválido")}
  };
  r.readAsText(file);
}

/* =========================================================================
   INIT
   ========================================================================= */
renderHome();
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw-receitas.js').catch(()=>{});}
