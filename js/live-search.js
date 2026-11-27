/* Bakry ERP — instant local search layer.
 * Keeps the existing search/filter functions as the source of truth and invokes
 * them automatically while the user types. No records are changed by this file.
 */
(function installBakryLiveSearch() {
  'use strict';

  const inputHandlers = {
    'cust-search-term': () => App.Customers.search(),
    'guar-search-term': () => App.Guarantors.search(),
    'sup-search-term': () => App.Suppliers.search(),
    'prod-search-term': () => App.Products.searchModels(),
    'unit-search-term': () => App.Products.searchUnits(),
    'sale-cust-search': input => App.Sales.searchCustomers(input.value),
    'sales-log-search-term': () => App.Sales.searchSalesLog(),
    'traffic-search-term': () => App.Traffic.search(),
    'inst-plan-search': () => App.Installments.searchPlans(),
    'supplier-dues-search': () => App.Accounting.searchSupplierDues(),
    'audit-search-term': () => App.Audit.render()
  };

  const selectHandlers = {
    'cust-filter-type': () => App.Customers.search(),
    'sup-filter-type': () => App.Suppliers.search(),
    'unit-filter-status': () => App.Products.searchUnits(),
    'sales-log-filter-branch': () => App.Sales.searchSalesLog(),
    'audit-filter-role': () => App.Audit.render()
  };

  const timers = new WeakMap();
  function runSafely(handler, control) {
    try {
      const result = handler();
      if (result && typeof result.catch === 'function') {
        result.catch(error => console.error('Bakry live search failed:', control?.id, error));
      }
    } catch (error) {
      console.error('Bakry live search failed:', control?.id, error);
    }
  }

  function bindSectionSearch() {
    document.addEventListener('input', event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const handler = inputHandlers[input.id];
      if (!handler) return;
      const oldTimer = timers.get(input);
      if (oldTimer) clearTimeout(oldTimer);
      // A short debounce prevents unnecessary repeated table rendering while
      // keeping results effectively immediate as the user types.
      timers.set(input, setTimeout(() => runSafely(() => handler(input), input), 90));
    }, true);

    document.addEventListener('change', event => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      const handler = selectHandlers[select.id];
      if (handler) runSafely(handler, select);
    }, true);
  }

  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  function normalize(value) {
    return String(value ?? '')
      .replace(/[٠-٩]/g, ch => String(arabicDigits.indexOf(ch)))
      .replace(/[۰-۹]/g, ch => String(persianDigits.indexOf(ch)))
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
      .toLocaleLowerCase('ar-EG').trim();
  }

  function safeText(value) {
    return String(value ?? '').trim();
  }

  function decrypt(value) {
    try { return App.Security.decrypt(value) || value || ''; }
    catch { return value || ''; }
  }

  function makePanel() {
    const wrapper = document.querySelector('.header-search');
    const input = document.getElementById('global-search');
    if (!wrapper || !input) return null;
    let panel = document.getElementById('bakry-global-search-results');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'bakry-global-search-results';
      panel.className = 'bakry-global-search-results hidden';
      panel.setAttribute('role', 'listbox');
      panel.setAttribute('aria-label', 'نتائج البحث السريع');
      wrapper.appendChild(panel);
    }
    input.setAttribute('aria-controls', panel.id);
    input.setAttribute('aria-autocomplete', 'list');
    return panel;
  }

  function addIfMatch(results, query, kind, title, subtitle, route, targetId, matchedValue) {
    const fields = [title, subtitle, matchedValue].map(normalize);
    if (!fields.some(field => field && field.includes(query))) return;
    results.push({ kind, title: safeText(title), subtitle: safeText(subtitle), route, targetId, term: safeText(matchedValue || title) });
  }

  async function collectGlobalResults(rawQuery) {
    const query = normalize(rawQuery);
    const results = [];
    if (query.length < 2) return results;

    (allCustomers || []).forEach(customer => {
      addIfMatch(results, query, 'عميل', customer.name,
        `${customer.code || ''} · ${decrypt(customer.phone)}`,
        'customers', 'cust-search-term', [customer.name, customer.code, decrypt(customer.phone), decrypt(customer.nid)].join(' '));
    });

    (allSuppliers || []).forEach(supplier => {
      addIfMatch(results, query, 'مورد', supplier.name,
        `${supplier.code || ''} · ${supplier.phone || ''}`,
        'suppliers', 'sup-search-term', [supplier.name, supplier.code, supplier.phone, supplier.nid, supplier.address].join(' '));
    });

    (allProducts || []).forEach(product => {
      addIfMatch(results, query, 'موديل بالمخزون', `${product.brand || ''} ${product.cc || ''}`,
        `كود الموديل: ${product.code || '-'} · السنة: ${product.year || '-'}`,
        'product-models', 'prod-search-term', [product.code, product.brand, product.cc, product.year].join(' '));
    });

    (allUnits || []).forEach(unit => {
      const product = (allProducts || []).find(item => Number(item.id) === Number(unit.productId));
      addIfMatch(results, query, 'قطعة / شاسيه', unit.chassis || unit.motor || 'قطعة بالمخزون',
        `${product?.brand || ''} · شاسيه: ${unit.chassis || '-'} · موتور: ${unit.motor || '-'}`,
        'product-units', 'unit-search-term', [unit.chassis, unit.motor, unit.color, unit.branch, product?.brand].join(' '));
    });

    // Other searchable business ledgers are read from IndexedDB only; this
    // never uploads or modifies the records.
    const storesToRead = ['sales', 'installments', 'supplier_dues'];
    const ledgerReads = await Promise.all(storesToRead.map(store =>
      MotoDB.getAll(store).catch(error => { console.warn('Global search read failed:', store, error); return []; })
    ));
    const sales = ledgerReads[0] || [];
    const installments = ledgerReads[1] || [];
    const supplierDues = ledgerReads[2] || [];

    sales.forEach(sale => {
      const customer = (allCustomers || []).find(item => Number(item.id) === Number(sale.customerId));
      const customerName = customer?.name || sale.customerName || '';
      addIfMatch(results, query, 'فاتورة بيع', sale.invoiceNo || `فاتورة ${sale.id}`,
        `${customerName} · ${sale.saleDate || ''} · ${sale.branch || ''}`,
        'sales-log', 'sales-log-search-term', [sale.invoiceNo, customerName, sale.branch, sale.chassis, sale.motor, sale.saleDate].join(' '));

      [
        ['g1_name', 'g1_phone', 'g1_nid', 'ضامن أول'],
        ['g2_name', 'g2_phone', 'g2_nid', 'ضامن ثان']
      ].forEach(([nameKey, phoneKey, nidKey, label]) => {
        if (!sale[nameKey]) return;
        const term = [sale[nameKey], decrypt(sale[phoneKey]), decrypt(sale[nidKey])].join(' ');
        addIfMatch(results, query, 'ضامن', sale[nameKey], `${label} · العميل: ${customerName}`,
          'guarantors', 'guar-search-term', term);
      });
    });

    installments.forEach(installment => {
      const sale = sales.find(item => Number(item.id) === Number(installment.saleId));
      const customer = sale && (allCustomers || []).find(item => Number(item.id) === Number(sale.customerId));
      const customerName = customer?.name || '';
      addIfMatch(results, query, 'قسط', `قسط ${installment.installmentNumber || ''} · ${customerName}`,
        `استحقاق: ${installment.dueDate || '-'} · الحالة: ${installment.status || '-'}`,
        'installments', 'inst-plan-search', [customerName, sale?.invoiceNo, installment.contractNo, installment.dueDate, installment.id].join(' '));
    });

    supplierDues.forEach(due => {
      const supplier = (allSuppliers || []).find(item => Number(item.id) === Number(due.supplierId));
      const supplierName = supplier?.name || due.supplierName || '';
      addIfMatch(results, query, 'مستحق مورد', due.invoiceNo || `مستحق ${due.id}`,
        `${supplierName} · ${due.dueDate || ''} · ${due.status || ''}`,
        'supplier-dues', 'supplier-dues-search', [supplierName, due.invoiceNo, due.dueDate, due.status, due.notes].join(' '));
    });

    return results.slice(0, 30);
  }

  function navigateToResult(result, query) {
    const value = result.term || query;
    const field = document.getElementById(result.targetId);
    if (result.route === 'product-models' || result.route === 'product-units') {
      App.switchTab('products');
      App.Products.switchSubTab(result.route === 'product-models' ? 'models' : 'units');
    } else if (result.route === 'sales-log') {
      App.switchTab('sales');
      App.Sales.switchSubTab('log');
    } else if (result.route === 'supplier-dues') {
      App.switchTab('accounting');
      App.Accounting.switchSubTab('supplier-dues');
    } else {
      App.switchTab(result.route);
    }
    if (field) {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    hideGlobalPanel();
    const globalInput = document.getElementById('global-search');
    if (globalInput) globalInput.blur();
  }

  let activeIndex = -1;
  let currentResults = [];
  function hideGlobalPanel() {
    const panel = document.getElementById('bakry-global-search-results');
    if (panel) panel.classList.add('hidden');
    activeIndex = -1;
  }

  function paintGlobalResults(panel, results, query) {
    panel.replaceChildren();
    currentResults = results;
    activeIndex = -1;
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'bakry-global-search-empty';
      empty.textContent = normalize(query).length < 2 ? 'اكتب حرفين على الأقل لعرض النتائج.' : 'لا توجد نتائج مطابقة.';
      panel.appendChild(empty);
    } else {
      results.forEach((result, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bakry-global-search-item';
        button.setAttribute('role', 'option');
        button.dataset.index = String(index);
        const title = document.createElement('strong');
        title.textContent = result.title;
        const subtitle = document.createElement('span');
        subtitle.textContent = `${result.kind} · ${result.subtitle}`;
        button.append(title, subtitle);
        button.addEventListener('click', () => navigateToResult(result, query));
        panel.appendChild(button);
      });
    }
    panel.classList.remove('hidden');
  }

  function setActiveResult(nextIndex) {
    const panel = document.getElementById('bakry-global-search-results');
    if (!panel || !currentResults.length) return;
    activeIndex = (nextIndex + currentResults.length) % currentResults.length;
    panel.querySelectorAll('.bakry-global-search-item').forEach((item, index) => {
      item.classList.toggle('active', index === activeIndex);
      if (index === activeIndex) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function bindGlobalSearch() {
    const input = document.getElementById('global-search');
    const panel = makePanel();
    if (!input || !panel) return;
    let requestId = 0;
    let timer = null;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const query = input.value;
      if (normalize(query).length < 2) {
        paintGlobalResults(panel, [], query);
        return;
      }
      timer = setTimeout(async () => {
        const thisRequest = ++requestId;
        try {
          const results = await collectGlobalResults(query);
          if (thisRequest !== requestId || input.value !== query) return;
          paintGlobalResults(panel, results, query);
        } catch (error) {
          console.error('Bakry global search failed:', error);
        }
      }, 100);
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && !panel.classList.contains('hidden')) {
        event.preventDefault(); setActiveResult(activeIndex + 1);
      } else if (event.key === 'ArrowUp' && !panel.classList.contains('hidden')) {
        event.preventDefault(); setActiveResult(activeIndex < 0 ? currentResults.length - 1 : activeIndex - 1);
      } else if (event.key === 'Enter' && !panel.classList.contains('hidden') && currentResults.length) {
        event.preventDefault();
        const chosen = currentResults[activeIndex >= 0 ? activeIndex : 0];
        navigateToResult(chosen, input.value);
      } else if (event.key === 'Escape') {
        hideGlobalPanel();
      }
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('.header-search')) hideGlobalPanel();
    });
  }

  function start() {
    bindSectionSearch();
    bindGlobalSearch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
