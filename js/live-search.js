/* Bakry ERP — instant local section search and unified global search.
 * The global search reads IndexedDB only and never changes or uploads records.
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
      .toLocaleLowerCase('ar-EG')
      .replace(/\s+/g, ' ')
      .trim();
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
      panel.setAttribute('aria-label', 'نتيجة البحث الموحدة');
      wrapper.appendChild(panel);
    }

    input.setAttribute('aria-controls', panel.id);
    input.setAttribute('aria-autocomplete', 'list');
    return panel;
  }

  function matchingField(query, fields) {
    for (const field of fields) {
      if (normalize(field.value).includes(query)) return field;
    }
    return null;
  }

  function matchRank(query, value) {
    const candidate = normalize(value);
    if (!candidate) return 99;
    if (candidate === query) return 0;
    if (candidate.startsWith(query)) return 1;
    return 2;
  }

  function findUnitForSale(sale, units) {
    return units.find(unit => Number(unit.id) === Number(sale.unitId)) || null;
  }

  async function collectGlobalResults(rawQuery) {
    const query = normalize(rawQuery);
    if (query.length < 2) return [];

    const customers = Array.isArray(allCustomers) ? allCustomers : [];
    const units = Array.isArray(allUnits) ? allUnits : [];
    const sales = await MotoDB.getAll('sales').catch(error => {
      console.warn('Bakry global search could not read sales:', error);
      return [];
    });

    const customerById = new Map(customers.map(customer => [Number(customer.id), customer]));
    const salesNewestFirst = [...(Array.isArray(sales) ? sales : [])]
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    const latestSaleByCustomer = new Map();

    for (const sale of salesNewestFirst) {
      const customerKey = Number(sale.customerId);
      if (!latestSaleByCustomer.has(customerKey)) latestSaleByCustomer.set(customerKey, sale);
    }

    const results = [];
    const seen = new Set();

    // Customers: search only by name, phone or national ID (not code/address).
    for (const customer of customers) {
      const phone = decrypt(customer.phone);
      const nid = decrypt(customer.nid);
      const matchedBy = matchingField(query, [
        { label: 'الاسم', value: customer.name },
        { label: 'رقم الهاتف', value: phone },
        { label: 'الرقم القومي', value: nid }
      ]);
      if (!matchedBy) continue;

      const key = `customer:${customer.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const latestSale = latestSaleByCustomer.get(Number(customer.id));
      const latestUnit = latestSale ? findUnitForSale(latestSale, units) : null;
      const details = [`مطابقة بـ${matchedBy.label}`];
      if (phone) details.push(`هاتف: ${phone}`);
      if (latestSale?.invoiceNo) details.push(`آخر فاتورة: ${latestSale.invoiceNo}`);
      if (latestUnit?.chassis) details.push(`شاسيه: ${latestUnit.chassis}`);

      results.push({
        kind: 'عميل',
        title: safeText(customer.name || 'عميل'),
        subtitle: details.join(' · '),
        route: 'customers',
        targetId: 'cust-search-term',
        term: safeText(customer.name),
        _rank: matchRank(query, matchedBy.value)
      });
    }

    // Guarantors are attached to installment sales. Installment schedules,
    // collection history and supplier balances are deliberately not searched.
    for (const sale of salesNewestFirst) {
      if (sale.type !== 'installment') continue;
      const customer = customerById.get(Number(sale.customerId));
      const customerName = customer?.name || sale.customerName || 'عميل غير معروف';
      const guarantors = [
        { number: 1, name: sale.g1_name, phone: decrypt(sale.g1_phone), nid: decrypt(sale.g1_nid) },
        { number: 2, name: sale.g2_name, phone: decrypt(sale.g2_phone), nid: decrypt(sale.g2_nid) }
      ];

      for (const guarantor of guarantors) {
        if (!guarantor.name || guarantor.name === '-') continue;
        const matchedBy = matchingField(query, [
          { label: 'اسم الضامن', value: guarantor.name },
          { label: 'رقم هاتف الضامن', value: guarantor.phone },
          { label: 'الرقم القومي للضامن', value: guarantor.nid }
        ]);
        if (!matchedBy) continue;

        const key = `guarantor:${sale.id}:${guarantor.number}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const details = [`مطابقة بـ${matchedBy.label}`, `العميل: ${customerName}`];
        if (guarantor.phone) details.push(`هاتف: ${guarantor.phone}`);
        if (sale.invoiceNo) details.push(`فاتورة: ${sale.invoiceNo}`);
        results.push({
          kind: 'ضامن',
          title: safeText(guarantor.name),
          subtitle: details.join(' · '),
          route: 'guarantors',
          targetId: 'guar-search-term',
          term: safeText(guarantor.name),
          _rank: matchRank(query, matchedBy.value)
        });
      }
    }

    // Sale-specific search: invoice number, chassis number or motor number.
    // All three are grouped into one compact result row per sale.
    const linkedUnitIds = new Set();
    for (const sale of salesNewestFirst) {
      const unit = findUnitForSale(sale, units);
      if (unit) linkedUnitIds.add(Number(unit.id));

      const matchedBy = matchingField(query, [
        { label: 'رقم الفاتورة', value: sale.invoiceNo },
        { label: 'رقم الشاسيه', value: unit?.chassis },
        { label: 'رقم الموتور', value: unit?.motor }
      ]);
      if (!matchedBy) continue;

      const key = `sale:${sale.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const customer = customerById.get(Number(sale.customerId));
      const details = [`مطابقة بـ${matchedBy.label}`, `العميل: ${customer?.name || 'غير مسجل'}`];
      if (sale.invoiceNo) details.push(`فاتورة: ${sale.invoiceNo}`);
      if (unit?.chassis) details.push(`شاسيه: ${unit.chassis}`);
      if (unit?.motor) details.push(`موتور: ${unit.motor}`);

      results.push({
        kind: 'فاتورة / مركبة',
        title: safeText(customer?.name || sale.invoiceNo || 'نتيجة بيع'),
        subtitle: details.join(' · '),
        route: 'sales-log',
        targetId: 'sales-log-search-term',
        term: safeText(sale.invoiceNo),
        _rank: matchRank(query, matchedBy.value)
      });
    }

    // Unlinked stock items remain searchable by chassis/motor only.
    for (const unit of units) {
      if (linkedUnitIds.has(Number(unit.id))) continue;
      const matchedBy = matchingField(query, [
        { label: 'رقم الشاسيه', value: unit.chassis },
        { label: 'رقم الموتور', value: unit.motor }
      ]);
      if (!matchedBy) continue;

      const key = `unit:${unit.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        kind: 'مخزون',
        title: safeText(unit.chassis || unit.motor || 'قطعة بالمخزون'),
        subtitle: [
          `مطابقة بـ${matchedBy.label}`,
          unit.chassis ? `شاسيه: ${unit.chassis}` : '',
          unit.motor ? `موتور: ${unit.motor}` : ''
        ].filter(Boolean).join(' · '),
        route: 'product-units',
        targetId: 'unit-search-term',
        term: safeText(matchedBy.value),
        _rank: matchRank(query, matchedBy.value)
      });
    }

    // Show one compact result card, not a stack of cards for linked invoices,
    // guarantors or stock records. Exact matches outrank prefix/partial matches.
    results.sort((a, b) => (a._rank ?? 99) - (b._rank ?? 99));
    if (!results.length) return [];
    const best = { ...results[0] };
    delete best._rank;
    return [best];
  }

  function navigateToResult(result) {
    if (result.route === 'product-units') {
      App.switchTab('products');
      App.Products.switchSubTab('units');
    } else if (result.route === 'sales-log') {
      App.switchTab('sales');
      App.Sales.switchSubTab('log');
    } else {
      App.switchTab(result.route);
    }

    const field = document.getElementById(result.targetId);
    if (field) {
      field.value = result.term || '';
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

    const card = document.createElement('div');
    card.className = 'bakry-global-search-card';

    const heading = document.createElement('div');
    heading.className = 'bakry-global-search-heading';
    heading.textContent = normalize(query).length < 2
      ? 'اكتب حرفين على الأقل للبحث.'
      : results.length
        ? 'نتيجة البحث'
        : 'لا توجد نتائج مطابقة.';
    card.appendChild(heading);

    if (results.length) {
      const list = document.createElement('div');
      list.className = 'bakry-global-search-list';
      results.forEach((result, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bakry-global-search-item';
        button.setAttribute('role', 'option');
        button.dataset.index = String(index);

        const top = document.createElement('span');
        top.className = 'bakry-global-search-item-title';
        const title = document.createElement('strong');
        title.textContent = result.title;
        const kind = document.createElement('small');
        kind.textContent = result.kind;
        top.append(title, kind);

        const subtitle = document.createElement('span');
        subtitle.className = 'bakry-global-search-item-details';
        subtitle.textContent = result.subtitle;
        button.append(top, subtitle);
        button.addEventListener('click', () => navigateToResult(result));
        list.appendChild(button);
      });
      card.appendChild(list);
    }

    panel.appendChild(card);
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
      const thisRequest = ++requestId;
      if (!normalize(query)) {
        hideGlobalPanel();
        currentResults = [];
        return;
      }
      if (normalize(query).length < 2) {
        paintGlobalResults(panel, [], query);
        return;
      }

      timer = setTimeout(async () => {
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
        event.preventDefault();
        setActiveResult(activeIndex + 1);
      } else if (event.key === 'ArrowUp' && !panel.classList.contains('hidden')) {
        event.preventDefault();
        setActiveResult(activeIndex < 0 ? currentResults.length - 1 : activeIndex - 1);
      } else if (event.key === 'Enter' && !panel.classList.contains('hidden') && currentResults.length) {
        event.preventDefault();
        const chosen = currentResults[activeIndex >= 0 ? activeIndex : 0];
        navigateToResult(chosen);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
