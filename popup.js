let events=[];let liveFilter='ALL';let selectedEventId=null;let selectedDetailTab='summary';let selectedSite=null;
const IMPORTANT_KEYS=new Set(['event','event_name','transaction_id','value','currency','item_id','item_name','item_brand','item_category','item_variant','source','medium','campaign','utm_source','utm_medium','utm_campaign','gclid','client_id','user_id','id','ev','tid','en']);
function load(){chrome.runtime.sendMessage({type:'VENTUS_GET_EVENTS'},r=>{if(chrome.runtime.lastError)return;events=Array.isArray(r?.events)?r.events.filter(Boolean):[];if(selectedEventId&&!events.some(e=>e.id===selectedEventId))selectedEventId=null;scheduleRender();});}load();
/* FIX: every captured request re-rendered all views (thousands of cards) synchronously.
   Renders are now batched per animation frame and only the visible view is rebuilt. */
let renderQueued=false;function scheduleRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;renderAll();});}
let loadTimer=null;function scheduleLoad(){clearTimeout(loadTimer);loadTimer=setTimeout(load,150);}
chrome.runtime.onMessage.addListener(m=>{if(!m)return;if(m.type==='VENTUS_NEW_EVENT'&&m.payload){if(!events.some(e=>e.id===m.payload.id))events.push(m.payload);scheduleRender();}if(m.type==='VENTUS_REFRESH')scheduleLoad();});
document.querySelectorAll('.mainTab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.mainTab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));btn.classList.add('active');document.getElementById(btn.dataset.view).classList.add('active');renderAll();}));
document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));btn.classList.add('active');liveFilter=btn.dataset.filter;renderLive();}));
/* v5.6: searches are debounced (each keystroke used to stringify every event) */
function debounce(fn,ms=120){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
document.getElementById('searchLive').addEventListener('input',debounce(renderLive));document.getElementById('searchDL').addEventListener('input',debounce(renderDL));document.getElementById('searchSite').addEventListener('input',debounce(renderHistory));
/* v5.6: clearing everything needs a second click within 3 s (it was one accidental click away) */
function armConfirm(btn,run,label='Confirmar?'){if(btn.dataset.armed==='1'){clearTimeout(btn._armT);btn.dataset.armed='';btn.classList.remove('armed');if(btn._armLabel!==undefined)btn.innerHTML=btn._armLabel;run();return;}btn.dataset.armed='1';btn.classList.add('armed');btn._armLabel=btn.innerHTML;btn.innerHTML=`<span class="armText">${label}</span>`;btn._armT=setTimeout(()=>{btn.dataset.armed='';btn.classList.remove('armed');btn.innerHTML=btn._armLabel;},3000);}
document.getElementById('clear').addEventListener('click',ev=>armConfirm(ev.currentTarget,()=>chrome.runtime.sendMessage({type:'VENTUS_CLEAR_EVENTS'},()=>{events=[];selectedEventId=null;selectedSite=null;detailSignature='';renderAll();}),'Limpar tudo?'));
document.getElementById('clearSite').addEventListener('click',ev=>{if(!selectedSite)return;const site=selectedSite;armConfirm(ev.currentTarget,()=>chrome.runtime.sendMessage({type:'VENTUS_CLEAR_SITE',siteHost:site},()=>{events=events.filter(e=>e.siteHost!==site);if(selectedSite===site)selectedSite=null;renderAll();}),'Confirmar limpeza');});
function activeView(){return document.querySelector('.view.active')?.id||'eventsView';}
function renderCounts(){const n=events.filter(e=>e.type==='network').length,d=events.filter(e=>e.type==='datalayer').length,s=new Set(events.map(e=>e.siteHost||'site-desconhecido')).size;const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v>999?'999+':String(v);};set('tabCountEvents',n);set('tabCountDL',d);set('tabCountSites',s);}
function renderAll(){renderCounts();const v=activeView();if(v==='eventsView'){renderStats();renderLive();}else if(v==='dlView')renderDL();else if(v==='historyView')renderHistory();}
/* v5.6: the stats row is now a STATUS filter (Todos / OK / Erros / Pendentes); platform counts live on the platform chips. */
let statusFilter='ALL';
function statusClassOf(e){return statusInfo(e.status,e.error||'').cls;}
function renderStats(){const n=events.filter(e=>e.type==='network');const c={ALL:n.length,ok:0,error:0,pending:0};n.forEach(e=>{c[statusClassOf(e)]=(c[statusClassOf(e)]||0)+1;});document.getElementById('stats').innerHTML=stat('ALL',c.ALL,'Eventos')+stat('ok',c.ok,'Sucesso')+stat('error',c.error,'Erros')+stat('pending',c.pending,'Pendentes');
  const byPlatform={};n.forEach(e=>{byPlatform[e.platform]=(byPlatform[e.platform]||0)+1;});byPlatform['Server Side']=n.filter(isSS).length;document.querySelectorAll('.filter').forEach(btn=>{const f=btn.dataset.filter;const v=f==='ALL'?n.length:(byPlatform[f]||0);if(f!=='ALL'&&!btn.querySelector('.pIco')&&PLATFORM_ICONS[f])btn.insertAdjacentHTML('afterbegin',`<span class="fIco ${platformClass(f)}">${pIcon(f)}</span>`);let b=btn.querySelector('.filterCount');if(!b){b=document.createElement('span');b.className='filterCount';btn.appendChild(b);}b.textContent=v;btn.classList.toggle('isEmpty',f!=='ALL'&&!v);});}
function stat(key,v,l){return `<button type="button" class="stat ${key==='ALL'?'all':key} ${statusFilter===key?'active':''}" data-status-filter="${key}"><span class="v">${v}</span><span class="l">${l}</span></button>`;}
document.getElementById('stats').addEventListener('click',ev=>{const b=ev.target.closest('[data-status-filter]');if(!b)return;statusFilter=b.dataset.statusFilter===statusFilter&&statusFilter!=='ALL'?'ALL':b.dataset.statusFilter;renderStats();renderLive();});
const LIST_LIMIT=300;
function renderLive(){const q=document.getElementById('searchLive').value.trim().toLowerCase();const all=events.filter(e=>e.type==='network').filter(e=>matchesPlatform(e,liveFilter)).filter(e=>statusFilter==='ALL'||statusClassOf(e)===statusFilter).filter(e=>!q||str(e).includes(q));
  /* v5.6: only the most recent LIST_LIMIT cards are rendered (8000 cards froze the popup) */
  const list=all.slice(-LIST_LIMIT).reverse();const w=document.getElementById('liveEvents');
  w.innerHTML=list.length?list.map(card).join('')+(all.length>LIST_LIMIT?`<div class="listNote">Mostrando os ${LIST_LIMIT} mais recentes de ${all.length}. Use a busca para encontrar eventos antigos.</div>`:''):`<div class="empty"><strong>Nenhum evento encontrado</strong><span>${events.some(e=>e.type==='network')?'Ajuste os filtros ou a busca.':'Navegue em um site com tags para começar a capturar.'}</span></div>`;
  w.querySelectorAll('[data-event-id]').forEach(el=>el.addEventListener('click',()=>{selectedEventId=el.dataset.eventId;selectedDetailTab='summary';w.querySelectorAll('.eventCard.selected').forEach(c=>c.classList.remove('selected'));el.classList.add('selected');renderDetail();const panel=document.getElementById('detailPanel');if(window.innerWidth<=620)panel?.classList.add('mobileOpen');}));renderDetail();}
/* v5.9 — generic icons per media (function-based; not the vendors' trademarked logos) */
const PLATFORM_ICONS={
  'GA4':'<path d="M5 20v-6"/><path d="M12 20V9"/><path d="M19 20V4"/><path d="M3 20h18"/>',
  'Meta':'<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.3"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 19"/>',
  'Google Ads':'<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  'Floodlight':'<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.1.9 1.8V16h5.4v-.4c0-.7.3-1.3.9-1.8A6 6 0 0 0 12 3z"/>',
  'GTM':'<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.6"/>',
  'TikTok':'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.2v5.6l4.8-2.8z"/>',
  'Server Side':'<rect x="3" y="4" width="18" height="7" rx="1.6"/><rect x="3" y="13" width="18" height="7" rx="1.6"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
  'DataLayer':'<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".55"/>'
};
function pIcon(platform){const d=PLATFORM_ICONS[platform==='Data Layer'?'DataLayer':platform];return d?`<svg class="pIco" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`:`<span class="pTxt">${esc(shortPlatform(platform))}</span>`;}
/* v5.7: server-side helpers */
function isSS(e){return !!(e?.serverSide?.isServerSide||e?.transport==='server-side-ingress'||e?.platform==='Server Side');}
function matchesPlatform(e,f){return f==='ALL'||(f==='Server Side'?isSS(e):e.platform===f);}
function partyLabel(ss){return ss?.party==='first'?'1ª parte':ss?.party==='third'?'3ª parte':'';}
/* Same GA4 hit (tid + event) sent both straight to Google and to a server container within 3 s → double counting risk */
function dualSendOf(e){if(e.platform!=='GA4'||!e.trackingId)return null;const ts=Number(e.timestamp)||0;return events.find(x=>x!==e&&x.type==='network'&&x.platform==='GA4'&&x.siteHost===e.siteHost&&x.trackingId===e.trackingId&&normalize(x.eventName)===normalize(e.eventName)&&isSS(x)!==isSS(e)&&Math.abs((Number(x.timestamp)||0)-ts)<=3000)||null;}
function durationOf(e){return Number.isFinite(e.durationMs)?e.durationMs:(e.completedAt&&(e.startedAt||e.timestamp)?Math.max(0,e.completedAt-(e.startedAt||e.timestamp)):null);}
function card(e){const cls=platformClass(e.platform),p=e.allParams||{},gtm=getGtmContainer(e.siteHost,e.timestamp),id=e.trackingId||e.conversionId||'',d=durationOf(e),ch=chips(e,p);
  return `<article class="eventCard ${cls} ${selectedEventId===e.id?'selected':''}" data-event-id="${attr(e.id)}">
  <div class="cardHead"><div class="platformIcon ${cls}" title="${attr(e.platform)}">${pIcon(e.platform)}</div>
    <div class="cardMain">
      <div class="cardMeta"><span class="cardPlatform">${esc(e.platform)}</span><span class="time">${timeText(e.timestamp)}</span></div>
      <div class="cardTitle" title="${attr(e.eventName||'Request')}">${esc(e.eventName||'Request')}</div>
      <div class="cardIdRow">${id?`<span class="cardId" title="${attr(id)}">${esc(id)}</span>`:''}${gtm?`<span class="via" title="Container GTM">${esc(gtm)}</span>`:''}${isSS(e)?`<span class="ssBadge ${e.serverSide?.party||''}" title="${attr('Server-side · '+(e.serverSide?.host||e.host||'')+(e.serverSide?.provider?' · '+e.serverSide.provider:''))}">sGTM${e.serverSide?.party?' · '+partyLabel(e.serverSide):''}</span>`:''}${dualSendOf(e)?'<span class="warnBadge" title="O mesmo evento GA4 foi enviado direto ao Google e ao server container">duplicado?</span>':''}<span class="grow"></span>${validationBadge(e)}${statusBadge(e.status,e.error||'')}</div>
    </div></div>
  ${ch?`<div class="chips">${ch}</div>`:''}
  <div class="cardFoot"><span class="cardEndpoint" title="${attr((e.method||'')+' '+(e.host||'')+(e.path||''))}"><b>${esc(e.method||'')}</b>${d!==null?` <i>${d} ms ·</i>`:''} ${esc(e.path||'')}</span>
    <div class="cardActions"><button class="copyStatusBtn" type="button" data-copy-status-id="${attr(e.id)}" title="Copiar status/erro">⧉</button><button class="aiTagBtn" type="button" data-ai-event-id="${attr(e.id)}" title="Analisar com IA">✦ Analisar</button></div></div>
</article>`;}
function chips(e,p){/* v5.6: event_name/endpoint/method were duplicated in the title and footer */const items=p.items||p['ep.items'];const vals=[['transaction_id',p['ep.transaction_id']||p.transaction_id||p.order_id],['value',p['ep.value']||p.value||p['cd[value]']],['currency',p['ep.currency']||p.currency||p['cd[currency]']],['label',e.conversionLabel],['items',Object.keys(p).filter(k=>/^pr\d+$/.test(k)).length||null]].filter(([,v])=>v!==undefined&&v!==null&&v!=='');return vals.map(([k,v])=>`<span class="chip" title="${attr(k+': '+first(v))}"><b>${esc(k)}</b><span>${esc(first(v))}</span></span>`).join('');}
/* FIX: the detail panel was rebuilt on every new event, resetting its scroll while the
   user was reading. It is only rebuilt when the selected event/tab actually changes. */
let detailSignature='';
function renderDetail(force=false){const panel=document.getElementById('detailPanel'),e=events.find(x=>x.id===selectedEventId);const sig=e?[e.id,selectedDetailTab,e.status,e.completedAt,Object.keys(e.requestHeaders||{}).length,Object.keys(e.responseHeaders||{}).length,dlSig(e),getGtmContainer(e.siteHost,e.timestamp),(e.serverSide?.cookies||[]).join(','),e.serverSide?.preview,dualSendOf(e)?.id||''].join('|'):'none';if(!force&&sig===detailSignature)return;detailSignature=sig;if(!e){panel.className='detailPanel emptyDetail';panel.innerHTML='<div class="emptyDetailText"><strong>Selecione um evento</strong><span>Clique em uma tag para ver Data Layer, GTM, parâmetros e timeline.</span></div>';return;}panel.className='detailPanel';const dl=correlateDataLayer(e),gtm=getGtmContainer(e.siteHost,e.timestamp),duration=durationOf(e);panel.innerHTML=`<div class="detailHeader"><div class="detailTop"><div class="detailBadge ${platformClass(e.platform)}" title="${attr(e.platform)}">${pIcon(e.platform)}</div><div class="detailTitleBlock"><div class="detailPlatform">${esc(e.platform)}</div><div class="detailTitle" title="${attr(e.eventName||'Request')}">${esc(e.eventName||'Request')}</div></div><button class="aiDetailBtn" id="aiDetailBtn" data-ai-event-id="${attr(e.id)}" type="button">✦ Analisar com IA</button><button class="detailClose" id="detailClose" title="Fechar (Esc)">×</button></div><div class="detailMetaRow">${(e.trackingId||e.conversionId)?`<span class="metaChip mono" title="Measurement / Pixel ID">${esc(e.trackingId||e.conversionId)}</span>`:''}${gtm?`<span class="metaChip via" title="Container GTM">${esc(gtm)}</span>`:''}${isSS(e)?`<span class="ssBadge ${e.serverSide?.party||''}">sGTM${e.serverSide?.party?' · '+partyLabel(e.serverSide):''}${e.serverSide?.provider?' · '+esc(e.serverSide.provider):''}</span>`:''}${dualSendOf(e)?'<span class="warnBadge">possível duplicidade</span>':''}<span class="metaChip mono">${timeText(e.timestamp)}</span>${duration!==null?`<span class="metaChip mono">${duration} ms</span>`:''}${statusBadge(e.status,e.error||'')}</div></div><div class="detailTabs">${detailTab('summary','Resumo')}${detailTab('datalayer','Data Layer')}${detailTab('params','Parâmetros')}${detailTab('headers','Headers')}${detailTab('response','Resposta')}${detailTab('timeline','Timeline')}</div><div class="detailBody"><section class="detailSection ${selectedDetailTab==='summary'?'active':''}">${summaryHtml(e,dl,gtm,duration)}</section><section class="detailSection ${selectedDetailTab==='datalayer'?'active':''}">${blockTitle('Evento Data Layer associado',dl?JSON.stringify(dl.data,null,2):'')}<div class="codeBox">${dl?renderObject(dl.data):'Nenhum Data Layer correspondente encontrado.'}</div></section><section class="detailSection ${selectedDetailTab==='params'?'active':''}">${kvTable('Query String',e.queryParams)}${kvTable('Body / POST',e.bodyParams)}${kvTable('Parâmetros combinados',e.allParams)}</section><section class="detailSection ${selectedDetailTab==='headers'?'active':''}">${kvTable('Request Headers',e.requestHeaders)}${kvTable('Response Headers',e.responseHeaders)}</section><section class="detailSection ${selectedDetailTab==='response'?'active':''}"><div class="infoGrid">${infoStatus(e)}${info('Status line',e.statusLine||'-')}${info('Concluído em',e.completedAt?timeText(e.completedAt):'-')}${info('Erro',e.error||'-')}</div></section><section class="detailSection ${selectedDetailTab==='timeline'?'active':''}">${timelineHtml(e,dl,gtm)}</section></div>`;const closeBtn=panel.querySelector('#detailClose');if(closeBtn){closeBtn.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();});closeBtn.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(typeof ev.stopImmediatePropagation==='function')ev.stopImmediatePropagation();selectedEventId=null;selectedDetailTab='summary';detailSignature='none';document.querySelectorAll('.eventCard.selected').forEach(c=>c.classList.remove('selected'));panel.classList.remove('mobileOpen');panel.className='detailPanel emptyDetail';panel.innerHTML='<div class="emptyDetailText"><strong>Selecione um evento</strong><span>Clique em uma tag para ver Data Layer, GTM, parâmetros e timeline.</span></div>';});}panel.querySelectorAll('.detailTab').forEach(btn=>btn.addEventListener('click',()=>{selectedDetailTab=btn.dataset.tab;renderDetail(true);}));if(window.innerWidth<=620&&selectedEventId)panel.classList.add('mobileOpen');}
function summaryHtml(e,dl,gtm,duration){return `${validationSummaryHtml(e)}<div class="infoGrid">${info('Plataforma',e.platform)}${infoStatus(e)}${info('Duração',duration!==null?duration+' ms':'-')}${info('Evento',e.eventName,'blue mono','wide')}${info('Pixel / Measurement ID',e.trackingId||e.conversionId||'-','blue mono')}${info('Endpoint',(e.method?e.method+' ':'')+(e.host||'')+(e.path||''),'mono','wide')}${(e.redirects||[]).length?info('Redirecionamentos',e.redirects.length+'× → '+(safeHost(e.redirects[e.redirects.length-1])),'mono','full'):''}${info('GTM Container',gtm||'Não identificado',gtm?'blue mono':'muted')}${isSS(e)?'':info('Transporte','Navegador → vendor (direto)','','full')}</div>${isSS(e)?serverSideHtml(e):''}${blockTitle('Data Layer relacionado',dl?JSON.stringify(dl.data,null,2):'')}<div class="codeBox">${dl?renderObject(dl.data):'Nenhum evento Data Layer correlacionado.'}</div>${blockTitle('Request (URL completa)',e.url||'')}<div class="urlBox">${esc(e.url||'')}</div>${timelineHtml(e,dl,gtm)}`;}
/* v5.7: what the browser can prove about the server-side hop */
function serverSideHtml(e){const ss=e.serverSide||{host:e.host,signals:[],cookies:[]};const dual=dualSendOf(e);
  const notes=[];
  if(ss.party==='third')notes.push(['warn','Server container em domínio de terceiros','Cookies definidos por ele não são first-party para este site e podem ser limitados por ITP/ETP. Use um subdomínio próprio (ex.: sgtm.'+esc(registrableOf(e.siteHost))+').']);
  if(ss.party==='first')notes.push(['ok','Server container em subdomínio do próprio site','Permite cookies first-party definidos pelo servidor (ex.: FPID).']);
  if(dual)notes.push(['err','Possível envio duplicado','O mesmo evento ('+esc(e.eventName)+' / '+esc(e.trackingId)+') também saiu '+(isSS(dual)?'para o server container':'direto para o Google')+' às '+timeText(dual.timestamp)+'. Se o sGTM também envia ao GA4, o evento pode ser contado duas vezes.']);
  if(ss.preview)notes.push(['info','Modo preview do sGTM','A requisição tem o header X-Gtm-Server-Preview: ela aparece no preview do server container.']);
  if(typeof e.status==='number'&&e.status>=400)notes.push(['err','O server container rejeitou o hit (HTTP '+e.status+')','Confira se existe um client que reivindique este caminho/formato no sGTM e se o domínio aponta para o container certo.']);
  if(e.status==='ERROR')notes.push(['err','O hit não chegou ao server container','Falha de rede ('+esc(e.error||'erro')+'). Bloqueadores, DNS do subdomínio, certificado ou CSP podem estar impedindo.']);
  notes.push(['info','Limite do que o navegador vê','A extensão confirma navegador → servidor. O envio servidor → GA4/Meta/Ads acontece fora do Chrome: valide no preview do sGTM ou nos logs.']);
  return `${blockTitle('Server-side (sGTM)','')}<div class="infoGrid">${info('Endpoint',ss.host||e.host||'-','mono','wide')}${info('Contexto',partyLabel(ss)||'-',ss.party==='third'?'warnText':'')}${info('Provedor',ss.provider||'Não identificado',ss.provider?'':'muted')}${info('Modo preview',ss.preview?'Sim':'Não')}${info('Cookies FP definidos',(ss.cookies||[]).join(', ')||'Nenhum observado','mono')}</div>
  ${(ss.signals||[]).length?`<ul class="ssSignals">${ss.signals.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  <div class="ssNotes">${notes.map(([k,t,d])=>`<div class="ssNote ${k}"><strong>${t}</strong><span>${d}</span></div>`).join('')}</div>`;}
function safeHost(u){try{return new URL(u).host+new URL(u).pathname;}catch(_){return String(u||'');}}
function registrableOf(host){const p=String(host||'').split('.');if(p.length<=2)return host||'seudominio.com';const l2=p.slice(-2).join('.');return /^(com|net|org|gov|edu|co)\.[a-z]{2}$/.test(l2)?p.slice(-3).join('.'):l2;}
/* v5.6: section titles with a copy button (URL, Data Layer JSON) */
function blockTitle(t,copy){return `<div class="blockTitle"><span>${esc(t)}</span>${copy?`<button type="button" class="miniCopy" data-copy-text="${attr(copy)}">Copiar</button>`:''}</div>`;}
function detailTab(id,label){return `<button class="detailTab ${selectedDetailTab===id?'active':''}" data-tab="${id}">${label}</button>`;}function info(k,v,c='',box=''){return `<div class="infoBox ${box}"><div class="k">${esc(k)}</div><div class="v ${c}" title="${attr(v)}">${esc(v)}</div></div>`;}function infoStatus(e){const meta=statusInfo(e.status,e.error||"");return `<div class="infoBox"><div class="k">Status</div><div class="v"><span class="status ${meta.cls}" data-status-tooltip="${attr(meta.tooltip)}">${esc(meta.label)}</span></div></div>`;}
function kvTable(t,o){const entries=Object.entries(o||{});return `<div class="blockTitle">${esc(t)}</div><div class="kvTable">${entries.length?entries.map(([k,v])=>`<div class="kvRow"><div class="key">${esc(k)}</div><div class="value">${esc(typeof v==='object'?JSON.stringify(v):v)}</div></div>`).join(''):'<div class="kvRow"><div class="key">—</div><div class="value">Nenhum dado</div></div>'}</div>`;}
function dlSig(e){const d=correlateDataLayer(e);return d?d.id:'';}
/* v5.6: a push is only linked when the event name matches (within 30 s) or, without a
   name match, when it happened right before the request (1.5 s). Previously any earlier
   push on the same site was shown, e.g. add_to_cart linked to a generate_lead tag. */
function correlateDataLayer(e){const ts=Number(e.timestamp)||0;const candidates=events.filter(x=>x.type==='datalayer'&&x.siteHost===e.siteHost&&(x.timestamp||0)<=ts+50);if(!candidates.length)return null;const closest=l=>l.sort((a,b)=>Math.abs(ts-a.timestamp)-Math.abs(ts-b.timestamp))[0]||null;const exact=candidates.filter(x=>normalize(x.eventName)===normalize(e.eventName)&&ts-(x.timestamp||0)<=30000);if(exact.length)return closest(exact);const near=candidates.filter(x=>ts-(x.timestamp||0)<=1500&&!/^gtm\./.test(normalize(x.eventName)));return closest(near);}
/* v5.6: GTM lookup is cached per render pass (it was a full scan for every card) */
let gtmCache=null,gtmCacheLen=-1;function gtmIndex(){if(gtmCacheLen===events.length&&gtmCache)return gtmCache;gtmCache={};events.forEach(x=>{if(x.type==='network'&&x.platform==='GTM'&&/^GTM-/i.test(x.trackingId||''))(gtmCache[x.siteHost]??=[]).push(x);});Object.values(gtmCache).forEach(l=>l.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)));gtmCacheLen=events.length;return gtmCache;}
function getGtmContainer(siteHost,ts){const l=gtmIndex()[siteHost];if(!l)return '';const hit=l.find(x=>(x.timestamp||0)<=ts);return hit?.trackingId||'';}
function timelineHtml(e,dl,gtm){const responseTs=e.completedAt||null;return `<div class="blockTitle">Timeline do evento</div><div class="timeline"><div class="step dl"><div class="stepDot">DL</div><div class="stepName">Data Layer</div><div class="stepMeta">${dl?timeText(dl.timestamp):'não correlacionado'}<br>${dl?esc(dl.eventName):''}</div></div><div class="step gtm"><div class="stepDot">G</div><div class="stepName">GTM</div><div class="stepMeta">${gtm?esc(gtm):'não identificado'}</div></div><div class="step"><div class="stepDot">↗</div><div class="stepName">${esc(e.platform)} Request</div><div class="stepMeta">${timeText(e.timestamp)}<br>${esc(e.path||'')}</div></div><div class="step response"><div class="stepDot">✓</div><div class="stepName">Resposta</div><div class="stepMeta">${responseTs?timeText(responseTs):'...'}<br>${esc(e.status??'-')}</div></div></div>`;}
function renderDL(){const q=document.getElementById('searchDL').value.trim().toLowerCase();const all=events.filter(e=>e.type==='datalayer').filter(e=>!q||str(e).includes(q));const list=all.slice(-LIST_LIMIT).reverse();document.getElementById('dlEvents').innerHTML=list.length?list.map(e=>`<article class="eventCard dlCard"><div class="cardHead"><div class="platformIcon dl" title="Data Layer">${pIcon('DataLayer')}</div><div class="cardMain"><div class="cardMeta"><span class="cardPlatform">Data Layer · ${esc(e.source==='existing'?'já existente':'push')}</span><span class="time">${timeText(e.timestamp)}</span></div><div class="cardTitle" title="${attr(e.eventName||'dataLayer.push')}">${esc(e.eventName||'dataLayer.push')}</div><div class="cardIdRow"><span class="cardId" title="${attr(e.pageUrl||e.siteHost||'')}">${esc(e.siteHost||'')}</span><span class="grow"></span><button type="button" class="miniCopy" data-copy-text="${attr(JSON.stringify(e.data,null,2))}">Copiar JSON</button></div></div></div><div class="payload">${renderObject(e.data)}</div></article>`).join('')+(all.length>LIST_LIMIT?`<div class="listNote">Mostrando os ${LIST_LIMIT} mais recentes de ${all.length}.</div>`:''):'<div class="empty"><strong>Nenhum Data Layer capturado</strong><span>Os pushes de window.dataLayer aparecem aqui em tempo real.</span></div>';}
function renderHistory(){const q=document.getElementById('searchSite').value.trim().toLowerCase(),grouped={};events.filter(Boolean).forEach(e=>{const s=e.siteHost||'site-desconhecido';(grouped[s]??=[]).push(e)});const sites=Object.entries(grouped).filter(([s])=>!q||s.toLowerCase().includes(q)).sort((a,b)=>latest(b[1])-latest(a[1]));if(!sites.length){/* FIX: title, stats and "Limpar site" stayed visible after clearing */selectedSite=q?selectedSite:null;document.getElementById('siteList').innerHTML='<div class="empty">Sem histórico.</div>';document.getElementById('historyEvents').innerHTML='';document.getElementById('historyStats').innerHTML='';document.getElementById('historySiteTitle').textContent='Histórico';document.getElementById('historySiteMeta').textContent=q?'Nenhum site corresponde à busca.':'Selecione um site.';document.getElementById('clearSite').classList.add('hidden');return;}if(!selectedSite||!grouped[selectedSite])selectedSite=sites[0][0];document.getElementById('siteList').innerHTML=sites.map(([s,l])=>`<div class="siteItem ${s===selectedSite?'active':''}" data-site="${attr(s)}"><div class="siteTop"><div class="siteHost" title="${attr(s)}">${esc(s)}</div><div class="siteCount">${l.length}</div></div><div class="siteMeta">${friendlyDate(latest(l))}</div></div>`).join('');document.querySelectorAll('.siteItem').forEach(el=>el.addEventListener('click',()=>{selectedSite=el.dataset.site;renderHistory();}));const list=grouped[selectedSite]||[];document.getElementById('historySiteTitle').textContent=selectedSite;document.getElementById('historySiteTitle').title=selectedSite;document.getElementById('historySiteMeta').textContent=`${list.length} eventos • último ${friendlyDate(latest(list))}`;document.getElementById('clearSite').classList.remove('hidden');const c={all:list.length,ga4:list.filter(x=>x.platform==='GA4').length,meta:list.filter(x=>x.platform==='Meta').length,dl:list.filter(x=>x.type==='datalayer').length};document.getElementById('historyStats').innerHTML=mini(c.all,'Eventos')+mini(c.ga4,'GA4')+mini(c.meta,'Meta')+mini(c.dl,'Data Layer');const rows=list.slice().sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).slice(0,500);document.getElementById('historyEvents').innerHTML='<div class="historyRow header"><div>Hora</div><div>Plataforma</div><div>Evento</div><div>ID / Tag</div><div>Status</div></div>'+rows.map(e=>{const pl=e.type==='datalayer'?'Data Layer':e.platform;const st=e.type==='datalayer'?'<span class="muted">—</span>':statusBadge(e.status,e.error||'');return `<div class="historyRow"><div>${timeText(e.timestamp)}</div><div><span class="platformMini ${e.type==='datalayer'?'dl':platformClass(e.platform)}">${pIcon(e.type==='datalayer'?'DataLayer':e.platform)}</span>${esc(pl)}</div><div title="${attr(e.eventName||'-')}"><b>${esc(e.eventName||'-')}</b></div><div title="${attr(e.trackingId||e.conversionId||'-')}">${esc(e.trackingId||e.conversionId||'-')}</div><div>${st}</div></div>`;}).join('')+(list.length>500?`<div class="listNote">Mostrando os 500 mais recentes de ${list.length}.</div>`:'');}
function mini(v,l){return `<div class="miniStat"><strong>${v}</strong><span>${l}</span></div>`;}function latest(l){return Math.max(0,...l.map(e=>Number(e.timestamp)||0));}function friendlyDate(ts){if(!ts)return'';const d=new Date(ts),n=new Date();return d.toDateString()===n.toDateString()?`Hoje, ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}function normalize(v){return String(v||'').trim().toLowerCase();}function shortPlatform(p){return p==='Google Ads'?'Ads':p==='Floodlight'?'FL':p==='Server Side'?'SS':p==='DataLayer'?'DL':p||'?';}function platformClass(p){return String(p||'').toLowerCase().replaceAll(' ','');}function first(v){return Array.isArray(v)?(v[0]??''):v;}function timeText(ts){const d=new Date(Number(ts)||Date.now());return d.toLocaleTimeString('pt-BR',{hour12:false})+'.'+String(d.getMilliseconds()).padStart(3,'0');}function statusBadge(s, errorMessage=""){
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
      const res=await fetch(health,{method:"GET",signal:AbortSignal.timeout(5000)});
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

/* v5.8 — tag validation: deterministic rules (validator.js) + optional AI on top */
function tagFor(e){const dl=correlateDataLayer(e);return{platform:e.platform,eventName:e.eventName,trackingId:e.trackingId,conversionId:e.conversionId,conversionLabel:e.conversionLabel,status:e.status,error:e.error,method:e.method,endpoint:e.path,path:e.path,host:e.host,siteHost:e.siteHost,transport:e.transport,
  serverSide:e.serverSide?{isServerSide:isSS(e),party:e.serverSide.party,provider:e.serverSide.provider,host:e.serverSide.host,preview:e.serverSide.preview,firstPartyCookies:e.serverSide.cookies,signals:e.serverSide.signals}:null,
  possibleDualSend:!!dualSendOf(e),gtmContainer:getGtmContainer(e.siteHost,e.timestamp),allParams:e.allParams||{},dataLayer:dl?.data||null,dataLayerTimestamp:dl?.timestamp||null};}
/* same transaction/order id fired more than once (purchase on reload, double trigger…) */
function txKey(e){const p=e.allParams||{};const f=v=>Array.isArray(v)?v[0]:v;return f(p['ep.transaction_id'])||f(p.transaction_id)||f(p['cd[order_id]'])||f(p.oid)||(e.platform==='Floodlight'?f(p.ord):'')||'';}
function duplicatesOf(e){const k=txKey(e);if(!k)return 0;return events.filter(x=>x!==e&&x.type==='network'&&x.platform===e.platform&&x.siteHost===e.siteHost&&normalize(x.eventName)===normalize(e.eventName)&&txKey(x)===k&&!isSS(x)===!isSS(e)).length;}
const validationCache=new Map();
function validationFor(e){if(!window.VentusValidator)return null;const sig=`${e.status}|${events.length}`;const c=validationCache.get(e.id);if(c&&c.sig===sig)return c.res;let res=null;try{res=VentusValidator.validateTag(tagFor(e),{duplicates:duplicatesOf(e)});}catch(err){console.warn('[Ventus] validação',err);}validationCache.set(e.id,{sig,res});if(validationCache.size>2000)validationCache.delete(validationCache.keys().next().value);return res;}
function validationBadge(e){const v=validationFor(e);if(!v)return'';const n=v.counts.high+v.counts.medium;const cls=v.counts.high?'high':v.counts.medium?'medium':'ok';const tip=v.findings.filter(f=>f.severity==='high'||f.severity==='medium').slice(0,4).map(f=>'• '+f.title).join('\n')||'Nenhum problema encontrado pelas regras';return `<span class="valBadge ${cls}" title="${attr(tip)}">${n?`⚠ ${n}`:'✓'}</span>`;}
function validationSummaryHtml(e){const v=validationFor(e);if(!v)return'';const issues=v.findings.filter(f=>f.severity!=='good');return `<div class="valSummary ${v.counts.high?'high':v.counts.medium?'medium':'ok'}"><div class="valScore">${v.score}</div><div class="valText"><strong>Validação da tag</strong><span>${esc(v.summary)}</span>${issues.length?`<ul>${issues.slice(0,3).map(f=>`<li class="${f.severity}">${esc(f.title)}</li>`).join('')}${issues.length>3?`<li class="more">+${issues.length-3} outro(s)</li>`:''}</ul>`:''}</div><button type="button" class="aiTagBtn" data-ai-event-id="${attr(e.id)}">Ver validação completa</button></div>`;}

const aiCache=new Map();
async function analyzeEventById(eventId,opts={}){
  const modal=document.getElementById("aiModal");
  const result=document.getElementById("aiResult");
  const loading=document.getElementById("aiLoading");
  if(modal) modal.classList.remove("hidden");
  if(result) result.innerHTML="";
  const e=events.find(x=>x?.id===eventId);
  if(!e){showAiUiError("A tag selecionada não está mais disponível no histórico atual.");return;}

  const tag=tagFor(e);
  const rules=VentusValidator.validateTag(tag,{duplicates:duplicatesOf(e)});
  /* rules render instantly; the AI (if online) is added when it answers */
  renderAIAnalysis({source:"rules",rules,pending:true},e);
  if(loading) loading.classList.remove("hidden");

  const cacheKey=`${e.id}|${e.status}`;
  if(!opts.force&&aiCache.has(cacheKey)){if(loading)loading.classList.add("hidden");renderAIAnalysis({source:"ai",ai:aiCache.get(cacheKey),rules,cached:true},e);return;}

  const payload=sanitizeForAI({...tag,queryParams:e.queryParams,bodyParams:e.bodyParams,requestHeaders:e.requestHeaders,responseHeaders:e.responseHeaders,
    timing:{requestTimestamp:e.timestamp,dataLayerTimestamp:tag.dataLayerTimestamp,completedAt:e.completedAt||null},
    ruleValidation:{score:rules.score,findings:rules.findings.map(f=>({severity:f.severity,title:f.title,text:f.text,param:f.param})),checks:rules.checks}});
  try{
    const endpoint=await getAiEndpoint();
    const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-Ventus-Version":chrome.runtime.getManifest().version},body:JSON.stringify({tag:payload}),signal:AbortSignal.timeout(25000)});
    if(!response.ok){let msg="";try{msg=(await response.json())?.error||"";}catch(_){}throw new Error(msg||`HTTP ${response.status}`);}
    const ai=await response.json();
    aiCache.set(cacheKey,ai);
    updateAiConnection("online","IA online");
    if(loading)loading.classList.add("hidden");
    renderAIAnalysis({source:"ai",ai,rules},e);
  }catch(remoteError){
    updateAiConnection("offline","IA offline");
    if(loading)loading.classList.add("hidden");
    const reason=remoteError?.name==="TimeoutError"||remoteError?.name==="AbortError"?"tempo limite excedido":(remoteError?.message||"falha ao chamar o backend");
    renderAIAnalysis({source:"rules",rules,fallbackReason:reason},e);
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
    }).finally(()=>clearTimeout(timer));

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
  badge.title=text;
  /* FIX: textContent erased the .aiConnectionDot/.aiConnectionText spans from v5.3,
     so the pill lost its indicator and layout after the first health check. */
  let dot=badge.querySelector(".aiConnectionDot");
  let label=badge.querySelector(".aiConnectionText");
  if(!dot||!label){
    badge.innerHTML='<span class="aiConnectionDot" aria-hidden="true"></span><span class="aiConnectionText"></span>';
    label=badge.querySelector(".aiConnectionText");
  }
  label.textContent=text;
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
  /* FIX: Meta/Google Ads user data uses short keys (em, ph, fn, ln, ud[em], user_data.em...) */
  const shortKeys=["em","ph","fn","ln","db","ge","ct","st","zp","external_id"];
  const leaf=lower.replace(/\]$/,"").split(/[.\[]/).pop();

  if(blockedKeys.some(k=>lower===k||lower.endsWith(`.${k}`)||lower.includes(k))||shortKeys.includes(leaf)){
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

function severityLabel(s){return s==="high"?"Crítico":s==="medium"?"Atenção":s==="low"?"Info":"OK";}
function scoreClass(n){return n===null||n===undefined?"":n>=80?"good":n>=50?"medium":"high";}
function findingHtml(f){return `<div class="aiFinding ${esc(f.severity||"low")}"><div class="aiFindingHead"><span class="sevPill ${esc(f.severity||"low")}">${severityLabel(f.severity)}</span><div class="aiFindingTitle">${esc(f.title||"Ponto identificado")}</div>${f.param?`<code class="aiParam">${esc(f.param)}</code>`:""}</div>${f.text?`<div class="aiFindingText">${esc(f.text)}</div>`:""}${f.fix?`<div class="aiFix"><b>Como corrigir:</b> ${esc(f.fix)}</div>`:""}</div>`;}
function checksHtml(checks){if(!checks?.length)return"";return `<div class="aiSection"><h3>Checklist da tag</h3><div class="aiChecks">${checks.map(c=>`<div class="aiCheck ${esc(c.status)}"><span class="ckIcon">${c.status==="ok"?"✓":c.status==="error"?"✕":c.status==="warn"?"!":"i"}</span><span class="ckLabel">${esc(c.label)}</span><span class="ckValue" title="${attr(c.value)}">${esc(c.value)}</span>${c.note?`<span class="ckNote">${esc(c.note)}</span>`:""}</div>`).join("")}</div></div>`;}
function reportText(data,event){const r=data.rules;const lines=[`Ventus · validação de ${event.platform} · ${event.eventName}`,`Score (regras): ${r.score}/100 — ${r.summary}`];if(data.ai)lines.push(`Score (IA): ${data.ai.score??"-"} — ${data.ai.summary||""}`);lines.push("","Checklist:");r.checks.forEach(c=>lines.push(`- ${c.label}: ${c.value} [${c.status}]`));const all=[...r.findings,...(data.ai?.findings||[])].filter(f=>f.severity!=="good");if(all.length){lines.push("","Problemas:");all.forEach(f=>lines.push(`- (${severityLabel(f.severity)}) ${f.title}${f.text?": "+f.text:""}${f.fix?" → "+f.fix:""}`));}return lines.join("\n");}

function renderAIAnalysis(data,event){
  if(typeof data==="string"){aiResult.innerHTML=`<pre class="aiRaw">${esc(data)}</pre>`;return;}
  const r=data.rules;const ai=data.ai&&typeof data.ai==="object"?data.ai:null;
  const score=ai&&Number.isFinite(Number(ai.score))?Number(ai.score):r.score;
  const issues=r.findings.filter(f=>f.severity!=="good"),goods=r.findings.filter(f=>f.severity==="good");
  const aiFindings=(ai?.findings||[]).filter(f=>!r.findings.some(x=>normalize(x.title)===normalize(f.title)));
  const sourceBadge=ai?`<span class="srcBadge ai">IA + regras${data.cached?" · cache":""}</span>`:data.pending?`<span class="srcBadge">Regras · consultando IA…</span>`:`<span class="srcBadge">Regras locais</span>`;
  aiResult.innerHTML=`
    <div class="aiScore ${scoreClass(score)}">
      <div class="aiScoreNumber">${esc(score??"—")}</div>
      <div class="aiScoreText">
        <h3>${esc(event.platform||"Tag")} · ${esc(event.eventName||"Evento")}</h3>
        <p>${esc(ai?.summary||r.summary)}</p>
        <div class="aiMetaRow">${sourceBadge}${r.counts.high?`<span class="sevPill high">${r.counts.high} crítico(s)</span>`:""}${r.counts.medium?`<span class="sevPill medium">${r.counts.medium} atenção</span>`:""}${data.fallbackReason?`<span class="aiOffline" title="${attr(data.fallbackReason)}">IA indisponível: ${esc(data.fallbackReason)}</span>`:""}</div>
      </div>
    </div>
    <div class="aiToolbar"><button type="button" class="miniCopy" data-copy-text="${attr(reportText(data,event))}">Copiar relatório</button>${ai?`<button type="button" class="miniCopy" data-ai-reanalyze="${attr(event.id)}">Reanalisar com IA</button>`:""}</div>
    ${issues.length?`<div class="aiSection"><h3>Problemas encontrados (${issues.length})</h3>${issues.map(findingHtml).join("")}</div>`:`<div class="aiSection"><div class="aiFinding good"><div class="aiFindingHead"><span class="sevPill good">OK</span><div class="aiFindingTitle">Nenhum problema encontrado pelas regras</div></div><div class="aiFindingText">Os parâmetros obrigatórios e recomendados para este evento estão presentes e no formato correto.</div></div></div>`}
    ${aiFindings.length?`<div class="aiSection"><h3>Análise da IA</h3>${aiFindings.map(findingHtml).join("")}</div>`:""}
    ${checksHtml(r.checks)}
    ${goods.length?`<details class="aiSection aiGood"><summary>O que está correto (${goods.length})</summary>${goods.map(findingHtml).join("")}</details>`:""}
  `;
}
document.addEventListener("click",ev=>{const b=ev.target.closest?.("[data-ai-reanalyze]");if(!b)return;ev.preventDefault();ev.stopPropagation();analyzeEventById(b.dataset.aiReanalyze,{force:true});},true);

const ventusPowerToggle=document.getElementById("ventusPowerToggle");
const ventusPowerLabel=document.getElementById("ventusPowerLabel");
function applyVentusPowerState(enabled){
  if(ventusPowerToggle)ventusPowerToggle.checked=enabled;
  if(ventusPowerLabel)ventusPowerLabel.textContent=enabled?"Ligado":"Desligado";
  document.body.classList.toggle("ventusPaused",!enabled);
  const monitor=document.querySelector(".monitor");
  /* FIX: innerHTML removed the .monitorText span used by the responsive header CSS */
  if(monitor)monitor.innerHTML=`<span class="dot"></span><span class="monitorText">${enabled?'Monitorando':'Captura pausada'}</span>`;
}
chrome.runtime.sendMessage({type:"VENTUS_GET_ENABLED"},r=>{if(chrome.runtime.lastError)return;applyVentusPowerState(r?.enabled!==false);});
if(ventusPowerToggle){
  ventusPowerToggle.addEventListener("change",()=>{
    const wanted=ventusPowerToggle.checked;chrome.runtime.sendMessage({type:"VENTUS_SET_ENABLED",enabled:wanted},r=>{if(chrome.runtime.lastError){applyVentusPowerState(!wanted);return;}applyVentusPowerState(r?.enabled!==false);});
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

  const gtmContainer = event.gtmContainer || getGtmContainer(event.siteHost, event.timestamp);
  if (gtmContainer) {
    lines.push(`GTM: ${gtmContainer}`);
  }

  if (event.transport) {
    lines.push(`Transporte: ${event.transport}`);
  }
  if (isSS(event) && event.serverSide) {
    const ss = event.serverSide;
    lines.push(`Server-side: ${ss.host || "-"} (${partyLabel(ss) || "contexto desconhecido"}${ss.provider ? ", " + ss.provider : ""}${ss.preview ? ", preview" : ""})`);
    if ((ss.cookies || []).length) lines.push(`Cookies FP: ${ss.cookies.join(", ")}`);
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
    ventusThemeIcon.innerHTML=selected==="dark"
      ?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      :'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
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


/* v5.6 — copy buttons inside the detail / Data Layer views, and Esc to close */
document.addEventListener("click", async ev => {
  const btn = ev.target.closest?.("[data-copy-text]");
  if (!btn) return;
  ev.preventDefault(); ev.stopPropagation();
  try { await copyText(btn.dataset.copyText || ""); btn.textContent = "Copiado ✓"; btn.classList.add("copied"); }
  catch (_) { btn.textContent = "Falhou"; }
  clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = btn.dataset.label || "Copiar"; btn.classList.remove("copied"); }, 1200);
}, true);
document.addEventListener("pointerdown", ev => { const b = ev.target.closest?.("[data-copy-text]"); if (b && !b.dataset.label) b.dataset.label = b.textContent; }, true);
document.addEventListener("keydown", ev => {
  if (ev.key !== "Escape") return;
  const open = [...document.querySelectorAll(".aiModal")].find(m => !m.classList.contains("hidden"));
  if (open) { open.classList.add("hidden"); return; }
  document.getElementById("detailClose")?.click();
});
