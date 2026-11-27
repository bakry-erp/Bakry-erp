/* Bakry ERP export worker: IndexedDB reads and XLSX generation stay off the UI thread. */
'use strict';

const DB_NAME = 'bakry_erp_local';
const DB_VERSION = 3;
const ALL_STORES = [
  'customers', 'guarantors', 'suppliers', 'products', 'units', 'sales',
  'installments', 'transactions', 'supplier_dues', 'audit_logs', 'branches',
  'defaults', 'traffic', 'notifications', 'collection_notes'
];
const EXCEL_STORES = ['customers', 'sales', 'suppliers', 'products', 'units', 'installments', 'transactions'];
const WRITE_CHUNK_SIZE = 500;

function progress(percent, detail) {
  self.postMessage({ type: 'progress', percent: Math.max(0, Math.min(99, Math.round(percent))), detail });
}

function yieldToWorkerLoop() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('تعذر فتح قاعدة البيانات المحلية.'));
    request.onblocked = () => reject(new Error('قاعدة البيانات مشغولة في تبويب آخر. أغلق التبويبات القديمة ثم أعد المحاولة.'));
  });
}

function countStore(db, name) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(name)) return resolve(0);
    const request = db.transaction(name, 'readonly').objectStore(name).count();
    request.onsuccess = () => resolve(Number(request.result) || 0);
    request.onerror = () => reject(request.error || new Error(`تعذر عد سجلات ${name}.`));
  });
}

function readStore(db, name, count, onItem) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(name)) return resolve([]);
    const records = [];
    const transaction = db.transaction(name, 'readonly');
    const request = transaction.objectStore(name).openCursor();
    request.onsuccess = event => {
      const cursor = event.target.result;
      if (!cursor) return;
      records.push(cursor.value);
      onItem(records.length, count);
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error(`تعذر قراءة سجلات ${name}.`));
    transaction.onabort = () => reject(transaction.error || new Error(`تم إلغاء قراءة ${name}.`));
    transaction.onerror = () => reject(transaction.error || new Error(`تعذر إكمال قراءة ${name}.`));
    transaction.oncomplete = () => resolve(records);
  });
}

function safeDecrypt(value) {
  if (!value) return '';
  const ciphertext = String(value);
  if (/^[0-9\s\-+]+$/.test(ciphertext)) return ciphertext;
  try {
    const text = decodeURIComponent(escape(atob(ciphertext)));
    const key = 'MotoMaxSecureKey2026';
    const chars = new Array(text.length);
    for (let i = 0; i < text.length; i++) {
      chars[i] = String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    const result = chars.join('');
    if (/[\x00-\x08\x0E-\x1F\x7F]/.test(result)) return ciphertext;
    return result;
  } catch (_) {
    return ciphertext;
  }
}

async function addMappedSheet(workbook, name, headers, source, mapper, startPercent, endPercent) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  let written = 0;
  const total = source.length;

  for (let start = 0; start < total; start += WRITE_CHUNK_SIZE) {
    const stop = Math.min(total, start + WRITE_CHUNK_SIZE);
    const chunk = [];
    for (let index = start; index < stop; index++) {
      const mapped = mapper(source[index]);
      if (mapped) chunk.push(headers.map(header => mapped[header] ?? ''));
    }
    if (chunk.length) {
      XLSX.utils.sheet_add_aoa(worksheet, chunk, { origin: -1 });
      written += chunk.length;
    }
    const ratio = total ? stop / total : 1;
    progress(startPercent + (endPercent - startPercent) * ratio,
      `تجهيز ورقة ${name}: ${stop.toLocaleString('en-US')} من ${total.toLocaleString('en-US')} سجل.`);
    await yieldToWorkerLoop();
  }

  // Keep the workbook sheet recognizable even when the source table is empty.
  if (written === 0) XLSX.utils.sheet_add_aoa(worksheet, [headers.map(() => '')], { origin: -1 });
  worksheet['!dir'] = 'rtl';
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

async function createExcel(data) {
  let customers = data.customers;
  let sales = data.sales;
  let suppliers = data.suppliers;
  let products = data.products;
  let units = data.units;
  let installments = data.installments;
  let transactions = data.transactions;

  // Keep only the relationship fields needed for joins, not duplicate full records.
  const customerById = new Map();
  for (const row of customers) customerById.set(String(row.id), { name: row.name || '', nid: row.nid || '' });
  const supplierCodeById = new Map();
  for (const row of suppliers) supplierCodeById.set(String(row.id), row.code || '');
  const productById = new Map();
  for (const row of products) productById.set(String(row.id), { brand: row.brand || '', code: row.code || '' });
  const unitById = new Map();
  for (const row of units) unitById.set(String(row.id), { chassis: row.chassis || '', motor: row.motor || '', productId: row.productId });
  const saleById = new Map();
  for (const row of sales) saleById.set(String(row.id), { invoiceNo: row.invoiceNo || '', customerId: row.customerId });
  const installmentById = new Map();
  for (const row of installments) installmentById.set(String(row.id), { installmentNumber: row.installmentNumber || '', saleId: row.saleId });

  const guarantorCount = sales.reduce((count, sale) => count + (sale.g1_name ? 1 : 0), 0);
  const workbook = XLSX.utils.book_new();
  await addMappedSheet(workbook, 'العملاء',
    ['كود العميل', 'الاسم الكامل', 'رقم الموبايل', 'الرقم القومي', 'محل الإقامة والسكن', 'نوع المعاملة', 'ملاحظات'], customers,
    c => ({ 'كود العميل': c.code || '', 'الاسم الكامل': c.name || '', 'رقم الموبايل': safeDecrypt(c.phone), 'الرقم القومي': safeDecrypt(c.nid), 'محل الإقامة والسكن': c.address || '', 'نوع المعاملة': c.type || '', 'ملاحظات': c.notes || '' }),
    54, 58);
  customers = null; data.customers = null;

  await addMappedSheet(workbook, 'الضامنين',
    ['رقم الفاتورة', 'العميل', 'اسم الضامن 1', 'رقم الهاتف 1', 'الرقم القومي 1', 'العنوان 1', 'صلة القرابة 1', 'اسم الضامن 2', 'رقم الهاتف 2', 'الرقم القومي 2', 'العنوان 2', 'صلة القرابة 2'], sales,
    s => {
      if (!s.g1_name) return null;
      const customer = customerById.get(String(s.customerId));
      return { 'رقم الفاتورة': s.invoiceNo || '', 'العميل': customer?.name || '', 'اسم الضامن 1': s.g1_name || '', 'رقم الهاتف 1': safeDecrypt(s.g1_phone), 'الرقم القومي 1': safeDecrypt(s.g1_nid), 'العنوان 1': s.g1_address || '', 'صلة القرابة 1': s.g1_rel || '', 'اسم الضامن 2': s.g2_name || '', 'رقم الهاتف 2': safeDecrypt(s.g2_phone), 'الرقم القومي 2': safeDecrypt(s.g2_nid), 'العنوان 2': s.g2_address || '', 'صلة القرابة 2': s.g2_rel || '' };
    }, 58, 62);

  await addMappedSheet(workbook, 'الموردين',
    ['كود المورد', 'اسم المورد', 'النوع', 'رقم الهاتف', 'الرقم القومي/السجل', 'العنوان', 'ملاحظات'], suppliers,
    s => ({ 'كود المورد': s.code || '', 'اسم المورد': s.name || '', 'النوع': s.type || '', 'رقم الهاتف': safeDecrypt(s.phone), 'الرقم القومي/السجل': safeDecrypt(s.nid || s.regNo || ''), 'العنوان': s.address || '', 'ملاحظات': s.notes || '' }),
    62, 66);
  suppliers = null; data.suppliers = null;

  await addMappedSheet(workbook, 'الموديلات',
    ['كود الموديل', 'الموديل', 'سنة الموديل', 'السعة/CC', 'السعر الافتراضي', 'كود المورد', 'ملاحظات'], products,
    p => ({ 'كود الموديل': p.code || '', 'الموديل': p.brand || '', 'سنة الموديل': p.year || '', 'السعة/CC': p.cc || '', 'السعر الافتراضي': p.price || '', 'كود المورد': supplierCodeById.get(String(p.supplierId)) || '', 'ملاحظات': p.notes || '' }),
    66, 70);
  products = null; data.products = null;

  await addMappedSheet(workbook, 'المخزون',
    ['رقم الشاسيه', 'رقم الموتور', 'اللون', 'الفرع', 'الحالة', 'الموديل', 'كود الموديل', 'تكلفة الشراء', 'سعر البيع', 'تاريخ البيع'], units,
    u => {
      const product = productById.get(String(u.productId));
      return { 'رقم الشاسيه': u.chassis || '', 'رقم الموتور': u.motor || '', 'اللون': u.color || '', 'الفرع': u.branch || '', 'الحالة': u.status || '', 'الموديل': product?.brand || '', 'كود الموديل': product?.code || '', 'تكلفة الشراء': u.cost || '', 'سعر البيع': u.soldPrice || '', 'تاريخ البيع': u.soldDate || '' };
    }, 70, 74);
  units = null; data.units = null;

  await addMappedSheet(workbook, 'المبيعات',
    ['رقم الفاتورة', 'اسم العميل', 'الرقم القومي للعميل', 'رقم الشاسيه', 'رقم الموتور', 'الموديل', 'تاريخ البيع', 'الفرع', 'نوع البيع', 'سعر البيع', 'المقدم', 'الباقي', 'القسط الشهري', 'عدد الشهور', 'تاريخ أول قسط', 'اسم الضامن 1', 'هاتف الضامن 1', 'رقم بطاقة الضامن 1', 'عنوان الضامن 1', 'اسم الضامن 2', 'هاتف الضامن 2', 'رقم بطاقة الضامن 2', 'عنوان الضامن 2', 'ملاحظات'], sales,
    s => {
      const customer = customerById.get(String(s.customerId));
      const unit = unitById.get(String(s.unitId));
      const product = unit ? productById.get(String(unit.productId)) : null;
      return { 'رقم الفاتورة': s.invoiceNo || '', 'اسم العميل': customer?.name || '', 'الرقم القومي للعميل': customer ? safeDecrypt(customer.nid) : '', 'رقم الشاسيه': unit?.chassis || '', 'رقم الموتور': unit?.motor || '', 'الموديل': product?.brand || '', 'تاريخ البيع': s.saleDate || '', 'الفرع': s.branch || '', 'نوع البيع': s.type || '', 'سعر البيع': s.salePrice || '', 'المقدم': s.downpayment || '', 'الباقي': s.remainingAmount || '', 'القسط الشهري': s.monthlyPayment || '', 'عدد الشهور': s.months || '', 'تاريخ أول قسط': s.firstInstallmentDate || '', 'اسم الضامن 1': s.g1_name || '', 'هاتف الضامن 1': safeDecrypt(s.g1_phone), 'رقم بطاقة الضامن 1': safeDecrypt(s.g1_nid), 'عنوان الضامن 1': s.g1_address || '', 'اسم الضامن 2': s.g2_name || '', 'هاتف الضامن 2': safeDecrypt(s.g2_phone), 'رقم بطاقة الضامن 2': safeDecrypt(s.g2_nid), 'عنوان الضامن 2': s.g2_address || '', 'ملاحظات': s.notes || '' };
    }, 74, 80);
  sales = null; data.sales = null;

  await addMappedSheet(workbook, 'الأقساط',
    ['رقم الفاتورة', 'اسم العميل', 'رقم القسط', 'المبلغ', 'تاريخ الاستحقاق', 'الحالة', 'المبلغ المدفوع', 'تاريخ السداد', 'ملاحظات'], installments,
    i => {
      const sale = saleById.get(String(i.saleId));
      const customer = sale ? customerById.get(String(sale.customerId)) : null;
      return { 'رقم الفاتورة': sale?.invoiceNo || '', 'اسم العميل': customer?.name || '', 'رقم القسط': i.installmentNumber || '', 'المبلغ': i.amount || '', 'تاريخ الاستحقاق': i.dueDate || '', 'الحالة': i.status || '', 'المبلغ المدفوع': i.paidAmount || '', 'تاريخ السداد': i.paidDate || '', 'ملاحظات': i.notes || '' };
    }, 80, 84);
  installments = null; data.installments = null;

  await addMappedSheet(workbook, 'الحركات',
    ['كود الحركة', 'التاريخ', 'النوع', 'الفئة', 'المبلغ', 'الوصف', 'المرجع', 'رقم الفاتورة المرتبط', 'رقم القسط المرتبط', 'المستخدم', 'طريقة الدفع'], transactions,
    tx => {
      const linkedInstallment = installmentById.get(String(tx.refId));
      const linkedSale = saleById.get(String(tx.refId)) || (linkedInstallment ? saleById.get(String(linkedInstallment.saleId)) : null);
      return { 'كود الحركة': tx.code || '', 'التاريخ': tx.date || '', 'النوع': tx.type || '', 'الفئة': tx.category || '', 'المبلغ': tx.amount || '', 'الوصف': tx.description || '', 'المرجع': tx.refId || '', 'رقم الفاتورة المرتبط': linkedSale?.invoiceNo || '', 'رقم القسط المرتبط': linkedInstallment?.installmentNumber || '', 'المستخدم': tx.user || '', 'طريقة الدفع': tx.paymentMethod || '' };
    }, 84, 88);
  transactions = null; data.transactions = null;

  const metaWorksheet = XLSX.utils.json_to_sheet([{
    'اسم المعرض': 'معرض البكري', 'تاريخ التصدير': new Date().toLocaleString('ar-EG'),
    'عدد العملاء': data._counts.customers, 'عدد الضامنين': guarantorCount,
    'عدد الموردين': data._counts.suppliers, 'عدد الموديلات': data._counts.products,
    'عدد الشاسيهات': data._counts.units, 'عدد الفواتير': data._counts.sales,
    'عدد الأقساط': data._counts.installments, 'عدد الحركات': data._counts.transactions
  }]);
  metaWorksheet['!dir'] = 'rtl';
  XLSX.utils.book_append_sheet(workbook, metaWorksheet, 'الملخص');
  progress(92, 'اكتملت أوراق البيانات. جارٍ إنشاء ملف Excel النهائي...');

  // Compression is intentionally disabled: the worker avoids long synchronous compression stalls.
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: false, bookSST: false });
  const arrayBuffer = output instanceof ArrayBuffer
    ? output
    : output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
  progress(98, 'اكتمل بناء الملف. جارٍ تسليم الملف للتنزيل...');
  return arrayBuffer;
}

async function runExport(mode, metadata) {
  if (mode === 'xlsx') importScripts('./xlsx.full.min.js');
  progress(1, 'جارٍ فتح قاعدة البيانات المحلية...');
  const db = await openDatabase();
  try {
    const stores = mode === 'json' ? ALL_STORES : EXCEL_STORES;
    const counts = {};
    for (const name of stores) counts[name] = await countStore(db, name);
    const total = stores.reduce((sum, name) => sum + counts[name], 0);

    if (mode === 'json') {
      // Serialize one table at a time, so a full backup does not retain every table
      // plus a second full in-memory JSON string at the same time.
      const backupMeta = {
        app: 'MotoMax', version: '3.0', exportDate: new Date().toISOString(),
        branding: metadata?.branding || {}, branches: metadata?.branches || [],
        exportedBy: metadata?.exportedBy || 'admin'
      };
      const parts = ['{"_meta":', JSON.stringify(backupMeta)];
      let completed = 0;
      for (let index = 0; index < stores.length; index++) {
        const name = stores[index];
        const count = counts[name];
        progress(total ? 3 + (completed / total) * 82 : 85, `جارٍ تجهيز النسخة الاحتياطية من ${name} (${index + 1}/${stores.length})...`);
        const records = await readStore(db, name, count, seen => {
          completed++;
          const reportEvery = Math.max(50, Math.floor(count / 100));
          if (seen === count || seen % reportEvery === 0) {
            progress(total ? 3 + (completed / total) * 82 : 85, `قراءة ${name}: ${seen.toLocaleString('en-US')} من ${count.toLocaleString('en-US')}.`);
          }
        });
        const serialized = JSON.stringify(records);
        parts.push(',', JSON.stringify(name), ':', serialized);
        await yieldToWorkerLoop();
      }
      parts.push('}');
      progress(92, 'اكتملت قراءة الجداول. جارٍ تجميع ملف النسخة الاحتياطية...');
      const blob = new Blob(parts, { type: 'application/json;charset=utf-8' });
      self.postMessage({ type: 'done', mode: 'json', blob, counts });
      return;
    }

    const data = {};
    let completed = 0;
    for (let index = 0; index < stores.length; index++) {
      const name = stores[index];
      const count = counts[name];
      progress(total ? 3 + (completed / total) * 49 : 52, `جارٍ قراءة ${name} (${index + 1}/${stores.length})...`);
      data[name] = await readStore(db, name, count, seen => {
        completed++;
        const reportEvery = Math.max(50, Math.floor(count / 100));
        if (seen === count || seen % reportEvery === 0) {
          progress(total ? 3 + (completed / total) * 49 : 52, `قراءة ${name}: ${seen.toLocaleString('en-US')} من ${count.toLocaleString('en-US')}.`);
        }
      });
      await yieldToWorkerLoop();
    }

    const missing = EXCEL_STORES.filter(name => !db.objectStoreNames.contains(name));
    if (missing.length) throw new Error(`جداول مطلوبة غير موجودة: ${missing.join(', ')}`);
    data._counts = counts;
    const arrayBuffer = await createExcel(data);
    self.postMessage({ type: 'done', mode: 'xlsx', arrayBuffer, counts }, [arrayBuffer]);
  } finally {
    db.close();
  }
}

self.onmessage = event => {
  const { mode, metadata } = event.data || {};
  if (!['xlsx', 'json'].includes(mode)) {
    self.postMessage({ type: 'error', message: 'نوع التصدير غير معروف.' });
    return;
  }
  runExport(mode, metadata).catch(error => {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  });
};
