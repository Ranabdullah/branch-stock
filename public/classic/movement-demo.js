// Reporting functions from the original stock manager movement dashboard.
    function movementRangeStart(range) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (range === 'today') return today;
      if (range === '7d') return today - (7 * 86400000);
      if (range === '30d') return today - (30 * 86400000);
      if (range === '90d') return today - (90 * 86400000);
      return null;
    }

    function getMovementDashboardEntries(ignoreType = false) {
      const range = document.getElementById('movementRange')?.value || '30d';
      const type = document.getElementById('movementType')?.value || 'all';
      const store = document.getElementById('movementStore')?.value || (isAdmin ? 'all' : STORES[curStore]);
      const search = (document.getElementById('movementSearch')?.value || '').trim().toLowerCase();
      const start = movementRangeStart(range);
      return actLog.filter(entry => {
        const difference = Number(entry.to || 0) - Number(entry.from || 0);
        const timestamp = logTimestamp(entry);
        if (store !== 'all' && entry.store !== store) return false;
        if (start !== null && (timestamp === null || timestamp < start)) return false;
        if (!ignoreType && type === 'added' && difference <= 0) return false;
        if (!ignoreType && type === 'gone' && difference >= 0) return false;
        if (!search) return true;
        return [entry.brand, entry.flavor, entry.store, entry.user]
          .some(value => String(value || '').toLowerCase().includes(search));
      }).sort((a, b) => (logTimestamp(b) || 0) - (logTimestamp(a) || 0));
    }

    function movementProductId(entry) {
      if (entry.productId && state[entry.productId]) return entry.productId;
      const found = (brands[entry.brand] || []).find(item => item.flavor === entry.flavor);
      return found?.uid || '';
    }

    function movementCurrentStock(productId, storeName) {
      if (!productId || !state[productId]) return 0;
      const selectedStore = storeName || (document.getElementById('movementStore')?.value || 'all');
      if (selectedStore !== 'all') {
        const index = STORES.indexOf(selectedStore);
        return index >= 0 ? Math.max(0, Number(state[productId][index]) || 0) : 0;
      }
      return state[productId].reduce((total, quantity) => total + Math.max(0, Number(quantity) || 0), 0);
    }

    function movementDateTime(entry) {
      const timestamp = logTimestamp(entry);
      if (timestamp === null) return { date: 'Saving time…', time: '—' };
      const date = new Date(timestamp);
      return {
        date: date.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: date.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
      };
    }

    function movementTopSellers(entries, limit = 8) {
      const products = new Map();
      entries.forEach(entry => {
        const difference = Number(entry.to || 0) - Number(entry.from || 0);
        if (difference >= 0) return;
        const productId = movementProductId(entry);
        const key = productId || [entry.brand, entry.flavor].join('\u0000');
        const record = products.get(key) || {
          productId,
          brand: entry.brand,
          flavor: entry.flavor,
          removed: 0,
          changes: 0,
          stores: new Set()
        };
        record.removed += Math.abs(difference);
        record.changes += 1;
        record.stores.add(entry.store);
        products.set(key, record);
      });
      return [...products.values()]
        .map(record => ({ ...record, currentStock: movementCurrentStock(record.productId) }))
        .sort((a, b) => b.removed - a.removed || b.changes - a.changes || a.flavor.localeCompare(b.flavor))
        .slice(0, limit || undefined);
    }

    function movementCategories(entries) {
      const totals = new Map();
      entries.forEach(entry => {
        const removed = Number(entry.from || 0) - Number(entry.to || 0);
        if (removed > 0) totals.set(entry.brand, (totals.get(entry.brand) || 0) + removed);
      });
      return [...totals].map(([label, removed]) => ({ label, removed }))
        .sort((a, b) => b.removed - a.removed || String(a.label).localeCompare(String(b.label)));
    }

'use strict';
const panel = document.createElement('dialog');
panel.setAttribute('aria-label', 'Stock movements');
panel.style.cssText='width:min(820px,94vw);max-height:85vh;border:1px solid #68798a;background:var(--bg,#17212d);color:var(--text,#eee);padding:18px;border-radius:12px';
panel.innerHTML='<div class="header-right"><strong>Stock movements</strong><button class="btn" data-close>Close</button></div><div class="header-right"><label>Period <select id="movementRange"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d" selected>Last 30 days</option><option value="all">All dates</option></select></label><label>Type <select id="movementType"><option value="all">All movements</option><option value="gone">Units out</option><option value="added">Units in</option></select></label><label>Shop <select id="movementStore"></select></label><label>Search <input id="movementSearch" type="search"></label></div><p id="movementTotals"></p><p id="movementRanking"></p><div style="overflow:auto"><table><thead><tr><th>Timestamp</th><th>Shop</th><th>Product</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody id="movementRows"></tbody></table></div>';
document.body.append(panel);
function renderDemoMovements(){
  const rows=getMovementDashboardEntries();
  const rank=movementTopSellers(rows,3);
  const outgoing=rows.reduce((n,row)=>n+Math.max(0,row.from-row.to),0);
  const incoming=rows.reduce((n,row)=>n+Math.max(0,row.to-row.from),0);
  document.getElementById('movementTotals').textContent=rows.length+' changes · '+incoming+' in · '+outgoing+' out';
  document.getElementById('movementRanking').textContent=rank.length?'Most units out · '+rank.map(row=>row.flavor+' ('+row.removed+')').join(', '):'No outgoing stock in this selection.';
  document.getElementById('movementRows').innerHTML=rows.map(row=>'<tr><td>'+escHtml(new Date(row.ts).toLocaleString())+'</td><td>'+escHtml(row.store)+'</td><td>'+escHtml(row.flavor)+'</td><td>'+Number(row.from)+'</td><td>'+Number(row.to)+'</td><td>'+Number(row.to-row.from)+'</td></tr>').join('');
}
document.getElementById('movementsDemo').onclick=()=>{
  const options=document.getElementById('movementStore');
  options.replaceChildren(new Option('All shops','all'),...STORES.map(name=>new Option(name,name)));
  renderDemoMovements();
  panel.showModal();
};
panel.addEventListener('input',renderDemoMovements);
panel.querySelector('[data-close]').onclick=()=>panel.close();
