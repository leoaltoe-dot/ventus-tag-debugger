let events=[];
function load(){
 chrome.runtime.sendMessage({type:"VENTUS_GET_EVENTS"},r=>{events=Array.isArray(r?.events)?r.events:[];render()});
}
load();
chrome.runtime.onMessage.addListener(m=>{if(m?.type==="VENTUS_NEW_EVENT"&&m.payload){events.push(m.payload);render()} if(m?.type==="VENTUS_REFRESH")load()});
document.getElementById("search").oninput=render;
function render(){
 const q=document.getElementById("search").value.toLowerCase();
 const tbody=document.getElementById("rows");tbody.innerHTML="";
 events.filter(Boolean).filter(e=>!q||JSON.stringify(e).toLowerCase().includes(q)).slice().reverse().forEach(e=>{
  const d=new Date(Number(e.timestamp)||Date.now());
  const tr=document.createElement("tr");
  tr.innerHTML=`<td>${d.toLocaleTimeString("pt-BR",{hour12:false})}</td><td>${x(e.siteHost)}</td><td>${e.type==="datalayer"?"DL":"Network"}</td><td>${x(e.type==="datalayer"?"Data Layer":e.platform)}</td><td>${x(e.eventName)}</td><td>${x(e.trackingId||e.conversionId||"-")}</td><td>${x(e.status??"-")}</td>`;
  tbody.appendChild(tr);
 });
}
function x(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}
