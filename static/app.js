const $ = (id) => document.getElementById(id);

let lastEnvelope = null;
let lastClients = [];
let filteredClients = [];
let lastPagination = { before: null, after: null };
let requestHistory = [];
let lastApiFetchTs = "";

const els = {
  baseUrl: $('baseUrl'), token: $('token'), rememberToken: $('rememberToken'), authPill: $('authPill'),
  checkTokenBtn: $('checkTokenBtn'), loadBtn: $('loadBtn'), loadBtnInline: $('loadBtnInline'), clearTokenBtn: $('clearTokenBtn'),
  routerFilter: $('routerFilter'), hostnameFilter: $('hostnameFilter'), networkTypeFilter: $('networkTypeFilter'), freshnessFilter: $('freshnessFilter'), cadencePreset: $('cadencePreset'),
  pageLimit: $('pageLimit'), activeCutoffMinutes: $('activeCutoffMinutes'), afterCursor: $('afterCursor'), beforeCursor: $('beforeCursor'), resetFiltersBtn: $('resetFiltersBtn'),
  copyCurlBtn: $('copyCurlBtn'), exportCsvBtn: $('exportCsvBtn'), exportShownCsvBtn: $('exportShownCsvBtn'), exportJsonBtn: $('exportJsonBtn'), showHistoryBtn: $('showHistoryBtn'),
  clientsBody: $('clientsBody'), localSearch: $('localSearch'), resultHint: $('resultHint'), rawOutput: $('rawOutput'),
  curlPreview: $('curlPreview'), refreshPreviewBtn: $('refreshPreviewBtn'), toggleRawBtn: $('toggleRawBtn'),
  prevBtn: $('prevBtn'), nextBtn: $('nextBtn'), pageInfo: $('pageInfo'), toast: $('toast'),
  statTotal: $('statTotal'), statActive: $('statActive'), statPrevious: $('statPrevious'), statWifi: $('statWifi'), statEthernet: $('statEthernet'),
  statRouters: $('statRouters'), statSnapshotAge: $('statSnapshotAge'), statApiFetch: $('statApiFetch'), snapshotNotice: $('snapshotNotice'), snapshotTitle: $('snapshotTitle'), snapshotText: $('snapshotText'), detailDialog: $('detailDialog'), detailTitle: $('detailTitle'),
  detailSubtitle: $('detailSubtitle'), detailJson: $('detailJson'), closeDialogBtn: $('closeDialogBtn'),
  emptyState: $('emptyState'), querySummary: $('querySummary'), historyCard: $('historyCard'), historyBody: $('historyBody'),
  historyEmpty: $('historyEmpty'), clearHistoryBtn: $('clearHistoryBtn'), exportHistoryBtn: $('exportHistoryBtn')
};

function init() {
  els.baseUrl.value = localStorage.getItem('lanClientsBaseUrl') || 'https://api.cradlepointecm.com';
  const savedToken = localStorage.getItem('lanClientsToken');
  if (savedToken) {
    els.token.value = savedToken;
    els.rememberToken.checked = true;
    setPill('muted', 'Token loaded from browser');
  }
  ['routerFilter','hostnameFilter','networkTypeFilter','freshnessFilter','cadencePreset','pageLimit','activeCutoffMinutes','afterCursor','beforeCursor'].forEach((id) => {
    const val = localStorage.getItem(`lanClients_${id}`);
    if (val !== null && els[id]) els[id].value = val;
    if (els[id]) {
      const eventName = els[id].tagName === 'SELECT' ? 'change' : 'input';
      els[id].addEventListener(eventName, () => {
        localStorage.setItem(`lanClients_${id}`, els[id].value);
        updateCurlPreview();
        updateQuerySummary();
        if (id === 'freshnessFilter' || id === 'activeCutoffMinutes') renderTable();
      });
    }
  });
  if (!localStorage.getItem('lanClients_cadencePreset') && els.cadencePreset) els.cadencePreset.value = 'essentials';
  applyCadencePreset({ persist: false, quiet: true });
  if (els.cadencePreset) {
    els.cadencePreset.addEventListener('change', () => {
      applyCadencePreset({ persist: true, quiet: false });
      renderTable();
    });
  }
  els.baseUrl.addEventListener('input', () => {
    localStorage.setItem('lanClientsBaseUrl', els.baseUrl.value.trim());
    updateCurlPreview();
    updateQuerySummary();
  });
  els.token.addEventListener('input', persistToken);
  els.rememberToken.addEventListener('change', persistToken);
  els.checkTokenBtn.addEventListener('click', checkToken);
  els.loadBtn.addEventListener('click', loadClients);
  if (els.loadBtnInline) els.loadBtnInline.addEventListener('click', loadClients);
  els.clearTokenBtn.addEventListener('click', clearToken);
  els.resetFiltersBtn.addEventListener('click', resetFilters);
  els.copyCurlBtn.addEventListener('click', copyCurl);
  els.exportCsvBtn.addEventListener('click', exportCsv);
  if (els.exportShownCsvBtn) els.exportShownCsvBtn.addEventListener('click', exportShownCsv);
  els.exportJsonBtn.addEventListener('click', exportJson);
  if (els.showHistoryBtn) els.showHistoryBtn.addEventListener('click', () => els.historyCard?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  if (els.clearHistoryBtn) els.clearHistoryBtn.addEventListener('click', clearHistory);
  if (els.exportHistoryBtn) els.exportHistoryBtn.addEventListener('click', exportHistory);
  els.localSearch.addEventListener('input', renderTable);
  if (els.refreshPreviewBtn) els.refreshPreviewBtn.addEventListener('click', updateCurlPreview);
  els.toggleRawBtn.addEventListener('click', toggleRaw);
  els.closeDialogBtn.addEventListener('click', () => els.detailDialog.close());
  els.prevBtn.addEventListener('click', () => useCursor('before'));
  els.nextBtn.addEventListener('click', () => useCursor('after'));
  document.querySelectorAll('[data-network]').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.networkTypeFilter.value = btn.dataset.network;
      localStorage.setItem('lanClients_networkTypeFilter', els.networkTypeFilter.value);
      updateCurlPreview();
      updateQuerySummary();
      renderTable();
    });
  });
  document.querySelectorAll('[data-freshness]').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.freshnessFilter.value = btn.dataset.freshness;
      localStorage.setItem('lanClients_freshnessFilter', els.freshnessFilter.value);
      updateQuerySummary();
      renderTable();
    });
  });
  requestHistory = loadHistory();
  renderHistory();
  updateCurlPreview();
  updateQuerySummary();
}

function persistToken() {
  if (els.rememberToken.checked && els.token.value.trim()) {
    localStorage.setItem('lanClientsToken', els.token.value.trim());
  } else {
    localStorage.removeItem('lanClientsToken');
  }
}

function clearToken() {
  els.token.value = '';
  localStorage.removeItem('lanClientsToken');
  els.rememberToken.checked = false;
  setPill('muted', 'Token cleared');
  toast('Token cleared from this browser.');
  updateCurlPreview();
}

function payload() {
  return {
    base_url: els.baseUrl.value.trim() || 'https://api.cradlepointecm.com',
    token: els.token.value.trim(),
    filters: {
      router: els.routerFilter.value.trim(),
      hostname: els.hostnameFilter.value.trim(),
      network_type: els.networkTypeFilter.value.trim()
    },
    page_limit: Number(els.pageLimit.value || 100),
    freshness_filter: els.freshnessFilter?.value || 'active',
    active_cutoff_minutes: Number(els.activeCutoffMinutes?.value || 90),
    cadence_preset: els.cadencePreset?.value || 'essentials',
    after: els.afterCursor.value.trim(),
    before: els.beforeCursor.value.trim()
  };
}

function updateQuerySummary() {
  if (!els.querySummary) return;
  const p = payload();
  const pieces = [];
  if (p.filters.router) pieces.push(`router ${p.filters.router}`);
  if (p.filters.network_type) pieces.push(labelNetwork(p.filters.network_type).replace(',', ' + '));
  if (p.filters.hostname) pieces.push(`hostname ${p.filters.hostname}`);
  const limit = Math.max(1, Math.min(Number(p.page_limit || 100), 500));
  const scope = pieces.length ? pieces.join(' · ') : 'all LAN clients visible to this token';
  const freshness = labelFreshness(p.freshness_filter, activeCutoff());
  const cadence = labelCadence(p.cadence_preset, activeCutoff());
  els.querySummary.textContent = `Will request ${scope}, up to ${limit} rows for this page. The table will show ${freshness}. Freshness assumption: ${cadence}. This fetch does not force a router rescan.`;
}

function buildQueryString(redacted = false) {
  const p = payload();
  const params = new URLSearchParams();
  if (p.filters.router) params.set('filter[router]', p.filters.router);
  if (p.filters.hostname) params.set('filter[hostname]', p.filters.hostname);
  if (p.filters.network_type) params.set('filter[network_type]', p.filters.network_type);
  params.set('page[limit]', String(Math.max(1, Math.min(Number(p.page_limit || 100), 500))));
  if (p.after) params.set('page[after]', p.after);
  if (p.before) params.set('page[before]', p.before);
  return params.toString();
}

function endpointUrl() {
  const base = (els.baseUrl.value.trim() || 'https://api.cradlepointecm.com').replace(/\/+$/, '');
  try {
    const url = new URL(base.startsWith('http') ? base : `https://${base}`);
    return `${url.origin}/api/v3/beta/lan_clients`;
  } catch {
    return 'https://api.cradlepointecm.com/api/v3/beta/lan_clients';
  }
}

function updateCurlPreview() {
  const query = buildQueryString(true);
  const url = `${endpointUrl()}${query ? '?' + query : ''}`;
  els.curlPreview.textContent = `curl --location --request GET '${url}' \\\n  --header 'Accept: application/vnd.api+json' \\\n  --header 'Content-Type: application/vnd.api+json' \\\n  --header 'Authorization: Bearer <bearer token>'`;
}

async function checkToken() {
  if (!payload().token) return toast('Paste a bearer token first.');
  const startedAt = performance.now();
  const requestPayload = payload();
  setLoading(true, 'Checking…');
  setPill('working', 'Checking token');
  try {
    const res = await fetch('/api/token/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload)
    });
    const body = await res.json();
    lastEnvelope = body;
    showRaw(body);
    captureHistory('Token check', body, startedAt, requestPayload);
    if (body.ok) {
      setPill('ok', `Token OK · HTTP ${body.status_code}`);
      toast('Token check succeeded.');
    } else {
      setPill('bad', `Token check failed · HTTP ${body.status_code || res.status}`);
      toast(body.error || 'Token check failed.');
    }
  } catch (err) {
    setPill('bad', 'Token check failed');
    toast(String(err));
  } finally {
    setLoading(false);
  }
}

async function loadClients() {
  if (!payload().token) return toast('Paste a bearer token first.');
  const startedAt = performance.now();
  const requestPayload = payload();
  setLoading(true, 'Fetching…');
  setPill('working', 'Fetching stored records');
  updateCurlPreview();
  try {
    const previousReport = latestTimestampInfo(lastClients.map(normalizedClient));
    const res = await fetch('/api/lan-clients/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload)
    });
    const body = await res.json();
    lastApiFetchTs = new Date().toISOString();
    lastEnvelope = body;
    showRaw(body);
    captureHistory('Load clients', body, startedAt, requestPayload);
    if (!body.ok) {
      setPill('bad', `Fetch failed · HTTP ${body.status_code || res.status}`);
      toast(body.error || 'LAN clients request failed.');
      lastClients = [];
      renderTable();
      updateStats([]);
      updateEmptyState();
      return;
    }
    const apiPayload = body.data || {};
    lastClients = Array.isArray(apiPayload.data) ? apiPayload.data : [];
    lastPagination = apiPayload.meta?.pagination || { before: null, after: null };
    const newestReport = latestTimestampInfo(lastClients.map(normalizedClient));
    setPill('ok', `Fetched stored LAN-client records · HTTP ${body.status_code}`);
    renderTable();
    const snapText = newestReport.raw ? `Latest timestamp is ${relativeAge(newestReport.raw)} (${displayTimestampSource(newestReport)}).` : 'No usable timestamp found.';
    els.resultHint.textContent = `${lastClients.length} client${lastClients.length === 1 ? '' : 's'} returned from NCM. ${filteredClients.length} shown after freshness/search filters. ${snapText}`;
    updatePager();
    updateEmptyState();
    if (previousReport.raw && newestReport.raw && snapshotKey(previousReport.raw) === snapshotKey(newestReport.raw) && previousReport.source === newestReport.source) {
      toast(`Fetched NCM again. No newer timestamp yet; latest is still ${relativeAge(newestReport.raw)} (${displayTimestampSource(newestReport)}).`);
    } else if (newestReport.raw) {
      toast(`Fetched ${lastClients.length} LAN client${lastClients.length === 1 ? '' : 's'}. Latest timestamp: ${relativeAge(newestReport.raw)} (${displayTimestampSource(newestReport)}).`);
    } else {
      toast(`Fetched ${lastClients.length} LAN client${lastClients.length === 1 ? '' : 's'}, but no usable timestamp was returned.`);
    }
  } catch (err) {
    setPill('bad', 'Request failed');
    toast(String(err));
  } finally {
    setLoading(false);
  }
}

function normalizedClient(row) {
  const a = row.attributes || {};
  const routerId = row.relationships?.router?.data?.id || '';
  const tenantId = row.relationships?.tenant?.data?.id || '';
  const network = a.network_type || String(row.type || '').replace('lan_client_', '') || 'unknown';
  return {
    id: row.id || '', type: row.type || '', routerId, tenantId, network,
    hostname: a.hostname || '(no hostname)', ip: a.ip_address || '', mac: a.mac || '',
    connectedSeconds: Number(a.connected_seconds || 0), ipv6: a.ipv6_addresses || [],
    manufacturer: a.manufacturer || '', createdAt: a.created_at || '', updatedAt: a.updated_at || '', collectionTime: a.collection_time || '',
    band: a.band, bandwidth: a.bandwidth, psmode: a.psmode, rssi: a.rssi, ssid: a.ssid, rxrate: a.rxrate, txrate: a.txrate,
    raw: row
  };
}

function renderTable() {
  const q = els.localSearch.value.trim().toLowerCase();
  const freshness = els.freshnessFilter?.value || 'active';
  const cutoff = activeCutoff();
  filteredClients = lastClients.map(normalizedClient).filter((c) => {
    if (!matchesFreshness(c, freshness, cutoff)) return false;
    if (!q) return true;
    return [c.hostname, c.ip, c.mac, c.network, c.routerId, c.manufacturer, c.ssid, c.type]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  });
  updateStats(filteredClients, lastClients.map(normalizedClient));
  updateSnapshotNotice(filteredClients, lastClients.map(normalizedClient));
  if (lastClients.length) {
    els.resultHint.textContent = `${lastClients.length} client${lastClients.length === 1 ? '' : 's'} returned from NCM. ${filteredClients.length} shown after freshness/search filters.`;
  }
  if (!filteredClients.length) {
    const message = lastClients.length ? 'No loaded rows match the current freshness/search filter.' : 'No clients loaded yet.';
    els.clientsBody.innerHTML = `<tr><td colspan="11" class="empty">${message}</td></tr>`;
    updateEmptyState();
    return;
  }
  els.clientsBody.innerHTML = filteredClients.map((c, idx) => clientRow(c, idx)).join('');
  document.querySelectorAll('[data-detail-index]').forEach((btn) => {
    btn.addEventListener('click', () => showDetail(Number(btn.dataset.detailIndex)));
  });
  updateEmptyState();
}

function updateEmptyState() {
  if (!els.emptyState) return;
  els.emptyState.style.display = lastClients.length ? 'none' : 'grid';
}

function clientRow(c, idx) {
  const h = healthFor(c);
  const wifi = wirelessText(c);
  const ts = timestampInfoForClient(c);
  const collected = ts.raw;
  const cutoff = activeCutoff();
  const activity = activityFor(c, cutoff);
  const snapshotHint = timestampHintFor(ts);
  const activityHelp = infoTip(activityTooltipFor(c, activity, ts, cutoff), 'in-cell');
  const healthHelp = infoTip(healthTooltipFor(c), 'in-cell');
  const connectedHelp = infoTip(connectedTooltipFor(c, ts), 'mini-help');
  return `<tr>
    <td><div class="cell-line"><span class="activity ${activity.className}">${escapeHtml(activity.label)}</span>${activityHelp}</div><div class="mini">${escapeHtml(activity.detail)}</div></td>
    <td><div class="cell-line"><span class="health ${h.className}">${escapeHtml(h.label)}</span>${healthHelp}</div><div class="mini">${escapeHtml(h.detail)}</div></td>
    <td><b>${escapeHtml(c.hostname)}</b><div class="mini">${escapeHtml(c.type || 'lan_client')}</div></td>
    <td><div>${escapeHtml(c.ip || '—')}</div><div class="mono mini">${escapeHtml(c.mac || '—')}</div>${ipv6Text(c.ipv6)}</td>
    <td><span class="network ${escapeHtml(c.network)}">${escapeHtml(labelNetwork(c.network))}</span></td>
    <td><span class="mono">${escapeHtml(c.routerId || '—')}</span></td>
    <td>${formatDuration(c.connectedSeconds)}<div class="mini">as of report ${connectedHelp}</div></td>
    <td class="timestamp-cell"><div class="ts-primary">${escapeHtml(formatDateCompact(collected))}</div><div class="ts-age ${activity.warn ? 'warn' : ''}">${escapeHtml(relativeAge(collected))}</div>${snapshotHint}</td>
    <td>${escapeHtml(c.manufacturer || '—')}</td>
    <td>${wifi}</td>
    <td><button class="rowbtn" data-detail-index="${idx}">JSON</button></td>
  </tr>`;
}

function healthFor(c) {
  if (c.network === 'wifi') {
    const rssi = Number(c.rssi);
    if (!Number.isFinite(rssi)) return { className: 'unknown', label: 'Wi‑Fi', detail: 'RSSI missing' };
    if (rssi >= -50) return { className: 'great', label: 'Excellent', detail: `${rssi} dBm` };
    if (rssi >= -67) return { className: 'good', label: 'Good', detail: `${rssi} dBm` };
    if (rssi >= -75) return { className: 'fair', label: 'Fair', detail: `${rssi} dBm` };
    return { className: 'poor', label: 'Poor', detail: `${rssi} dBm` };
  }
  if (c.network === 'ethernet') return { className: 'wired', label: 'Wired', detail: 'Ethernet client' };
  if (c.network === 'bluetooth') return { className: 'unknown', label: 'Bluetooth', detail: 'BT client' };
  return { className: 'unknown', label: 'Unknown', detail: 'No type' };
}

function wirelessText(c) {
  if (c.network !== 'wifi') return '<span class="muted-text">—</span>';
  const pieces = [];
  if (c.ssid) pieces.push(`<b>${escapeHtml(c.ssid)}</b>`);
  if (c.band !== undefined && c.band !== null) pieces.push(`${escapeHtml(String(c.band))} GHz`);
  if (c.bandwidth !== undefined && c.bandwidth !== null) pieces.push(`${escapeHtml(String(c.bandwidth))} MHz`);
  if (c.rxrate !== undefined && c.rxrate !== null) pieces.push(`RX ${escapeHtml(String(c.rxrate))} Mbps*`);
  if (c.txrate !== undefined && c.txrate !== null) pieces.push(`TX ${escapeHtml(String(c.txrate))} Mbps*`);
  const help = infoTip('rxrate and txrate are last-reported Wi-Fi rate values from the endpoint. The docs call out 5-minute Advanced and 60-minute Essentials update intervals for these values. They do not represent live throughput right now.', 'mini-help');
  return `<div>${pieces.join(' · ') || 'Wi‑Fi details missing'}</div><div class="mini">*last reported, not live throughput ${help}</div>`;
}

function updateStats(rows, allRows = null) {
  const clients = rows.map ? rows : [];
  const all = allRows || clients;
  const wifi = clients.filter(c => c.network === 'wifi');
  const ethernet = clients.filter(c => c.network === 'ethernet');
  const routers = new Set(clients.map(c => c.routerId).filter(Boolean));
  const cutoff = activeCutoff();
  const active = all.filter(c => activityFor(c, cutoff).state === 'active').length;
  const previous = all.filter(c => activityFor(c, cutoff).state === 'previous').length;
  els.statTotal.textContent = all.length ? `${clients.length}/${all.length}` : '0';
  els.statActive.textContent = String(active);
  els.statPrevious.textContent = String(previous);
  els.statWifi.textContent = String(wifi.length);
  els.statEthernet.textContent = String(ethernet.length);
  els.statRouters.textContent = String(routers.size);
  if (els.statSnapshotAge) {
    const latest = latestTimestampInfo(all);
    els.statSnapshotAge.textContent = latest.raw ? relativeAge(latest.raw) : '—';
    els.statSnapshotAge.removeAttribute('title');
    els.statSnapshotAge.dataset.tip = latest.raw ? `${formatDate(latest.raw)} · ${displayTimestampSource(latest)}` : '';
  }
  if (els.statApiFetch) {
    els.statApiFetch.textContent = lastApiFetchTs ? relativeAge(lastApiFetchTs) : '—';
  }
}

function timestampInfoForClient(c) {
  if (!c) return { raw: '', source: 'none', label: 'Time unknown', isFallback: false };
  if (c.collectionTime) {
    return { raw: c.collectionTime, source: 'collection_time', label: 'Router report time', isFallback: false };
  }
  if (c.updatedAt) {
    return { raw: c.updatedAt, source: 'updated_at', label: 'Record updated time', isFallback: true };
  }
  return { raw: '', source: 'none', label: 'Time unknown', isFallback: false };
}

function latestTimestampInfo(rows) {
  const times = rows.map(c => timestampInfoForClient(c))
    .filter(info => info.raw)
    .map(info => ({ ...info, t: new Date(info.raw).getTime() }))
    .filter(x => Number.isFinite(x.t));
  if (!times.length) return { raw: '', source: 'none', label: 'Time unknown', isFallback: false };
  times.sort((a,b) => b.t - a.t);
  return times[0];
}

function latestSnapshotTime(rows) {
  return latestTimestampInfo(rows).raw;
}

function snapshotKey(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

function snapshotGroups(rows) {
  const m = new Map();
  for (const c of rows) {
    const info = timestampInfoForClient(c);
    const key = `${snapshotKey(info.raw)}|${info.source}`;
    if (!info.raw || !snapshotKey(info.raw)) continue;
    if (!m.has(key)) m.set(key, { key, raw: info.raw, source: info.source, label: info.label, isFallback: info.isFallback, count: 0 });
    m.get(key).count += 1;
  }
  return [...m.values()].sort((a,b) => new Date(b.raw).getTime() - new Date(a.raw).getTime());
}

function updateSnapshotNotice(shownRows, allRows) {
  if (!els.snapshotNotice) return;
  const rows = shownRows || [];
  if (!rows.length) {
    els.snapshotNotice.hidden = true;
    return;
  }
  const groups = snapshotGroups(rows);
  if (!groups.length) {
    els.snapshotNotice.hidden = false;
    els.snapshotTitle.textContent = 'No usable timestamp';
    els.snapshotText.textContent = 'These rows do not have collection_time or updated_at values the browser can parse, so the activity filter cannot confidently infer freshness.';
    return;
  }
  const newest = groups[0];
  const fetchText = lastApiFetchTs ? ` Last API fetch was ${relativeAge(lastApiFetchTs)}.` : '';
  const fallbackCount = rows.filter(c => timestampInfoForClient(c).isFallback).length;
  els.snapshotNotice.hidden = false;
  if (fallbackCount === rows.length) {
    els.snapshotTitle.textContent = 'No router report time returned';
    els.snapshotText.textContent = `The endpoint did not return collection_time for the shown rows. This UI is showing updated_at instead, which only means the NCM record was updated. Treat “recent” here as a lower-confidence estimate, not a confirmed live router report. Newest record update is ${relativeAge(newest.raw)}.${fetchText}`;
  } else if (fallbackCount > 0) {
    els.snapshotTitle.textContent = 'Mixed timestamp sources in this view';
    els.snapshotText.textContent = `${fallbackCount} of ${rows.length} shown row${rows.length === 1 ? '' : 's'} are missing collection_time and show updated_at instead. Rows with collection_time are stronger evidence of a router LAN-client report. Newest timestamp is ${relativeAge(newest.raw)} (${displayTimestampSource(newest)}).${fetchText}`;
  } else if (groups.length === 1 && rows.length > 1) {
    els.snapshotTitle.textContent = 'These clients came from the same router report';
    els.snapshotText.textContent = `All ${rows.length} shown client rows share the same collection_time: ${relativeAge(newest.raw)}. That usually means the router sent one LAN-client table report, not that every client independently checked in at that exact moment.${fetchText}`;
  } else {
    const totalGroups = groups.length;
    const biggest = groups.slice().sort((a,b) => b.count - a.count)[0];
    els.snapshotTitle.textContent = 'Multiple report timestamps in this view';
    els.snapshotText.textContent = `${rows.length} shown rows are spread across ${totalGroups} timestamp group${totalGroups === 1 ? '' : 's'}. Newest timestamp is ${relativeAge(newest.raw)} (${displayTimestampSource(newest)}); largest group has ${biggest.count} row${biggest.count === 1 ? '' : 's'}.${fetchText}`;
  }
}

function timestampHintFor(info) {
  if (!info.raw) {
    return `<div class="timestamp-note unknown-source"><div class="note-head"><span>Timestamp unavailable</span>${infoTip(timestampTooltipFor(info), 'mini-help')}</div><small>Cannot estimate freshness</small></div>`;
  }
  if (info.isFallback) {
    return `<div class="timestamp-note fallback-source"><div class="note-head"><span>NCM record update</span>${infoTip(timestampTooltipFor(info), 'mini-help')}</div><small>No router report time</small></div>`;
  }
  return `<div class="timestamp-note report-source"><div class="note-head"><span>Router report time</span>${infoTip(timestampTooltipFor(info), 'mini-help')}</div><small>Best available client-report timestamp</small></div>`;
}

function updatePager() {
  const before = lastPagination?.before || '';
  const after = lastPagination?.after || '';
  els.prevBtn.disabled = !before;
  els.nextBtn.disabled = !after;
  if (before || after) {
    els.pageInfo.textContent = `${before ? 'Previous page available' : 'First page'} · ${after ? 'Next page available' : 'Last page'}`;
  } else {
    els.pageInfo.textContent = lastClients.length ? 'No additional pages returned.' : 'Pagination appears after the first load.';
  }
}

function useCursor(kind) {
  const cursor = lastPagination?.[kind];
  if (!cursor) return;
  if (kind === 'after') {
    els.afterCursor.value = cursor;
    els.beforeCursor.value = '';
  } else {
    els.beforeCursor.value = cursor;
    els.afterCursor.value = '';
  }
  localStorage.setItem('lanClients_afterCursor', els.afterCursor.value);
  localStorage.setItem('lanClients_beforeCursor', els.beforeCursor.value);
  loadClients();
}

function showDetail(idx) {
  const c = filteredClients[idx];
  if (!c) return;
  els.detailTitle.textContent = c.hostname || `LAN client ${c.id}`;
  els.detailSubtitle.textContent = `${labelNetwork(c.network)} · ${c.ip || 'no IP'} · ${c.mac || 'no MAC'}`;
  els.detailJson.textContent = JSON.stringify(c.raw, null, 2);
  els.detailDialog.showModal();
}

function resetFilters() {
  ['routerFilter','hostnameFilter','networkTypeFilter','afterCursor','beforeCursor'].forEach((id) => {
    els[id].value = '';
    localStorage.removeItem(`lanClients_${id}`);
  });
  els.freshnessFilter.value = 'active';
  if (els.cadencePreset) els.cadencePreset.value = 'essentials';
  els.activeCutoffMinutes.value = 90;
  els.pageLimit.value = 100;
  localStorage.setItem('lanClients_freshnessFilter', 'active');
  localStorage.setItem('lanClients_cadencePreset', 'essentials');
  localStorage.setItem('lanClients_activeCutoffMinutes', '90');
  applyCadencePreset({ persist: false, quiet: true });
  localStorage.setItem('lanClients_pageLimit', '100');
  updateCurlPreview();
  updateQuerySummary();
  renderTable();
  toast('Filters reset.');
}

function exportCsv() {
  if (!lastClients.length) return toast('Fetch LAN clients before exporting a client list.');
  exportClientCsv(lastClients.map(normalizedClient), 'fetched');
}

function exportShownCsv() {
  if (!lastClients.length) return toast('Fetch LAN clients before exporting a client list.');
  if (!filteredClients.length) return toast('No shown clients match the current filters.');
  exportClientCsv(filteredClients, 'shown');
}

function exportClientCsv(rows, scope) {
  const headers = [
    'id','type','activity','activity_detail','timestamp_source','timestamp_age','hostname','ip_address','mac','network_type','router_id','tenant_id',
    'connected_seconds','connected_duration','collection_time','updated_at','manufacturer','ssid','band','bandwidth','psmode','rssi','rxrate','txrate','ipv6_addresses'
  ];
  const lines = [headers.join(',')];
  for (const c of rows) {
    const act = activityFor(c, activeCutoff());
    const ts = timestampInfoForClient(c);
    const vals = [
      c.id,c.type,act.label,act.detail,displayTimestampSource(ts),ts.raw ? relativeAge(ts.raw) : '',c.hostname,c.ip,c.mac,c.network,c.routerId,c.tenantId,
      c.connectedSeconds,formatDuration(c.connectedSeconds),c.collectionTime,c.updatedAt,c.manufacturer,c.ssid,c.band,c.bandwidth,c.psmode,c.rssi,c.rxrate,c.txrate,(c.ipv6 || []).join(' ')
    ];
    lines.push(vals.map(csvCell).join(','));
  }
  downloadCsv(`lan_clients_${scope}_${timestamp()}.csv`, lines);
  toast(`Exported ${rows.length} ${scope === 'shown' ? 'shown' : 'fetched'} client${rows.length === 1 ? '' : 's'} as a .csv file.`);
}

function exportJson() {
  if (!lastEnvelope) return toast('No JSON response to export yet.');
  downloadFile(`lan_clients_${timestamp()}.json`, JSON.stringify(lastEnvelope, null, 2), 'application/json');
}

function copyCurl() {
  updateCurlPreview();
  navigator.clipboard.writeText(els.curlPreview.textContent).then(() => toast('Copied curl preview with redacted token.'));
}

function showRaw(body) {
  els.rawOutput.textContent = JSON.stringify(body, null, 2);
}

function toggleRaw() {
  const isHidden = els.rawOutput.style.display === 'none';
  els.rawOutput.style.display = isHidden ? 'block' : 'none';
  els.toggleRawBtn.textContent = isHidden ? 'Collapse' : 'Expand';
}

function setLoading(loading, label = 'Loading…') {
  els.loadBtn.disabled = loading;
  if (els.loadBtnInline) els.loadBtnInline.disabled = loading;
  els.checkTokenBtn.disabled = loading;
  if (loading) {
    els.loadBtn.dataset.old = els.loadBtn.textContent;
    els.loadBtn.textContent = label;
    if (els.loadBtnInline) {
      els.loadBtnInline.dataset.old = els.loadBtnInline.textContent;
      els.loadBtnInline.textContent = label;
    }
  } else {
    els.loadBtn.textContent = els.loadBtn.dataset.old || 'Fetch latest stored records';
    if (els.loadBtnInline) els.loadBtnInline.textContent = els.loadBtnInline.dataset.old || 'Fetch latest stored records';
  }
}

function setPill(state, text) {
  els.authPill.className = `pill ${state}`;
  els.authPill.innerHTML = `<span class="dot"></span> ${escapeHtml(text)}`;
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
}


function displayTimestampSource(info) {
  const src = info?.snapshot_source || info?.source || '';
  if (src === 'collection_time') return 'router report time';
  if (src === 'updated_at') return 'record updated time, fallback';
  return info?.snapshot_label || info?.label || 'timestamp';
}

function labelNetwork(network) {
  if (network === 'wifi') return 'Wi‑Fi';
  if (network === 'ethernet') return 'Ethernet';
  if (network === 'bluetooth') return 'Bluetooth';
  if (network === 'wifi,ethernet') return 'Wi‑Fi + Ethernet';
  if (network === '') return 'All client types';
  return network || 'Unknown';
}

function activeCutoff() {
  const v = Number(els.activeCutoffMinutes?.value || 90);
  return Math.max(1, Math.min(Number.isFinite(v) ? v : 90, 1440));
}

function applyCadencePreset({ persist = true, quiet = true } = {}) {
  if (!els.cadencePreset || !els.activeCutoffMinutes) return;
  const preset = els.cadencePreset.value || 'essentials';
  if (preset === 'advanced') {
    els.activeCutoffMinutes.value = 15;
    els.activeCutoffMinutes.disabled = true;
  } else if (preset === 'essentials') {
    els.activeCutoffMinutes.value = 90;
    els.activeCutoffMinutes.disabled = true;
  } else {
    els.activeCutoffMinutes.disabled = false;
  }
  if (persist) {
    localStorage.setItem('lanClients_cadencePreset', preset);
    localStorage.setItem('lanClients_activeCutoffMinutes', els.activeCutoffMinutes.value);
  }
  updateQuerySummary();
  if (!quiet) toast(`Freshness assumption set to ${labelCadence(preset, activeCutoff())}.`);
}

function labelCadence(value, cutoff) {
  if (value === 'advanced') return 'Advanced / faster telemetry, recent <= 15 minutes';
  if (value === 'essentials') return 'Essentials / conservative, recent <= 90 minutes';
  return `Custom, recent <= ${cutoff} minutes`;
}

function labelFreshness(value, cutoff) {
  if (value === 'active') return `clients seen in a recent router report within ${cutoff} minutes`;
  if (value === 'previous') return `previously seen clients from older report timestamps beyond ${cutoff} minutes`;
  if (value === 'unknown') return 'clients with no usable report timestamp';
  return 'all known clients returned by the endpoint';
}

function matchesFreshness(c, value, cutoff) {
  const state = activityFor(c, cutoff).state;
  if (value === 'active') return state === 'active';
  if (value === 'previous') return state === 'previous';
  if (value === 'unknown') return state === 'unknown';
  return true;
}

function activityFor(c, cutoff) {
  const ts = timestampInfoForClient(c);
  const mins = ageMinutes(ts.raw);
  if (!Number.isFinite(mins)) {
    return { state: 'unknown', className: 'unknown', label: 'No timestamp', detail: 'freshness cannot be estimated', warn: true };
  }
  if (mins <= cutoff) {
    if (ts.isFallback) {
      return { state: 'active', className: 'active fallback', label: 'Record updated recently', detail: `not confirmed connected · ${relativeAge(ts.raw)}`, warn: true };
    }
    return { state: 'active', className: 'active', label: 'Recently reported', detail: `router report · ${relativeAge(ts.raw)}`, warn: false };
  }
  if (ts.isFallback) {
    return { state: 'previous', className: 'previous fallback', label: 'Older NCM record', detail: `not confirmed connected · ${relativeAge(ts.raw)}`, warn: true };
  }
  return { state: 'previous', className: 'previous', label: 'Older router report', detail: `reported ${relativeAge(ts.raw)}`, warn: true };
}

function infoTip(text, extraClass = '') {
  const safe = escapeHtml(text);
  return `<span class="info-tip ${extraClass}" tabindex="0" aria-label="${safe}" data-tip="${safe}">?</span>`;
}

function activityTooltipFor(c, activity, ts, cutoff) {
  if (!ts.raw) {
    return 'NCM did not return a usable time for this client row, so the UI cannot estimate whether it is recent or stale.';
  }
  const age = relativeAge(ts.raw);
  if (ts.isFallback) {
    return `NCM did not return collection_time for this row, so this estimate is based on updated_at. That means the stored NCM record changed ${age}; it does not prove the client is connected right now. Recent cutoff: ${cutoff} minutes.`;
  }
  if (activity.state === 'active') {
    return `This estimate is based on collection_time. The row was included in a router LAN-client report ${age}, which is inside the ${cutoff}-minute cutoff. It is still stored NCM data, not a live connected/disconnected flag.`;
  }
  return `This estimate is based on collection_time, but the router report is older than the ${cutoff}-minute cutoff (${age}). The client may be disconnected, or it may simply not have a newer stored report yet.`;
}

function timestampTooltipFor(info) {
  if (!info?.raw) {
    return 'No usable timestamp was returned. The UI cannot calculate a reliable age for this LAN-client row.';
  }
  if (info.isFallback) {
    return 'NCM did not return collection_time for this row. The time shown is updated_at, which only means the stored NCM record changed. Use it as a rough recency hint only; it does not prove the client is connected.';
  }
  return 'This timestamp comes from collection_time, the best available time for router-reported LAN-client data. Multiple clients can share one collection_time because they were part of the same stored LAN-client report.';
}

function healthTooltipFor(c) {
  if (c.network === 'wifi') {
    return 'Wi-Fi status is based on RSSI when available. RSSI is signal quality, not throughput. Missing RSSI usually means NCM did not return that wireless field for this row.';
  }
  if (c.network === 'ethernet') {
    return 'Ethernet clients do not have Wi-Fi RSSI/rate fields, so this column only marks the client as wired.';
  }
  if (c.network === 'bluetooth') {
    return 'Bluetooth clients may not include Wi-Fi-specific fields such as RSSI, SSID, rxrate, or txrate.';
  }
  return 'The endpoint returned an unknown or missing network_type for this row, so only generic status can be shown.';
}

function connectedTooltipFor(c, ts) {
  const source = ts?.isFallback ? 'record timestamp' : 'router report timestamp';
  return `connected_seconds is the duration included in the stored LAN-client record. Treat it as connection duration as of the ${source}, not as a live counter. If the client has since disconnected, this value may still appear in historical rows.`;
}

function ipv6Text(values) {
  if (!values || !values.length) return '';
  const first = escapeHtml(values[0]);
  const extra = values.length > 1 ? ` +${values.length - 1}` : '';
  return `<div class="mono mini">IPv6 ${first}${extra}</div>`;
}

function formatDuration(seconds) {
  seconds = Number(seconds || 0);
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatDateCompact(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function ageMinutes(value) {
  if (!value) return Infinity;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.round((Date.now() - d.getTime()) / 60000);
}

function relativeAge(value) {
  const mins = ageMinutes(value);
  if (!Number.isFinite(mins)) return 'time unknown';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}


function loadHistory() {
  try {
    const raw = localStorage.getItem('lanClientsRequestHistory');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem('lanClientsRequestHistory', JSON.stringify(requestHistory.slice(0, 50)));
}

function captureHistory(action, body, startedAt, requestPayload) {
  const apiPayload = body?.data || {};
  const rawRows = Array.isArray(apiPayload.data) ? apiPayload.data : [];
  const rows = rawRows.length;
  const timestampInfo = latestTimestampInfoFromRawRows(rawRows);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: new Date().toISOString(),
    action,
    ok: Boolean(body?.ok),
    status_code: body?.status_code || null,
    row_count: rows,
    snapshot_time: timestampInfo.raw,
    snapshot_source: timestampInfo.source,
    snapshot_label: timestampInfo.label,
    duration_ms: Math.round(performance.now() - startedAt),
    url: body?.requested_url || endpointUrl(),
    error: body?.error || '',
    payload: redactedPayload(requestPayload),
  };
  requestHistory = [entry, ...requestHistory].slice(0, 50);
  saveHistory();
  renderHistory();
}

function latestSnapshotFromRawRows(rows) {
  const normalized = (rows || []).map(normalizedClient);
  return latestTimestampInfo(normalized).raw;
}

function latestTimestampInfoFromRawRows(rows) {
  const normalized = (rows || []).map(normalizedClient);
  return latestTimestampInfo(normalized);
}

function redactedPayload(p) {
  return {
    base_url: p.base_url,
    filters: p.filters,
    page_limit: p.page_limit,
    after: p.after,
    before: p.before,
    freshness_filter: p.freshness_filter,
    active_cutoff_minutes: p.active_cutoff_minutes,
    cadence_preset: p.cadence_preset,
  };
}

function renderHistory() {
  if (!els.historyBody) return;
  if (!requestHistory.length) {
    els.historyBody.innerHTML = '';
    if (els.historyEmpty) els.historyEmpty.style.display = 'block';
    return;
  }
  if (els.historyEmpty) els.historyEmpty.style.display = 'none';
  els.historyBody.innerHTML = requestHistory.map((h, idx) => {
    const statusClass = h.ok ? 'ok' : 'bad';
    const statusText = h.status_code ? `HTTP ${h.status_code}` : 'No status';
    return `<tr>
      <td><div>${escapeHtml(formatDate(h.ts))}</div><div class="mini">${escapeHtml(relativeAge(h.ts))}</div></td>
      <td><b>${escapeHtml(h.action)}</b><div class="mini">${escapeHtml(historyFilterSummary(h))}</div></td>
      <td><span class="status-badge ${statusClass}">${escapeHtml(statusText)}</span>${h.error ? `<div class="mini warn">${escapeHtml(h.error)}</div>` : ''}</td>
      <td>${escapeHtml(String(h.row_count ?? '—'))}</td>
      <td><div>${escapeHtml(h.snapshot_time ? relativeAge(h.snapshot_time) : '—')}</div>${h.snapshot_time ? `<div class="mini ${h.snapshot_source === 'updated_at' ? 'warn' : ''}">${escapeHtml(displayTimestampSource(h))}</div>` : ''}</td>
      <td>${escapeHtml(String(h.duration_ms ?? '—'))} ms</td>
      <td><div class="mono mini url-cell">${escapeHtml(h.url || '—')}</div></td>
      <td><div class="button-row tight"><button class="rowbtn" data-history-replay-index="${idx}">Replay</button><button class="rowbtn" data-history-copy-index="${idx}">Copy URL</button></div></td>
    </tr>`;
  }).join('');
  document.querySelectorAll('[data-history-replay-index]').forEach((btn) => {
    btn.addEventListener('click', () => replayHistory(Number(btn.dataset.historyReplayIndex)));
  });
  document.querySelectorAll('[data-history-copy-index]').forEach((btn) => {
    btn.addEventListener('click', () => copyHistoryUrl(Number(btn.dataset.historyCopyIndex)));
  });
}

function historyFilterSummary(h) {
  const p = h.payload || {};
  const f = p.filters || {};
  const pieces = [];
  if (f.router) pieces.push(`router=${f.router}`);
  if (f.network_type) pieces.push(`network=${f.network_type}`);
  if (f.hostname) pieces.push(`hostname=${f.hostname}`);
  if (p.freshness_filter) pieces.push(`view=${p.freshness_filter}`);
  if (p.cadence_preset) pieces.push(`cadence=${p.cadence_preset}`);
  if (p.after) pieces.push('after cursor');
  if (p.before) pieces.push('before cursor');
  return pieces.length ? pieces.join(' · ') : 'no filters';
}

function replayHistory(idx) {
  const h = requestHistory[idx];
  if (!h?.payload) return;
  const p = h.payload;
  els.baseUrl.value = p.base_url || 'https://api.cradlepointecm.com';
  els.routerFilter.value = p.filters?.router || '';
  els.hostnameFilter.value = p.filters?.hostname || '';
  els.networkTypeFilter.value = p.filters?.network_type || '';
  els.pageLimit.value = p.page_limit || 100;
  els.afterCursor.value = p.after || '';
  els.beforeCursor.value = p.before || '';
  els.freshnessFilter.value = p.freshness_filter || 'active';
  if (els.cadencePreset) els.cadencePreset.value = p.cadence_preset || 'essentials';
  els.activeCutoffMinutes.value = p.active_cutoff_minutes || 90;
  applyCadencePreset({ persist: false, quiet: true });
  ['routerFilter','hostnameFilter','networkTypeFilter','freshnessFilter','cadencePreset','pageLimit','activeCutoffMinutes','afterCursor','beforeCursor'].forEach((id) => {
    localStorage.setItem(`lanClients_${id}`, els[id].value);
  });
  localStorage.setItem('lanClientsBaseUrl', els.baseUrl.value.trim());
  updateCurlPreview();
  updateQuerySummary();
  loadClients();
}

function copyHistoryUrl(idx) {
  const h = requestHistory[idx];
  if (!h?.url) return toast('No URL to copy.');
  navigator.clipboard.writeText(h.url).then(() => toast('Copied actual requested URL.'));
}

function clearHistory() {
  requestHistory = [];
  saveHistory();
  renderHistory();
  toast('GET history cleared.');
}

function exportHistory() {
  if (!requestHistory.length) return toast('No GET history to export.');
  const headers = ['fetch_time','action','ok','status_code','rows_returned','latest_timestamp','timestamp_source','duration_ms','url','filters','error'];
  const lines = [headers.join(',')];
  for (const h of requestHistory) {
    const vals = [
      h.ts,
      h.action,
      h.ok ? 'true' : 'false',
      h.status_code || '',
      h.row_count ?? '',
      h.snapshot_time || '',
      displayTimestampSource(h),
      h.duration_ms ?? '',
      h.url || '',
      historyFilterSummary(h),
      h.error || '',
    ];
    lines.push(vals.map(csvCell).join(','));
  }
  downloadCsv(`lan_clients_get_history_${timestamp()}.csv`, lines);
  toast(`Exported ${requestHistory.length} GET history row${requestHistory.length === 1 ? '' : 's'} as a .csv file.`);
}


function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(name, lines) {
  // CSV is technically plain text, but this forces a real .csv filename,
  // adds a UTF-8 BOM for Excel, and uses Windows-friendly CRLF line endings.
  const cleanName = name.toLowerCase().endsWith('.csv') ? name : `${name}.csv`;
  const content = '\uFEFF' + lines.join('\r\n');
  downloadFile(cleanName, content, 'text/csv;charset=utf-8');
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

init();
