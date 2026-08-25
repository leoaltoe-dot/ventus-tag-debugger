let events=[];let liveFilter='ALL';let selectedEventId=null;let selectedDetailTab='summary';let selectedSite=null;
const IMPORTANT_KEYS=new Set(['event','event_name','transaction_id','value','currency','item_id','item_name','item_brand','item_category','item_variant','source','medium','campaign','utm_source','utm_medium','utm_campaign','gclid','client_id','user_id','id','ev','tid','en']);
function load(){chrome.runtime.sendMessage({type:'VENTUS_GET_EVENTS'},r=>{events=Array.isArray(r?.events)?r.events.filter(Boolean):[];if(selectedEventId&&!events.some(e=>e.id===selectedEventId))selectedEventId=null;renderAll();});}load();
chrome.runtime.onMessage.addListener(m=>{if(!m)return;if(m.type==='VENTUS_NEW_EVENT'&&m.payload){events.push(m.payload);renderAll();}if(m.type==='VENTUS_REFRESH')load();});
document.querySelectorAll('.mainTab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.mainTab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));btn.classList.add('active');document.getElementById(btn.dataset.view).classList.add('active');}));
document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));btn.classList.add('active');liveFilter=btn.dataset.filter;renderLive();}));
document.getElementById('searchLive').addEventListener('input',renderLive);document.getElementById('searchDL').addEventListener('input',renderDL);document.getElementById('searchSite').addEventListener('input',renderHistory);
document.getElementById('clear').addEventListener('click',()=>chrome.runtime.sendMessage({type:'VENTUS_CLEAR_EVENTS'},()=>{events=[];selectedEventId=null;selectedSite=null;renderAll();}));
document.getElementById('clearSite').addEventListener('click',()=>{if(!selectedSite)return;chrome.runtime.sendMessage({type:'VENTUS_CLEAR_SITE',siteHost:selectedSite},()=>{events=events.filter(e=>e.siteHost!==selectedSite);selectedSite=null;renderAll();});});
function renderAll(){renderStats();renderLive();renderDL();renderHistory();}
function renderStats(){const n=events.filter(e=>e.type==='network');const c={total:n.length,ga4:n.filter(e=>e.platform==='GA4').length,meta:n.filter(e=>e.platform==='Meta').length,ads:n.filter(e=>e.platform==='Google Ads').length};const other=Math.max(0,c.total-c.ga4-c.meta-c.ads);document.getElementById('stats').innerHTML=stat(c.total,'Eventos','')+stat(c.ga4,'GA4','ga4')+stat(c.meta,'Meta','meta')+stat(c.ads,'Google Ads','ads')+stat(other,'Outros','');}
function stat(v,l,c){return `<div class="stat ${c}"><div class="v">${v}</div><div class="l">${l}</div></div>`;}
function renderLive(){const q=document.getElementById('searchLive').value.trim().toLowerCase();const list=events.filter(e=>e.type==='network').filter(e=>liveFilter==='ALL'||e.platform===liveFilter).filter(e=>!q||str(e).includes(q)).slice().reverse();const w=document.getElementById('liveEvents');w.innerHTML=list.length?list.map(card).join(''):'<div class="empty">Nenhum evento encontrado.</div>';w.querySelectorAll('[data-event-id]').forEach(el=>el.addEventListener('click',()=>{selectedEventId=el.dataset.eventId;selectedDetailTab='summary';renderLive();renderDetail();const panel=document.getElementById('detailPanel');if(window.innerWidth<=620)panel?.classList.add('mobileOpen');}));renderDetail();}
function card(e){const cls=platformClass(e.platform),p=e.allParams||{},gtm=getGtmContainer(e.siteHost,e.timestamp);return `<article class="eventCard ${cls} ${selectedEventId===e.id?'selected':''}" data-event-id="${attr(e.id)}"><div class="cardTop"><div class="cardLeft"><div class="platformIcon ${cls}">${esc(shortPlatform(e.platform))}</div><div><div class="cardSub">${esc(e.platform)}</div><div class="cardTitle">${esc(e.eventName||'Request')}</div><div class="cardSub">${esc(e.trackingId||e.conversionId||'')}${gtm?` <span class="via">via ${esc(gtm)}</span>`:''}</div></div></div><div class="cardRight"><div class="time">${timeText(e.timestamp)}</div>${statusBadge(e.status,e.error||'')}</div></div><div class="chips">${chips(e,p)}</div>
    <div class="cardQuickActions">
      <button class="copyStatusBtn" type="button" data-copy-status-id="${attr(e.id)}" title="Copiar status/erro">⧉</button>
    </div><button class="aiTagBtn" type="button" data-ai-event-id="${attr(e.id)}">✦ Analisar com IA</button></article>`;}
function chips(e,p){const vals=[['event_name',p.en||p.ev||p.event_name],['transaction_id',p['ep.transaction_id']||p.transaction_id],['value',p['ep.value']||p.value],['currency',p['ep.currency']||p.currency],['endpoint',e.path],['method',e.method]].filter(([,v])=>v!==undefined&&v!==null&&v!=='');return vals.slice(0,6).map(([k,v])=>`<span class="chip"><b>${esc(k)}</b>&nbsp;${esc(first(v))}</span>`).join('');}
function renderDetail(){const panel=document.getElementById('detailPanel'),e=events.find(x=>x.id===selectedEventId);if(!e){panel.className='detailPanel emptyDetail';panel.innerHTML='<div class="emptyDetailText"><strong>Selecione um evento</strong><span>Clique em uma tag para ver Data Layer, GTM, parâmetros e timeline.</span></div>';return;}panel.className='detailPanel';const dl=correlateDataLayer(e),gtm=getGtmContainer(e.siteHost,e.timestamp),duration=e.completedAt&&e.timestamp?Math.max(0,e.completedAt-e.timestamp):null;panel.innerHTML=`<div class="detailHeader"><div class="detailTitleWrap"><div class="detailBadge">${esc(shortPlatform(e.platform))}</div><div><div class="detailTitle">${esc(e.eventName||'Request')}</div><div class="detailSub">${esc(e.trackingId||e.conversionId||'')}${gtm?` <span class="via">via ${esc(gtm)}</span>`:''}</div></div></div><div class="detailRight"><div class="time">${timeText(e.timestamp)}</div>${statusBadge(e.status,e.error||'')}<button class="aiDetailBtn" id="aiDetailBtn" data-ai-event-id="${attr(e.id)}" type="button">✦ Analisar IA</button><button class="detailClose" id="detailClose" title="Voltar">×</button></div></div><div class="detailTabs">${detailTab('summary','Resumo')}${detailTab('datalayer','Data Layer')}${detailTab('params','Parâmetros')}${detailTab('headers','Headers')}${detailTab('response','Resposta')}${detailTab('timeline','Timeline')}</div><div class="detailBody"><section class="detailSection ${selectedDetailTab==='summary'?'active':''}">${summaryHtml(e,dl,gtm,duration)}</section><section class="detailSection ${selectedDetailTab==='datalayer'?'active':''}"><div class="blockTitle">Evento Data Layer associado</div><div class="codeBox">${dl?renderObject(dl.data):'Nenhum Data Layer correspondente encontrado.'}</div></section><section class="detailSection ${selectedDetailTab==='params'?'active':''}">${kvTable('Query String',e.queryParams)}${kvTable('Body / POST',e.bodyParams)}${kvTable('Parâmetros combinados',e.allParams)}</section><section class="detailSection ${selectedDetailTab==='headers'?'active':''}">${kvTable('Request Headers',e.requestHeaders)}${kvTable('Response Headers',e.responseHeaders)}</section><section class="detailSection ${selectedDetailTab==='response'?'active':''}"><div class="infoGrid">${infoStatus(e)}${info('Status line',e.statusLine||'-')}${info('Concluído em',e.completedAt?timeText(e.completedAt):'-')}${info('Erro',e.error||'-')}</div></section><section class="detailSection ${selectedDetailTab==='timeline'?'active':''}">${timelineHtml(e,dl,gtm)}</section></div>`;const closeBtn=panel.querySelector('#detailClose');if(closeBtn){closeBtn.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();});closeBtn.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(typeof ev.stopImmediatePropagation==='function')ev.stopImmediatePropagation();selectedEventId=null;selectedDetailTab='summary';panel.classList.remove('mobileOpen');panel.className='detailPanel emptyDetail';panel.innerHTML='<div class="emptyDetailText"><strong>Selecione um evento</strong><span>Clique em uma tag para ver Data Layer, GTM, parâmetros e timeline.</span></div>';});}panel.querySelectorAll('.detailTab').forEach(btn=>btn.addEventListener('click',()=>{selectedDetailTab=btn.dataset.tab;renderDetail();}));if(window.innerWidth<=620&&selectedEventId)panel.classList.add('mobileOpen');}
function summaryHtml(e,dl,gtm,duration){return `<div class="infoGrid">${info('Plataforma',e.platform)}${info('Evento',e.eventName,'blue')}${info('Measurement / Pixel ID',e.trackingId||e.conversionId||'-','blue')}${info('Método',e.method||'-')}${info('Endpoint',e.path||'-')}${infoStatus(e)}${info('Duração',duration!==null?duration+' ms':'-')}${info('GTM Container',gtm||'Não identificado','blue')}</div><div class="blockTitle">Data Layer relacionado</div><div class="codeBox">${dl?renderObject(dl.data):'Nenhum evento Data Layer correlacionado.'}</div><div class="blockTitle">Request (URL completa)</div><div class="urlBox">${esc(e.url||'')}</div>${timelineHtml(e,dl,gtm)}`;}
function detailTab(id,label){return `<button class="detailTab ${selectedDetailTab===id?'active':''}" data-tab="${id}">${label}</button>`;}function info(k,v,c=''){return `<div class="infoBox"><div class="k">${esc(k)}</div><div class="v ${c}">${esc(v)}</div></div>`;}function infoStatus(e){const meta=statusInfo(e.status,e.error||"");return `<div class="infoBox"><div class="k">Status</div><div class="v"><span class="status ${meta.cls}" data-status-tooltip="${attr(meta.tooltip)}">${esc(meta.label)}</span></div></div>`;}
function kvTable(t,o){const entries=Object.entries(o||{});return `<div class="blockTitle">${esc(t)}</div><div class="kvTable">${entries.length?entries.map(([k,v])=>`<div class="kvRow"><div class="key">${esc(k)}</div><div class="value">${esc(typeof v==='object'?JSON.stringify(v):v)}</div></div>`).join(''):'<div class="kvRow"><div class="key">—</div><div class="value">Nenhum dado</div></div>'}</div>`;}
function correlateDataLayer(e){const candidates=events.filter(x=>x.type==='datalayer'&&x.siteHost===e.siteHost&&(x.timestamp||0)<=e.timestamp);if(!candidates.length)return null;const exact=candidates.filter(x=>normalize(x.eventName)===normalize(e.eventName));const pool=exact.length?exact:candidates;return pool.sort((a,b)=>Math.abs(e.timestamp-a.timestamp)-Math.abs(e.timestamp-b.timestamp))[0]||null;}
function getGtmContainer(siteHost,ts){const gtms=events.filter(x=>x.type==='network'&&x.platform==='GTM'&&x.siteHost===siteHost&&(x.timestamp||0)<=ts&&/^GTM-/i.test(x.trackingId||''));if(!gtms.length)return '';return gtms.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))[0].trackingId||'';}
function timelineHtml(e,dl,gtm){const responseTs=e.completedAt||null;return `<div class="blockTitle">Timeline do evento</div><div class="timeline"><div class="step dl"><div class="stepDot">DL</div><div class="stepName">Data Layer</div><div class="stepMeta">${dl?timeText(dl.timestamp):'não correlacionado'}<br>${dl?esc(dl.eventName):''}</div></div><div class="step gtm"><div class="stepDot">G</div><div class="stepName">GTM</div><div class="stepMeta">${gtm?esc(gtm):'não identificado'}</div></div><div class="step"><div class="stepDot">↗</div><div class="stepName">${esc(e.platform)} Request</div><div class="stepMeta">${timeText(e.timestamp)}<br>${esc(e.path||'')}</div></div><div class="step response"><div class="stepDot">✓</div><div class="stepName">Resposta</div><div class="stepMeta">${responseTs?timeText(responseTs):'...'}<br>${esc(e.status??'-')}</div></div></div>`;}
function renderDL(){const q=document.getElementById('searchDL').value.trim().toLowerCase();const list=events.filter(e=>e.type==='datalayer').filter(e=>!q||str(e).includes(q)).slice().reverse();document.getElementById('dlEvents').innerHTML=list.length?list.map(e=>`<article class="eventCard dlCard"><div class="cardTop"><div class="cardLeft"><div class="platformIcon" style="color:#f97316">DL</div><div><div class="cardSub">Data Layer</div><div class="cardTitle">${esc(e.eventName||'dataLayer.push')}</div><div class="cardSub">${esc(e.siteHost||'')}</div></div></div><div class="time">${timeText(e.timestamp)}</div></div><div class="payload">${renderObject(e.data)}</div></article>`).join(''):'<div class="empty">Nenhum Data Layer capturado.</div>';}
function renderHistory(){const q=document.getElementById('searchSite').value.trim().toLowerCase(),grouped={};events.filter(Boolean).forEach(e=>{const s=e.siteHost||'site-desconhecido';(grouped[s]??=[]).push(e)});const sites=Object.entries(grouped).filter(([s])=>!q||s.toLowerCase().includes(q)).sort((a,b)=>latest(b[1])-latest(a[1]));if(!sites.length){document.getElementById('siteList').innerHTML='<div class="empty">Sem histórico.</div>';document.getElementById('historyEvents').innerHTML='';return;}if(!selectedSite||!grouped[selectedSite])selectedSite=sites[0][0];document.getElementById('siteList').innerHTML=sites.map(([s,l])=>`<div class="siteItem ${s===selectedSite?'active':''}" data-site="${attr(s)}"><div class="siteTop"><div class="siteHost">${esc(s)}</div><div class="siteCount">${l.length}</div></div><div class="siteMeta">${friendlyDate(latest(l))}</div></div>`).join('');document.querySelectorAll('.siteItem').forEach(el=>el.addEventListener('click',()=>{selectedSite=el.dataset.site;renderHistory();}));const list=grouped[selectedSite]||[];document.getElementById('historySiteTitle').textContent=selectedSite;document.getElementById('historySiteMeta').textContent=`${list.length} eventos • último ${friendlyDate(latest(list))}`;document.getElementById('clearSite').classList.remove('hidden');const c={all:list.length,ga4:list.filter(x=>x.platform==='GA4').length,meta:list.filter(x=>x.platform==='Meta').length,dl:list.filter(x=>x.type==='datalayer').length};document.getElementById('historyStats').innerHTML=mini(c.all,'Eventos')+mini(c.ga4,'GA4')+mini(c.meta,'Meta')+mini(c.dl,'Data Layer');const rows=list.slice().sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));document.getElementById('historyEvents').innerHTML='<div class="historyRow header"><div>Hora</div><div>Plataforma</div><div>Evento</div><div>ID / Tag</div><div>Status</div></div>'+rows.map(e=>`<div class="historyRow"><div>${timeText(e.timestamp)}</div><div>${esc(e.type==='datalayer'?'Data Layer':e.platform)}</div><div><b>${esc(e.eventName||'-')}</b></div><div>${esc(e.trackingId||e.conversionId||'-')}</div><div>${esc(e.status??'-')}</div></div>`).join('');}
function mini(v,l){return `<div class="miniStat"><strong>${v}</strong><span>${l}</span></div>`;}function latest(l){return Math.max(0,...l.map(e=>Number(e.timestamp)||0));}function friendlyDate(ts){if(!ts)return'';const d=new Date(ts),n=new Date();return d.toDateString()===n.toDateString()?`Hoje, ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}function normalize(v){return String(v||'').trim().toLowerCase();}function shortPlatform(p){return p==='Google Ads'?'Ads':p==='Floodlight'?'FL':p||'?';}function platformClass(p){return String(p||'').toLowerCase().replaceAll(' ','');}function first(v){return Array.isArray(v)?(v[0]??''):v;}function timeText(ts){const d=new Date(Number(ts)||Date.now());return d.toLocaleTimeString('pt-BR',{hour12:false})+'.'+String(d.getMilliseconds()).padStart(3,'0');}function statusBadge(s, errorMessage=""){
  const meta = statusInfo(s, errorMessage);
  return `<span class="status ${meta.cls}" data-status-tooltip="${attr(meta.tooltip)}">${esc(meta.label)}</span>`;
}

function statusInfo(status, errorMessage=""){
  if(status==="ERROR"){
    const detail = errorMessage ? ` Detalhe: ${errorMessage}` : "";
    return {
      label:"ERRO",
      cls:"error",
      tooltip:`Falha de rede ou request interrompido.${detail}`
    };
  }

  if(typeof status!=="number"){
    return {
      label:"...",
      cls:"pending",
      tooltip:"Request capturado, aguardando resposta ou status HTTP."
    };
  }

  const map = {
    200:["OK","Request processado com sucesso."],
    201:["Created","Recurso criado com sucesso."],
    202:["Accepted","Request aceito para processamento."],
    204:["No Content","Request processado com sucesso. A resposta não possui corpo, comportamento comum em tags de tracking."],
    301:["Moved Permanently","Redirecionamento permanente."],
    302:["Found","Redirecionamento temporário."],
    304:["Not Modified","Recurso não modificado; o navegador pode usar cache."],
    400:["Bad Request","O servidor rejeitou o request por formato ou parâmetros inválidos."],
    401:["Unauthorized","O endpoint exige autenticação ou a credencial não foi aceita."],
    403:["Forbidden","O servidor recebeu o request, mas recusou o acesso."],
    404:["Not Found","O endpoint ou recurso solicitado não foi encontrado."],
    408:["Request Timeout","O servidor demorou demais para receber/processar o request."],
    409:["Conflict","O request entrou em conflito com o estado atual do recurso."],
    429:["Too Many Requests","Muitos requests foram enviados; houve limitação de taxa."],
    500:["Internal Server Error","Erro interno no servidor que recebeu a tag."],
    502:["Bad Gateway","Um gateway/proxy recebeu uma resposta inválida do servidor upstream."],
    503:["Service Unavailable","O serviço está temporariamente indisponível."],
    504:["Gateway Timeout","Um gateway/proxy não recebeu resposta a tempo do servidor upstream."]
  };

  const known = map[status];

  if(known){
    const isOk = status >= 200 && status < 400;
    return {
      label:String(status),
      cls:isOk ? "ok" : "error",
      tooltip:`${status} ${known[0]} — ${known[1]}`
    };
  }

  if(status >= 200 && status < 300){
    return {
      label:String(status),
      cls:"ok",
      tooltip:`${status} — Request processado com sucesso.`
    };
  }

  if(status >= 300 && status < 400){
    return {
      label:String(status),
      cls:"ok",
      tooltip:`${status} — O request recebeu uma resposta de redirecionamento.`
    };
  }

  if(status >= 400 && status < 500){
    return {
      label:String(status),
      cls:"error",
      tooltip:`${status} — Erro do lado do request/cliente. Verifique URL, parâmetros, permissões ou bloqueios.`
    };
  }

  if(status >= 500){
    return {
      label:String(status),
      cls:"error",
      tooltip:`${status} — Erro do servidor/endereço de tracking.`
    };
  }

  return {
    label:String(status),
    cls:"pending",
    tooltip:`Status HTTP ${status}.`
  };
}
function str(v){try{return JSON.stringify(v).toLowerCase()}catch{return'';}}
function renderObject(value,level=0){if(value===null)return'<span class="null">null</span>';if(value===undefined)return'<span class="null">undefined</span>';if(typeof value==='string')return`<span class="string">"${esc(value)}"</span>`;if(typeof value==='number')return`<span class="number">${value}</span>`;if(typeof value==='boolean')return`<span class="boolean">${value}</span>`;if(Array.isArray(value))return'[\n'+value.map(v=>`${indent(level+1)}${renderObject(v,level+1)}`).join(',\n')+`\n${indent(level)}]`;if(typeof value==='object'){const entries=Object.entries(value);if(!entries.length)return'{}';return'{\n'+entries.map(([k,v])=>{const important=IMPORTANT_KEYS.has(String(k).toLowerCase());const key=important?`<span class="key-important">"${esc(k)}"</span>`:`<span class="key-normal">"${esc(k)}"</span>`;let val=renderObject(v,level+1);if(important&&['string','number','boolean'].includes(typeof v))val=`<span class="value-important">${esc(typeof v==='string'?`"${v}"`:String(v))}</span>`;return`${indent(level+1)}${key}: ${val}`;}).join(',\n')+`\n${indent(level)}}`;}return esc(String(value));}
function indent(n){return'  '.repeat(n);}function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}function attr(v){return esc(v).replaceAll('"','&quot;');}


window.addEventListener("resize", () => {
  const panel = document.getElementById("detailPanel");
  if (!panel) return;
  if (window.innerWidth > 620) panel.classList.remove("mobileOpen");
  else if (selectedEventId) panel.classList.add("mobileOpen");
});


/* Ventus AI Analyzer */
const DEFAULT_AI_ENDPOINT = window.VENTUS_AI_ENDPOINT || "http://localhost:8787/analyze";

const aiModal = document.getElementById("aiModal");
const aiModalClose = document.getElementById("aiModalClose");
const aiResult = document.getElementById("aiResult");
const aiLoading = document.getElementById("aiLoading");

const aiSettingsModal = document.getElementById("aiSettingsModal");
const aiSettingsBtn = document.getElementById("aiSettings");
const aiSettingsClose = document.getElementById("aiSettingsClose");
const aiEndpointInput = document.getElementById("aiEndpoint");
const aiSave = document.getElementById("aiSave");
const aiTest = document.getElementById("aiTest");
const aiSettingsStatus = document.getElementById("aiSettingsStatus");

if(aiModalClose) aiModalClose.addEventListener("click",()=>aiModal.classList.add("hidden"));
if(aiSettingsClose) aiSettingsClose.addEventListener("click",()=>aiSettingsModal.classList.add("hidden"));

if(aiSettingsBtn){
  aiSettingsBtn.addEventListener("click",()=>{
    chrome.storage.local.get(["ventusAiEndpoint"],r=>{
      aiEndpointInput.value=r.ventusAiEndpoint||DEFAULT_AI_ENDPOINT;
      aiSettingsStatus.textContent="";
      aiSettingsStatus.className="aiSettingsStatus";
      aiSettingsModal.classList.remove("hidden");
    });
  });
}

if(aiSave){
  aiSave.addEventListener("click",()=>{
    const endpoint=String(aiEndpointInput.value||"").trim();
    if(!/^https?:\/\//i.test(endpoint)){
      aiSettingsStatus.textContent="Informe uma URL HTTP ou HTTPS válida.";
      aiSettingsStatus.className="aiSettingsStatus error";
      return;
    }
    chrome.storage.local.set({ventusAiEndpoint:endpoint},()=>{
      aiSettingsStatus.textContent="Endpoint salvo.";
      aiSettingsStatus.className="aiSettingsStatus ok";
    });
  });
}

if(aiTest){
  aiTest.addEventListener("click",async()=>{
    const endpoint=String(aiEndpointInput.value||"").trim();
    aiSettingsStatus.textContent="Testando...";
    aiSettingsStatus.className="aiSettingsStatus";
    try{
      const base=new URL(endpoint);
      const health=new URL("/health",base.origin).toString();
      const res=await fetch(health,{method:"GET"});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const healthData=await res.json();
      if(!healthData.apiKeyConfigured){
        throw new Error("Backend online, mas OPENAI_API_KEY não está configurada.");
      }
      aiSettingsStatus.textContent=`Conexão OK · ${healthData.model||"IA configurada"}`;
      aiSettingsStatus.className="aiSettingsStatus ok";
      updateAiConnection("online",`IA online · ${healthData.model||""}`);
    }catch(err){
      aiSettingsStatus.textContent=`Não foi possível conectar: ${err.message}`;
      aiSettingsStatus.className="aiSettingsStatus error";
    }
  });
}

if(aiModal){
  aiModal.addEventListener("click",ev=>{
    if(ev.target===aiModal)aiModal.classList.add("hidden");
  });
}
if(aiSettingsModal){
  aiSettingsModal.addEventListener("click",ev=>{
    if(ev.target===aiSettingsModal)aiSettingsModal.classList.add("hidden");
  });
}


/* Ventus v4.5 — delegated AI click handling */
document.addEventListener("pointerdown", (ev) => {
  const aiButton = ev.target.closest?.("[data-ai-event-id], #aiDetailBtn");
  if (!aiButton) return;
  ev.stopPropagation();
}, true);

document.addEventListener("click", (ev) => {
  const aiButton = ev.target.closest?.("[data-ai-event-id], #aiDetailBtn");
  if (!aiButton) return;

  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === "function") {
    ev.stopImmediatePropagation();
  }

  const eventId =
    aiButton.dataset?.aiEventId ||
    selectedEventId ||
    aiButton.closest?.("[data-event-id]")?.dataset?.eventId;

  if (!eventId) {
    showAiUiError("Não foi possível identificar qual tag deve ser analisada.");
    return;
  }

  analyzeEventById(eventId);
}, true);

function showAiUiError(message) {
  const modal = document.getElementById("aiModal");
  const loading = document.getElementById("aiLoading");
  const result = document.getElementById("aiResult");

  if (modal) modal.classList.remove("hidden");
  if (loading) loading.classList.add("hidden");
  if (result) {
    result.innerHTML = `
      <div class="aiFinding high">
        <div class="aiFindingTitle">Erro ao iniciar análise</div>
        <div class="aiFindingText">${esc(message)}</div>
      </div>
    `;
  }
}

async function analyzeEventById(eventId){
  const modal=document.getElementById("aiModal");
  const result=document.getElementById("aiResult");
  const loading=document.getElementById("aiLoading");

  if(modal) modal.classList.remove("hidden");
  if(result) result.innerHTML="";
  if(loading) loading.classList.remove("hidden");

  const e=events.find(x=>x?.id===eventId);

  if(!e){
    if(loading) loading.classList.add("hidden");
    showAiUiError("A tag selecionada não está mais disponível no histórico atual.");
    return;
  }

  const dl=typeof correlateDataLayer==="function" ? correlateDataLayer(e) : null;
  const gtm=typeof getGtmContainer==="function" ? getGtmContainer(e.siteHost,e.timestamp) : "";

  const technicalPayload=sanitizeForAI({
    platform:e.platform,
    eventName:e.eventName,
    trackingId:e.trackingId,
    conversionId:e.conversionId,
    conversionLabel:e.conversionLabel,
    status:e.status,
    error:e.error,
    method:e.method,
    endpoint:e.path,
    host:e.host,
    siteHost:e.siteHost,
    transport:e.transport,
    gtmContainer:gtm,
    queryParams:e.queryParams,
    bodyParams:e.bodyParams,
    allParams:e.allParams,
    requestHeaders:e.requestHeaders,
    responseHeaders:e.responseHeaders,
    dataLayer:dl?.data||null,
    timing:{
      requestTimestamp:e.timestamp,
      dataLayerTimestamp:dl?.timestamp||null,
      completedAt:e.completedAt||null
    }
  });

  try{
    const endpoint=await getAiEndpoint();
    let analysis;

    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),20000);

      const response=await fetch(endpoint,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "X-Ventus-Version":"4.5.0"
        },
        body:JSON.stringify({tag:technicalPayload}),
        signal:controller.signal
      });

      clearTimeout(timer);

      if(!response.ok){
        let msg="";
        try{msg=(await response.json())?.error||"";}catch(_){}
        throw new Error(msg||`HTTP ${response.status}`);
      }

      analysis=await response.json();
      updateAiConnection("online","IA online");
    }catch(remoteError){
      updateAiConnection("offline","IA offline");
      analysis=localTagAnalysis(technicalPayload);
      analysis.fallback=true;
      analysis.fallbackReason=
        remoteError?.name==="AbortError"
          ? "Tempo limite excedido ao chamar o backend de IA."
          : (remoteError?.message || "Falha ao chamar o backend de IA.");
    }

    aiLoading.classList.add("hidden");
    renderAIAnalysis(analysis,e);
  }catch(err){
    aiLoading.classList.add("hidden");
    aiResult.innerHTML=`<div class="aiFinding high"><div class="aiFindingTitle">Não foi possível analisar</div><div class="aiFindingText">${esc(err.message)}</div></div>`;
  }
}

function getAiEndpoint(){
  return new Promise(resolve=>{
    chrome.storage.local.get(["ventusAiEndpoint"],r=>resolve(r.ventusAiEndpoint||DEFAULT_AI_ENDPOINT));
  });
}

async function checkAiConnection(){
  const badge=document.getElementById("aiConnection");
  if(!badge)return;

  updateAiConnection("checking","Verificando IA...");

  try{
    const endpoint=await getAiEndpoint();
    const url=new URL(endpoint);
    const health=new URL("/health",url.origin).toString();

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),1800);

    const response=await fetch(health,{
      method:"GET",
      signal:controller.signal
    });

    clearTimeout(timer);

    if(!response.ok)throw new Error(`HTTP ${response.status}`);

    const data=await response.json();

    if(!data.apiKeyConfigured){
      updateAiConnection("offline","Backend online · falta API key");
      return;
    }

    updateAiConnection("online",`IA online · ${data.model||"GPT"}`);
  }catch(_){
    updateAiConnection("offline","IA offline");
  }
}

function updateAiConnection(state,text){
  const badge=document.getElementById("aiConnection");
  if(!badge)return;
  badge.className=`aiConnection ${state}`;
  badge.textContent=text;
}

setTimeout(checkAiConnection,250);
setInterval(checkAiConnection,30000);


function sanitizeForAI(value,key=""){
  const blockedKeys=[
    "authorization","cookie","set-cookie","x-api-key","api-key",
    "email","email_address","phone","phone_number","telephone",
    "user_email","user_phone","address","first_name","last_name",
    "firstname","lastname"
  ];

  const lower=String(key||"").toLowerCase();

  if(blockedKeys.some(k=>lower===k||lower.endsWith(`.${k}`)||lower.includes(k))){
    return "[REDACTED]";
  }

  if(value===null||value===undefined)return value;

  if(Array.isArray(value)){
    return value.slice(0,50).map(v=>sanitizeForAI(v,key));
  }

  if(typeof value==="object"){
    const out={};
    Object.entries(value).slice(0,200).forEach(([k,v])=>{
      out[k]=sanitizeForAI(v,k);
    });
    return out;
  }

  if(typeof value==="string" && value.length>1500){
    return value.slice(0,1500)+"…";
  }

  return value;
}

function localTagAnalysis(tag){
  const findings=[];
  const params=tag.allParams||{};
  const dl=tag.dataLayer||{};
  const event=String(tag.eventName||"").toLowerCase();

  function issue(severity,title,text){
    findings.push({severity,title,text});
  }

  if(tag.status==="ERROR" || (typeof tag.status==="number" && tag.status>=400)){
    issue("high","Falha no envio",`O request retornou ${tag.status||"erro"}. Verifique endpoint, bloqueios, CSP, consentimento e parâmetros do request.`);
  }else if(typeof tag.status==="number" && tag.status>=200 && tag.status<400){
    issue("good","Request recebido",`O status ${tag.status} indica que o endpoint respondeu sem erro HTTP.`);
  }

  if(!tag.gtmContainer){
    issue("medium","GTM não identificado","Não foi possível associar um container GTM ao request. Isso pode ser esperado em implementações via gtag.js ou hardcoded.");
  }

  if(!tag.dataLayer){
    issue("medium","Data Layer não correlacionado","Nenhum dataLayer.push próximo foi associado à tag. Valide se o evento é disparado por Data Layer, custom event ou código direto.");
  }

  if(tag.platform==="GA4"){
    if(!tag.trackingId)issue("high","Measurement ID ausente","Não foi identificado tid/Measurement ID no request.");
    if(!tag.eventName)issue("high","Event name ausente","O request não possui um nome de evento identificável.");

    if(event==="purchase"){
      if(!(params["ep.transaction_id"]||params.transaction_id||dl.transaction_id)){
        issue("high","transaction_id ausente","Purchase sem transaction_id pode gerar duplicidade e prejudicar receita/transações.");
      }
      if(!(params["ep.value"]||params.value||dl.value)){
        issue("medium","value ausente","Purchase sem value limita mensuração de receita.");
      }
      if(!(params["ep.currency"]||params.currency||dl.currency)){
        issue("medium","currency ausente","Recomenda-se enviar currency junto de value.");
      }
    }

    if(["view_item","add_to_cart","begin_checkout","purchase","view_promotion","select_promotion"].includes(event)){
      const hasItems=JSON.stringify(tag.dataLayer||{}).includes('"items"') ||
        Object.keys(params).some(k=>k.startsWith("pr")||k.includes("item_id"));
      if(!hasItems)issue("medium","Items não identificados","Evento de ecommerce sem produtos/itens identificáveis. Valide o array items.");
    }
  }

  if(tag.platform==="Meta"){
    if(!tag.trackingId)issue("high","Pixel ID ausente","Não foi identificado o Pixel ID no request.");
    if(!tag.eventName)issue("medium","Nome do evento ausente","Não foi possível identificar ev/event_name.");
    if(event==="purchase"){
      if(!(params.value||dl.value))issue("medium","value ausente","Purchase da Meta normalmente deve enviar value.");
      if(!(params.currency||dl.currency))issue("medium","currency ausente","Purchase da Meta normalmente deve enviar currency.");
    }
  }

  if(tag.transport==="server-side-ingress"){
    issue("low","Evento server-side ingress","A extensão vê o navegador chegando ao endpoint server-side. O envio posterior servidor→vendor precisa ser validado nos logs/debug do servidor.");
  }

  if(!findings.some(f=>f.severity==="high"||f.severity==="medium")){
    issue("good","Estrutura consistente","Nos dados visíveis pelo navegador, não foram encontrados problemas óbvios.");
  }

  const penalties=findings.reduce((n,f)=>n+(f.severity==="high"?20:f.severity==="medium"?10:f.severity==="low"?3:0),0);
  return {
    score:Math.max(0,100-penalties),
    summary:`Análise técnica local de ${tag.platform||"tag"} — ${tag.eventName||"evento"}.`,
    findings,
    recommendations:findings.filter(f=>f.severity!=="good").map(f=>f.text)
  };
}

function renderAIAnalysis(data,event){
  if(typeof data==="string"){
    aiResult.innerHTML=`<pre class="aiRaw">${esc(data)}</pre>`;
    return;
  }

  const findings=Array.isArray(data.findings)?data.findings:[];
  const recommendations=Array.isArray(data.recommendations)?data.recommendations:[];

  aiResult.innerHTML=`
    <div class="aiScore">
      <div class="aiScoreNumber">${esc(data.score??"—")}</div>
      <div>
        <h3>${esc(event.platform||"Tag")} · ${esc(event.eventName||"Evento")}</h3>
        <p>${esc(data.summary||"Análise concluída.")}</p>
        ${data.fallback?`<p style="margin-top:5px;color:#a16207">Backend de IA indisponível; exibindo análise local. ${esc(data.fallbackReason||"")}</p>`:""}
      </div>
    </div>

    <div class="aiSection">
      <h3>Diagnóstico</h3>
      ${findings.length ? findings.map(f=>`
        <div class="aiFinding ${esc(f.severity||"low")}">
          <div class="aiFindingTitle">${esc(f.title||"Ponto identificado")}</div>
          <div class="aiFindingText">${esc(f.text||"")}</div>
        </div>
      `).join("") : `<div class="aiFinding good"><div class="aiFindingTitle">Sem alertas</div><div class="aiFindingText">Nenhum problema relevante foi retornado.</div></div>`}
    </div>

    ${recommendations.length?`
      <div class="aiSection">
        <h3>O que melhorar</h3>
        ${recommendations.map((r,i)=>`<div class="aiFinding low"><div class="aiFindingTitle">${i+1}. Recomendação</div><div class="aiFindingText">${esc(r)}</div></div>`).join("")}
      </div>
    `:""}
  `;
}

const ventusPowerToggle=document.getElementById("ventusPowerToggle");
const ventusPowerLabel=document.getElementById("ventusPowerLabel");
function applyVentusPowerState(enabled){
  if(ventusPowerToggle)ventusPowerToggle.checked=enabled;
  if(ventusPowerLabel)ventusPowerLabel.textContent=enabled?"Ligado":"Desligado";
  document.body.classList.toggle("ventusPaused",!enabled);
  const monitor=document.querySelector(".monitor");
  if(monitor)monitor.innerHTML=enabled?'<span class="dot"></span>Monitorando':'<span class="dot"></span>Captura pausada';
}
chrome.runtime.sendMessage({type:"VENTUS_GET_ENABLED"},r=>applyVentusPowerState(r?.enabled!==false));
if(ventusPowerToggle){
  ventusPowerToggle.addEventListener("change",()=>{
    chrome.runtime.sendMessage({type:"VENTUS_SET_ENABLED",enabled:ventusPowerToggle.checked},r=>applyVentusPowerState(r?.enabled!==false));
  });
}
chrome.runtime.onMessage.addListener(m=>{if(m?.type==="VENTUS_ENABLED_CHANGED")applyVentusPowerState(m.enabled!==false);});


/* Ventus v4.7 — copy status/error */
document.addEventListener("pointerdown", ev => {
  const btn = ev.target.closest?.("[data-copy-status-id]");
  if (!btn) return;
  ev.stopPropagation();
}, true);

document.addEventListener("click", async ev => {
  const btn = ev.target.closest?.("[data-copy-status-id]");
  if (!btn) return;

  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === "function") {
    ev.stopImmediatePropagation();
  }

  const eventId = btn.dataset.copyStatusId;
  const event = events.find(x => x?.id === eventId);

  if (!event) {
    showCopyFeedback(btn, "Erro");
    return;
  }

  const text = buildStatusCopyText(event);

  try {
    await copyText(text);
    showCopyFeedback(btn, "Copiado");
  } catch (_) {
    showCopyFeedback(btn, "Falhou");
  }
}, true);

function buildStatusCopyText(event) {
  const status = event.status === "ERROR"
    ? "ERRO"
    : (event.status ?? "Sem status");

  const statusMeta = typeof statusInfo === "function"
    ? statusInfo(event.status, event.error || "")
    : null;

  const lines = [
    "Ventus Tag Debugger",
    `Plataforma: ${event.platform || "-"}`,
    `Evento: ${event.eventName || "-"}`,
    `ID: ${event.trackingId || event.conversionId || "-"}`,
    `Status: ${status}`
  ];

  if (statusMeta?.tooltip) {
    lines.push(`Descrição: ${statusMeta.tooltip}`);
  }

  if (event.error) {
    lines.push(`Erro técnico: ${event.error}`);
    if (event.statusCategory) {
      lines.push(`Categoria do erro: ${event.statusCategory}`);
    }
  }

  if (event.method) {
    lines.push(`Método: ${event.method}`);
  }

  if (event.host || event.path) {
    lines.push(`Endpoint: ${(event.host || "") + (event.path || "")}`);
  }

  if (event.gtmContainer) {
    lines.push(`GTM: ${event.gtmContainer}`);
  }

  if (event.transport) {
    lines.push(`Transporte: ${event.transport}`);
  }

  return lines.join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const ok = document.execCommand("copy");
  textarea.remove();

  if (!ok) {
    throw new Error("Não foi possível copiar.");
  }
}

function showCopyFeedback(button, message) {
  if (!button) return;

  const original = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = original;
  button.textContent = message === "Copiado" ? "✓" : message === "Erro" ? "!" : "×";
  button.classList.add(message === "Copiado" ? "copied" : "copyError");

  clearTimeout(button._ventusCopyTimer);
  button._ventusCopyTimer = setTimeout(() => {
    button.textContent = original || "⧉";
    button.classList.remove("copied", "copyError");
  }, 1200);
}



/* Ventus v4.9 — proper theme switching */
const ventusThemeToggle=document.getElementById("themeToggle");
const ventusThemeIcon=document.getElementById("themeIcon");

function applyVentusTheme(theme){
  const selected=theme==="dark"?"dark":"light";
  document.documentElement.setAttribute("data-theme",selected);

  if(ventusThemeIcon){
    ventusThemeIcon.textContent=selected==="dark"?"☀":"☾";
  }

  if(ventusThemeToggle){
    const label=selected==="dark"
      ? "Mudar para modo claro"
      : "Mudar para modo escuro";

    ventusThemeToggle.title=label;
    ventusThemeToggle.setAttribute("aria-label",label);
  }
}

chrome.storage.local.get(["ventusTheme"],result=>{
  applyVentusTheme(result.ventusTheme==="dark"?"dark":"light");
});

if(ventusThemeToggle){
  ventusThemeToggle.addEventListener("click",()=>{
    const current=document.documentElement.getAttribute("data-theme")==="dark"
      ? "dark"
      : "light";

    const next=current==="dark"?"light":"dark";

    applyVentusTheme(next);
    chrome.storage.local.set({ventusTheme:next});
  });
}
