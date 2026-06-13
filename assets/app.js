let events=[], spGeo=null, mpGeo=null, mnGeo=null, impactCategories=[];
let map, geoLayer, timeChart, categoryChart;
const layerMeta={
  sp:{file:'data/sp_areas.geojson', nameField:'SP_NAME', normField:'sp_norm', label:'Small Place'},
  mp:{file:'data/mp_areas.geojson', nameField:'MP_NAME', normField:'mp_norm', label:'Main Place'},
  municipality:{file:'data/municipality_areas.geojson', nameField:'MN_NAME', normField:'mn_norm', label:'Municipality'}
};
const $=id=>document.getElementById(id);

function showView(viewId){
  // About uses two blocks: background + objectives. All other views show one block only.
  document.querySelectorAll('.view').forEach(sec=>sec.classList.remove('activeView'));
  if(viewId === 'about'){
    document.getElementById('about')?.classList.add('activeView');
    document.getElementById('objectives')?.classList.add('activeView');
  } else {
    document.getElementById(viewId)?.classList.add('activeView');
  }
  document.querySelectorAll('.navBtn').forEach(btn=>btn.classList.toggle('active', btn.dataset.view===viewId));
  window.scrollTo({top:0, behavior:'smooth'});
  // Leaflet needs this when the map was hidden and then becomes visible.
  if(viewId === 'explorer' && map){ setTimeout(()=>map.invalidateSize(), 250); }
}
function addSectionBackButtons(){
  document.querySelectorAll('.siteMain > section.view').forEach(sec=>{
    if(sec.id && sec.id !== 'home' && !sec.querySelector('.viewTopActions')){
      sec.insertAdjacentHTML('afterbegin','<div class="viewTopActions"><button class="backHome viewBtn" data-view="home">← Website contents</button></div>');
    }
  });
}

function norm(s){return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function uniq(arr){return [...new Set(arr.filter(x=>x!==''&&x!==null&&x!==undefined))].sort();}
function colorScale(n){return n>20?'#7f1d1d':n>10?'#b91c1c':n>5?'#ef4444':n>0?'#fca5a5':'#e5e7eb';}
function initMap(){
  map=L.map('map').setView([-33.93,18.55],10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const legend=L.control({position:'bottomright'});
  legend.onAdd=()=>{const div=L.DomUtil.create('div','legend'); div.innerHTML='<b>Record count</b><br><i style="background:#e5e7eb"></i>0<br><i style="background:#fca5a5"></i>1–5<br><i style="background:#ef4444"></i>6–10<br><i style="background:#b91c1c"></i>11–20<br><i style="background:#7f1d1d"></i>20+';return div};
  legend.addTo(map);
}
async function loadData(){
  events=await fetch('data/events.json').then(r=>r.json());
  impactCategories=await fetch('data/impact_categories.json').then(r=>r.json()).catch(()=>[]);
  spGeo=await fetch(layerMeta.sp.file).then(r=>r.json());
  mpGeo=await fetch(layerMeta.mp.file).then(r=>r.json());
  mnGeo=await fetch(layerMeta.municipality.file).then(r=>r.json());
}
function populateFilters(){
  uniq(events.map(e=>e.Source)).forEach(v=>$('sourceSelect').add(new Option(v,v)));
  uniq(events.map(e=>e.impact_category_label)).forEach(v=>$('categorySelect').add(new Option(v,v)));
  const years=uniq(events.map(e=>e.year).filter(y=>/^\d{4}$/.test(y)));
  years.forEach(y=>{$('startYearSelect').add(new Option(y,y));$('endYearSelect').add(new Option(y,y));});
  updateLocationOptions();
}
function getGeo(){const l=$('layerSelect').value; return l==='sp'?spGeo:l==='mp'?mpGeo:mnGeo;}
function updateLocationOptions(){
  const sel=$('locationSelect'); sel.innerHTML='<option value="all">All locations</option>';
  const meta=layerMeta[$('layerSelect').value];
  const names=uniq(getGeo().features.map(f=>f.properties[meta.nameField]));
  names.forEach(n=>sel.add(new Option(n,n)));
}
function areaFilterForEvent(e){
  const layer=$('layerSelect').value; const selected=$('locationSelect').value;
  if(selected==='all') return true;
  const selectedNorm=norm(selected);
  if(layer==='sp') return e.sp_norm===selectedNorm || e.mp_norm===selectedNorm;
  if(layer==='mp') return e.mp_norm===selectedNorm;
  return e.mn_norm===selectedNorm || norm(e['Metropolitan/District area'])===selectedNorm;
}
function getFilteredEvents(){
  const source=$('sourceSelect').value, cat=$('categorySelect').value, sy=$('startYearSelect').value, ey=$('endYearSelect').value, q=norm($('searchInput').value);
  return events.filter(e=>{
    let ok=true;
    if(source!=='all') ok=ok&&e.Source===source;
    if(cat!=='all') ok=ok&&e.impact_category_label===cat;
    if(sy!=='all') ok=ok&&/^\d{4}$/.test(e.year)&&Number(e.year)>=Number(sy);
    if(ey!=='all') ok=ok&&/^\d{4}$/.test(e.year)&&Number(e.year)<=Number(ey);
    if(q) ok=ok&&norm(Object.values(e).join(' ')).includes(q);
    ok=ok&&areaFilterForEvent(e);
    return ok;
  });
}
function redrawMap(){
  if(geoLayer) geoLayer.remove();
  const meta=layerMeta[$('layerSelect').value];
  const filtered=getFilteredEvents();
  const countByNorm={};
  filtered.forEach(e=>{const key=$('layerSelect').value==='sp'?e.sp_norm:($('layerSelect').value==='mp'?e.mp_norm:e.mn_norm); if(key) countByNorm[key]=(countByNorm[key]||0)+1;});
  geoLayer=L.geoJson(getGeo(),{
    style:f=>{const n=countByNorm[f.properties[meta.normField]]||0; return {color:'#334155',weight:0.7,fillColor:colorScale(n),fillOpacity:n?0.65:0.16};},
    onEachFeature:(f,l)=>{
      const name=f.properties[meta.nameField]||'Unknown'; const n=countByNorm[f.properties[meta.normField]]||0;
      l.bindTooltip(`<b>${name}</b><br>${meta.label}<br>${n} filtered record(s)`);
      l.on('mouseover',()=>{l.setStyle({weight:2,color:'#0f172a'}); showAreaInfo(name,n,meta.label);});
      l.on('mouseout',()=>geoLayer.resetStyle(l));
      l.on('click',()=>{$('locationSelect').value=name; updateAll(false); map.fitBounds(l.getBounds(),{maxZoom:13});});
    }
  }).addTo(map);
  try{map.fitBounds(geoLayer.getBounds());}catch(e){}
}
function showAreaInfo(name,n,label){$('selectedArea').innerHTML=`<b>${name}</b><br>${label}<br>${n} record(s) under current filters. Click the polygon to filter to this area.`;}
function updateInsights(filtered){
  $('kpiRecords').textContent=filtered.length;
  $('kpiPlaces').textContent=uniq(filtered.map(e=>e.MP_NAME||e.SP_NAME||e['Places affected'])).length;
  $('kpiYears').textContent=uniq(filtered.map(e=>e.year).filter(y=>/^\d{4}$/.test(y))).length;
  const layer=$('layerSelect').value; const nameField=layer==='sp'?'SP_NAME':layer==='mp'?'MP_NAME':'Metropolitan/District area';
  const counts={}; filtered.forEach(e=>{const k=e[nameField]||e.MP_NAME||e['Places affected']||'Unknown'; counts[k]=(counts[k]||0)+1;});
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  $('topLocations').innerHTML=top.map(([k,v])=>`<li>${k} <span class="pill">${v}</span></li>`).join('')||'<li>No records</li>';
}
function updateCharts(filtered){
  const byYear={}; filtered.forEach(e=>{if(/^\d{4}$/.test(e.year)) byYear[e.year]=(byYear[e.year]||0)+1;});
  const years=Object.keys(byYear).sort();
  if(timeChart) timeChart.destroy();
  timeChart=new Chart($('timeChart'),{type:'line',data:{labels:years,datasets:[{label:'Flood impact records',data:years.map(y=>byYear[y]),tension:.2}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
  const byCat={}; filtered.forEach(e=>{const k=e['Classification code']||'Unknown'; byCat[k]=(byCat[k]||0)+1;});
  const cats=Object.keys(byCat).sort((a,b)=>parseFloat(a)-parseFloat(b));
  if(categoryChart) categoryChart.destroy();
  categoryChart=new Chart($('categoryChart'),{type:'bar',data:{labels:cats,datasets:[{label:'Records',data:cats.map(c=>byCat[c])}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
}
function renderTable(filtered){
  const rows=filtered.slice(0,300).map(e=>`<tr><td>${e['Impact start date']||''}</td><td>${e.Source||''}</td><td>${e['Classification code']||''}<br><span class="pill">${e.impact_category_label||''}</span></td><td><b>${e['Places affected']||''}</b><br>SP: ${e.SP_NAME||'-'}<br>MP: ${e.MP_NAME||'-'}</td><td>${e['Extracted impact description']||''}<br><em>${e['Direct quote']||''}</em></td><td>${e['Link to the online source']?`<a href="${e['Link to the online source']}" target="_blank">source</a>`:''}</td></tr>`).join('');
  $('recordsTable').innerHTML=`<div class="tableWrap"><table><thead><tr><th>Date</th><th>Source</th><th>Category</th><th>Location</th><th>Description / quote</th><th>Link</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No records match the current filters.</td></tr>'}</tbody></table></div><p class="note">Showing ${Math.min(filtered.length,300)} of ${filtered.length} matching records.</p>`;
}
function updateAll(refreshMap=true){const filtered=getFilteredEvents(); updateInsights(filtered); updateCharts(filtered); renderTable(filtered); if(refreshMap) redrawMap();}
function downloadCSV(){
  const filtered=getFilteredEvents();
  const cols=['event_id','Source','Classification code','impact_category_label','Impact start date','Impact end date','Places affected','SP_NAME','MP_NAME','Metropolitan/District area','Extracted impact description','Direct quote','Link to the online source'];
  const esc=v=>'"'+(v??'').toString().replaceAll('"','""')+'"';
  const csv=[cols.join(','),...filtered.map(r=>cols.map(c=>esc(r[c])).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='filtered_flood_impacts.csv'; a.click(); URL.revokeObjectURL(url);
}
function renderFrameworkTable(){
  if(!$('impactFrameworkTable')) return;
  const q=norm($('frameworkSearch')?.value||'');
  const data=impactCategories.filter(r=>!q || norm(Object.values(r).join(' ')).includes(q));
  const rows=data.map(r=>`<tr><td>${r.category}</td><td>${r.category_number}</td><td>${r.class_number}</td><td><strong>${r.code}</strong></td><td>${r.description}</td></tr>`).join('');
  $('impactFrameworkTable').innerHTML=`<table><thead><tr><th>Category</th><th>Category no.</th><th>Class no.</th><th>Code</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
}
const methods={
  saws:{title:'South African Weather Service (SAWS)', img:'assets/doc_images/figure_3.png', link:'https://journals.co.za/journal/cssa', points:['Source: Climate Summary of South Africa reports accessed via SABINET archives.','Included events that directly referenced Cape Town or the Western Cape and clearly described flood occurrence.','Extraction captured publication date, event dates where available, location, flood type if provided, reported impacts and direct quotes.','Main limitation: reports are often monthly and spatial descriptions can be inconsistent or broad.']},
  news:{title:'News articles', img:'assets/doc_images/figure_2.png', link:'https://lib.uct.ac.za/all-library-resources/newspapers/newspaper-databases', points:['Source: UCT Libraries/Sabinet Discover and Google searches.','Searches used combinations such as Cape Town AND rain AND flood, with Khayelitsha used as a focused case-study search term.','Extraction captured article title, publication date, URL, event dates, locations mentioned and summary of impacts.','Main limitation: media coverage is uneven and may over-represent highly visible events.']},
  floodlist:{title:'FloodList', img:'assets/doc_images/figure_4.png', link:'https://floodlist.com/', points:['Source: FloodList website search.','Search terms included Cape Town, Western Cape and South Africa.','Included confirmed impacts such as displacement, infrastructure damage, fatalities, emergency responses, or forecasted flood risk.','Main limitation: FloodList relies on secondary sources and has limited Cape Town coverage ending around 2023.']},
  emdat:{title:'EM-DAT', img:null, link:'https://public.emdat.be/data', points:['Source: EM-DAT public database downloaded in Excel format.','Records were filtered for flood-related disaster categories and narrowed to the Western Cape and Cape Town where possible.','Selected entries can be cross-checked against FloodList, news reports and municipal records.','Main limitation: EM-DAT captures larger disaster events, so smaller localised flooding is often absent.']},
  service:{title:'Municipal service requests', img:'assets/doc_images/figure_1.png', link:'https://odp-cctegis.opendata.arcgis.com', points:['Status: not yet fully integrated into the current database.','Service request records can add resident-reported impacts and help identify frequently affected areas.','Processing includes filtering for flooding-related complaints, standardising place names and aggregating daily counts.','Main limitation: service request data requires careful cleaning because complaint types and location names are inconsistent.']}
};
function renderMethod(key='saws'){
  const m=methods[key];
  $('methodContent').innerHTML=`<div class="methodCard"><div><h3>${m.title}</h3><p>${m.link?`<a href="${m.link}" target="_blank">Open source/access link</a>`:''}</p><ul>${m.points.map(p=>`<li>${p}</li>`).join('')}</ul></div>${m.img?`<figure><img src="${m.img}" alt="${m.title} workflow"><figcaption>${m.title} processing workflow.</figcaption></figure>`:''}</div>`;
}
async function start(){
  addSectionBackButtons();
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
  initMap(); await loadData(); populateFilters(); renderFrameworkTable(); renderMethod('saws'); redrawMap(); updateAll(false);
  ['layerSelect','locationSelect','sourceSelect','categorySelect','startYearSelect','endYearSelect'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='layerSelect'){updateLocationOptions();$('locationSelect').value='all';} updateAll(true);}));
  $('searchInput').addEventListener('input',()=>updateAll(true));
  $('resetBtn').addEventListener('click',()=>{['sourceSelect','categorySelect','startYearSelect','endYearSelect','locationSelect'].forEach(id=>$(id).value='all');$('searchInput').value='';updateAll(true);});
  $('downloadBtn').addEventListener('click',downloadCSV);
  $('frameworkSearch')?.addEventListener('input',renderFrameworkTable);
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderMethod(btn.dataset.method);}));
}
start().catch(err=>{console.error(err); document.body.insertAdjacentHTML('afterbegin',`<div class="errorBox">Website data failed to load. Use VS Code Live Server, not direct file opening. Error: ${err.message}</div>`);});
