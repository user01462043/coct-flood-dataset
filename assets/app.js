let events = [], spGeo = null, mpGeo = null, mnGeo = null, impactCategories = [];
let map, geoLayer, timeChart, categoryChart, domainChart, topLocationChart, sourceChart, severityChart;
let activeFrameworkTab = 'Built environment';

const layerMeta = {
  sp: { file: 'data/sp_areas.geojson', nameField: 'SP_NAME', normField: 'sp_norm', label: 'Small Place' },
  mp: { file: 'data/mp_areas.geojson', nameField: 'MP_NAME', normField: 'mp_norm', label: 'Main Place' },
  municipality: { file: 'data/municipality_areas.geojson', nameField: 'MN_NAME', normField: 'mn_norm', label: 'Municipality' }
};

const $ = id => document.getElementById(id);

function showView(viewId) {
  document.querySelectorAll('.view').forEach(sec => sec.classList.remove('activeView'));
  document.getElementById(viewId)?.classList.add('activeView');
  document.querySelectorAll('.navBtn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (viewId === 'explorer' && map) setTimeout(() => map.invalidateSize(), 250);
}

function addSectionBackButtons() {
  document.querySelectorAll('.siteMain > section.view').forEach(sec => {
    if (sec.id && sec.id !== 'home' && sec.id !== 'sources' && !sec.querySelector('.viewTopActions')) {
      sec.insertAdjacentHTML('afterbegin','<div class="viewTopActions"><button class="backHome viewBtn" data-view="home">← Website contents</button></div>');
    }
  });
}

function norm(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function uniq(arr) { return [...new Set(arr.filter(x => x !== '' && x !== null && x !== undefined))].sort(); }
function codeSort(a, b) {
  const [ad = 0, ac = 0] = (a || '').toString().split('.').map(Number);
  const [bd = 0, bc = 0] = (b || '').toString().split('.').map(Number);
  return (ad - bd) || (ac - bc);
}
function codeDomainLabel(code) {
  const cat = impactCategories.find(r => r.code === code);
  return cat ? `${cat.category} (${code})` : `Classification code (${code})`;
}
function colorScale(n) { return n > 20 ? '#7f1d1d' : n > 10 ? '#b91c1c' : n > 5 ? '#ef4444' : n > 0 ? '#fca5a5' : '#e5e7eb'; }

function initMap() {
  map = L.map('map').setView([-33.93, 18.55], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = '<b>Record count</b><br><i style="background:#e5e7eb"></i>0<br><i style="background:#fca5a5"></i>1–5<br><i style="background:#ef4444"></i>6–10<br><i style="background:#b91c1c"></i>11–20<br><i style="background:#7f1d1d"></i>20+';
    return div;
  };
  legend.addTo(map);
}

async function loadData() {
  events = await fetch('data/events.json').then(r => r.json());
  impactCategories = await fetch('data/impact_categories.json').then(r => r.json()).catch(() => []);
  spGeo = await fetch(layerMeta.sp.file).then(r => r.json());
  mpGeo = await fetch(layerMeta.mp.file).then(r => r.json());
  mnGeo = await fetch(layerMeta.municipality.file).then(r => r.json());
}

function populateFilters() {
  // Source remains a simple compact checkbox list because there are only a few source types.
  populateCheckboxList(
    'sourceOptions',
    [
      { value: 'all', label: 'All sources', checked: true },
      ...uniq(events.map(e => e.Source)).map(v => ({ value: v, label: v }))
    ]
  );

  // Use the full Diakakis framework list, not only the codes present in the dataset.
  // This means codes such as 1.10 will still appear, even if they currently return 0 records.
  const frameworkCodes = uniq(impactCategories.map(r => r.code)).sort(codeSort);
  const eventCodes = uniq(events.map(e => e['Classification code'])).sort(codeSort);
  const codesToShow = frameworkCodes.length ? frameworkCodes : eventCodes;
  populateCodeCheckboxList('categoryOptions', codesToShow);

  // Restrict year selector to 2015–2024
  const years = uniq(
    events
      .map(e => e.year)
      .filter(y => /^\d{4}$/.test(y))
      .filter(y => Number(y) >= 2015 && Number(y) <= 2024)
  );

  years.forEach(y => {
    $('startYearSelect').add(new Option(y, y));
    $('endYearSelect').add(new Option(y, y));
  });

  updateLocationOptions();
  applyCheckboxSearch('locationFilterInput', 'locationOptions');
  applyCheckboxSearch('codeFilterInput', 'categoryOptions');
}
function populateCheckboxList(containerId, items) {
  const container = $(containerId);
  container.innerHTML = '';
  items.forEach(item => {
    const label = document.createElement('label');
    label.className = 'checkOption';
    label.dataset.search = norm(`${item.label} ${item.value}`);
    label.innerHTML = `<input type="checkbox" value="${String(item.value).replace(/"/g, '&quot;')}" ${item.checked ? 'checked' : ''}> <span>${item.label}</span>`;
    container.appendChild(label);
  });
}
function populateCodeCheckboxList(containerId, codes) {
  const container = $(containerId);
  container.innerHTML = '';
  const all = document.createElement('label');
  all.className = 'checkOption';
  all.dataset.search = 'all codes';
  all.innerHTML = '<input type="checkbox" value="all" checked> <span>All codes</span>';
  container.appendChild(all);

  const grouped = {};
  codes.forEach(code => {
    const cat = impactCategories.find(r => r.code === code);
    const domain = cat ? cat.category : 'Other codes';
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(code);
  });

  Object.keys(grouped).sort().forEach(domain => {
    const heading = document.createElement('div');
    heading.className = 'checkGroupHeading';
    heading.dataset.search = norm(domain);
    heading.textContent = domain;
    container.appendChild(heading);
    grouped[domain].sort(codeSort).forEach(code => {
      const label = document.createElement('label');
      label.className = 'checkOption codeOption';
      label.dataset.group = domain;
      label.dataset.search = norm(`${domain} ${code} ${codeDomainLabel(code)}`);
      label.innerHTML = `<input type="checkbox" value="${code}"> <span>${domain} (${code})</span>`;
      container.appendChild(label);
    });
  });
}
function applyCheckboxSearch(inputId, containerId) {
  const input = $(inputId);
  const container = $(containerId);
  if (!input || !container) return;
  const q = norm(input.value);
  const visibleGroups = new Set();
  container.querySelectorAll('.checkOption').forEach(label => {
    const isAll = label.querySelector('input')?.value === 'all';
    const matches = !q || isAll || (label.dataset.search || '').includes(q);
    label.style.display = matches ? 'flex' : 'none';
    if (matches && label.dataset.group) visibleGroups.add(label.dataset.group);
  });
  container.querySelectorAll('.checkGroupHeading').forEach(h => {
    const groupMatches = !q || (h.dataset.search || '').includes(q) || visibleGroups.has(h.textContent);
    h.style.display = groupMatches ? 'block' : 'none';
  });
}
function getSelectedValues(containerId) {
  const selected = Array.from($(containerId).querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
  return selected.includes('all') || selected.length === 0 ? [] : selected;
}
function clearMultiSelect(containerId) {
  $(containerId).querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = i.value === 'all'; });
}
function selectSingleOption(containerId, value) {
  $(containerId).querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = i.value === value; });
}
function handleCheckboxAll(containerId, changedInput) {
  const boxes = Array.from($(containerId).querySelectorAll('input[type=checkbox]'));
  const allBox = boxes.find(i => i.value === 'all');
  if (!allBox) return;
  if (changedInput.value === 'all' && changedInput.checked) {
    boxes.forEach(i => { if (i.value !== 'all') i.checked = false; });
  } else if (changedInput.value !== 'all' && changedInput.checked) {
    allBox.checked = false;
  }
  const anySpecific = boxes.some(i => i.value !== 'all' && i.checked);
  if (!anySpecific) allBox.checked = true;
}
function getGeo() { const l = $('layerSelect').value; return l === 'sp' ? spGeo : l === 'mp' ? mpGeo : mnGeo; }
function updateLocationOptions() {
  const meta = layerMeta[$('layerSelect').value];
  const locations = uniq(getGeo().features.map(f => f.properties[meta.nameField]));
  populateCheckboxList('locationOptions', [{ value: 'all', label: 'All locations', checked: true }, ...locations.map(n => ({ value: n, label: n }))]);
  applyCheckboxSearch('locationFilterInput', 'locationOptions');
}
function areaFilterForEvent(e) {
  const layer = $('layerSelect').value;
  const selectedLocations = getSelectedValues('locationOptions');
  if (!selectedLocations.length) return true;
  const selectedNorms = selectedLocations.map(norm);
  if (layer === 'sp') return selectedNorms.includes(e.sp_norm) || selectedNorms.includes(e.mp_norm);
  if (layer === 'mp') return selectedNorms.includes(e.mp_norm);
  return selectedNorms.includes(e.mn_norm) || selectedNorms.includes(norm(e['Metropolitan/District area']));
}
function getFilteredEvents() {
  const sources = getSelectedValues('sourceOptions');
  const codes = getSelectedValues('categoryOptions');
  const sy = $('startYearSelect').value, ey = $('endYearSelect').value, q = norm($('searchInput').value);

  return events.filter(e => {
    let ok = true;

    // Always restrict database to 2015–2024
    ok = ok && /^\d{4}$/.test(e.year) && Number(e.year) >= 2015 && Number(e.year) <= 2024;

    if (sources.length) ok = ok && sources.includes(e.Source);
    if (codes.length) ok = ok && codes.includes(e['Classification code']);
    if (sy !== 'all') ok = ok && Number(e.year) >= Number(sy);
    if (ey !== 'all') ok = ok && Number(e.year) <= Number(ey);
    if (q) ok = ok && norm(Object.values(e).join(' ')).includes(q);

    return ok && areaFilterForEvent(e);
  });
}
function redrawMap() {
  if (geoLayer) geoLayer.remove();
  const meta = layerMeta[$('layerSelect').value];
  const filtered = getFilteredEvents();
  const countByNorm = {};
  filtered.forEach(e => {
    const key = $('layerSelect').value === 'sp' ? e.sp_norm : $('layerSelect').value === 'mp' ? e.mp_norm : e.mn_norm;
    if (key) countByNorm[key] = (countByNorm[key] || 0) + 1;
  });
  geoLayer = L.geoJson(getGeo(), {
    style: f => {
      const n = countByNorm[f.properties[meta.normField]] || 0;
      return { color:'#334155', weight:0.7, fillColor:colorScale(n), fillOpacity:n ? 0.65 : 0.16 };
    },
    onEachFeature: (f, l) => {
      const name = f.properties[meta.nameField] || 'Unknown';
      const n = countByNorm[f.properties[meta.normField]] || 0;
      l.bindTooltip(`<b>${name}</b><br>${meta.label}<br>${n} filtered record(s)`);
      l.on('mouseover', () => { l.setStyle({ weight:2, color:'#0f172a' }); showAreaInfo(name,n,meta.label); });
      l.on('mouseout', () => geoLayer.resetStyle(l));
      l.on('click', () => { selectSingleOption('locationOptions', name); updateAll(false); map.fitBounds(l.getBounds(), { maxZoom:13 }); });
    }
  }).addTo(map);
  try { map.fitBounds(geoLayer.getBounds()); } catch(e) {}
}
function showAreaInfo(name,n,label){ $('selectedArea').innerHTML = `<b>${name}</b><br>${label}<br>${n} record(s) under current filters. Click the polygon to filter to this area.`; }
function updateInsights(filtered) {
  $('kpiRecords').textContent = filtered.length;
  $('kpiPlaces').textContent = uniq(filtered.map(e => e.MP_NAME || e.SP_NAME || e['Places affected'])).length;
  $('kpiYears').textContent = uniq(filtered.map(e => e.year).filter(y => /^\d{4}$/.test(y))).length;
  const layer = $('layerSelect').value;
  const nameField = layer === 'sp' ? 'SP_NAME' : layer === 'mp' ? 'MP_NAME' : 'Metropolitan/District area';
  const counts = {};
  filtered.forEach(e => { const k = e[nameField] || e.MP_NAME || e['Places affected'] || 'Unknown'; counts[k] = (counts[k] || 0) + 1; });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  $('topLocations').innerHTML = top.map(([k,v])=>`<li>${k} <span class="pill">${v}</span></li>`).join('') || '<li>No records</li>';
}
function getCategoryForCode(code) {
  return impactCategories.find(r => r.code === code);
}
function domainForCode(code) {
  return getCategoryForCode(code)?.category || 'Unmapped';
}
function countEntries(values, limit = null) {
  const counts = {};
  values.forEach(v => {
    const key = v || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return limit ? entries.slice(0, limit) : entries;
}
function renderChart(canvasId, existingChart, config) {
  const canvas = $(canvasId);
  if (!canvas) return existingChart;
  if (existingChart) existingChart.destroy();
  return new Chart(canvas, config);
}
function renderSeverityHeatmap(filtered) {
  const host = $('severityHeatmapChart');
  if (!host) return;

  if (severityChart && typeof severityChart.destroy === 'function') {
    severityChart.destroy();
  }
  severityChart = null;
  host.innerHTML = '';

  const codes = impactCategories
    .map(r => String(r.code || '').trim())
    .filter(Boolean)
    .sort(codeSort);

  const months = uniq(filtered.map(e => monthKey(e['Impact start date'])).filter(Boolean));

  if (!filtered.length || !codes.length || !months.length) {
    const empty = $('severityPlotEmpty');
    if (empty) empty.textContent = 'No records with valid dates match the current filters.';
    return;
  }

  const empty = $('severityPlotEmpty');
  if (empty) empty.textContent = '';

  const counts = {};
  filtered.forEach(e => {
    const code = String(e['Classification code'] || '').trim();
    const month = monthKey(e['Impact start date']);
    if (!code || !month || !codes.includes(code)) return;
    counts[`${code}|${month}`] = (counts[`${code}|${month}`] || 0) + 1;
  });

  if (!Object.keys(counts).length) {
    const empty = $('severityPlotEmpty');
    if (empty) empty.textContent = 'No classified records with valid dates match the current filters.';
    return;
  }

  const maxCount = Math.max(1, ...Object.values(counts));
  const monthIndex = Object.fromEntries(months.map((m, i) => [m, i]));
  const codeIndex = Object.fromEntries(codes.map((c, i) => [c, i]));

  // Fixed-width SVG: this keeps the chart visible in one view with no left-right scrolling.
  const width = 1000;
  const left = 92;
  const right = 30;
  const top = 26;
  const bottom = 112;

  // This controls vertical spacing between classification-code rows.
  const rowGap = 11;
  const plotHeight = Math.max(1, (codes.length - 1) * rowGap);
  const height = top + plotHeight + bottom;
  const plotWidth = width - left - right;


  const xForMonth = month => {
    if (months.length === 1) return left + plotWidth / 2;
    return left + (monthIndex[month] / (months.length - 1)) * plotWidth;
  };
  const yForCode = code => top + ((codes.length - 1 - codeIndex[code]) * rowGap);
    const separators = ['2.0', '3.0', '4.0']
  .filter(code => codeIndex[code] !== undefined)
  .map(code => {
    const y = yForCode(code) - rowGap / 2;
    return `
      <line
        x1="${left}"
        y1="${y}"
        x2="${width - right}"
        y2="${y}"
        stroke="#475569"
        stroke-width="2"
      />
    `;
  }).join('');

  const manyMonths = months.length > 18;
  const tickStep = months.length > 60 ? 6 : months.length > 30 ? 3 : 1;

  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const yGrid = [...codes].reverse().map(code => {
    const y = yForCode(code);
    return `
      <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="sev-grid" />
      <text x="${left - 10}" y="${y + 4}" text-anchor="end" class="sev-y-label">${esc(code)}</text>`;
  }).join('');

  const xGrid = months.map((month, i) => {
    const x = xForMonth(month);
    const mm = month.slice(5, 7);
    const showLabel = manyMonths ? (mm === '06' || mm === '12') : (tickStep <= 1 || i % tickStep === 0);
    const label = showLabel ? prettyMonth(month) : '';
    return `
      <line x1="${x}" y1="${top}" x2="${x}" y2="${top + plotHeight}" class="sev-x-grid" />
      ${label ? `<text x="${x}"y="${top + plotHeight + 28}"text-anchor="end"transform="rotate(-90 ${x} ${top + plotHeight + 28})"class="sev-x-label">${esc(label)}</text>` : ''}`;
  }).join('');

  const circles = Object.entries(counts).map(([key, n]) => {
    const [code, month] = key.split('|');
    const x = xForMonth(month);
    const y = yForCode(code);
    const r = 3.0; // fixed small dot size; darkness now represents record count.
    const opacity = 0.18 + (0.82 * n / maxCount);
    const title = `${code} · ${domainForCode(code)}\n${prettyMonth(month)}: ${n} record(s)`;
    return `
      <circle cx="${x}" cy="${y}" r="${r}" fill="#0e7490" fill-opacity="${opacity.toFixed(2)}" stroke="#082f49" stroke-opacity="0.35" stroke-width="1">
        <title>${esc(title)}</title>
      </circle>`;
  }).join('');

  const legendY = 10;
  const legendX = width - 250;
  const legend = `
    <g class="sev-legend">
      <text x="${legendX}" y="${legendY - 12}" class="sev-legend-title">Dot darkness = number of records</text>
      <circle cx="${legendX + 10}" cy="${legendY + 6}" r="4.3" fill="#0e7490" fill-opacity="0.22" stroke="#082f49" stroke-opacity="0.35" />
      <text x="${legendX + 24}" y="${legendY + 10}" class="sev-legend-label">Fewer</text>
      <circle cx="${legendX + 85}" cy="${legendY + 6}" r="4.3" fill="#0e7490" fill-opacity="0.55" stroke="#082f49" stroke-opacity="0.35" />
      <text x="${legendX + 99}" y="${legendY + 10}" class="sev-legend-label">More</text>
      <circle cx="${legendX + 158}" cy="${legendY + 6}" r="4.3" fill="#0e7490" fill-opacity="1" stroke="#082f49" stroke-opacity="0.35" />
      <text x="${legendX + 172}" y="${legendY + 10}" class="sev-legend-label">Most</text>
    </g>`;

  host.innerHTML = `
    <svg class="severitySvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Impact severity over time">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      ${yGrid}
      ${xGrid}
      ${circles}
      ${legend}
      <text x="${left + plotWidth / 2}" y="${height - 16}" text-anchor="middle" class="sev-axis-title">${manyMonths ? 'Time (June and December labels shown for readability)' : 'Time'}</text>
      <text transform="translate(18 ${top + plotHeight / 2}) rotate(-90)" text-anchor="middle" class="sev-axis-title">Diakakis impact code</text>
    </svg>`;
}
function monthKey(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
}
function prettyMonth(key) {
  const [y,m] = key.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[Number(m)-1] || m} ${y}`;
}
function updateCharts(filtered) {
  const byYear = {}; filtered.forEach(e => { if (/^\d{4}$/.test(e.year)) byYear[e.year] = (byYear[e.year] || 0) + 1; });
  const years = Object.keys(byYear).sort();
  timeChart = renderChart('timeChart', timeChart, { type:'line', data:{ labels:years, datasets:[{ label:'Flood impact records', data:years.map(y=>byYear[y]), tension:0.2 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 }}} }});

  const fullCodes = impactCategories.map(r => r.code).sort(codeSort);
  const byCat = {}; filtered.forEach(e => { const k = e['Classification code'] || 'Unknown'; byCat[k] = (byCat[k] || 0) + 1; });
  const cats = fullCodes.length ? fullCodes : Object.keys(byCat).sort(codeSort);
  categoryChart = renderChart('categoryChart', categoryChart, { type:'bar', data:{ labels:cats, datasets:[{ label:'Records', data:cats.map(c=>byCat[c] || 0) }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}}, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 }}} }});

  const domains = countEntries(filtered.map(e => domainForCode(e['Classification code'])));
  domainChart = renderChart('domainChart', domainChart, { type:'doughnut', data:{ labels:domains.map(d=>d[0]), datasets:[{ label:'Records', data:domains.map(d=>d[1]) }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' }, tooltip:{ callbacks:{ label: ctx => `${ctx.label}: ${ctx.raw} records (${filtered.length ? Math.round(ctx.raw/filtered.length*100) : 0}%)` } } } }});

  const layer = $('layerSelect').value;
  const nameField = layer === 'sp' ? 'SP_NAME' : layer === 'mp' ? 'MP_NAME' : 'Metropolitan/District area';
  const topLocations = countEntries(filtered.map(e => e[nameField] || e.MP_NAME || e.SP_NAME || e['Places affected']), 12).reverse();
  topLocationChart = renderChart('topLocationChart', topLocationChart, { type:'bar', data:{ labels:topLocations.map(d=>d[0]), datasets:[{ label:'Records', data:topLocations.map(d=>d[1]) }] }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}}, scales:{ x:{ beginAtZero:true, ticks:{ precision:0 }}} }});

  const sources = countEntries(filtered.map(e => e.Source));
  sourceChart = renderChart('sourceChart', sourceChart, { type:'pie', data:{ labels:sources.map(d=>d[0]), datasets:[{ label:'Records', data:sources.map(d=>d[1]) }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' }, tooltip:{ callbacks:{ label: ctx => `${ctx.label}: ${ctx.raw} records (${filtered.length ? Math.round(ctx.raw/filtered.length*100) : 0}%)` } } } }});

  renderSeverityHeatmap(filtered);
}
function renderTable(filtered) {
  const rows = filtered.slice(0,300).map(e => {
    const code = e['Classification code'] || '';
    const cat = getCategoryForCode(code);
    const domain = cat ? cat.category : 'Unmapped';
    return `<tr><td>${e['Impact start date'] || ''}</td><td>${e.Source || ''}</td><td><strong>${code}</strong><br><span class="pill">${domain}</span></td><td><b>${e['Places affected'] || ''}</b><br>SP: ${e.SP_NAME || '-'}<br>MP: ${e.MP_NAME || '-'}</td><td>${e['Extracted impact description'] || ''}<br><em>${e['Direct quote'] || ''}</em></td><td>${e['Link to the online source'] ? `<a href="${e['Link to the online source']}" target="_blank">source</a>` : ''}</td></tr>`;
  }).join('');
  $('recordsTable').innerHTML = `<div class="tableWrap"><table><thead><tr><th>Date</th><th>Source</th><th>Classification code</th><th>Location</th><th>Description / quote</th><th>Link</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No records match the current filters.</td></tr>'}</tbody></table></div><p class="note">Showing ${Math.min(filtered.length,300)} of ${filtered.length} matching records.</p>`;
}
function updateAll(refreshMap = true) { const filtered = getFilteredEvents(); updateInsights(filtered); updateCharts(filtered); renderTable(filtered); if (refreshMap) redrawMap(); renderFrameworkTable(); }
function downloadCSV() {
  const filtered = getFilteredEvents();
  const cols = ['event_id','Source','Classification code','impact_category_label','Impact start date','Impact end date','Places affected','SP_NAME','MP_NAME','Metropolitan/District area','Extracted impact description','Direct quote','Link to the online source'];
  const esc = v => '"' + (v ?? '').toString().replaceAll('"','""') + '"';
  const csv = [cols.join(','), ...filtered.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'filtered_flood_events.csv'; a.click(); URL.revokeObjectURL(url);
}

const sourceData = {
  emdat: {
    title:'EM-DAT', img:'assets/doc_images/processing_overview.png',
    access:['Primary access point: https://www.emdat.be/','Secondary access point: https://public.emdat.be/data'],
    description:'EM-DAT (The International Disaster Database) is a global database maintained by the Centre for Research on the Epidemiology of Disasters (CRED). It records major disasters worldwide, including floods, storms, droughts and other natural hazards.',
    role:'EM-DAT is used to identify and verify major flood events affecting the City of Cape Town and the Western Cape. The database provides information on event timing, hazard type and reported impacts at a regional or national scale.',
    strengths:['Internationally recognised disaster database.','Consistent event reporting framework.','Useful for identifying high-impact flood events.'],
    limitations:['Primarily captures larger disasters and may omit smaller local flooding incidents.','Spatial detail is often limited compared with local news reports or municipal records.','Impact descriptions are generally less detailed than narrative sources.']
  },
  saws: {
    title:'SAWS Climate Summaries', img:'assets/doc_images/saws_workflow.png',
    access:['Monthly reports accessible via Sabinet and UCT Libraries: https://journals.co.za/journal/cssa'],
    description:'The South African Weather Service (SAWS) Climate Summary of South Africa reports document significant weather and climate events occurring across the country, including flooding associated with heavy rainfall and storms.',
    role:'SAWS Climate Summaries were used to identify reported flood events and associated impacts affecting Cape Town and the Western Cape. The reports provide information on event timing, affected locations and, where available, reported impacts.',
    strengths:["Produced by South Africa's national meteorological service.",'Provides authoritative documentation of flood events and impacts.'],
    limitations:['Flood locations are reported with varying levels of spatial detail, ranging from specific neighbourhoods to broader regional descriptions.','Reports often describe impacts associated with heavy rainfall and storms, but the specific flood mechanism is not always clear.']
  },
  news: {
    title:'News media archives', img:'assets/doc_images/news_workflow.png',
    access:['UCT Libraries Newspaper Databases via the Sabinet News Clippings Archive: https://lib.uct.ac.za/all-library-resources/newspapers/newspaper-databases'],
    description:'News articles provide contemporaneous accounts of flood events and their impacts, often including affected locations, infrastructure damage, service disruptions, evacuations and other local consequences of flooding.',
    role:'News articles were used to identify reported flood events and extract detailed information on flood impacts affecting the City of Cape Town. The reports frequently provided information on event timing, affected locations, reported damages, disruptions and impacts on residents.',
    strengths:['Often provide detailed descriptions of flood impacts and consequences.','Can capture localised flooding incidents not recorded in disaster databases.'],
    limitations:['Media coverage is uneven and may favour high-profile events.','Smaller or less-publicised incidents may be under-reported.','Reported locations and event dates may vary in precision between articles.','Search results may depend on the search terms and archive coverage available at the time of data collection.']
  },
  floodlist: {
    title:'FloodList', img:'assets/doc_images/floodlist_workflow.png',
    access:['https://floodlist.com/'],
    description:'FloodList is an online flood-reporting platform that provides summaries of flood events occurring around the world, including information on affected locations, reported impacts and response activities.',
    role:'FloodList is used to identify reported flood events and associated impacts affecting the City of Cape Town. The reports provided information on event timing, affected locations, reported damages, displacement and other documented flood consequences.',
    strengths:['Provides consolidated flood-event information from multiple sources.','Frequently includes information on reported impacts and affected communities.','Useful for identifying flood events that may not be captured in other datasets.','Provides an additional source for event verification and cross-referencing.'],
    limitations:['Relies largely on secondary reporting sources and may under-represent smaller or less-publicised flood events.','Spatial detail varies between reports, with some events described at suburb level and others only at broader regional scales.','The number of Cape Town flood events identified through FloodList is limited compared with local news archives and SAWS Climate Summaries.']
  },
  service: {
    title:'Municipal service requests', img:'assets/doc_images/service_requests_workflow.png',
    access:['City of Cape Town Open Data Portal: https://odp-cctegis.opendata.arcgis.com'],
    description:'Municipal service requests are administrative records logged by residents and captured by the City of Cape Town. The records include complaint categories, dates and reported locations associated with municipal service issues, including flooding-related incidents.',
    role:'Municipal service requests were used to identify reported flooding incidents within the City of Cape Town and provide a local-scale perspective on flood occurrence. The records support spatial analyses of frequently affected areas and complement information obtained from EM-DAT, SAWS reports and media sources.',
    strengths:['Provides local-scale information on reported flooding incidents.','Large volume of records covering multiple years.','Captures community-reported impacts that may not appear in news reports or disaster databases.','Useful for identifying frequently affected locations and spatial patterns.'],
    limitations:['Only captures incidents reported to the municipality.','Reporting rates may vary between communities and over time.','Complaint categories do not always provide detailed information on realised flood impacts.','Location names may be inconsistently recorded and require spatial standardisation before analysis.']
  }
};

function linkify(text){ return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>'); }
function renderSource(key='emdat'){
  const s = sourceData[key] || sourceData.emdat;
  const combinedText = `${s.description} ${s.role}`;
  $('sourceContent').innerHTML = `
    <div class="sourceCard sourceCardStacked sourceCardCompact">
      <div class="sourceIntroBlock">
        <h3>${s.title}</h3>
        <p class="sourceCombinedText">${combinedText}</p>
        <p class="sourceAccessLine"><strong>Access link:</strong> ${s.access.map(x=>linkify(x)).join(' | ')}</p>
      </div>

      <figure class="sourceWorkflowFigure sourceWorkflowTop">
        <img src="${s.img}" alt="${s.title} workflow">
        <figcaption>${s.title} workflow figure from the methodology document.</figcaption>
      </figure>

      <div class="sourceGrid sourceStrengthsLimitations">
        <div><h4>Strengths</h4><ul>${s.strengths.map(x=>`<li>${x}</li>`).join('')}</ul></div>
        <div><h4>Limitations</h4><ul>${s.limitations.map(x=>`<li>${x}</li>`).join('')}</ul></div>
      </div>
    </div>`;
}

const methods = {
  event:{ title:'Flood-event identification and initial inclusion criteria', img:null, points:['Flood records were retained only when a report explicitly referenced flooding, inundation or flood-related disruption within the City of Cape Town municipal boundary.','Reports describing isolated burst pipes, plumbing failures or drainage issues without evidence of flooding were excluded.','For retained records, basic event metadata were captured, including publication date, event location, and start and end dates where available.','Source documents were archived to support traceability and later verification.'] },
  impact:{ title:'Flood-impact extraction and classification', img:null, points:['Impact information was extracted selectively, depending on the level of detail provided by each source type.','EM-DAT and municipal service requests were used primarily to identify and confirm flood occurrences, as they generally provide limited descriptions of realised impacts.','SAWS Climate Summaries, FloodList and news articles commonly include narrative accounts of flood consequences.','Reported impacts were extracted from source documents and then classified using the Diakakis et al. framework.'] },
  standardisation:{ title:'Spatial standardisation', img:null, points:['Reported place names were reviewed because sources used inconsistent spelling, abbreviations and different levels of geographic detail.','Where possible, locations were matched to standardised Main Place records to support consistent comparison and mapping.','Spatial standardisation supports hotspot analysis, filtering and interpretation within the City of Cape Town municipal boundary.'] },
  workflow:{ title:'Source-specific workflow examples', img:null, points:['The source tabs include workflow figures for SAWS, news archives, FloodList and municipal service requests.','The overall processing figure summarises the workflow from source review to the final flood-events database.','These figures can be replaced with higher-resolution final versions later without changing the website structure.'] }
};
function renderMethod(key='event'){
  const m = methods[key] || methods.event;

  const extra = key === 'event' ? `
    <figure class="wideFigure">
      <img src="assets/doc_images/processing_overview.png" alt="Overall flood-events database workflow">
      <figcaption>Overall workflow used to develop the final flood-events database.</figcaption>
    </figure>
  ` : '';

  $('methodContent').innerHTML =
    `<div class="methodCard oneCol">
      <div>
        <h3>${m.title}</h3>
        <ul>${m.points.map(p=>`<li>${p}</li>`).join('')}</ul>
      </div>
      ${extra}
    </div>`;
}

function countCodes(){ const c={}; events.forEach(e=>{ const code=String(e['Classification code']||'').trim(); if(code) c[code]=(c[code]||0)+1; }); return c; }
function getCategoryForCode(code){ return impactCategories.find(r=>r.code === code); }
function frameworkLabel(tab){
  const labels = {
    'Built environment': ['Built Environment', 'Codes 1.1–1.10'],
    'Mobile objects': ['Mobile Objects', 'Codes 2.1–2.10'],
    'Natural environment': ['Natural Environment', 'Codes 3.1–3.10'],
    'Human population': ['Human Population', 'Codes 4.1–4.10'],
    'frequent': ['Frequently Observed Codes', 'Calculated automatically from the dataset']
  };
  return labels[tab] || [tab, ''];
}

function updateFrameworkButtons(){
  document.querySelectorAll('[data-framework]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.framework === activeFrameworkTab);
  });
  const [title, meta] = frameworkLabel(activeFrameworkTab);
  if ($('frameworkPanelTitle')) $('frameworkPanelTitle').textContent = title;
  if ($('frameworkPanelMeta')) $('frameworkPanelMeta').textContent = meta;
}

function renderFrameworkTable(){
  if (!$('impactFrameworkTable')) return;
  updateFrameworkButtons();
  const q = norm($('frameworkSearch')?.value || '');
  const counts = countCodes();

  if (activeFrameworkTab === 'frequent') {
    let entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,15);
    if (q) entries = entries.filter(([code,count]) => {
      const cat = getCategoryForCode(code);
      const text = [code, count, cat?.category || '', cat?.description || ''].join(' ');
      return norm(text).includes(q);
    });
    const rows = entries.map(([code,count]) => {
      const cat = getCategoryForCode(code);
      const desc = cat ? cat.description : (events.find(e=>e['Classification code']===code)?.impact_category_label || 'No description available');
      const category = cat ? cat.category : 'Unmapped';
      return `<tr><td><strong>${code}</strong></td><td>${category}</td><td><span class="countPill">${count}</span></td><td>${desc}</td></tr>`;
    }).join('');
    $('impactFrameworkTable').innerHTML = `<table><thead><tr><th>Code</th><th>Domain</th><th>Dataset records</th><th>Description</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No codes found.</td></tr>'}</tbody></table><p class="note">This table is generated automatically from the current events dataset.</p>`;
    return;
  }

  let data = impactCategories.filter(r => r.category === activeFrameworkTab);
  if (q) data = data.filter(r => norm(Object.values(r).join(' ')).includes(q));
  const rows = data.map(r => `<tr><td>${r.class_number}</td><td><strong>${r.code}</strong></td><td><span class="countPill">${counts[r.code] || 0}</span></td><td>${r.description}</td></tr>`).join('');
  $('impactFrameworkTable').innerHTML = `<table><thead><tr><th>Class</th><th>Code</th><th>Dataset records</th><th>Description</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No matching framework records.</td></tr>'}</tbody></table>`;
}

async function start() {
  addSectionBackButtons();
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  initMap();
  await loadData();
  populateFilters();
  renderSource('emdat');
  renderMethod('event');
  renderFrameworkTable();
  redrawMap();
  updateAll(false);

  ['layerSelect','startYearSelect','endYearSelect'].forEach(id => $(id).addEventListener('change', () => {
    if (id === 'layerSelect') { $('locationFilterInput').value = ''; updateLocationOptions(); clearMultiSelect('locationOptions'); }
    updateAll(true);
  }));
  ['locationOptions','sourceOptions','categoryOptions'].forEach(id => $(id).addEventListener('change', e => {
    if (e.target.matches('input[type=checkbox]')) handleCheckboxAll(id, e.target);
    updateAll(true);
  }));
  $('locationFilterInput')?.addEventListener('input', () => applyCheckboxSearch('locationFilterInput', 'locationOptions'));
  $('codeFilterInput')?.addEventListener('input', () => applyCheckboxSearch('codeFilterInput', 'categoryOptions'));
  $('searchInput').addEventListener('input', () => updateAll(true));
  $('resetBtn').addEventListener('click', () => {
    ['sourceOptions','categoryOptions','locationOptions'].forEach(clearMultiSelect);
    ['startYearSelect','endYearSelect'].forEach(id => $(id).value = 'all');
    $('searchInput').value = '';
    $('locationFilterInput').value = '';
    $('codeFilterInput').value = '';
    applyCheckboxSearch('locationFilterInput', 'locationOptions');
    applyCheckboxSearch('codeFilterInput', 'categoryOptions');
    updateAll(true);
  });
  $('downloadBtn').addEventListener('click', downloadCSV);
  $('frameworkSearch')?.addEventListener('input', renderFrameworkTable);
  document.querySelectorAll('[data-source]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-source]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderSource(btn.dataset.source); }));
  document.querySelectorAll('[data-method]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-method]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderMethod(btn.dataset.method); }));
  document.querySelectorAll('[data-framework]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-framework]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); activeFrameworkTab = btn.dataset.framework; renderFrameworkTable(); }));
}

start().catch(err => { console.error(err); document.body.insertAdjacentHTML('afterbegin', `<div class="errorBox">Website data failed to load. Use VS Code Live Server, not direct file opening. Error: ${err.message}</div>`); });

function updateSelectedFiltersSummary(){
 const box=document.getElementById('selectedFiltersSummary');
 if(!box) return;
 const checked=[...document.querySelectorAll('.checkboxList input[type=checkbox]:checked')]
 .map(x=>x.parentElement.innerText.trim())
 .filter(x=>!x.toLowerCase().includes('all '));
 box.innerHTML='<strong>Selected filters</strong><div>'+(checked.length?checked.join(', '):'None')+'</div>';
}
document.addEventListener('change',e=>{
 if(e.target.matches('.checkboxList input[type=checkbox]')) updateSelectedFiltersSummary();
});
setTimeout(updateSelectedFiltersSummary,500);
