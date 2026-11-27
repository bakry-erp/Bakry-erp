/* Bakry-branded dialogs: replaces browser-native alerts/confirmations. */
(function installBakryDialogs() {
    const queue = [];
    let active = false;

    function showNext() {
        if (active || !queue.length) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', showNext, { once: true });
            return;
        }
        active = true;
        const request = queue.shift();
        const overlay = document.createElement('div');
        overlay.className = 'bakry-dialog-overlay';
        overlay.setAttribute('dir', 'rtl');
        overlay.innerHTML = `
            <section class="bakry-dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="bakry-dialog-title" aria-describedby="bakry-dialog-message">
                <header class="bakry-dialog-header">
                    <span class="bakry-dialog-mark" aria-hidden="true"><i class="fa-solid fa-motorcycle"></i></span>
                    <div class="bakry-dialog-brand-wrap">
                        <strong id="bakry-dialog-title">معرض البكري</strong>
                        <small>تنبيه النظام</small>
                    </div>
                </header>
                <div class="bakry-dialog-message" id="bakry-dialog-message"></div>
                <footer class="bakry-dialog-actions"></footer>
            </section>`;
        const message = overlay.querySelector('.bakry-dialog-message');
        message.textContent = String(request.message ?? '');
        const actions = overlay.querySelector('.bakry-dialog-actions');

        const finish = (value) => {
            document.removeEventListener('keydown', onKeyDown, true);
            overlay.remove();
            active = false;
            request.resolve(value);
            showNext();
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(request.kind === 'confirm' ? false : true);
            } else if (event.key === 'Enter' && request.kind === 'alert') {
                event.preventDefault();
                finish(true);
            }
        };

        if (request.kind === 'confirm') {
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'bakry-dialog-btn bakry-dialog-btn-secondary';
            cancel.textContent = 'إلغاء';
            cancel.addEventListener('click', () => finish(false));
            const accept = document.createElement('button');
            accept.type = 'button';
            accept.className = 'bakry-dialog-btn bakry-dialog-btn-primary';
            accept.textContent = 'تأكيد';
            accept.addEventListener('click', () => finish(true));
            actions.append(cancel, accept);
            requestAnimationFrame(() => accept.focus());
        } else {
            const ok = document.createElement('button');
            ok.type = 'button';
            ok.className = 'bakry-dialog-btn bakry-dialog-btn-primary';
            ok.textContent = 'حسنًا';
            ok.addEventListener('click', () => finish(true));
            actions.append(ok);
            requestAnimationFrame(() => ok.focus());
        }
        document.addEventListener('keydown', onKeyDown, true);
        document.body.appendChild(overlay);
    }

    function enqueue(kind, message) {
        return new Promise(resolve => {
            queue.push({ kind, message, resolve });
            showNext();
        });
    }

    window.BakryDialogs = {
        alert(message) { enqueue('alert', message); },
        confirm(message) { return enqueue('confirm', message).then(Boolean); }
    };
    window.alert = function(message) { window.BakryDialogs.alert(message); };
})();

/* Date controls use a visible DD/MM/YYYY text field while exposing ISO values
   through .value to the existing business logic and database. */
(function installBakryDateFields() {
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const digitMap = value => String(value || '').replace(/[٠-٩۰-۹]/g, ch => {
        const a = arabicDigits.indexOf(ch);
        return String(a >= 0 ? a : persianDigits.indexOf(ch));
    });
    const pad2 = n => String(n).padStart(2, '0');
    const parseDate = rawValue => {
        const raw = digitMap(rawValue).trim();
        if (!raw) return '';
        let day, month, year;
        const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); }
        else {
            const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
            if (dmy) { day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3]); }
            else {
                const digits = raw.replace(/\D/g, '');
                if (digits.length !== 8) return '';
                day = Number(digits.slice(0, 2)); month = Number(digits.slice(2, 4)); year = Number(digits.slice(4));
            }
        }
        if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return '';
        const check = new Date(year, month - 1, day);
        if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return '';
        return `${year}-${pad2(month)}-${pad2(day)}`;
    };
    const toDmy = iso => {
        const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
    };

    function install(input) {
        if (!input || input.dataset.bakryDateReady === '1') return;
        const initialValue = nativeValue.get.call(input) || '';
        const initialIso = parseDate(initialValue);
        input.type = 'text';
        input.classList.add('bakry-date-control');
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('maxlength', '10');
        input.setAttribute('placeholder', 'يوم/شهر/سنة');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('dir', 'ltr');
        input.setAttribute('lang', 'en-GB');
        input.setAttribute('pattern', '\\d{1,2}/\\d{1,2}/\\d{4}');
        input.dataset.bakryDateReady = '1';

        const wrapper = document.createElement('div');
        wrapper.className = 'bakry-date-field';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const picker = document.createElement('input');
        picker.type = 'date';
        picker.className = 'bakry-date-native-picker';
        picker.tabIndex = -1;
        picker.setAttribute('aria-hidden', 'true');
        picker.lang = 'en-GB';
        wrapper.appendChild(picker);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bakry-date-picker-button';
        button.setAttribute('aria-label', 'اختيار التاريخ من التقويم');
        button.title = 'اختيار التاريخ من التقويم';
        button.innerHTML = '<i class="fa-regular fa-calendar"></i>';
        wrapper.appendChild(button);

        let isoValue = initialIso;
        const setDisplay = value => nativeValue.set.call(input, toDmy(value));
        Object.defineProperty(input, 'value', {
            configurable: true,
            enumerable: false,
            get() { return isoValue; },
            set(value) {
                isoValue = parseDate(value);
                setDisplay(isoValue);
                input.setCustomValidity(value && !isoValue ? 'أدخل التاريخ بالترتيب يوم/شهر/سنة.' : '');
                picker.value = isoValue;
            }
        });
        input.value = initialIso;

        input.addEventListener('input', () => {
            const raw = nativeValue.get.call(input);
            const western = digitMap(raw);
            if (/^\d+$/.test(western) && western.length > 2) {
                const digits = western.slice(0, 8);
                const formatted = digits.length <= 4
                    ? `${digits.slice(0, 2)}/${digits.slice(2)}`
                    : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                if (formatted !== raw) nativeValue.set.call(input, formatted);
            } else if (western !== raw) {
                nativeValue.set.call(input, western);
            }
            const displayed = nativeValue.get.call(input);
            isoValue = parseDate(displayed);
            input.setCustomValidity(displayed && !isoValue ? 'أدخل التاريخ بالترتيب يوم/شهر/سنة.' : '');
            picker.value = isoValue;
        });

        button.addEventListener('click', () => {
            picker.value = isoValue || '';
            try {
                if (typeof picker.showPicker === 'function') picker.showPicker();
                else picker.click();
            } catch (error) { picker.click(); }
        });
        picker.addEventListener('change', () => {
            isoValue = picker.value || '';
            setDisplay(isoValue);
            input.setCustomValidity('');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    function installAll() {
        document.querySelectorAll('input[type="date"]').forEach(install);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installAll, { once: true });
    else installAll();
    window.BakryDateFields = { installAll, parseDate, toDmy };
})();

window.onerror = function(message, source, lineno, colno, error) {
    const errorDetail = `حدث خطأ في النظام:\n\nالرسالة: ${message}\nالملف: ${source}\nالسطر: ${lineno}\nالعامود: ${colno}\nالخطأ: ${error ? error.stack : ''}`;
    alert(errorDetail);
    console.error(errorDetail);
    return false;
};

/* ==========================================================================
   MotoMax Application Core v3.0 - Business Logic & UI Coordinator
   ========================================================================== */

// Global State
let currentRole = 'admin'; // admin, sales, accounting, viewer
let allProducts = [];
let allSuppliers = [];
let allCustomers = [];
let allUnits = [];
let syncIntervalId = null;

// ── Password Config (loaded from localStorage on boot)
const PWD_CONFIG = (() => {
    const defaultPwds = { admin: '123456', sales: '123456', accounting: '123456', viewer: '123456' };
    const saved = localStorage.getItem('motomax_passwords');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            return {
                admin: parsed.admin || '123456',
                sales: parsed.sales || '123456',
                accounting: parsed.accounting || '123456',
                viewer: parsed.viewer || '123456'
            };
        } catch(e) {}
    }
    return defaultPwds;
})();

// ── Branches list (loaded from localStorage, fallback to demo)
let BRANCHES = (() => {
    const saved = localStorage.getItem('motomax_branches');
    if (saved) {
        try { return JSON.parse(saved); } catch(e) {}
    }
    return ['فرع طنطا (الرئيسي)', 'فرع القاهرة', 'فرع الجيزة'];
})();

// ── Branding config (loaded from localStorage)
const BRANDING = (() => {
    const saved = localStorage.getItem('motomax_branding');
    if (saved) {
        try { const cfg = JSON.parse(saved); cfg.logo = ''; return cfg; } catch(e) {}
    }
    return { name: 'Moto_ERP', logo: '', address: '', phone: '', theme: 'sport' };
})();

// Main Initialization
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // Prevent mouse wheel from changing focused number inputs
        document.addEventListener('wheel', function(e) {
            if (document.activeElement && document.activeElement.type === 'number') {
                document.activeElement.blur();
            }
        });

        // Enforce single window/tab security check immediately
        App.Security.initSingleTabCheck();

        // Check License Status (Demo Mode vs Full Mode)
        App.isDemoMode = false; // Local edition: full features, no trial limits

        // Apply saved theme immediately (before DB load to avoid flash)
        App.Settings.applyTheme(BRANDING.theme || 'sport', false);
        
        // Apply saved branding to sidebar/header
        App.Settings.applyBrandingToUI();
        
        // Initialize DB
        await MotoDB.init();
        
        // Setup F2 key for fast installment calculator
        document.addEventListener('keydown', function(e) {
            if (e.key === 'F2') {
                e.preventDefault();
                const modal = document.getElementById('installment-calculator-modal');
                if (modal && !modal.classList.contains('hidden')) {
                    App.Calculator.closeModal();
                } else {
                    App.Calculator.openModal();
                }
            }
        });

        // Setup Event Listeners & Nav
        App.initNavigation();
        App.updateCurrentDate();
        
        // Populate branch dropdowns across the app
        App.Settings.populateBranchDropdowns();
        
        // Load initial data
        await App.loadAllData();
        
        // Initial setup for login
        App.Auth.init();
        
    } catch (error) {
        alert("فشل تهيئة النظام: " + error);
        console.error(error);
    }
});

const App = {
    /* ==========================================================================
       MotoMax - Fast Installment Calculator Module (حاسبة تقسيط البكري)
       ========================================================================== */
    Calculator: {
        openModal: function(initialCash, initialDown, initialMonths, initialRate) {
            const brandName = (typeof BRANDING !== 'undefined' && BRANDING.name) ? BRANDING.name : 'معرض البكري';
            const brandTitleEl = document.getElementById('calc-modal-brand-title');
            const brandNoteEl = document.getElementById('calc-footer-brand-note');
            if (brandTitleEl) brandTitleEl.textContent = `حاسبة تقسيط ${brandName}`;
            if (brandNoteEl) brandNoteEl.textContent = `${brandName} — حاسبة التقسيط`;

            if (initialCash !== undefined && initialCash !== null && initialCash !== '') {
                const cEl = document.getElementById('calc-cash');
                if (cEl) cEl.value = initialCash;
            }
            if (initialDown !== undefined && initialDown !== null && initialDown !== '') {
                const dEl = document.getElementById('calc-down');
                if (dEl) dEl.value = initialDown;
            }
            if (initialMonths !== undefined && initialMonths !== null && initialMonths !== '') {
                const mEl = document.getElementById('calc-months');
                if (mEl) mEl.value = initialMonths;
            }
            if (initialRate !== undefined && initialRate !== null && initialRate !== '') {
                const rEl = document.getElementById('calc-rate');
                if (rEl) rEl.value = initialRate;
            }

            this.calc();
            const modal = document.getElementById('installment-calculator-modal');
            if (modal) modal.classList.remove('hidden');
        },

        closeModal: function() {
            const modal = document.getElementById('installment-calculator-modal');
            if (modal) modal.classList.add('hidden');
        },

        money: function(n) {
            return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n) + ' جنيه';
        },

        calc: function() {
            const cashInput = document.getElementById('calc-cash');
            const downInput = document.getElementById('calc-down');
            const rateInput = document.getElementById('calc-rate');
            const monthsInput = document.getElementById('calc-months');

            if (!cashInput || !downInput || !rateInput || !monthsInput) return null;

            let cash = Math.max(0, +cashInput.value || 0);
            let down = Math.max(0, +downInput.value || 0);
            let rate = Math.max(0, +rateInput.value || 0);
            let months = Math.max(1, Math.floor(+monthsInput.value || 1));

            down = Math.min(down, cash);
            let remaining = cash - down;
            let increase = remaining * rate / 100;
            let total = remaining + increase;
            let grandTotal = down + total;
            let monthly = total / months;

            const remEl = document.getElementById('calc-remaining');
            const incEl = document.getElementById('calc-increase');
            const totEl = document.getElementById('calc-total');
            const grandTotEl = document.getElementById('calc-grand-total');
            const mOutEl = document.getElementById('calc-monthsOut');
            const monEl = document.getElementById('calc-monthly');

            if (remEl) remEl.textContent = this.money(remaining);
            if (incEl) incEl.textContent = this.money(increase);
            if (totEl) totEl.textContent = this.money(total);
            if (grandTotEl) grandTotEl.textContent = this.money(grandTotal);
            if (mOutEl) mOutEl.textContent = months + ' شهر';
            if (monEl) monEl.textContent = this.money(monthly) + ' / شهر';

            return { cash, down, rate, months, remaining, increase, total, grandTotal, monthly };
        },

        clearAll: function() {
            ['calc-cash', 'calc-down', 'calc-rate', 'calc-months'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            this.calc();
        },

        copyResult: function() {
            const res = this.calc();
            const brandName = (typeof BRANDING !== 'undefined' && BRANDING.name) ? BRANDING.name : 'معرض البكري';
            const cash = document.getElementById('calc-cash') ? (document.getElementById('calc-cash').value || 0) : 0;
            const down = document.getElementById('calc-down') ? (document.getElementById('calc-down').value || 0) : 0;
            const rate = document.getElementById('calc-rate') ? (document.getElementById('calc-rate').value || 0) : 0;
            const rem = document.getElementById('calc-remaining') ? document.getElementById('calc-remaining').textContent : '';
            const inc = document.getElementById('calc-increase') ? document.getElementById('calc-increase').textContent : '';
            const tot = document.getElementById('calc-total') ? document.getElementById('calc-total').textContent : '';
            const grandTot = document.getElementById('calc-grand-total') ? document.getElementById('calc-grand-total').textContent : '';
            const mon = document.getElementById('calc-monthly') ? document.getElementById('calc-monthly').textContent : '';
            const monthsOut = document.getElementById('calc-monthsOut') ? document.getElementById('calc-monthsOut').textContent : '';

            const t = `حاسبة تقسيط ${brandName}\n` +
                      `─────────────────────\n` +
                      `السعر الكاش: ${cash} جنيه\n` +
                      `المقدم: ${down} جنيه\n` +
                      `نسبة التقسيط: ${rate}%\n` +
                      `المتبقي بعد المقدم: ${rem}\n` +
                      `قيمة الزيادة: ${inc}\n` +
                      `إجمالي المبلغ المقسط: ${tot}\n` +
                      `إجمالي السعر بالتقسيط (شامل المقدم): ${grandTot}\n` +
                      `عدد الأقساط: ${monthsOut}\n` +
                      `القسط الشهري: ${mon}\n` +
                      `─────────────────────\n` +
                      `المقدم أولًا — ثم تُحسب النسبة على المتبقي`;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(t).then(() => {
                    alert('تم نسخ تفاصيل حساب القسط بنجاح! 📋');
                }).catch(() => {
                    prompt('انسخ نتيجة الحساب:', t);
                });
            } else {
                prompt('انسخ نتيجة الحساب:', t);
            }
        },

        
        pageCalc: function() {
            const brandName = (typeof BRANDING !== 'undefined' && BRANDING.name) ? BRANDING.name : 'معرض البكري';
            const h1El = document.getElementById('calc-page-brand-header');
            const tEl = document.getElementById('calc-page-title');
            const noteEl = document.getElementById('page-calc-footer-note');
            if (h1El) h1El.innerHTML = `<i class="fa-solid fa-calculator text-orange" style="margin-left: 8px;"></i> حاسبة تقسيط ${brandName}`;
            if (tEl) tEl.textContent = `حاسبة تقسيط ${brandName}`;
            if (noteEl) noteEl.textContent = `${brandName} — حاسبة التقسيط`;

            const cashInput = document.getElementById('page-calc-cash');
            const downInput = document.getElementById('page-calc-down');
            const rateInput = document.getElementById('page-calc-rate');
            const monthsInput = document.getElementById('page-calc-months');

            if (!cashInput || !downInput || !rateInput || !monthsInput) return null;

            let cash = Math.max(0, +cashInput.value || 0);
            let down = Math.max(0, +downInput.value || 0);
            let rate = Math.max(0, +rateInput.value || 0);
            let months = Math.max(1, Math.floor(+monthsInput.value || 1));

            down = Math.min(down, cash);
            let remaining = cash - down;
            let increase = remaining * rate / 100;
            let total = remaining + increase;
            let grandTotal = down + total;
            let monthly = total / months;

            const remEl = document.getElementById('page-calc-remaining');
            const incEl = document.getElementById('page-calc-increase');
            const totEl = document.getElementById('page-calc-total');
            const grandTotEl = document.getElementById('page-calc-grand-total');
            const mOutEl = document.getElementById('page-calc-monthsOut');
            const monEl = document.getElementById('page-calc-monthly');

            if (remEl) remEl.textContent = this.money(remaining);
            if (incEl) incEl.textContent = this.money(increase);
            if (totEl) totEl.textContent = this.money(total);
            if (grandTotEl) grandTotEl.textContent = this.money(grandTotal);
            if (mOutEl) mOutEl.textContent = months + ' شهر';
            if (monEl) monEl.textContent = this.money(monthly) + ' / شهر';

            return { cash, down, rate, months, remaining, increase, total, grandTotal, monthly };
        },

        pageClearAll: function() {
            ['page-calc-cash', 'page-calc-down', 'page-calc-rate', 'page-calc-months'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            this.pageCalc();
        },

        pageCopyResult: function() {
            const res = this.pageCalc();
            const brandName = (typeof BRANDING !== 'undefined' && BRANDING.name) ? BRANDING.name : 'معرض البكري';
            const cash = document.getElementById('page-calc-cash') ? (document.getElementById('page-calc-cash').value || 0) : 0;
            const down = document.getElementById('page-calc-down') ? (document.getElementById('page-calc-down').value || 0) : 0;
            const rate = document.getElementById('page-calc-rate') ? (document.getElementById('page-calc-rate').value || 0) : 0;
            const rem = document.getElementById('page-calc-remaining') ? document.getElementById('page-calc-remaining').textContent : '';
            const inc = document.getElementById('page-calc-increase') ? document.getElementById('page-calc-increase').textContent : '';
            const tot = document.getElementById('page-calc-total') ? document.getElementById('page-calc-total').textContent : '';
            const grandTot = document.getElementById('page-calc-grand-total') ? document.getElementById('page-calc-grand-total').textContent : '';
            const mon = document.getElementById('page-calc-monthly') ? document.getElementById('page-calc-monthly').textContent : '';
            const monthsOut = document.getElementById('page-calc-monthsOut') ? document.getElementById('page-calc-monthsOut').textContent : '';

            const t = `حاسبة تقسيط ${brandName}\n` +
                      `─────────────────────\n` +
                      `السعر الكاش: ${cash} جنيه\n` +
                      `المقدم: ${down} جنيه\n` +
                      `نسبة التقسيط: ${rate}%\n` +
                      `المتبقي بعد المقدم: ${rem}\n` +
                      `قيمة الزيادة: ${inc}\n` +
                      `إجمالي المبلغ المقسط: ${tot}\n` +
                      `إجمالي السعر بالتقسيط (شامل المقدم): ${grandTot}\n` +
                      `عدد الأقساط: ${monthsOut}\n` +
                      `القسط الشهري: ${mon}\n` +
                      `─────────────────────\n` +
                      `المقدم أولًا — ثم تُحسب النسبة على المتبقي`;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(t).then(() => {
                    alert('تم نسخ تفاصيل حساب القسط بنجاح! 📋');
                }).catch(() => {
                    prompt('انسخ نتيجة الحساب:', t);
                });
            } else {
                prompt('انسخ نتيجة الحساب:', t);
            }
        },

        pageApplyToSale: function() {
            const res = this.pageCalc();
            if (!res) return;

            App.switchTab('sales');
            if (App.Sales && typeof App.Sales.switchSubTab === 'function') {
                App.Sales.switchSubTab('checkout');
            }

            if (App.Sales && typeof App.Sales.toggleSaleType === 'function') {
                App.Sales.toggleSaleType('installment');
            }
            document.querySelectorAll('input[name="sale_type"]').forEach(r => {
                if (r.value === 'installment') r.checked = true;
            });
            document.querySelectorAll('#sales-checkout-subpage .radio-pill-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.innerHTML.includes('installment')) btn.classList.add('active');
            });

            const salePriceInput = document.getElementById('sale-price-input');
            const saleDownInput = document.getElementById('sale-downpayment');
            const saleRateInput = document.getElementById('sale-rate-input');
            const saleMonthsInput = document.getElementById('sale-months');

            if (salePriceInput) salePriceInput.value = res.cash;
            if (saleDownInput) saleDownInput.value = res.down;
            if (saleRateInput) saleRateInput.value = res.rate;
            if (saleMonthsInput) saleMonthsInput.value = res.months;

            if (App.Sales && typeof App.Sales.calculateInstallments === 'function') {
                App.Sales.calculateInstallments();
            }

            alert('تم تطبيق بيانات التقسيط في شاشة البيع بنجاح! 🛒');
        },

        applyToSale: function() {
            const res = this.calc();
            if (!res) return;

            // Switch to Sales page & checkout tab
            App.switchTab('sales');
            if (App.Sales && typeof App.Sales.switchSubTab === 'function') {
                App.Sales.switchSubTab('checkout');
            }

            // Select installment radio
            if (App.Sales && typeof App.Sales.toggleSaleType === 'function') {
                App.Sales.toggleSaleType('installment');
            }
            document.querySelectorAll('input[name="sale_type"]').forEach(r => {
                if (r.value === 'installment') r.checked = true;
            });
            document.querySelectorAll('#sales-checkout-subpage .radio-pill-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.innerHTML.includes('installment')) btn.classList.add('active');
            });

            // Set inputs in Sales Checkout
            const salePriceInput = document.getElementById('sale-price-input');
            const saleDownInput = document.getElementById('sale-downpayment');
            const saleRateInput = document.getElementById('sale-rate-input');
            const saleMonthsInput = document.getElementById('sale-months');

            if (salePriceInput) salePriceInput.value = res.cash;
            if (saleDownInput) saleDownInput.value = res.down;
            if (saleRateInput) saleRateInput.value = res.rate;
            if (saleMonthsInput) saleMonthsInput.value = res.months;

            // Trigger sales recalculation
            if (App.Sales && typeof App.Sales.calculateInstallments === 'function') {
                App.Sales.calculateInstallments();
            }

            this.closeModal();
            alert('تم تطبيق بيانات التقسيط في شاشة البيع بنجاح! 🛒');
        }
    },

    Security: {
        key: 'MotoMaxSecureKey2026',
        encrypt: function(text) {
            return text || '';
        },
        decrypt: function(ciphertext) {
            if (!ciphertext) return '';
            if (/^[0-9\s\-+]+$/.test(ciphertext)) {
                return ciphertext;
            }
            try {
                const text = decodeURIComponent(escape(atob(ciphertext)));
                let result = '';
                for (let i = 0; i < text.length; i++) {
                    const charCode = text.charCodeAt(i);
                    const keyChar = this.key.charCodeAt(i % this.key.length);
                    result += String.fromCharCode(charCode ^ keyChar);
                }
                if (/[\x00-\x08\x0E-\x1F\x7F]/.test(result)) {
                    return ciphertext;
                }
                return result;
            } catch (e) {
                return ciphertext;
            }
        },
        initSingleTabCheck: function() {
            let myTabId = sessionStorage.getItem('motomax_tab_id');
            if (!myTabId) {
                myTabId = 'tab_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
                sessionStorage.setItem('motomax_tab_id', myTabId);
            }

            localStorage.setItem('motomax_active_tab_id', myTabId);

            setInterval(() => {
                const activeTabId = localStorage.getItem('motomax_active_tab_id');
                const currentTabId = sessionStorage.getItem('motomax_tab_id');
                
                if (activeTabId && activeTabId !== currentTabId) {
                    this.showSingleTabBlocker();
                } else {
                    this.hideSingleTabBlocker();
                }
            }, 1000);
        },
        showSingleTabBlocker: function() {
            let blocker = document.getElementById('single-tab-blocker');
            if (!blocker) {
                blocker = document.createElement('div');
                blocker.id = 'single-tab-blocker';
                blocker.style.position = 'fixed';
                blocker.style.top = '0';
                blocker.style.left = '0';
                blocker.style.width = '100vw';
                blocker.style.height = '100vh';
                blocker.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
                blocker.style.backdropFilter = 'blur(10px)';
                blocker.style.zIndex = '9999999';
                blocker.style.display = 'flex';
                blocker.style.flexDirection = 'column';
                blocker.style.justifyContent = 'center';
                blocker.style.alignItems = 'center';
                blocker.style.color = '#f8fafc';
                blocker.style.fontFamily = "'Cairo', sans-serif";
                blocker.style.direction = 'rtl';
                blocker.style.textAlign = 'center';
                blocker.style.padding = '20px';
                
                blocker.innerHTML = `
                    <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); padding: 40px 30px; border-radius: 16px; max-width: 500px; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5); animation: scaleIn 0.3s ease-out;">
                        <div style="font-size: 60px; color: #ff5722; margin-bottom: 20px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                        <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 15px; color: #ffffff;">تنبيه أمني: الجلسة ملغاة مؤقتاً</h2>
                        <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 30px;">
                            تم فتح نظام <strong>Moto_ERP</strong> في علامة تبويب أخرى أو نافذة متصفح أخرى.
                            <br>لا يمكن تشغيل نافذتين أو حسابين في نفس الوقت على نفس الجهاز لمنع تداخل البيانات وحماية الخزينة.
                        </p>
                        <button class="btn btn-primary" onclick="App.Security.activateThisTab()" style="padding: 12px 24px; font-size: 14px; font-weight: 700; width: 100%; border-radius: 8px; cursor: pointer; border: none; background: linear-gradient(135deg, #ff5722, #e64a19); color: #fff; box-shadow: 0 4px 15px rgba(255,87,34,0.3); transition: 0.2s;">
                            <i class="fa-solid fa-circle-check"></i> تفعيل هذه النافذة والعمل هنا
                        </button>
                    </div>
                `;
                document.body.appendChild(blocker);
            }
        },
        hideSingleTabBlocker: function() {
            const blocker = document.getElementById('single-tab-blocker');
            if (blocker) {
                blocker.remove();
            }
        },
        activateThisTab: function() {
            const myTabId = sessionStorage.getItem('motomax_tab_id');
            if (myTabId) {
                localStorage.setItem('motomax_active_tab_id', myTabId);
                this.hideSingleTabBlocker();
            }
        }
    },

    /* ── Duplicate Person & NID Checker Engine ── */
    DuplicateChecker: {
        async checkNid(nid) {
            if (!nid || typeof nid !== 'string') return null;
            const cleanNid = nid.trim();
            if (cleanNid.length !== 14 || isNaN(cleanNid)) return null;

            let customers = allCustomers || [];
            let sales = [];
            let installments = [];

            try {
                const [custsRes, salesRes, instsRes] = await Promise.all([
                    MotoDB.getAll('customers').catch(() => allCustomers || []),
                    MotoDB.getAll('sales').catch(() => []),
                    MotoDB.getAll('installments').catch(() => [])
                ]);
                customers = custsRes && custsRes.length ? custsRes : customers;
                sales = salesRes || [];
                installments = instsRes || [];
            } catch (err) {
                console.error("Duplicate check fetch error:", err);
            }

            // Find customer records matching this NID
            const matchingCustomers = customers.filter(c => {
                const decNid = (App.Security.decrypt(c.nid) || c.nid || '').trim();
                return decNid === cleanNid;
            });
            const customerIds = matchingCustomers.map(c => c.id);

            // Buyer sales
            const buyerSales = sales.filter(s => customerIds.includes(s.customerId));
            
            // Guarantor 1 sales
            const g1Sales = sales.filter(s => {
                const decG1Nid = (App.Security.decrypt(s.g1_nid) || s.g1_nid || '').trim();
                return decG1Nid === cleanNid;
            });

            // Guarantor 2 sales
            const g2Sales = sales.filter(s => {
                const decG2Nid = (App.Security.decrypt(s.g2_nid) || s.g2_nid || '').trim();
                return decG2Nid === cleanNid;
            });

            const today = new Date().toISOString().split('T')[0];

            function analyzeSale(sale, role) {
                const cust = customers.find(c => c.id === sale.customerId);
                const custName = cust ? cust.name : (sale.customerName || 'عميل مسجل');
                const saleInsts = installments.filter(inst => inst.saleId === sale.id);
                
                let isFinished = false;
                let unpaidAmount = 0;
                let unpaidCount = 0;
                let overdueCount = 0;
                let totalInstCount = saleInsts.length;

                if (sale.type === 'cash') {
                    isFinished = true;
                    unpaidAmount = 0;
                } else {
                    if (saleInsts.length > 0) {
                        const unpaidInsts = saleInsts.filter(inst => inst.status !== 'paid');
                        unpaidCount = unpaidInsts.length;
                        unpaidAmount = unpaidInsts.reduce((sum, inst) => sum + (Number(inst.amount) || 0) - (Number(inst.paidAmount) || 0), 0);
                        overdueCount = unpaidInsts.filter(inst => inst.dueDate && inst.dueDate < today).length;
                        isFinished = (unpaidCount === 0 || unpaidAmount <= 0);
                    } else {
                        isFinished = (sale.remainingAmount === 0 || !sale.remainingAmount);
                        unpaidAmount = Number(sale.remainingAmount) || 0;
                    }
                }

                return {
                    saleId: sale.id,
                    invoiceNo: sale.invoiceNo,
                    saleDate: sale.saleDate || '-',
                    branch: sale.branch || '-',
                    type: sale.type,
                    salePrice: Number(sale.salePrice) || 0,
                    role: role,
                    buyerName: custName,
                    isFinished: isFinished,
                    unpaidAmount: Math.max(0, unpaidAmount),
                    unpaidCount: unpaidCount,
                    overdueCount: overdueCount,
                    totalInstCount: totalInstCount
                };
            }

            const buyerRecords = buyerSales.map(s => analyzeSale(s, 'مشتري'));
            const g1Records = g1Sales.map(s => analyzeSale(s, 'ضامن أول'));
            const g2Records = g2Sales.map(s => analyzeSale(s, 'ضامن ثاني'));
            const allRecords = [...buyerRecords, ...g1Records, ...g2Records];

            const activeRecords = allRecords.filter(r => !r.isFinished);
            const finishedRecords = allRecords.filter(r => r.isFinished);

            return {
                nid: cleanNid,
                hasHistory: allRecords.length > 0,
                hasActiveDebts: activeRecords.length > 0,
                activeCount: activeRecords.length,
                finishedCount: finishedRecords.length,
                totalCount: allRecords.length,
                buyerRecords,
                g1Records,
                g2Records,
                allRecords,
                activeRecords,
                finishedRecords
            };
        },

        renderAlertHtml(result, personTitle = 'هذا الشخص') {
            if (!result || !result.hasHistory) {
                return `
                    <div class="dup-alert-box dup-alert-clean">
                        <i class="fa-solid fa-circle-check text-success"></i>
                        <span><strong>سجل نظيف:</strong> هذا الرقم القومي جديد (${result ? result.nid : ''}) ولم يسجل له أي معاملات شراء أو ضمان سابقة.</span>
                    </div>
                `;
            }

            const isDanger = result.hasActiveDebts;
            const alertClass = isDanger ? 'dup-alert-danger' : 'dup-alert-warning-soft';
            const headerIcon = isDanger ? 'fa-triangle-exclamation' : 'fa-circle-info';
            const headerColor = isDanger ? '#ef4444' : '#10b981';

            let rowsHtml = '';
            result.allRecords.forEach(rec => {
                const statusBadge = rec.isFinished 
                    ? `<span class="dup-badge dup-badge-success"><i class="fa-solid fa-check"></i> منتهية (مسددة بالكامل)</span>`
                    : `<span class="dup-badge dup-badge-danger"><i class="fa-solid fa-clock"></i> فعالة (متبقي ${rec.unpaidAmount.toLocaleString('ar-EG')} ج.م${rec.overdueCount > 0 ? ` - ${rec.overdueCount} قسط متأخر ⚠️` : ''})</span>`;
                
                const roleBadge = rec.role === 'مشتري' 
                    ? `<span class="dup-badge dup-badge-buyer"><i class="fa-solid fa-user"></i> مشتري</span>`
                    : `<span class="dup-badge dup-badge-guar"><i class="fa-solid fa-shield-halved"></i> ${rec.role} للعميل (${rec.buyerName})</span>`;

                rowsHtml += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px;">
                        <td style="padding: 6px 8px;">${roleBadge}</td>
                        <td style="padding: 6px 8px; font-weight: bold; color: var(--text-cyan);">${rec.invoiceNo}</td>
                        <td style="padding: 6px 8px;">${rec.saleDate}</td>
                        <td style="padding: 6px 8px;">${rec.branch}</td>
                        <td style="padding: 6px 8px;">${statusBadge}</td>
                    </tr>
                `;
            });

            return `
                <div class="dup-alert-box ${alertClass}">
                    <div class="dup-alert-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid ${headerIcon}" style="color: ${headerColor}; font-size: 16px;"></i>
                            <strong style="color: ${headerColor}; font-size: 13px;">
                                ${isDanger ? '⚠️ تنبيه: تم العثور على معاملات سابقة نشطة (فعالة)!' : 'ℹ️ إشعار: تم العثور على سجل معاملات سابقة (مسددة بالكامل):'}
                            </strong>
                        </div>
                        <div class="dup-stats-pills">
                            ${result.activeCount > 0 ? `<span class="dup-pill-danger">${result.activeCount} عملية فعالة/جارية</span>` : ''}
                            ${result.finishedCount > 0 ? `<span class="dup-pill-success">${result.finishedCount} عملية منتهية</span>` : ''}
                        </div>
                    </div>
                    <div class="dup-alert-body mt-2">
                        <table style="width: 100%; border-collapse: collapse; text-align: right; background: rgba(0,0,0,0.2); border-radius: 6px; overflow: hidden;">
                            <thead>
                                <tr style="background: rgba(255,255,255,0.05); font-size: 10px; color: var(--text-secondary);">
                                    <th style="padding: 6px 8px;">الدور السابق</th>
                                    <th style="padding: 6px 8px;">رقم الفاتورة</th>
                                    <th style="padding: 6px 8px;">التاريخ</th>
                                    <th style="padding: 6px 8px;">الفرع</th>
                                    <th style="padding: 6px 8px;">حالة المعاملة</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        },

        async onNidInput(inputElem, alertContainerId, roleTitle, conflictCheckFn) {
            if (!inputElem) return;
            const nid = (inputElem.value || '').trim();
            const container = document.getElementById(alertContainerId);
            if (!container) return;

            if (nid.length !== 14 || isNaN(nid)) {
                container.innerHTML = '';
                container.classList.add('hidden');
                return;
            }

            if (conflictCheckFn) {
                const conflictMsg = conflictCheckFn(nid);
                if (conflictMsg) {
                    container.innerHTML = `
                        <div class="dup-alert-box dup-alert-danger">
                            <i class="fa-solid fa-circle-xmark text-danger" style="font-size: 16px;"></i>
                            <span><strong style="color: #ef4444;">خطأ تعارض في نفس العملية:</strong> ${conflictMsg}</span>
                        </div>
                    `;
                    container.classList.remove('hidden');
                    return;
                }
            }

            container.innerHTML = `<div style="font-size: 11px; color: var(--text-cyan); padding: 6px;"><i class="fa-solid fa-spinner fa-spin"></i> جاري فحص سجل المعاملات للرقم القومي (${nid})...</div>`;
            container.classList.remove('hidden');

            try {
                const result = await this.checkNid(nid);
                container.innerHTML = this.renderAlertHtml(result, roleTitle);
                container.classList.remove('hidden');
            } catch (e) {
                console.error("onNidInput error:", e);
                container.innerHTML = '';
                container.classList.add('hidden');
            }
        }
    },

    logActivity: async function(action, details) {
        try {
            const now = new Date();
            const dateStr = now.getFullYear() + '-' + 
                            String(now.getMonth()+1).padStart(2,'0') + '-' + 
                            String(now.getDate()).padStart(2,'0') + ' ' + 
                            String(now.getHours()).padStart(2,'0') + ':' + 
                            String(now.getMinutes()).padStart(2,'0');
            
            const logEntry = {
                timestamp: dateStr,
                user: currentRole,
                action: action,
                details: details
            };
            
            await MotoDB.add('audit_logs', logEntry);
        } catch (e) {
            console.error("Failed to log activity:", e);
        }
    },

    saveAutoBackup: async function() {
        // Run in background with a slight delay to prevent blocking the UI thread
        setTimeout(async () => {
            try {
                const stores = ['customers', 'suppliers', 'products', 'units', 'sales', 'installments', 'transactions', 'audit_logs'];
                const backup = {
                    _meta: {
                        app: 'Moto_ERP',
                        version: '3.0',
                        exportDate: new Date().toISOString(),
                        branding: BRANDING,
                        branches: BRANCHES,
                        exportedBy: 'SystemAutoBackup'
                    }
                };

                for (const store of stores) {
                    backup[store] = await MotoDB.getAll(store);
                }

                const json = JSON.stringify(backup);
                
                if (window.pywebview && window.pywebview.api && window.pywebview.api.save_backup_auto) {
                    window.pywebview.api.save_backup_auto(json).then(res => {
                        if (res && res.success) {
                            console.log("Automatic backup saved successfully.");
                        } else {
                            console.warn("Auto-backup status: ", res);
                        }
                    }).catch(e => {
                        console.error("Error saving automatic backup:", e);
                    });
                } else {
                    // Fallback to local HTTP server API when running in standard browser
                    fetch('/api/backup/auto', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: json
                    })
                    .then(res => res.json())
                    .then(res => {
                        if (res && res.success) {
                            console.log("Automatic backup saved successfully via API.");
                        } else {
                            console.warn("Auto-backup via API status: ", res);
                        }
                    })
                    .catch(e => {
                        console.error("Error saving automatic backup via API:", e);
                    });
                }
            } catch (err) {
                console.error("Auto-backup creation failed:", err);
            }
        }, 100);
    },

    // 1. Navigation & Tab Switching
    initNavigation: function() {
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = item.getAttribute('data-tab');
                if (!tabId || !document.getElementById(`${tabId}-page`)) return;
                this.switchTab(tabId);
                menuItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                document.querySelector('.sidebar')?.classList.remove('open');
                document.body.classList.remove('sidebar-open');
            });
        });
    },

    switchTab: async function(tabId) {
        const roleAllowed = {
            admin: ['dashboard', 'customers', 'guarantors', 'suppliers', 'products', 'sales', 'installments', 'traffic', 'calculator', 'accounting', 'reports', 'settings', 'audit', 'defaults'],
            sales: ['dashboard', 'customers', 'guarantors', 'products', 'sales', 'installments', 'traffic', 'calculator', 'defaults'],
            accounting: ['dashboard', 'customers', 'guarantors', 'products', 'sales', 'installments', 'traffic', 'calculator', 'accounting', 'defaults'],
            viewer: ['dashboard', 'customers', 'guarantors', 'products', 'sales', 'installments', 'traffic', 'calculator', 'accounting', 'reports', 'defaults']
        };

        const allowedList = roleAllowed[currentRole] || roleAllowed['viewer'];
        if (!allowedList.includes(tabId)) {
            tabId = 'dashboard';
        }

        // Keep the URL in sync with the visible page so refresh/back navigation restores the correct section.
        if (location.hash !== `#${tabId}`) history.replaceState(null, '', `#${tabId}`);
        document.querySelectorAll('.menu-item').forEach(item => item.classList.toggle('active', item.dataset.tab === tabId));

        // Hide all pages
        const pages = document.querySelectorAll('.page');
        pages.forEach(page => page.classList.remove('active'));
        
        // Show active page
        const activePage = document.getElementById(`${tabId}-page`);
        if (activePage) {
            activePage.classList.add('active');
        }

        // Load page-specific logic
        await this.loadAllData(); // Refresh State
        
        switch(tabId) {
            case 'calculator':
                if (App.Calculator && typeof App.Calculator.pageCalc === 'function') {
                    App.Calculator.pageCalc();
                }
                break;
            case 'dashboard':
                this.Dashboard.render();
                break;
            case 'customers':
                this.Customers.render();
                break;
            case 'guarantors':
                this.Guarantors.render();
                break;
            case 'suppliers':
                this.Suppliers.render();
                break;
            case 'products':
                this.Products.render();
                break;
            case 'sales':
                this.Sales.render();
                break;
            case 'installments':
                this.Installments.render();
                break;
            case 'traffic':
                this.Traffic.render();
                break;
            case 'accounting':
                this.Accounting.render();
                break;
            case 'reports':
                this.Reports.render();
                break;
            case 'defaults':
                this.Defaults.render();
                break;
            case 'settings':
                this.Settings.render();
                break;
            case 'audit':
                this.Audit.render();
                break;
        }

        this.applyPermissions();
    },

    switchUserRole: function(role) {
        currentRole = role;
        // Update header role display
        const roleNames = {
            admin: 'مدير النظام (Admin)',
            sales: 'موظف مبيعات (Sales)',
            accounting: 'موظف حسابات (Accounting)',
            viewer: 'موظف إداري (Viewer)'
        };
        const roleEl = document.getElementById('current-role-display');
        if (roleEl) roleEl.textContent = roleNames[role] || role;
        
        // Update the dropdown too
        const selectEl = document.getElementById('role-select');
        if (selectEl) selectEl.value = role;
        
        // Redirect to dashboard immediately on role switch
        this.switchTab('dashboard');
    },

    updateCurrentDate: function() {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('current-date').innerHTML = `<i class="fa-regular fa-calendar-days"></i> ` + today.toLocaleDateString('ar-EG', options);
    },

    loadAllData: async function() {
        allProducts = await MotoDB.getAll('products');
        allSuppliers = await MotoDB.getAll('suppliers');
        const rawCustomers = await MotoDB.getAll('customers');
        allCustomers = rawCustomers.map(c => ({
            ...c,
            phone: this.Security.decrypt(c.phone),
            nid: this.Security.decrypt(c.nid)
        }));
        const rawUnits = await MotoDB.getAll('units');
        let needsDbMigration = false;
        const healedUnits = rawUnits.map(u => {
            if (u.status === 'غير متاح') {
                u.status = 'متاح';
                needsDbMigration = true;
            }
            return u;
        });
        if (needsDbMigration) {
            try {
                await MotoDB.updateBatch('units', healedUnits);
            } catch (e) {
                console.error("Failed to migrate units status:", e);
            }
        }

        const localBranch = localStorage.getItem('motomax_local_branch') || BRANCHES[0] || 'الفرع الرئيسي';
        allUnits = healedUnits.map(u => {
            if (u.branch && u.branch !== localBranch && u.status === 'متاح') {
                return { ...u, status: 'غير متاح' };
            }
            return u;
        });
        
        // Check overdue installments for count (in-memory update to avoid heavy disk I/O at startup)
        const installments = await MotoDB.getAll('installments');
        const todayStr = new Date().toISOString().split('T')[0];
        
        let overdueCount = 0;
        let overdueSum = 0;
        
        installments.forEach(inst => {
            if (inst.status === 'overdue' || (inst.status === 'pending' && inst.dueDate < todayStr)) {
                overdueCount++;
                overdueSum += inst.amount;
                // Mark overdue in-memory for the UI rendering
                if (inst.status === 'pending') {
                    inst.status = 'overdue';
                }
            }
        });
        
        // Check traffic letters overdue count for sidebar badge
        try {
            const sales = await MotoDB.getAll('sales');
            let criticalTrafficCount = 0;
            sales.forEach(s => {
                if (s.traffic_letter_status !== 'received' && s.saleDate) {
                    const bDays = App.Traffic && typeof App.Traffic.calculateBusinessDays === 'function' ? App.Traffic.calculateBusinessDays(s.saleDate, todayStr) : 0;
                    if (bDays >= 12) criticalTrafficCount++;
                }
            });
            const sbTrafficBadge = document.getElementById('sidebar-traffic-badge');
            if (sbTrafficBadge) {
                if (criticalTrafficCount > 0) {
                    sbTrafficBadge.textContent = criticalTrafficCount;
                    sbTrafficBadge.style.display = 'inline-block';
                } else {
                    sbTrafficBadge.style.display = 'none';
                }
            }
        } catch (tErr) {
            console.warn("Traffic badge check warning:", tErr);
        }

        document.getElementById('overdue-alerts-count').textContent = overdueCount;
        return { overdueCount, overdueSum };
    },

    applyPermissions: function() {
        const roleAllowed = {
            admin: ['dashboard', 'customers', 'guarantors', 'suppliers', 'products', 'sales', 'installments', 'traffic', 'accounting', 'reports', 'settings', 'audit', 'defaults'],
            sales: ['dashboard', 'customers', 'guarantors', 'products', 'sales', 'installments', 'traffic', 'defaults'],
            accounting: ['dashboard', 'customers', 'guarantors', 'products', 'sales', 'installments', 'traffic', 'accounting', 'defaults'],
            viewer: ['dashboard', 'customers', 'guarantors', 'products', 'sales', 'installments', 'traffic', 'accounting', 'reports', 'defaults']
        };

        const allowedList = roleAllowed[currentRole] || roleAllowed['viewer'];

        // 1. Hide/Show Sidebar Links
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const tab = item.getAttribute('data-tab');
            if (allowedList.includes(tab)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });

        // 2. Control Write/Delete/Edit operations based on role
        const writeElements = document.querySelectorAll('[data-permission="write"]');
        writeElements.forEach(el => {
            if (currentRole === 'viewer') {
                el.style.display = 'none'; // Viewer has read-only access
            } else {
                el.style.display = '';
            }
        });

        // Delete buttons: Admin & Accountant if allowed, else Admin ONLY
        const deleteButtons = document.querySelectorAll('.btn-delete-row, [data-permission="delete"]');
        deleteButtons.forEach(btn => {
            const allowAcc = btn.classList.contains('allow-acc-delete') || btn.getAttribute('data-allow-accounting') === 'true';
            if (currentRole === 'admin' || (currentRole === 'accounting' && allowAcc)) {
                btn.style.display = '';
            } else {
                btn.style.display = 'none';
            }
        });

        // Edit buttons: Admin, Accounting, and Sales if allowed, else Admin ONLY (except follow-up note edits)
        const editButtons = document.querySelectorAll('.btn-edit-row, [data-permission="edit"]');
        editButtons.forEach(btn => {
            const allowAcc = btn.classList.contains('allow-acc-edit') || btn.getAttribute('data-allow-accounting') === 'true';
            const isSalesNote = btn.classList.contains('allow-sales-edit');
            if (currentRole === 'admin' || currentRole === 'sales' || isSalesNote || (currentRole === 'accounting' && allowAcc)) {
                btn.style.display = '';
            } else {
                btn.style.display = 'none';
            }
        });

        const menuAudit = document.getElementById('menu-audit');
        if (menuAudit) {
            if (currentRole === 'admin') {
                menuAudit.style.display = '';
            } else {
                menuAudit.style.display = 'none';
            }
        }
    },

    handleGlobalSearch: async function(e) {
        if (e.key === 'Enter') {
            const query = e.target.value.trim().toLowerCase();
            if (!query) return;
            
            const cust = allCustomers.find(c => c.name.toLowerCase().includes(query) || c.phone.includes(query) || c.nid.includes(query) || c.code.toLowerCase().includes(query));
            const sup = allSuppliers.find(s => s.name.toLowerCase().includes(query) || s.phone.includes(query) || s.code.toLowerCase().includes(query));
            const unit = allUnits.find(u => u.chassis.toLowerCase().includes(query) || u.motor.toLowerCase().includes(query));
            
            if (cust) {
                this.switchTab('customers');
                document.getElementById('cust-search-term').value = cust.name;
                this.Customers.search();
            } else if (sup) {
                this.switchTab('suppliers');
                document.getElementById('sup-search-term').value = sup.name;
                this.Suppliers.search();
            } else if (unit) {
                this.switchTab('products');
                this.Products.switchSubTab('units');
                document.getElementById('unit-search-term').value = unit.chassis;
                this.Products.searchUnits();
            } else {
                alert("لم يتم العثور على أي نتائج مطابقة في العملاء أو الموردين أو الشاسيهات.");
            }
        }
    },

    showNotifications: async function() {
        const installments = await MotoDB.getAll('installments');
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const in7Days = new Date();
        in7Days.setDate(today.getDate() + 7);
        const in7DaysStr = in7Days.toISOString().split('T')[0];

        const overdues = installments.filter(i => i.status === 'overdue' || (i.status === 'pending' && i.dueDate < todayStr));
        const dueSoon = installments.filter(i => i.status === 'pending' && i.dueDate >= todayStr && i.dueDate <= in7DaysStr);

        overdues.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.installmentNumber || 0) - (b.installmentNumber || 0));
        dueSoon.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.installmentNumber || 0) - (b.installmentNumber || 0));

        let overduesHtml = '';
        if (overdues.length === 0) {
            overduesHtml = '<p class="text-emerald font-bold mb-4"><i class="fa-solid fa-circle-check"></i> لا يوجد عملاء متأخرين عن السداد حالياً.</p>';
        } else {
            overduesHtml = `
                <table class="data-table small-table red-borders mb-4" style="font-size:12px;">
                    <thead>
                        <tr>
                            <th>العميل</th>
                            <th>الموبايل</th>
                            <th>القسط</th>
                            <th>المبلغ</th>
                            <th>تاريخ الاستحقاق</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            for (let inst of overdues) {
                const cust = allCustomers.find(c => c.id === inst.customerId);
                const custName = cust ? cust.name : 'عميل مجهول';
                const custPhone = cust ? App.Security.decrypt(cust.phone) : '-';
                overduesHtml += `
                    <tr>
                        <td><strong>${custName}</strong></td>
                        <td class="font-bold text-cyan">${custPhone}</td>
                        <td>قسط ${inst.installmentNumber}</td>
                        <td class="text-crimson font-bold">${inst.amount.toLocaleString('ar-EG')} ج.م</td>
                        <td><span class="badge-status danger">${inst.dueDate}</span></td>
                    </tr>
                `;
            }
            overduesHtml += '</tbody></table>';
        }

        let dueSoonHtml = '';
        if (dueSoon.length === 0) {
            dueSoonHtml = '<p class="text-muted text-xs mb-4">لا يوجد أقساط تستحق اليوم أو خلال الـ 7 أيام القادمة.</p>';
        } else {
            dueSoonHtml = `
                <table class="data-table small-table mb-4" style="font-size:12px;">
                    <thead>
                        <tr>
                            <th>العميل</th>
                            <th>الموبايل</th>
                            <th>القسط</th>
                            <th>المبلغ</th>
                            <th>تاريخ الاستحقاق</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            for (let inst of dueSoon) {
                const cust = allCustomers.find(c => c.id === inst.customerId);
                const custName = cust ? cust.name : 'عميل مجهول';
                const custPhone = cust ? App.Security.decrypt(cust.phone) : '-';
                dueSoonHtml += `
                    <tr>
                        <td><strong>${custName}</strong></td>
                        <td class="font-bold text-cyan">${custPhone}</td>
                        <td>قسط ${inst.installmentNumber}</td>
                        <td class="text-orange font-bold">${inst.amount.toLocaleString('ar-EG')} ج.م</td>
                        <td><span class="badge-status warning">${inst.dueDate}</span></td>
                    </tr>
                `;
            }
            dueSoonHtml += '</tbody></table>';
        }

        const html = `
            <div class="details-summary-header">
                <h2>🔔 تنبيهات ومتابعة الأقساط العاجلة والمستحقة</h2>
                <p class="text-muted text-xs">قائمة بمتابعة العملاء المتأخرين والأقساط التي تقترب من موعد السداد.</p>
            </div>
            
            <div class="details-section-title"><i class="fa-solid fa-triangle-exclamation text-crimson"></i> 1. أقساط متأخرة ومستحقة الدفع (تحصيل فوري)</div>
            ${overduesHtml}

            <div class="details-section-title"><i class="fa-solid fa-bell text-cyan"></i> 2. أقساط تستحق اليوم وقريباً (خلال 7 أيام)</div>
            ${dueSoonHtml}
        `;

        App.openDetailsViewer("تنبيهات ومتابعة تحصيل الأقساط", html);
    },

    showOverdueInstallmentsTab: function() {
        this.switchTab('installments');
        this.Installments.switchSubTab('overdues');
    },

    openDetailsViewer: function(title, contentHtml) {
        document.getElementById('viewer-modal-title').textContent = title;
        document.getElementById('viewer-modal-body').innerHTML = contentHtml;
        document.getElementById('details-viewer-modal').classList.remove('hidden');
    },

    closeDetailsViewer: function() {
        document.getElementById('details-viewer-modal').classList.add('hidden');
    },

    closeReceipt: function() {
        document.getElementById('receipt-print-modal').classList.add('hidden');
        const printStyle = document.getElementById('receipt-page-style');
        if (printStyle) printStyle.remove();
    },

    printReceiptModal: function() {
        window.print();
    },


    /* ==========================================================================
       SUBMODULE: AUTHENTICATION & LOGIN (ROLE SECURED)
       ========================================================================== */
    Auth: {
        pendingRole: null,

        checkLicenseStatus: async function() {
            try {
                const res = await fetch('/api/license/status');
                const data = await res.json();
                App.isDemoMode = !data.is_licensed;
                App.machineId = data.machine_id;
                
                if (App.isDemoMode) {
                    const banner = document.getElementById('demo-mode-banner');
                    if (banner) banner.style.display = 'flex';
                    document.body.classList.add('has-demo-banner');
                    const actBtn = document.getElementById('sidebar-activate-btn');
                    if (actBtn) actBtn.style.display = 'flex';
                    
                    // Override branding values with generic demo data to hide actual developer data
                    BRANDING.name = "Moto_ERP (نسخة تجريبية)";
                    BRANDING.logo = "";
                    BRANDING.phone = "01012345678";
                    BRANDING.address = "القاهرة، جمهورية مصر العربية";
                    BRANDING.invoiceFooter = "شكراً لتعاملكم معنا. هذه نسخة تجريبية محدودة لعرض إمكانيات نظام Moto_ERP لإدارة المعارض.";
                    BRANDING.receiptFooter = "تحصيل قسط تجريبي - نظام Moto_ERP";
                    
                    // Re-apply to ensure UI is updated with these demo defaults
                    App.Settings.applyBrandingToUI();
                } else {
                    const banner = document.getElementById('demo-mode-banner');
                    if (banner) banner.style.display = 'none';
                    document.body.classList.remove('has-demo-banner');
                    const actBtn = document.getElementById('sidebar-activate-btn');
                    if (actBtn) actBtn.style.display = 'none';
                }
            } catch (err) {
                console.error("Error checking license status:", err);
            }
        },

        openActivationModal: function() {
            document.getElementById('activation-hwid-val').textContent = App.machineId || "جاري جلب كود الجهاز...";
            document.getElementById('activation-modal-key').value = "";
            document.getElementById('activation-error').style.display = 'none';
            document.getElementById('activation-success').style.display = 'none';
            document.getElementById('license-activation-modal').classList.remove('hidden');
        },

        closeActivationModal: function() {
            document.getElementById('license-activation-modal').classList.add('hidden');
        },

        copyActivationHWID: function() {
            const hwid = document.getElementById('activation-hwid-val').textContent;
            navigator.clipboard.writeText(hwid).then(function() {
                alert("تم نسخ كود الجهاز بنجاح!");
            });
        },

        formatActivationKey: function(input) {
            let val = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            let formatted = [];
            for (let i = 0; i < val.length; i += 4) {
                formatted.push(val.substring(i, i + 4));
            }
            input.value = formatted.join('-');
        },

        submitActivation: function(e) {
            e.preventDefault();
            const key = document.getElementById('activation-modal-key').value;
            const errAlert = document.getElementById('activation-error');
            const succAlert = document.getElementById('activation-success');
            
            errAlert.style.display = 'none';
            succAlert.style.display = 'none';

            if (!key || key.length < 15) {
                errAlert.textContent = "الرجاء إدخال مفتاح تفعيل صحيح ومكتمل.";
                errAlert.style.display = 'block';
                return;
            }

            fetch('/api/license/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: key })
            })
            .then(res => res.json())
            .then(function(res) {
                if (res.success) {
                    succAlert.textContent = res.message;
                    succAlert.style.display = 'block';
                    setTimeout(function() {
                        window.location.reload();
                    }, 1500);
                } else {
                    errAlert.textContent = res.message;
                    errAlert.style.display = 'block';
                }
            })
            .catch(err => {
                errAlert.textContent = "فشل الاتصال بالخادم لإتمام التفعيل.";
                errAlert.style.display = 'block';
            });
        },

        normalizePassword: function(input) {
            if (!input) return '';
            let s = input.toString();
            // Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to standard ASCII digits
            s = s.replace(/[\u0660-\u0669]/g, d => (d.charCodeAt(0) - 1632).toString());
            // Convert Eastern Arabic-Indic / Persian digits (۰۱۲۳۴۵۶۷۸۹) to standard ASCII digits
            s = s.replace(/[\u06F0-\u06F9]/g, d => (d.charCodeAt(0) - 1776).toString());
            // Remove zero-width spaces, directional marks, and whitespace
            s = s.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\s]/g, '');
            return s.trim();
        },

        checkPasswordMatch: function(role, input) {
            const clean = this.normalizePassword(input);
            if (!clean) return false;
            
            const expected = this.normalizePassword(PWD_CONFIG[role] || '123456');
            
            return (clean === expected);
        },

        togglePasswordVisibility: function(inputId, iconId) {
            const input = document.getElementById(inputId);
            const icon = document.getElementById(iconId);
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                if (icon) icon.className = 'fa-solid fa-eye-slash';
            } else {
                input.type = 'password';
                if (icon) icon.className = 'fa-solid fa-eye';
            }
        },

        init: function() {
            const session = sessionStorage.getItem('motomax_session');
            if (session) {
                currentRole = session;
                const roleSelect = document.getElementById('role-select');
                if (roleSelect) roleSelect.value = currentRole;
                App.switchUserRole(currentRole);
                
                // Hide login overlay
                const overlay = document.getElementById('login-overlay');
                if (overlay) overlay.style.display = 'none';
                const appWrapper = document.getElementById('app-wrapper');
                if (appWrapper) appWrapper.classList.remove('blur-content');
                App.switchTab('dashboard');
            } else {
                // Keep login prompt open
                const overlay = document.getElementById('login-overlay');
                if (overlay) overlay.style.display = 'flex';
                const appWrapper = document.getElementById('app-wrapper');
                if (appWrapper) appWrapper.classList.add('blur-content');
                this.onLoginRoleChange('admin');
            }
        },

        onLoginRoleChange: function(role) {
            const hint = document.getElementById('login-hint');
            if (hint) hint.textContent = "";
        },

        login: function(e) {
            if (e) e.preventDefault();
            const roleEl = document.getElementById('login-role');
            const role = roleEl ? roleEl.value : 'admin';
            const pwdEl = document.getElementById('login-password');
            const password = pwdEl ? pwdEl.value : '';

            if (this.checkPasswordMatch(role, password)) {
                // Set Session
                currentRole = role;
                sessionStorage.setItem('motomax_session', role);
                
                // Hide login, show system
                const overlay = document.getElementById('login-overlay');
                if (overlay) overlay.style.display = 'none';
                const appWrapper = document.getElementById('app-wrapper');
                if (appWrapper) appWrapper.classList.remove('blur-content');
                
                const roleSelect = document.getElementById('role-select');
                if (roleSelect) roleSelect.value = role;
                App.switchUserRole(role);
                
                App.logActivity("تسجيل الدخول", `نجاح تسجيل الدخول للنظام بالفئة المحددة: ${role}`);
                
                // Reset password input
                if (pwdEl) pwdEl.value = '';
                App.switchTab('dashboard');
            } else {
                alert("خطأ: الرقم السري الذي أدخلته غير صحيح لهذه الفئة، يرجى المحاولة مجدداً.");
            }
        },

        logout: async function() {
            if (await BakryDialogs.confirm("هل تريد تسجيل الخروج من النظام وتأمين الشاشة؟")) {
                sessionStorage.removeItem('motomax_session');
                const overlay = document.getElementById('login-overlay');
                if (overlay) overlay.style.display = 'flex';
                const appWrapper = document.getElementById('app-wrapper');
                if (appWrapper) appWrapper.classList.add('blur-content');
                this.onLoginRoleChange('admin');
            }
        },

        // Dropdown Role switcher verification
        triggerRoleChange: function(newRole) {
            if (newRole === currentRole) return;
            
            this.pendingRole = newRole;
            
            // Open password prompt modal
            const pwdInput = document.getElementById('role-prompt-password');
            if (pwdInput) pwdInput.value = '';
            
            const descEl = document.getElementById('pwd-prompt-desc');
            if (descEl) {
                const roleName = newRole === 'admin' ? 'Admin (مدير النظام)' : newRole === 'sales' ? 'موظف مبيعات' : newRole === 'accounting' ? 'موظف حسابات' : 'موظف إداري';
                descEl.innerHTML = `يرجى تأكيد الرقم السري الخاص بفئة <strong>(${roleName})</strong> للمتابعة:`;
            }
            
            const hintEl = document.getElementById('pwd-prompt-hint');
            if (hintEl) hintEl.textContent = "";
            
            const modal = document.getElementById('password-prompt-modal');
            if (modal) modal.classList.remove('hidden');
        },

        verifyRolePassword: function(e) {
            if (e) e.preventDefault();
            const pwdInput = document.getElementById('role-prompt-password');
            const password = pwdInput ? pwdInput.value : '';
            const targetRole = this.pendingRole || 'admin';

            if (this.checkPasswordMatch(targetRole, password)) {
                // Approved
                currentRole = targetRole;
                sessionStorage.setItem('motomax_session', targetRole);
                
                const modal = document.getElementById('password-prompt-modal');
                if (modal) modal.classList.add('hidden');
                
                App.switchUserRole(targetRole);
                App.logActivity("تغيير الصلاحية", `تحويل صلاحيات النظام لمحاكاة الفئة: ${targetRole}`);
                this.pendingRole = null;
            } else {
                alert("خطأ: الرقم السري غير صحيح! تم إلغاء عملية تحويل الصلاحيات.");
                this.cancelRoleChange();
            }
        },

        cancelRoleChange: function() {
            const modal = document.getElementById('password-prompt-modal');
            if (modal) modal.classList.add('hidden');
            // Revert select dropdown to previous state
            const roleSelect = document.getElementById('role-select');
            if (roleSelect) roleSelect.value = currentRole;
            this.pendingRole = null;
        }
    },


    /* ==========================================================================
       SUBMODULE: DASHBOARD
       ========================================================================== */
    Dashboard: {
        render: async function() {
            const sales = await MotoDB.getAll('sales');
            const txs = await MotoDB.getAll('transactions');
            const installments = await MotoDB.getAll('installments');
            const supplierDues = await MotoDB.getAll('supplier_dues');
            
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1; // 1-indexed
            const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
            const todayStr = now.toISOString().split('T')[0];

            // 1. Sales Calculations
            const monthSales = sales.filter(s => s.saleDate.startsWith(monthPrefix));
            const yearSales = sales.filter(s => s.saleDate.startsWith(String(currentYear)));
            
            let totalSalesSum = 0;
            sales.forEach(s => totalSalesSum += s.salePrice);
            
            const monthSalesCount = monthSales.length;
            const yearSalesCount = yearSales.length;
            
            const distinctMonths = [...new Set(sales.map(s => s.saleDate.substring(0, 7)))].length || 1;
            const monthlyAvg = totalSalesSum / distinctMonths;

            document.getElementById('metric-sales-month-count').textContent = monthSalesCount + " قطعة";
            document.getElementById('metric-sales-year-count').textContent = yearSalesCount + " قطعة";
            document.getElementById('metric-sales-total-value').textContent = totalSalesSum.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('metric-sales-monthly-avg').textContent = monthlyAvg.toLocaleString('ar-EG') + " ج.م";

            // 2. Installments Calculations
            let instTotalDue = 0;
            let instCollected = 0;
            installments.forEach(i => {
                instTotalDue += i.amount;
                if (i.status === 'paid') {
                    instCollected += (i.paidAmount || i.amount);
                }
            });
            const instRemaining = instTotalDue - instCollected;

            document.getElementById('metric-inst-total-due').textContent = instTotalDue.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('metric-inst-collected').textContent = instCollected.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('metric-inst-remaining').textContent = instRemaining.toLocaleString('ar-EG') + " ج.م";

            // 3. Treasury Calculations (Cash vs Bank)
            let treasuryBalance = 0;
            let treasuryCash = 0;
            let treasuryBank = 0;
            txs.forEach(t => {
                const isBank = (t.paymentMethod === 'بنك');
                if (t.type === 'قبض') {
                    treasuryBalance += t.amount;
                    if (isBank) treasuryBank += t.amount;
                    else treasuryCash += t.amount;
                } else {
                    treasuryBalance -= t.amount;
                    if (isBank) treasuryBank -= t.amount;
                    else treasuryCash -= t.amount;
                }
            });

            document.getElementById('metric-treasury-balance').textContent = treasuryBalance.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('metric-treasury-cash').textContent = treasuryCash.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('metric-treasury-bank').textContent = treasuryBank.toLocaleString('ar-EG') + " ج.م";

            // 4. Suppliers Calculations
            let suppliersTotalDue = 0;
            let suppliersDueMonth = 0;
            supplierDues.forEach(d => {
                if (d.status !== 'paid') {
                    const rem = d.totalAmount - d.paidAmount;
                    suppliersTotalDue += rem;
                    if (d.dueDate.startsWith(monthPrefix)) {
                        suppliersDueMonth += rem;
                    }
                }
            });

            document.getElementById('metric-suppliers-total-due').textContent = suppliersTotalDue.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('metric-suppliers-due-month').textContent = suppliersDueMonth.toLocaleString('ar-EG') + " ج.م";

            // 5. Showroom Health Indicator
            const overdueData = await App.loadAllData();
            
            // 6. Smart Alerts Calculations & Rendering
            const alertContainer = document.getElementById('smart-alerts-container');
            const alertBadge = document.getElementById('dashboard-alerts-count-badge');
            if (alertContainer) {
                alertContainer.innerHTML = '';
            }
            
            const alertsHtml = [];
            let activeAlertCount = 0;

            // Traffic Letters & Licensing Alerts (Critical: 12+ business days, Approaching: 9-11 business days)
            const allSalesData = await MotoDB.getAll('sales');
            const criticalTrafficLetters = [];
            const approachingTrafficLetters = [];

            allSalesData.forEach(sale => {
                if (sale.traffic_letter_status !== 'received' && sale.saleDate) {
                    const busDays = App.Traffic.calculateBusinessDays(sale.saleDate, todayStr);
                    const cust = allCustomers.find(c => c.id === sale.customerId);
                    const unit = allUnits.find(u => u.id === sale.unitId);
                    const prod = unit ? allProducts.find(p => p.id === unit.productId) : null;
                    const itemInfo = {
                        sale,
                        customerName: cust ? cust.name : 'عميل',
                        customerPhone: cust ? cust.phone : '',
                        vehicleName: prod ? `${prod.brand || ''} (${prod.year || ''})` : 'مركبة',
                        chassis: unit ? (unit.chassis || '-') : '-',
                        busDays: busDays,
                        remainingDays: Math.max(0, 12 - busDays)
                    };
                    if (busDays >= 12) {
                        criticalTrafficLetters.push(itemInfo);
                    } else if (busDays >= 9) {
                        approachingTrafficLetters.push(itemInfo);
                    }
                }
            });

            // Update sidebar traffic badge
            const sidebarTrafficBadge = document.getElementById('sidebar-traffic-badge');
            if (sidebarTrafficBadge) {
                if (criticalTrafficLetters.length > 0) {
                    sidebarTrafficBadge.textContent = criticalTrafficLetters.length;
                    sidebarTrafficBadge.style.display = 'inline-block';
                } else {
                    sidebarTrafficBadge.style.display = 'none';
                }
            }

            // Critical Traffic Letters Alert Card
            if (criticalTrafficLetters.length > 0) {
                activeAlertCount++;
                const letterChips = criticalTrafficLetters.slice(0, 4).map(item => `
                    <div class="smart-alert-chip" onclick="App.switchTab('traffic'); App.Traffic.openModal(${item.sale.id});" style="cursor: pointer;" title="اضغط لتسجيل استلام الجواب">
                        <span class="model-name"><strong>${item.customerName}</strong> (${item.vehicleName} - شاسيه: ${item.chassis})</span>
                        <span class="stock-pill out" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">مر ${item.busDays} يوم عمل (حرج)</span>
                    </div>
                `).join('');

                alertsHtml.push(`
                    <div class="smart-alert-card danger" style="border-right: 4px solid var(--crimson);">
                        <div class="smart-alert-header">
                            <div class="smart-alert-title" onclick="App.switchTab('traffic'); App.Traffic.setFilter('critical');" style="cursor: pointer;">
                                <i class="fa-solid fa-id-card-clip text-crimson animate-pulse"></i>
                                <span>جوابات وإخطارات مرور متأخرة (تجاوزت 12 يوم عمل)</span>
                            </div>
                            <span class="smart-alert-badge badge-danger-soft">${criticalTrafficLetters.length} جواب حرج</span>
                        </div>
                        <div style="font-size: 11.5px; margin-bottom: 6px; color: var(--text-secondary);">
                            حان موعد مطالبة الشركة المصنعة واستلام أوراق الترخيص للعملاء:
                        </div>
                        <div class="smart-alert-chips">
                            ${letterChips}
                        </div>
                        ${criticalTrafficLetters.length > 4 ? `<div style="text-align: left; margin-top: 6px;"><a href="#traffic" onclick="App.switchTab('traffic'); App.Traffic.setFilter('critical');" class="text-orange text-xs" style="text-decoration: underline;">عرض باقي الجوابات الحرجة (${criticalTrafficLetters.length})...</a></div>` : ''}
                    </div>
                `);
            }

            // Approaching Traffic Letters Alert Card
            if (approachingTrafficLetters.length > 0) {
                activeAlertCount++;
                alertsHtml.push(`
                    <div class="smart-alert-card warning" style="border-right: 4px solid var(--amber);">
                        <div class="smart-alert-header">
                            <div class="smart-alert-title" onclick="App.switchTab('traffic'); App.Traffic.setFilter('approaching');" style="cursor: pointer;">
                                <i class="fa-solid fa-hourglass-half text-orange"></i>
                                <span>جوابات وإخطارات مرور تقترب من موعد الإصدار (باقي 1 - 3 أيام)</span>
                            </div>
                            <span class="smart-alert-badge badge-warning-soft">${approachingTrafficLetters.length} جواب قيد المتابعة</span>
                        </div>
                        <div style="font-size: 11.5px; opacity: 0.9;">
                            مطلوب تجهيز بيانات ومتابعة المصانع بالجوابات فور اكتمال الـ 12 يوم عمل.
                        </div>
                    </div>
                `);
            }

            // Overdue Installments (Urgent)
            if (overdueData.overdueCount > 0) {
                activeAlertCount++;
                alertsHtml.push(`
                    <div class="smart-alert-card danger">
                        <div class="smart-alert-header">
                            <div class="smart-alert-title">
                                <i class="fa-solid fa-circle-exclamation text-crimson"></i>
                                <span>أقساط متأخرة واجبة التحصيل فوراً</span>
                            </div>
                            <span class="smart-alert-badge badge-danger-soft">${overdueData.overdueCount} قسط متأخر</span>
                        </div>
                        <div style="font-size: 11.5px; opacity: 0.9;">
                            إجمالي المبالغ المتأخرة: <strong style="color: #f87171;">${overdueData.overdueSum.toLocaleString('ar-EG')} ج.م</strong>
                        </div>
                    </div>
                `);
            }

            // Installments Due Today
            const dueTodayCount = installments.filter(i => i.status === 'pending' && i.dueDate === todayStr).length;
            if (dueTodayCount > 0) {
                activeAlertCount++;
                alertsHtml.push(`
                    <div class="smart-alert-card danger">
                        <div class="smart-alert-header">
                            <div class="smart-alert-title">
                                <i class="fa-solid fa-file-invoice-dollar text-crimson"></i>
                                <span>أقساط وإيصالات مستحقة السداد اليوم</span>
                            </div>
                            <span class="smart-alert-badge badge-danger-soft">${dueTodayCount} مستحق اليوم</span>
                        </div>
                    </div>
                `);
            }

            // Installments Due Soon (within 3 days)
            const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const dueSoonInsts = installments.filter(i => i.status === 'pending' && i.dueDate > todayStr && i.dueDate <= threeDaysLater);
            if (dueSoonInsts.length > 0) {
                activeAlertCount++;
                alertsHtml.push(`
                    <div class="smart-alert-card warning">
                        <div class="smart-alert-header">
                            <div class="smart-alert-title">
                                <i class="fa-solid fa-triangle-exclamation text-orange"></i>
                                <span>أقساط تقترب من موعد الاستحقاق (خلال 3 أيام)</span>
                            </div>
                            <span class="smart-alert-badge badge-warning-soft">${dueSoonInsts.length} عميل</span>
                        </div>
                    </div>
                `);
            }

            // Supplier dues in 7 days
            const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const dueSoonSuppliers = supplierDues.filter(d => d.status !== 'paid' && d.dueDate >= todayStr && d.dueDate <= sevenDaysLater);
            if (dueSoonSuppliers.length > 0) {
                activeAlertCount++;
                const totalDueSoonSupAmount = dueSoonSuppliers.reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);
                alertsHtml.push(`
                    <div class="smart-alert-card warning">
                        <div class="smart-alert-header">
                            <div class="smart-alert-title">
                                <i class="fa-solid fa-truck-field text-orange"></i>
                                <span>مستحقات للموردين تقترب من الاستحقاق (خلال أسبوع)</span>
                            </div>
                            <span class="smart-alert-badge badge-warning-soft">${totalDueSoonSupAmount.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        <div style="font-size: 11.5px; opacity: 0.9;">
                            عدد الفواتير المستحقة قريباً: <strong>${dueSoonSuppliers.length} فاتورة</strong>
                        </div>
                    </div>
                `);
            }

            // Stock Alerts: Out of Stock (0) vs Critical Low Stock (1)
            const outOfStockProducts = [];
            const criticalLowStockProducts = [];
            
            allProducts.forEach(p => {
                const count = allUnits.filter(u => u.productId === p.id && u.status === 'متاح').length;
                const modelLabel = `${p.brand || ''} (${p.year || ''}) - ${p.cc || ''}`.trim();
                if (count === 0) {
                    outOfStockProducts.push({ name: modelLabel, count: 0 });
                } else if (count === 1) {
                    criticalLowStockProducts.push({ name: modelLabel, count: 1 });
                }
            });

            // Out of stock alert
            if (outOfStockProducts.length > 0) {
                activeAlertCount++;
                const chips = outOfStockProducts.map(p => `
                    <div class="smart-alert-chip">
                        <span class="model-name">${p.name}</span>
                        <span class="stock-pill out">نفد (0)</span>
                    </div>
                `).join('');

                alertsHtml.push(`
                    <div class="smart-alert-card danger">
                        <div class="smart-alert-header">
                            <div class="smart-alert-title">
                                <i class="fa-solid fa-boxes-stacked text-crimson"></i>
                                <span>أصناف نفدت بالكامل من المعرض</span>
                            </div>
                            <span class="smart-alert-badge badge-danger-soft">${outOfStockProducts.length} صنف نفد</span>
                        </div>
                        <div class="smart-alert-chips">
                            ${chips}
                        </div>
                    </div>
                `);
            }

            // Critical low stock alert (1 item left)
            if (criticalLowStockProducts.length > 0) {
                activeAlertCount++;
                const chips = criticalLowStockProducts.map(p => `
                    <div class="smart-alert-chip">
                        <span class="model-name">${p.name}</span>
                        <span class="stock-pill low">متبقي 1 فقط</span>
                    </div>
                `).join('');

                alertsHtml.push(`
                    <div class="smart-alert-card warning">
                        <div class="smart-alert-header">
                            <div class="smart-alert-title">
                                <i class="fa-solid fa-triangle-exclamation text-orange"></i>
                                <span>أصناف في المخزون الحرج (متبقي قطعة واحدة)</span>
                            </div>
                            <span class="smart-alert-badge badge-warning-soft">${criticalLowStockProducts.length} صنف</span>
                        </div>
                        <div class="smart-alert-chips">
                            ${chips}
                        </div>
                    </div>
                `);
            }

            if (alertContainer) {
                if (alertsHtml.length === 0) {
                    alertContainer.innerHTML = '<div class="smart-alert-card success" style="text-align: center; padding: 25px 15px;"><div class="smart-alert-header" style="justify-content: center; font-size: 14px;"><i class="fa-solid fa-circle-check text-emerald" style="font-size: 20px;"></i> <span>لا توجد أي تنبيهات أو متأخرات حالياً، المعرض بحالة ممتازة!</span></div></div>';
                } else {
                    alertContainer.innerHTML = alertsHtml.join('');
                }
            }

            if (alertBadge) {
                if (activeAlertCount > 0) {
                    alertBadge.className = 'badge-status danger';
                    alertBadge.textContent = `${activeAlertCount} تنبيه نشط`;
                } else {
                    alertBadge.className = 'badge-status success';
                    alertBadge.textContent = 'المعرض بحالة ممتازة';
                }
            }

            this.renderStockChart();
            this.updateCloudStatusBadge();
        },

        renderStockChart: function() {
            const stockGroups = {};
            let totalAvailableUnits = 0;

            allUnits.forEach(u => {
                if (u.status === 'متاح') {
                    totalAvailableUnits++;
                    const prod = allProducts.find(p => p.id === u.productId);
                    if (prod) {
                        const modelName = `${prod.brand || ''} (${prod.year || ''}) - ${prod.cc || ''}`.trim();
                        const key = `${modelName}_${u.color || 'عام'}`;
                        if (!stockGroups[key]) {
                            stockGroups[key] = {
                                model: modelName,
                                color: u.color || 'عام',
                                count: 0
                            };
                        }
                        stockGroups[key].count++;
                    }
                }
            });

            const groups = Object.values(stockGroups).sort((a, b) => b.count - a.count);
            
            // Calculate Out of stock products count
            let outOfStockCount = 0;
            allProducts.forEach(p => {
                const count = allUnits.filter(u => u.productId === p.id && u.status === 'متاح').length;
                if (count === 0) outOfStockCount++;
            });

            // Update KPI elements
            const kpiTotalEl = document.getElementById('stock-kpi-total-units');
            const kpiModelsEl = document.getElementById('stock-kpi-models-count');
            const kpiOutEl = document.getElementById('stock-kpi-out-count');
            const totalBadgeEl = document.getElementById('dashboard-stock-total-badge');

            if (kpiTotalEl) kpiTotalEl.textContent = totalAvailableUnits;
            if (kpiModelsEl) kpiModelsEl.textContent = groups.length;
            if (kpiOutEl) kpiOutEl.textContent = outOfStockCount;
            if (totalBadgeEl) totalBadgeEl.textContent = `${totalAvailableUnits} متاح بالمخزن`;

            const legendEl = document.getElementById('dashboard-stock-legend');
            if (!legendEl) return;
            legendEl.innerHTML = '';

            if (groups.length === 0) {
                legendEl.innerHTML = `
                    <div style="text-align: center; padding: 40px 15px; color: var(--text-secondary);">
                        <i class="fa-solid fa-box-open" style="font-size: 32px; color: rgba(255,255,255,0.2); margin-bottom: 10px;"></i>
                        <p style="margin: 0; font-size: 13px;">لا توجد أي وحدات بضاعة متاحة في المخزن حالياً.</p>
                    </div>
                `;
                return;
            }

            groups.forEach(g => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'stock-list-item';
                itemDiv.style.display = 'flex';
                itemDiv.style.justifyContent = 'space-between';
                itemDiv.style.alignItems = 'center';
                itemDiv.style.width = '100%';
                itemDiv.style.boxSizing = 'border-box';
                itemDiv.style.padding = '10px 14px';
                itemDiv.style.background = 'rgba(15, 23, 42, 0.45)';
                itemDiv.style.border = '1px solid rgba(255, 255, 255, 0.06)';
                itemDiv.style.borderRadius = '10px';
                itemDiv.style.transition = 'all 0.2s ease';
                
                itemDiv.onmouseover = () => {
                    itemDiv.style.background = 'rgba(15, 23, 42, 0.75)';
                    itemDiv.style.borderColor = 'rgba(0, 229, 255, 0.25)';
                    itemDiv.style.transform = 'translateX(-3px)';
                };
                itemDiv.onmouseout = () => {
                    itemDiv.style.background = 'rgba(15, 23, 42, 0.45)';
                    itemDiv.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                    itemDiv.style.transform = 'translateX(0)';
                };

                itemDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(0, 229, 255, 0.1); border: 1px solid rgba(0, 229, 255, 0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fa-solid fa-motorcycle" style="color: #00e5ff; font-size: 15px;"></i>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0;">
                            <span style="font-weight: 700; color: #ffffff; font-size: 13px; direction: ltr; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${g.model}</span>
                            <div style="display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--text-secondary);">
                                <span>اللون: <strong style="color: #00e5ff;">${g.color}</strong></span>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        <span style="padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 800; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">
                            متاح: ${g.count} قطعة
                        </span>
                    </div>
                `;
                legendEl.appendChild(itemDiv);
            });
        },

        updateCloudStatusBadge: function() {
            const syncMode = localStorage.getItem('motomax_sync_mode') || 'local';
            const badge = document.getElementById('dashboard-cloud-status');
            if (syncMode === 'cloud') {
                badge.innerHTML = `<span class="badge-status success"><i class="fa-solid fa-cloud-arrow-up text-cyan animate-pulse"></i> المزامنة السحابية نشطة [متصل]</span>`;
            } else {
                badge.innerHTML = `<span class="badge-status success"><i class="fa-solid fa-signal"></i> وضع محلي (أوفلاين)</span>`;
            }
        }
    },

    Customers: {
        currentPage: 1,
        pageSize: 30,
        prevPage: function() {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.search(true);
            }
        },
        nextPage: function() {
            this.currentPage++;
            this.search(true);
        },
        render: async function() {
            this.search();
        },

        search: async function(keepPage = false) {
            if (!keepPage) this.currentPage = 1;
            
            const term = document.getElementById('cust-search-term').value.trim().toLowerCase();
            const filterType = document.getElementById('cust-filter-type').value;
            
            const tableBody = document.getElementById('customers-table-body');
            tableBody.innerHTML = '';

            let filtered = [...allCustomers];

            if (term) {
                filtered = filtered.filter(c => 
                    c.code.toLowerCase().includes(term) ||
                    c.name.toLowerCase().includes(term) ||
                    App.Security.decrypt(c.phone).includes(term) ||
                    App.Security.decrypt(c.nid).includes(term)
                );
            }

            if (filterType === 'cash') {
                filtered = filtered.filter(c => c.type === 'cash');
            } else if (filterType === 'installment') {
                filtered = filtered.filter(c => c.type === 'installment');
            } else if (filterType === 'overdue') {
                const installments = await MotoDB.getAll('installments');
                const overdueCustIds = installments.filter(i => i.status === 'overdue').map(i => i.customerId);
                filtered = filtered.filter(c => overdueCustIds.includes(c.id));
            }

            const totalMatches = filtered.length;
            const totalPages = Math.ceil(totalMatches / this.pageSize) || 1;
            if (this.currentPage > totalPages) this.currentPage = totalPages;
            
            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            const pageItems = filtered.slice(start, end);

            if (pageItems.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">لا يوجد عملاء مطابقين لخيارات البحث.</td></tr>`;
                document.getElementById('cust-pagination-info').textContent = 'عرض 0 من 0 عميل';
                document.getElementById('cust-btn-prev').disabled = true;
                document.getElementById('cust-btn-next').disabled = true;
                return;
            }

            pageItems.forEach(c => {
                const tr = document.createElement('tr');
                const badgeClass = c.type === 'cash' ? 'cyan' : 'success';
                const badgeLabel = c.type === 'cash' ? 'كاش نقدي' : 'تقسيط أقساط';
                
                const decPhone = App.Security.decrypt(c.phone);
                const decNid = App.Security.decrypt(c.nid);
                
                tr.innerHTML = `
                    <td><strong>${c.code}</strong></td>
                    <td>${c.name}</td>
                    <td>${decPhone}</td>
                    <td>${decNid}</td>
                    <td>${c.address}</td>
                    <td><span class="badge-status ${badgeClass}">${badgeLabel}</span></td>
                    <td>
                        <span class="badge-status success"><i class="fa-solid fa-check"></i> نشط</span>
                    </td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-icon-only btn-edit-row" onclick="App.Customers.openEditModal(${c.id})" title="تعديل العميل" data-permission="edit">
                                <i class="fa-solid fa-edit text-orange"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Customers.openCard(${c.id})" title="عرض كرت التفاصيل">
                                <i class="fa-solid fa-address-card text-cyan"></i>
                            </button>
                            <button class="btn btn-danger btn-icon-only btn-delete-row" onclick="App.Customers.delete(${c.id})" title="حذف العميل" data-permission="write">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            document.getElementById('cust-pagination-info').textContent = `عرض ${start + 1}-${Math.min(end, totalMatches)} من ${totalMatches} عميل`;
            document.getElementById('cust-btn-prev').disabled = (this.currentPage === 1);
            document.getElementById('cust-btn-next').disabled = (this.currentPage === totalPages);

            App.applyPermissions();
        },

        openAddModal: async function() {
            document.getElementById('customer-form').reset();
            document.getElementById('cust-id').value = '';
            document.getElementById('customer-modal-title').textContent = 'إضافة عميل جديد للمعرض';
            const alertBox = document.getElementById('cust-modal-nid-alert');
            if (alertBox) { alertBox.innerHTML = ''; alertBox.classList.add('hidden'); }
            
            const nextCode = await MotoDB.generateNextCode('customers', 'C');
            document.getElementById('cust-code').value = nextCode;

            document.getElementById('customer-modal').classList.remove('hidden');
        },

        closeModal: function() {
            document.getElementById('customer-modal').classList.add('hidden');
            const alertBox = document.getElementById('cust-modal-nid-alert');
            if (alertBox) { alertBox.innerHTML = ''; alertBox.classList.add('hidden'); }
        },

        onNidInput: function() {
            const input = document.getElementById('cust-nid');
            if (!input) return;
            App.DuplicateChecker.onNidInput(input, 'cust-modal-nid-alert', 'العميل');
        },

        openEditModal: async function(id) {
            const customer = await MotoDB.getById('customers', id);
            if (!customer) return;

            document.getElementById('cust-id').value = customer.id;
            document.getElementById('cust-code').value = customer.code;
            document.getElementById('cust-name').value = customer.name;
            document.getElementById('cust-phone').value = App.Security.decrypt(customer.phone);
            document.getElementById('cust-nid').value = App.Security.decrypt(customer.nid);
            document.getElementById('cust-address').value = customer.address;
            document.getElementById('cust-type').value = customer.type;
            document.getElementById('cust-notes').value = customer.notes || '';

            document.getElementById('customer-modal-title').textContent = 'تعديل بيانات العميل';
            document.getElementById('customer-modal').classList.remove('hidden');

            this.onNidInput();
        },

        save: async function(e) {
            e.preventDefault();
            
            const id = document.getElementById('cust-id').value;
            if (App.isDemoMode && !id) {
                if (allCustomers.length >= 3) {
                    alert("عذراً، هذه نسخة تجريبية محدودة بـ 3 عملاء فقط. لتفعيل النسخة الكاملة يرجى التواصل مع Hossam Hamaki.");
                    return;
                }
            }
            const code = document.getElementById('cust-code').value;
            const name = document.getElementById('cust-name').value.trim();
            const phone = document.getElementById('cust-phone').value.trim();
            const nid = document.getElementById('cust-nid').value.trim();
            const address = document.getElementById('cust-address').value.trim();
            const type = document.getElementById('cust-type').value;
            const notes = document.getElementById('cust-notes').value.trim();

            if (nid.length !== 14 || isNaN(nid)) {
                alert("يجب إدخال الرقم القومي للبطاقة صحيحاً ومكوناً من 14 رقماً بالتمام.");
                return;
            }

            // Check if other active debts exist
            const dupReport = await App.DuplicateChecker.checkNid(nid);
            if (dupReport && dupReport.hasActiveDebts) {
                const msg = `تنبيه سجل المعاملات:\nتم العثور على (${dupReport.activeCount}) معاملة سارية وفعالة مسجلة بهذا الرقم القومي بمبالغ متبقية!\nهل ترغب في الاستمرار وحفظ بيانات العميل؟`;
                if (!await BakryDialogs.confirm(msg)) {
                    return;
                }
            }

            const encryptedPhone = App.Security.encrypt(phone);
            const encryptedNid = App.Security.encrypt(nid);

            const customerObj = { code, name, phone: encryptedPhone, nid: encryptedNid, address, type, notes };
            if (id) customerObj.id = Number(id);

            try {
                if (id) {
                    await MotoDB.update('customers', customerObj);
                    App.logActivity("تعديل عميل", `تعديل بيانات العميل: ${name} (كود: ${code})`);
                } else {
                    await MotoDB.add('customers', customerObj);
                    App.logActivity("إضافة عميل", `إضافة عميل جديد: ${name} (كود: ${code})`);
                }
                await App.saveAutoBackup();
                this.closeModal();
                App.switchTab('customers');
            } catch (err) {
                alert(err);
            }
        },

        delete: async function(id) {
            if (await BakryDialogs.confirm("هل أنت متأكد من رغبتك في حذف هذا العميل؟")) {
                try {
                    const sales = await MotoDB.getAll('sales');
                    const hasSales = sales.some(s => s.customerId === id);
                    if (hasSales) {
                        alert("لا يمكن حذف هذا العميل لوجود فواتير مبيعات مسجلة باسمه.");
                        return;
                    }
                    const customer = await MotoDB.getById('customers', id);
                    const name = customer ? customer.name : '';
                    const code = customer ? customer.code : '';
                    await MotoDB.delete('customers', id);
                    App.logActivity("حذف عميل", `حذف العميل: ${name} (كود: ${code})`);
                    await App.saveAutoBackup();
                    App.switchTab('customers');
                } catch (err) {
                    alert("فشل الحذف: " + err);
                }
            }
        },

        openCard: async function(id) {
            const customerId = Number(id);
            const customer = await MotoDB.getById('customers', customerId);
            if (!customer) return;

            const sales = await MotoDB.getAll('sales');
            const custSales = sales.filter(s => Number(s.customerId) === customerId);
            
            const installments = await MotoDB.getAll('installments');
            const custInstallments = installments.filter(i => Number(i.customerId) === customerId);

            let salesListHtml = '';
            if (custSales.length === 0) {
                salesListHtml = `<p class="text-muted text-xs">لا يوجد مبيعات مسجلة لهذا العميل حتى الآن.</p>`;
            } else {
                salesListHtml = `
                    <table class="data-table small-table mt-2">
                        <thead>
                            <tr>
                                <th>رقم الفاتورة</th>
                                <th>تاريخ الشراء</th>
                                <th>الفرع</th>
                                <th>نوع البيع</th>
                                <th>قيمة البيع</th>
                                <th>حالة سداد الأقساط</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                custSales.forEach(s => {
                    const insts = custInstallments.filter(inst => inst.saleId === s.id);
                    const paidInsts = insts.filter(inst => inst.status === 'paid').length;
                    const totalInsts = insts.length;
                    
                    const invoiceLink = s.type === 'cash' ? `<strong>${s.invoiceNo}</strong>` : `<a href="#" onclick="event.preventDefault(); App.closeDetailsViewer(); App.Installments.openPlanCard(${s.id})" class="text-cyan font-bold" style="text-decoration: underline; cursor: pointer;"><strong>${s.invoiceNo}</strong></a>`;
                    const installmentProgress = s.type === 'cash' ? 'مسدد كاش' : `<a href="#" onclick="event.preventDefault(); App.closeDetailsViewer(); App.Installments.openPlanCard(${s.id})" class="text-cyan font-bold" style="text-decoration: underline; cursor: pointer;">أقساط (${paidInsts}/${totalInsts})</a>`;
                    
                    salesListHtml += `
                        <tr>
                            <td>${invoiceLink}</td>
                            <td>${s.saleDate}</td>
                            <td><span class="text-xs">${s.branch || '-'}</span></td>
                            <td><span class="badge-status ${s.type === 'cash' ? 'cyan' : 'success'}">${s.type === 'cash' ? 'كاش' : 'تقسيط'}</span></td>
                            <td>${s.salePrice.toLocaleString('ar-EG')} ج.م</td>
                            <td>${installmentProgress}</td>
                        </tr>
                    `;
                });
                salesListHtml += `</tbody></table>`;
            }

            let installmentsListHtml = '';
            const installmentSales = custSales.filter(s => s.type === 'installment');
            if (installmentSales.length > 0) {
                installmentsListHtml = `
                    <div class="details-section-title mt-4"><i class="fa-solid fa-list-ol"></i> تفاصيل وجدول سداد الأقساط للعميل</div>
                `;
                
                installmentSales.forEach(s => {
                    const insts = custInstallments.filter(inst => inst.saleId === s.id).sort((a,b) => a.installmentNumber - b.installmentNumber);
                    
                    installmentsListHtml += `
                        <h4 class="mt-3 text-cyan" style="font-size: 13px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span><i class="fa-solid fa-file-invoice-dollar"></i> أقساط العقد (${s.invoiceNo}) - إجمالي الأقساط: ${insts.length}</span>
                            <button class="btn btn-secondary btn-xs" onclick="App.closeDetailsViewer(); App.Installments.openPlanCard(${s.id});" style="padding: 4px 8px; font-size: 10px; border-radius: 6px; cursor: pointer;">
                                <i class="fa-solid fa-calendar-days"></i> عرض جدول السداد التفصيلي
                            </button>
                        </h4>
                        <table class="data-table small-table mt-1">
                            <thead>
                                <tr>
                                    <th>رقم القسط</th>
                                    <th>قيمة القسط</th>
                                    <th>تاريخ الاستحقاق</th>
                                    <th>الحالة</th>
                                    <th>تاريخ السداد</th>
                                    <th>ملاحظات</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    
                    insts.forEach(i => {
                        const badgeColor = i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : 'warning';
                        const statusLbl = i.status === 'paid' ? 'مسدد' : i.status === 'overdue' ? 'متأخر ومستحق' : 'مستحق قادماً';
                        installmentsListHtml += `
                            <tr>
                                <td>القسط ${i.installmentNumber}</td>
                                <td class="font-bold">${i.amount.toLocaleString('ar-EG')} ج.م</td>
                                <td><span class="badge-status warning">${i.dueDate}</span></td>
                                <td><span class="badge-status ${badgeColor}">${statusLbl}</span></td>
                                <td>${i.paidDate ? `<span class="badge-status success">${i.paidDate}</span>` : '-'}</td>
                                <td>${i.notes || '-'}</td>
                            </tr>
                        `;
                    });
                    
                    installmentsListHtml += `
                            </tbody>
                        </table>
                    `;
                });
            }

            let guaranteeCardHtml = '';
            if (customer.type === 'installment' && custSales.length > 0) {
                const instSale = custSales.find(s => s.type === 'installment');
                if (instSale) {
                    const hasG2 = !!(instSale.g2_name || (instSale.g2_nid && App.Security.decrypt(instSale.g2_nid) && App.Security.decrypt(instSale.g2_nid) !== '-'));
                    guaranteeCardHtml = `
                        <div class="details-section-title mt-4"><i class="fa-solid fa-people-arrows"></i> بيانات الضامنين المرفقة بالعقود</div>
                        <div class="guarantor-row mt-2">
                            <div class="guarantor-box" style="${hasG2 ? '' : 'grid-column: 1 / -1;'}">
                                <h4>${hasG2 ? 'الضامن الأول' : 'الضامن (الكفيل الوحيد)'}</h4>
                                <p class="text-xs">الاسم: <strong>${instSale.g1_name || 'غير متوفر'}</strong></p>
                                <p class="text-xs">الموبايل: <strong>${App.Security.decrypt(instSale.g1_phone) || 'غير متوفر'}</strong></p>
                                <p class="text-xs">البطاقة: <strong>${App.Security.decrypt(instSale.g1_nid) || 'غير متوفر'}</strong></p>
                                <p class="text-xs">السكن: <strong>${instSale.g1_address || 'غير متوفر'}</strong></p>
                                <p class="text-xs">القرابة: <strong>${instSale.g1_rel || 'غير متوفر'}</strong></p>
                                <button class="btn btn-secondary btn-xs btn-edit-row mt-2" onclick="App.closeDetailsViewer(); App.Guarantors.openEditModal(${instSale.id}, 1);" style="padding: 4px 8px; font-size: 10px; width: 100%; border-radius: 6px;" data-permission="edit">
                                    <i class="fa-solid fa-pen-to-square"></i> تعديل بيانات الضامن الأول
                                </button>
                            </div>
                            ${hasG2 ? `
                            <div class="guarantor-box">
                                <h4>الضامن الثاني</h4>
                                <p class="text-xs">الاسم: <strong>${instSale.g2_name || 'غير متوفر'}</strong></p>
                                <p class="text-xs">الموبايل: <strong>${App.Security.decrypt(instSale.g2_phone) || 'غير متوفر'}</strong></p>
                                <p class="text-xs">البطاقة: <strong>${App.Security.decrypt(instSale.g2_nid) || 'غير متوفر'}</strong></p>
                                <p class="text-xs">السكن: <strong>${instSale.g2_address || 'غير متوفر'}</strong></p>
                                <p class="text-xs">القرابة: <strong>${instSale.g2_rel || 'غير متوفر'}</strong></p>
                                <button class="btn btn-secondary btn-xs btn-edit-row mt-2" onclick="App.closeDetailsViewer(); App.Guarantors.openEditModal(${instSale.id}, 2);" style="padding: 4px 8px; font-size: 10px; width: 100%; border-radius: 6px;" data-permission="edit">
                                    <i class="fa-solid fa-pen-to-square"></i> تعديل بيانات الضامن الثاني
                                </button>
                            </div>
                            ` : ''}
                        </div>
                    `;
                }
            }

            const contentHtml = `
                <div class="details-summary-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div>
                        <h2>كرت العميل الشخصي: ${customer.name}</h2>
                        <span class="badge-status ${customer.type === 'cash' ? 'cyan' : 'success'}">${customer.type === 'cash' ? 'عميل كاش' : 'عميل تقسيط'}</span>
                    </div>
                    <button class="btn btn-secondary btn-xs btn-edit-row" onclick="App.closeDetailsViewer(); App.Customers.openEditModal(${customer.id});" style="padding: 6px 12px; font-size: 11px; margin-left: 10px; border-radius: 6px;" data-permission="edit">
                        <i class="fa-solid fa-edit"></i> تعديل بيانات العميل
                    </button>
                </div>
                <div class="details-info-table">
                    <div class="info-cell"><span>كود العميل:</span><strong>${customer.code}</strong></div>
                    <div class="info-cell"><span>الاسم الكامل:</span><strong>${customer.name}</strong></div>
                    <div class="info-cell"><span>رقم الموبايل:</span><strong>${App.Security.decrypt(customer.phone)}</strong></div>
                    <div class="info-cell"><span>الرقم القومي (البطاقة):</span><strong>${App.Security.decrypt(customer.nid)}</strong></div>
                    <div class="info-cell col-span-2"><span>محل الإقامة والسكن:</span><strong>${customer.address}</strong></div>
                    <div class="info-cell col-span-2"><span>ملاحظات مسجلة:</span><strong>${customer.notes || 'لا يوجد ملاحظات.'}</strong></div>
                </div>
                
                <div class="details-section-title"><i class="fa-solid fa-receipt"></i> سجل المشتريات والدراجات المبيعة للعميل</div>
                ${salesListHtml}
                
                ${installmentsListHtml}
                
                ${guaranteeCardHtml}
            `;

            App.openDetailsViewer("كرت بيانات العميل والضامنين", contentHtml);
        }
    },

    /* ==========================================================================
       SUBMODULE: GUARANTORS
       ========================================================================== */
    Guarantors: {
        render: async function() {
            this.search();
        },

        search: async function() {
            const term = document.getElementById('guar-search-term').value.trim().toLowerCase();
            const tableBody = document.getElementById('guarantors-table-body');
            tableBody.innerHTML = '';

            const sales = await MotoDB.getAll('sales');
            const instSales = sales.filter(s => s.type === 'installment');
            const installments = await MotoDB.getAll('installments');

            const guarantorsList = [];

            for (let s of instSales) {
                const cust = allCustomers.find(c => c.id === s.customerId);
                const custName = cust ? cust.name : 'عميل غير معروف';

                const insts = installments.filter(i => i.saleId === s.id);
                const hasOverdue = insts.some(i => i.status === 'overdue');
                const paidCount = insts.filter(i => i.status === 'paid').length;
                const totalCount = insts.length;
                
                let payStatusHtml = '';
                if (hasOverdue) {
                    payStatusHtml = '<span class="badge-status danger"><i class="fa-solid fa-circle-exclamation"></i> متأخر ومطالب</span>';
                } else if (paidCount === totalCount && totalCount > 0) {
                    payStatusHtml = '<span class="badge-status success"><i class="fa-solid fa-circle-check"></i> منتهي مسدد</span>';
                } else {
                    payStatusHtml = '<span class="badge-status warning">مستمر بالدفع</span>';
                }

                // Add Guarantor 1
                if (s.g1_name && s.g1_name !== '-') {
                    guarantorsList.push({
                        name: s.g1_name,
                        phone: App.Security.decrypt(s.g1_phone),
                        nid: App.Security.decrypt(s.g1_nid),
                        address: s.g1_address,
                        rel: s.g1_rel || 'ضامن أول',
                        custName: custName,
                        custId: s.customerId,
                        invoiceNo: s.invoiceNo,
                        saleId: s.id,
                        guarNum: 1,
                        payStatusHtml: payStatusHtml
                    });
                }

                // Add Guarantor 2
                if (s.g2_name && s.g2_name !== '-') {
                    guarantorsList.push({
                        name: s.g2_name,
                        phone: App.Security.decrypt(s.g2_phone),
                        nid: App.Security.decrypt(s.g2_nid),
                        address: s.g2_address,
                        rel: s.g2_rel || 'ضامن ثان',
                        custName: custName,
                        custId: s.customerId,
                        invoiceNo: s.invoiceNo,
                        saleId: s.id,
                        guarNum: 2,
                        payStatusHtml: payStatusHtml
                    });
                }
            }

            let filtered = guarantorsList;
            if (term) {
                filtered = guarantorsList.filter(g => 
                    g.name.toLowerCase().includes(term) ||
                    g.phone.includes(term) ||
                    g.nid.includes(term) ||
                    g.custName.toLowerCase().includes(term) ||
                    g.invoiceNo.toLowerCase().includes(term)
                );
            }

            if (filtered.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">لا يوجد ضامنين مطابقين لخيارات البحث.</td></tr>`;
                return;
            }

            filtered.forEach(g => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${g.name}</strong></td>
                    <td>${g.phone}</td>
                    <td>${g.nid}</td>
                    <td>${g.address}</td>
                    <td><span class="badge-status cyan">${g.rel}</span></td>
                    <td>${g.custName}</td>
                    <td><strong>${g.invoiceNo}</strong></td>
                    <td>${g.payStatusHtml}</td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Customers.openCard(${g.custId})" title="عرض كرت المشتري والضمانات">
                                <i class="fa-solid fa-address-card text-cyan"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only btn-edit-row" onclick="App.Guarantors.openEditModal(${g.saleId}, ${g.guarNum})" title="تعديل بيانات الضامن" data-permission="write">
                                <i class="fa-solid fa-pen-to-square text-orange"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            App.applyPermissions();
        },

        openEditModal: async function(saleId, guarNum) {
            const sale = await MotoDB.getById('sales', saleId);
            if (!sale) return;

            document.getElementById('edit-guar-sale-id').value = saleId;
            document.getElementById('edit-guar-num').value = guarNum;

            if (guarNum === 1) {
                document.getElementById('edit-guar-name').value = sale.g1_name || '';
                document.getElementById('edit-guar-phone').value = App.Security.decrypt(sale.g1_phone) || '';
                document.getElementById('edit-guar-nid').value = App.Security.decrypt(sale.g1_nid) || '';
                document.getElementById('edit-guar-rel').value = sale.g1_rel || 'ضامن أول';
                document.getElementById('edit-guar-address').value = sale.g1_address || '';
            } else {
                document.getElementById('edit-guar-name').value = sale.g2_name || '';
                document.getElementById('edit-guar-phone').value = App.Security.decrypt(sale.g2_phone) || '';
                document.getElementById('edit-guar-nid').value = App.Security.decrypt(sale.g2_nid) || '';
                document.getElementById('edit-guar-rel').value = sale.g2_rel || 'ضامن ثان';
                document.getElementById('edit-guar-address').value = sale.g2_address || '';
            }

            const alertBox = document.getElementById('edit-guar-nid-alert');
            if (alertBox) { alertBox.innerHTML = ''; alertBox.classList.add('hidden'); }

            document.getElementById('edit-guarantor-modal').classList.remove('hidden');

            this.onNidInput();
        },

        closeEditModal: function() {
            document.getElementById('edit-guarantor-modal').classList.add('hidden');
            const alertBox = document.getElementById('edit-guar-nid-alert');
            if (alertBox) { alertBox.innerHTML = ''; alertBox.classList.add('hidden'); }
        },

        onNidInput: function() {
            const input = document.getElementById('edit-guar-nid');
            if (!input) return;
            App.DuplicateChecker.onNidInput(input, 'edit-guar-nid-alert', 'الضامن');
        },

        saveGuarantor: async function(e) {
            e.preventDefault();

            const saleId = Number(document.getElementById('edit-guar-sale-id').value);
            const guarNum = Number(document.getElementById('edit-guar-num').value);

            const name = document.getElementById('edit-guar-name').value.trim();
            const phone = document.getElementById('edit-guar-phone').value.trim();
            const nid = document.getElementById('edit-guar-nid').value.trim();
            const rel = document.getElementById('edit-guar-rel').value.trim();
            const address = document.getElementById('edit-guar-address').value.trim();

            if (nid.length !== 14 || isNaN(nid)) {
                alert("يجب إدخال الرقم القومي للضامن صحيحاً ومكوناً من 14 رقماً.");
                return;
            }

            // Check if other active debts exist
            const dupReport = await App.DuplicateChecker.checkNid(nid);
            if (dupReport && dupReport.hasActiveDebts) {
                const msg = `تنبيه سجل المعاملات:\nتم العثور على (${dupReport.activeCount}) معاملة سارية وفعالة مسجلة بهذا الرقم القومي بمبالغ متبقية!\nهل ترغب في الاستمرار وتعديل بيانات الضامن؟`;
                if (!await BakryDialogs.confirm(msg)) {
                    return;
                }
            }

            try {
                const sale = await MotoDB.getById('sales', saleId);
                if (!sale) return;

                const encPhone = App.Security.encrypt(phone);
                const encNid = App.Security.encrypt(nid);

                if (guarNum === 1) {
                    sale.g1_name = name;
                    sale.g1_phone = encPhone;
                    sale.g1_nid = encNid;
                    sale.g1_rel = rel;
                    sale.g1_address = address;
                } else {
                    sale.g2_name = name;
                    sale.g2_phone = encPhone;
                    sale.g2_nid = encNid;
                    sale.g2_rel = rel;
                    sale.g2_address = address;
                }

                await MotoDB.update('sales', sale);
                App.logActivity("تعديل ضامن", `تعديل بيانات الضامن رقم ${guarNum} (${name}) للعقد رقم ${sale.invoiceNo}`);
                await App.saveAutoBackup();
                
                this.closeEditModal();
                this.search();
            } catch (err) {
                alert("فشل التعديل: " + err);
            }
        }
    },


    /* ==========================================================================
       SUBMODULE: SUPPLIERS
       ========================================================================== */
    Suppliers: {
        render: async function() {
            this.search();
        },

        search: async function() {
            const term = document.getElementById('sup-search-term').value.trim().toLowerCase();
            const filterType = document.getElementById('sup-filter-type').value;

            const tableBody = document.getElementById('suppliers-table-body');
            tableBody.innerHTML = '';

            let filtered = [...allSuppliers];

            if (term) {
                filtered = filtered.filter(s => 
                    s.code.toLowerCase().includes(term) ||
                    s.name.toLowerCase().includes(term) ||
                    s.phone.includes(term) ||
                    s.nid.includes(term)
                );
            }

            if (filterType !== 'all') {
                filtered = filtered.filter(s => s.type === filterType);
            }

            if (filtered.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">لا يوجد موردين مطابقين للبحث.</td></tr>`;
                return;
            }

            filtered.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${s.code}</strong></td>
                    <td>${s.name}</td>
                    <td>${s.phone}</td>
                    <td>${s.nid}</td>
                    <td>${s.address}</td>
                    <td><span class="badge-status cyan">${s.type}</span></td>
                    <td>
                        <span class="badge-status success"><i class="fa-solid fa-check"></i> حساب نشط</span>
                    </td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-icon-only btn-edit-row" onclick="App.Suppliers.openEditModal(${s.id})" title="تعديل المورد" data-permission="edit">
                                <i class="fa-solid fa-edit text-orange"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Suppliers.openCard(${s.id})" title="عرض كرت المورد والمنتجات">
                                <i class="fa-solid fa-address-card text-cyan"></i>
                            </button>
                            <button class="btn btn-danger btn-icon-only btn-delete-row" onclick="App.Suppliers.delete(${s.id})" title="حذف المورد" data-permission="write">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            App.applyPermissions();
        },

        openAddModal: async function() {
            document.getElementById('supplier-form').reset();
            document.getElementById('sup-id').value = '';
            document.getElementById('supplier-modal-title').textContent = 'إضافة مورد بضائع جديد';
            
            const nextCode = await MotoDB.generateNextCode('suppliers', 'S');
            document.getElementById('sup-code').value = nextCode;

            document.getElementById('supplier-modal').classList.remove('hidden');
        },

        openEditModal: async function(id) {
            const supplier = await MotoDB.getById('suppliers', id);
            if (!supplier) return;
            document.getElementById('supplier-form').reset();
            document.getElementById('sup-id').value = supplier.id;
            document.getElementById('sup-code').value = supplier.code;
            document.getElementById('sup-name').value = supplier.name;
            document.getElementById('sup-phone').value = supplier.phone;
            document.getElementById('sup-nid').value = supplier.nid;
            document.getElementById('sup-address').value = supplier.address;
            document.getElementById('sup-type').value = supplier.type;
            document.getElementById('sup-notes').value = supplier.notes || '';
            document.getElementById('supplier-modal-title').textContent = 'تعديل بيانات مورد بضائع';
            document.getElementById('supplier-modal').classList.remove('hidden');
        },

        closeModal: function() {
            document.getElementById('supplier-modal').classList.add('hidden');
        },

        save: async function(e) {
            e.preventDefault();
            
            const id = document.getElementById('sup-id').value;
            if (App.isDemoMode && !id) {
                if (allSuppliers.length >= 3) {
                    alert("عذراً، هذه نسخة تجريبية محدودة بـ 3 موردين فقط. لتفعيل النسخة الكاملة يرجى التواصل مع Hossam Hamaki.");
                    return;
                }
            }
            const code = document.getElementById('sup-code').value;
            const name = document.getElementById('sup-name').value.trim();
            const phone = document.getElementById('sup-phone').value.trim();
            const nid = document.getElementById('sup-nid').value.trim();
            const address = document.getElementById('sup-address').value.trim();
            const type = document.getElementById('sup-type').value;
            const notes = document.getElementById('sup-notes').value.trim();

            const supplierObj = { code, name, phone, nid, address, type, notes };
            if (id) supplierObj.id = Number(id);

            try {
                if (id) {
                    await MotoDB.update('suppliers', supplierObj);
                    App.logActivity("تعديل مورد", `تعديل بيانات المورد: ${name} (كود: ${code})`);
                } else {
                    await MotoDB.add('suppliers', supplierObj);
                    App.logActivity("إضافة مورد", `إضافة مورد جديد: ${name} (كود: ${code})`);
                }
                await App.saveAutoBackup();
                this.closeModal();
                App.switchTab('suppliers');
            } catch (err) {
                alert(err);
            }
        },

        delete: async function(id) {
            if (await BakryDialogs.confirm("هل تريد حذف هذا المورد نهائياً؟")) {
                try {
                    const products = await MotoDB.getAll('products');
                    const hasProducts = products.some(p => p.supplierId === id);
                    if (hasProducts) {
                        alert("لا يمكن حذف المورد نظراً لارتباط منتجات وموديلات مسجلة به.");
                        return;
                    }
                    const supplier = await MotoDB.getById('suppliers', id);
                    const name = supplier ? supplier.name : '';
                    const code = supplier ? supplier.code : '';
                    await MotoDB.delete('suppliers', id);
                    App.logActivity("حذف مورد", `حذف المورد: ${name} (كود: ${code})`);
                    await App.saveAutoBackup();
                    App.switchTab('suppliers');
                } catch (err) {
                    alert(err);
                }
            }
        },

        openCard: async function(id) {
            const supplier = await MotoDB.getById('suppliers', id);
            if (!supplier) return;

            const products = await MotoDB.getAll('products');
            const supProducts = products.filter(p => p.supplierId === id);

            let productsListHtml = '';
            if (supProducts.length === 0) {
                productsListHtml = `<p class="text-muted text-xs">لا يوجد موديلات منتجات مسجلة لهذا المورد حالياً.</p>`;
            } else {
                productsListHtml = `
                    <table class="data-table small-table mt-2">
                        <thead>
                            <tr>
                                <th>كود الموديل</th>
                                <th>المواصفات والنوع</th>
                                <th>السعر الافتراضي</th>
                                <th>ملاحظات</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                supProducts.forEach(p => {
                    productsListHtml += `
                        <tr>
                            <td><strong>${p.code}</strong></td>
                            <td>${p.brand} (${p.year}) - ${p.cc}</td>
                            <td>${p.price.toLocaleString('ar-EG')} ج.م</td>
                            <td><span class="text-muted text-xs">${p.notes || '-'}</span></td>
                        </tr>
                    `;
                });
                productsListHtml += `</tbody></table>`;
            }

            const contentHtml = `
                <div class="details-summary-header">
                    <h2>كرت المورد وحالة التوريد: ${supplier.name}</h2>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button class="btn btn-secondary text-xs btn-edit-row" onclick="App.closeDetailsViewer(); App.Suppliers.openEditModal(${supplier.id});" data-permission="edit" style="padding: 4px 8px; font-size: 11px;">
                            <i class="fa-solid fa-edit text-orange"></i> تعديل المورد
                        </button>
                        <span class="badge-status cyan">${supplier.type}</span>
                    </div>
                </div>
                <div class="details-info-table">
                    <div class="info-cell"><span>كود المورد:</span><strong>${supplier.code}</strong></div>
                    <div class="info-cell"><span>اسم الجهة/المورد:</span><strong>${supplier.name}</strong></div>
                    <div class="info-cell"><span>موبايل التواصل:</span><strong>${supplier.phone}</strong></div>
                    <div class="info-cell"><span>رقم السجل / الهوية:</span><strong>${supplier.nid}</strong></div>
                    <div class="info-cell col-span-2"><span>عنوان المورد بالتفصيل:</span><strong>${supplier.address}</strong></div>
                    <div class="info-cell col-span-2"><span>ملاحظات العقود والتوريدات:</span><strong>${supplier.notes || 'لا يوجد ملاحظات.'}</strong></div>
                </div>
                
                <div class="details-section-title"><i class="fa-solid fa-cubes"></i> قائمة الموديلات والمنتجات المسجلة تبعاً له</div>
                ${productsListHtml}
            `;

            App.openDetailsViewer("كرت بيانات المورد التفصيلي", contentHtml);
        }
    },


    /* ==========================================================================
       SUBMODULE: PRODUCTS & UNITS & OPEN BATCH ADDER
       ========================================================================== */
    Products: {
        activeSubTab: 'models',

        render: async function() {
            this.switchSubTab(this.activeSubTab);
        },

        switchSubTab: function(subTabId) {
            this.activeSubTab = subTabId;
            
            document.querySelectorAll('.sub-tab').forEach(btn => {
                btn.classList.remove('active');
                if (btn.getAttribute('data-subtab') === subTabId) btn.classList.add('active');
            });

            document.querySelectorAll('.subtab-content').forEach(div => div.classList.remove('active'));
            document.getElementById(`product-${subTabId}-subpage`).classList.add('active');

            if (subTabId === 'models') {
                this.searchModels();
            } else {
                this.searchUnits();
            }
        },

        searchModels: async function() {
            const term = document.getElementById('prod-search-term').value.trim().toLowerCase();
            const tableBody = document.getElementById('models-table-body');
            tableBody.innerHTML = '';

            let filtered = [...allProducts];
            if (term) {
                filtered = filtered.filter(p => 
                    p.code.toLowerCase().includes(term) ||
                    p.brand.toLowerCase().includes(term) ||
                    p.cc.toLowerCase().includes(term)
                );
            }

            if (filtered.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">لا يوجد موديلات منتجات مطابقة للبحث.</td></tr>`;
                return;
            }

            for (let p of filtered) {
                const sup = allSuppliers.find(s => s.id === p.supplierId);
                const supName = sup ? sup.name : 'مورد غير معروف';
                
                const localBranch = localStorage.getItem('motomax_local_branch') || BRANCHES[0] || 'الفرع الرئيسي';
                const units = allUnits.filter(u => u.productId === p.id && u.branch === localBranch);
                const available = units.filter(u => u.status === 'متاح').length;
                const total = units.length;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${p.code}</strong></td>
                    <td>${p.brand}</td>
                    <td>${p.year}</td>
                    <td>${p.cc}</td>
                    <td class="font-bold text-orange">${p.price.toLocaleString('ar-EG')} ج.م</td>
                    <td><span class="text-xs text-muted">${supName}</span></td>
                    <td><strong>${available} متاح</strong> (من ${total})</td>
                    <td>
                        <span class="badge-status ${available > 0 ? 'success' : 'danger'}">
                            ${available > 0 ? 'متوفر بالمخزن' : 'غير متوفر (نافد)'}
                        </span>
                    </td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-icon-only btn-edit-row" onclick="App.Products.openEditProductModal(${p.id})" title="تعديل الموديل" data-permission="edit">
                                <i class="fa-solid fa-edit text-orange"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Products.openModelCard(${p.id})" title="عرض تفاصيل المخزون">
                                <i class="fa-solid fa-eye text-cyan"></i>
                            </button>
                            <button class="btn btn-danger btn-icon-only btn-delete-row" onclick="App.Products.deleteProduct(${p.id})" title="حذف الموديل" data-permission="write">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            }

            App.applyPermissions();
        },

        openAddProductModal: function() {
            document.getElementById('product-form').reset();
            document.getElementById('prod-id').value = '';
            document.getElementById('product-modal-title').textContent = 'إضافة موديل دراجة نارية جديد للمخزون';
            
            MotoDB.generateNextCode('products', 'P').then(code => {
                document.getElementById('prod-code').value = code;
            });

            const supSelect = document.getElementById('prod-supplier-id');
            supSelect.innerHTML = '<option value="">-- اختر المورد المرتبط --</option>';
            allSuppliers.forEach(s => {
                supSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.type})</option>`;
            });

            document.getElementById('product-modal').classList.remove('hidden');
        },

        openEditProductModal: async function(id) {
            const product = await MotoDB.getById('products', id);
            if (!product) return;
            document.getElementById('product-form').reset();
            document.getElementById('prod-id').value = product.id;
            document.getElementById('prod-code').value = product.code;
            document.getElementById('prod-brand').value = product.brand;
            document.getElementById('prod-year').value = product.year;
            document.getElementById('prod-cc').value = product.cc;
            document.getElementById('prod-price').value = product.price;

            const supSelect = document.getElementById('prod-supplier-id');
            supSelect.innerHTML = '<option value="">-- اختر المورد المرتبط --</option>';
            allSuppliers.forEach(s => {
                supSelect.innerHTML += `<option value="${s.id}" ${s.id === product.supplierId ? 'selected' : ''}>${s.name} (${s.type})</option>`;
            });

            document.getElementById('product-modal-title').textContent = 'تعديل بيانات موديل منتج';
            document.getElementById('product-modal').classList.remove('hidden');
        },

        closeProductModal: function() {
            document.getElementById('product-modal').classList.add('hidden');
        },

        saveProduct: async function(e) {
            e.preventDefault();
            
            const id = document.getElementById('prod-id').value;
            const code = document.getElementById('prod-code').value;
            const brand = document.getElementById('prod-brand').value.trim();
            const year = Number(document.getElementById('prod-year').value);
            const cc = document.getElementById('prod-cc').value.trim();
            const price = Number(document.getElementById('prod-price').value);
            const supplierId = Number(document.getElementById('prod-supplier-id').value);
            const notes = document.getElementById('prod-notes').value.trim();

            const prodObj = { code, brand, year, cc, price, supplierId, notes };
            if (id) prodObj.id = Number(id);

            try {
                if (id) {
                    await MotoDB.update('products', prodObj);
                    App.logActivity("تعديل موديل", `تعديل موديل منتج: ${brand} (كود: ${code})`);
                } else {
                    await MotoDB.add('products', prodObj);
                    App.logActivity("إضافة موديل", `إضافة موديل منتج جديد: ${brand} (كود: ${code})`);
                }
                await App.saveAutoBackup();
                this.closeProductModal();
                App.switchTab('products');
            } catch (err) {
                alert(err);
            }
        },

        deleteProduct: async function(id) {
            if (await BakryDialogs.confirm("هل تريد حذف هذا الموديل نهائياً؟")) {
                try {
                    const units = allUnits.filter(u => u.productId === id);
                    if (units.length > 0) {
                        alert("لا يمكن حذف هذا الموديل لوجود قطع وشاسيهات مسجلة عليه.");
                        return;
                    }
                    const prod = await MotoDB.getById('products', id);
                    const brand = prod ? prod.brand : '';
                    const code = prod ? prod.code : '';
                    await MotoDB.delete('products', id);
                    App.logActivity("حذف موديل", `حذف موديل منتج: ${brand} (كود: ${code})`);
                    await App.saveAutoBackup();
                    App.switchTab('products');
                } catch (err) {
                    alert(err);
                }
            }
        },

        openModelCard: async function(id) {
            const product = await MotoDB.getById('products', id);
            if (!product) return;

            const sup = allSuppliers.find(s => s.id === product.supplierId);
            const supName = sup ? sup.name : 'مورد غير معروف';

            const units = allUnits.filter(u => u.productId === id);
            
            let unitsListHtml = '';
            if (units.length === 0) {
                unitsListHtml = `<p class="text-muted text-xs">لا يوجد قطع عينية مضافة لهذا الموديل بالمخازن حتى الآن.</p>`;
            } else {
                unitsListHtml = `
                    <table class="data-table small-table mt-2">
                        <thead>
                            <tr>
                                <th>رقم الشاسيه</th>
                                <th>رقم المحرك</th>
                                <th>الفرع</th>
                                <th>اللون</th>
                                <th>المورد</th>
                                <th>تكلفة التوريد</th>
                                <th>حالة القطعة</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                units.forEach(u => {
                    const unitSupId = u.supplierId || (product ? product.supplierId : null);
                    const sup = unitSupId ? allSuppliers.find(s => s.id === unitSupId) : null;
                    const supLabel = sup ? sup.name : '-';
                    
                    unitsListHtml += `
                        <tr>
                            <td><strong>${u.chassis}</strong></td>
                            <td>${u.motor}</td>
                            <td><span class="text-xs text-muted">${u.branch || '-'}</span></td>
                            <td>${u.color}</td>
                            <td><span class="text-xs text-muted">${supLabel}</span></td>
                            <td>${u.cost.toLocaleString('ar-EG')} ج.م</td>
                            <td><span class="badge-status ${u.status === 'متاح' ? 'success' : 'danger'}">${u.status}</span></td>
                            <td class="actions-col">
                                <div class="action-buttons">
                                    <button class="btn btn-secondary btn-icon-only btn-edit-row" onclick="App.closeDetailsViewer(); App.Products.openEditUnitModal(${u.id});" title="تعديل بيانات القطعة" style="padding: 2px 4px; font-size: 10px;" data-permission="edit">
                                        <i class="fa-solid fa-edit text-orange"></i>
                                    </button>
                                    <button class="btn btn-danger btn-icon-only btn-delete-row" onclick="App.closeDetailsViewer(); App.Products.deleteUnit(${u.id});" title="حذف القطعة" style="padding: 2px 4px; font-size: 10px;" data-permission="delete">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
                unitsListHtml += `</tbody></table>`;
            }

            const contentHtml = `
                <div class="details-summary-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div>
                        <h2>كرت المنتج ومخزون الموديل: ${product.brand}</h2>
                        <span class="badge-status success">${product.cc}</span>
                    </div>
                    <button class="btn btn-secondary btn-xs btn-edit-row" onclick="App.closeDetailsViewer(); App.Products.openEditProductModal(${product.id});" style="padding: 6px 12px; font-size: 11px; margin-left: 10px; border-radius: 6px;" data-permission="edit">
                        <i class="fa-solid fa-edit"></i> تعديل بيانات الموديل ككل
                    </button>
                </div>
                <div class="details-info-table">
                    <div class="info-cell"><span>كود الموديل:</span><strong>${product.code}</strong></div>
                    <div class="info-cell"><span>النوع / الماركة:</span><strong>${product.brand}</strong></div>
                    <div class="info-cell"><span>سنة الصنع:</span><strong>${product.year}</strong></div>
                    <div class="info-cell"><span>سعة الماتور:</span><strong>${product.cc}</strong></div>
                    <div class="info-cell"><span>السعر الافتراضي للبيع:</span><strong>${product.price.toLocaleString('ar-EG')} ج.م</strong></div>
                    <div class="info-cell"><span>المورد المرتبط:</span><strong>${supName}</strong></div>
                    <div class="info-cell col-span-2"><span>ملاحظات ومواصفات الموديل:</span><strong>${product.notes || 'لا يوجد ملاحظات.'}</strong></div>
                </div>
                
                <div class="details-section-title"><i class="fa-solid fa-barcode"></i> الأرقام الفرعية والقطع العينية الموجودة بالمخزن</div>
                ${unitsListHtml}
            `;

            App.openDetailsViewer("كرت موديل المنتج وتفاصيل المخزون", contentHtml);
        },

        unitsCurrentPage: 1,
        unitsPageSize: 30,
        prevUnitsPage: function() {
            if (this.unitsCurrentPage > 1) {
                this.unitsCurrentPage--;
                this.searchUnits(true);
            }
        },
        nextUnitsPage: function() {
            this.unitsCurrentPage++;
            this.searchUnits(true);
        },

        // Single Units Methods
        searchUnits: async function(keepPage = false) {
            if (!keepPage) this.unitsCurrentPage = 1;
            
            const term = document.getElementById('unit-search-term').value.trim().toLowerCase();
            const filterStatus = document.getElementById('unit-filter-status').value;
            
            const tableBody = document.getElementById('units-table-body');
            tableBody.innerHTML = '';

            let filtered = [...allUnits];

            if (term) {
                filtered = filtered.filter(u => {
                    const prod = allProducts.find(p => p.id === u.productId);
                    const prodBrand = prod ? prod.brand.toLowerCase() : '';
                    return u.chassis.toLowerCase().includes(term) ||
                           u.motor.toLowerCase().includes(term) ||
                           u.color.toLowerCase().includes(term) ||
                           (u.branch && u.branch.toLowerCase().includes(term)) ||
                           prodBrand.includes(term);
                });
            }

            // Calculate stats based on search term
            const matchesSearchTerm = term ? allUnits.filter(u => {
                const prod = allProducts.find(p => p.id === u.productId);
                const prodBrand = prod ? prod.brand.toLowerCase() : '';
                return u.chassis.toLowerCase().includes(term) ||
                       u.motor.toLowerCase().includes(term) ||
                       u.color.toLowerCase().includes(term) ||
                       (u.branch && u.branch.toLowerCase().includes(term)) ||
                       prodBrand.includes(term);
            }) : [...allUnits];

            const totalCount = matchesSearchTerm.length;
            const availableCount = matchesSearchTerm.filter(u => u.status === 'متاح').length;
            const soldCount = matchesSearchTerm.filter(u => u.status === 'مباع').length;
            const statsText = ` | إجمالي القطع: ${totalCount} (المتاحة للبيع: ${availableCount} - المباعة: ${soldCount})`;

            if (filterStatus !== 'all') {
                filtered = filtered.filter(u => u.status === filterStatus);
            }

            const totalMatches = filtered.length;
            const totalPages = Math.ceil(totalMatches / this.unitsPageSize) || 1;
            if (this.unitsCurrentPage > totalPages) this.unitsCurrentPage = totalPages;
            
            const start = (this.unitsCurrentPage - 1) * this.unitsPageSize;
            const end = start + this.unitsPageSize;
            const pageItems = filtered.slice(start, end);

            if (pageItems.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">لا يوجد قطع عينية مطابقة لخيارات التصفية.</td></tr>`;
                document.getElementById('units-pagination-info').textContent = 'عرض 0 من 0 قطعة' + statsText;
                document.getElementById('units-btn-prev').disabled = true;
                document.getElementById('units-btn-next').disabled = true;
                return;
            }

            pageItems.forEach(u => {
                const prod = allProducts.find(p => p.id === u.productId);
                const specLabel = prod ? `${prod.brand} (${prod.year}) - ${prod.cc}` : 'موديل غير معروف';
                const codeLabel = prod ? prod.code : 'P-xxxx';
                const dateLabel = u.soldDate ? u.soldDate : 'غير مباع';
                
                // Get unit supplier
                const unitSupId = u.supplierId || (prod ? prod.supplierId : null);
                const sup = unitSupId ? allSuppliers.find(s => s.id === unitSupId) : null;
                const supLabel = sup ? sup.name : '-';
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${codeLabel}</strong></td>
                    <td>${specLabel}</td>
                    <td><span class="text-cyan font-bold">${u.chassis}</span></td>
                    <td>${u.motor}</td>
                    <td>${u.color}</td>
                    <td><span class="text-xs">${u.branch || '-'}</span></td>
                    <td><span class="text-xs text-muted">${supLabel}</span></td>
                    <td><span class="badge-status ${u.status === 'متاح' ? 'success' : 'danger'}">${u.status}</span></td>
                    <td class="actions-col" data-permission="write">
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-icon-only btn-edit-row" onclick="App.Products.openEditUnitModal(${u.id})" title="تعديل بيانات القطعة" data-permission="edit">
                                <i class="fa-solid fa-edit text-orange"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Products.openTransferUnitModal(${u.id})" title="تحويل فرع القطعة">
                                <i class="fa-solid fa-right-left text-cyan"></i>
                            </button>
                            <button class="btn btn-danger btn-icon-only btn-delete-row" onclick="App.Products.deleteUnit(${u.id})" title="حذف قطعة الشاسيه" data-permission="write">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            document.getElementById('units-pagination-info').textContent = `عرض ${start + 1}-${Math.min(end, totalMatches)} من ${totalMatches} قطعة` + statsText;
            document.getElementById('units-btn-prev').disabled = (this.unitsCurrentPage === 1);
            document.getElementById('units-btn-next').disabled = (this.unitsCurrentPage === totalPages);

            App.applyPermissions();
        },

        openAddUnitModal: function() {
            document.getElementById('unit-form').reset();
            
            const prodSelect = document.getElementById('unit-prod-id');
            prodSelect.innerHTML = '<option value="">-- اختر الموديل والنوع المرتبط بالشاسيه --</option>';
            allProducts.forEach(p => {
                prodSelect.innerHTML += `<option value="${p.id}">${p.brand} (${p.year}) - ${p.cc}</option>`;
            });

            // Populate suppliers select dropdown
            const supSelect = document.getElementById('unit-supplier-id');
            if (supSelect) {
                supSelect.innerHTML = '<option value="">-- اختر المورد المرتبط --</option>';
                allSuppliers.forEach(s => {
                    supSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.type})</option>`;
                });
            }

            document.getElementById('unit-modal').classList.remove('hidden');
        },

        closeUnitModal: function() {
            document.getElementById('unit-modal').classList.add('hidden');
        },

        saveUnit: async function(e) {
            e.preventDefault();

            const id = document.getElementById('unit-id').value;
            const productId = Number(document.getElementById('unit-prod-id').value);
            const branch = document.getElementById('unit-branch').value;
            const chassis = document.getElementById('unit-chassis').value.trim();
            const motor = document.getElementById('unit-motor').value.trim();
            const color = document.getElementById('unit-color').value.trim();
            const cost = Number(document.getElementById('unit-cost').value);
            const supplierSelect = document.getElementById('unit-supplier-id');
            const supplierId = supplierSelect ? (Number(supplierSelect.value) || null) : null;

            const localBranch = localStorage.getItem('motomax_local_branch') || BRANCHES[0] || 'الفرع الرئيسي';
            const unitObj = {
                productId,
                branch,
                chassis,
                motor,
                color,
                cost,
                supplierId,
                status: 'متاح'
            };
            if (id) unitObj.id = Number(id);

            try {
                if (id) {
                    const existingUnit = await MotoDB.getById('units', id);
                    if (existingUnit) {
                        unitObj.status = existingUnit.status;
                        if (existingUnit.status !== 'مباع' && branch !== existingUnit.branch) {
                            unitObj.status = 'متاح';
                        }
                        if (existingUnit.soldPrice) unitObj.soldPrice = existingUnit.soldPrice;
                        if (existingUnit.soldDate) unitObj.soldDate = existingUnit.soldDate;
                    }
                    await MotoDB.update('units', unitObj);
                    App.logActivity("تعديل شاسيه", `تعديل بيانات الشاسيه (${chassis}) للموديل (${productId})`);
                } else {
                    const unitId = await MotoDB.add('units', unitObj);
                    
                    const prod = allProducts.find(p => p.id === productId);
                    let supName = '';
                    if (supplierId) {
                        const sup = allSuppliers.find(s => s.id === supplierId);
                        if (sup) supName = sup.name;
                    }
                    const desc = `شراء قطعة دراجة موديل (${prod ? prod.brand : 'موتوسيكل'}) برقم شاسيه: ${chassis}${supName ? ' من المورد (' + supName + ')' : ''} لـ (${branch})`;
                    
                    const txCode = await MotoDB.generateNextTxCode();
                    const now = new Date();
                    const nowStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
                    
                    const txObj = {
                        code: txCode,
                        date: nowStr,
                        type: 'صرف',
                        category: 'شراء بضاعة',
                        amount: cost,
                        description: desc,
                        refId: unitId,
                        user: currentRole === 'admin' ? 'Admin' : 'موظف حسابات'
                    };
                    await MotoDB.add('transactions', txObj);
                    App.logActivity("إضافة شاسيه", `شراء شاسيه (${chassis}) للموديل (${prod ? prod.brand : 'موتوسيكل'}) لـ (${branch})`);
                }
                await App.saveAutoBackup();

                this.closeUnitModal();
                App.switchTab('products');
                this.switchSubTab('units');
            } catch (err) {
                alert(err);
            }
        },

        deleteUnit: async function(id) {
            if (await BakryDialogs.confirm("هل أنت متأكد من حذف هذه القطعة؟")) {
                const unit = allUnits.find(u => u.id == id);
                if (unit && unit.status === 'مباع') {
                    // Check if there is an actual sale referencing this unit
                    try {
                        const sales = await MotoDB.getAll('sales');
                        const hasSale = sales.some(s => s.unitId == id);
                        if (hasSale) {
                            alert("لا يمكن حذف القطعة لأنها مباعة ومربوطة بفواتير مبيعات سابقة.");
                            return;
                        }
                    } catch (salesErr) {
                        console.error("Error checking sales for unit deletion:", salesErr);
                    }
                }
                try {
                    await MotoDB.delete('units', id);
                    App.logActivity("حذف شاسيه", `حذف الشاسيه (${unit ? unit.chassis : id}) من المخزن`);
                    await App.saveAutoBackup();
                    App.switchTab('products');
                    this.switchSubTab('units');
                } catch (err) {
                    alert(err);
                }
            }
        },

        // OPEN BATCH UNIT INGESTION (Uncapped quantity!)
        openBatchAddModal: function() {
            document.getElementById('batch-unit-form').reset();
            
            const prodSelect = document.getElementById('batch-prod-id');
            prodSelect.innerHTML = '<option value="">-- اختر موديل المنتج المشترك للشحنة --</option>';
            allProducts.forEach(p => {
                prodSelect.innerHTML += `<option value="${p.id}">${p.brand} (${p.year}) - ${p.cc}</option>`;
            });

            // Set default rows
            document.getElementById('batch-count').value = 5;
            this.generateBatchRows();

            document.getElementById('batch-unit-modal').classList.remove('hidden');
        },

        closeBatchAddModal: function() {
            document.getElementById('batch-unit-modal').classList.add('hidden');
        },

        generateBatchRows: function() {
            const count = Number(document.getElementById('batch-count').value) || 1;
            const defaultColor = document.getElementById('batch-default-color').value.trim() || 'أسود مطفي';
            const container = document.getElementById('batch-units-rows-container');
            container.innerHTML = '';

            // Generate N rows dynamically
            for (let i = 1; i <= count; i++) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="text-center font-bold">${i}</td>
                    <td><input type="text" class="batch-row-chassis" required placeholder="رقم الشاسيه ${i}..." style="padding: 6px 12px; font-size:12px;"></td>
                    <td><input type="text" class="batch-row-motor" required placeholder="رقم الماتور ${i}..." style="padding: 6px 12px; font-size:12px;"></td>
                    <td><input type="text" class="batch-row-color" value="${defaultColor}" required placeholder="اللون..." style="padding: 6px 12px; font-size:12px;"></td>
                `;
                container.appendChild(tr);
            }
        },

        saveBatchUnits: async function(e) {
            e.preventDefault();

            const productId = Number(document.getElementById('batch-prod-id').value);
            const branch = document.getElementById('batch-branch').value;
            const cost = Number(document.getElementById('batch-cost').value);
            const count = Number(document.getElementById('batch-count').value) || 0;

            if (!productId) {
                alert("يرجى اختيار موديل المنتج المشترك.");
                return;
            }

            const chassisInputs = document.querySelectorAll('.batch-row-chassis');
            const motorInputs = document.querySelectorAll('.batch-row-motor');
            const colorInputs = document.querySelectorAll('.batch-row-color');

            const unitsToAdd = [];
            const localChassisSet = new Set();
            const localMotorSet = new Set();

            // Validate and collect rows
            for (let i = 0; i < count; i++) {
                const chassis = chassisInputs[i].value.trim();
                const motor = motorInputs[i].value.trim();
                const color = colorInputs[i].value.trim();

                if (!chassis || !motor) {
                    alert(`خطأ: يرجى التأكد من ملء حقول الشاسيه والمحرك للسطر رقم ${i+1}.`);
                    return;
                }

                // Check local row duplicate in the form
                if (localChassisSet.has(chassis) || localMotorSet.has(motor)) {
                    alert(`خطأ: هناك تكرار لرقم شاسيه أو موتور في أسطر الجدول المدخلة (السطر رقم ${i+1}). يرجى التحقق.`);
                    return;
                }

                localChassisSet.add(chassis);
                localMotorSet.add(motor);

                unitsToAdd.push({
                    productId,
                    branch,
                    chassis,
                    motor,
                    color,
                    cost,
                    status: 'متاح'
                });
            }

            try {
                // Add all to DB
                for (let unit of unitsToAdd) {
                    await MotoDB.add('units', unit);
                }

                // record single collective cashbox expenditure
                const prod = allProducts.find(p => p.id === productId);
                const totalCost = cost * count;
                const desc = `شراء شحنة بضائع بالكمية عدد (${count}) دراجة موديل (${prod ? prod.brand : 'موتوسيكل'}) لـ (${branch})`;
                
                const txCode = await MotoDB.generateNextTxCode();
                const now = new Date();
                const nowStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

                const txObj = {
                    code: txCode,
                    date: nowStr,
                    type: 'صرف',
                    category: 'شراء بضاعة',
                    amount: totalCost,
                    description: desc,
                    user: currentRole === 'admin' ? 'Admin' : 'موظف حسابات'
                };
                await MotoDB.add('transactions', txObj);

                App.logActivity("إضافة دفعة شاسيهات", `شراء شحنة جماعية بعدد (${count}) قطعة للموديل (${prod ? prod.brand : 'موتوسيكل'}) لـ (${branch})`);
                await App.saveAutoBackup();

                alert(`ممتاز! تم تسجيل وحفظ كامل شحنة البضائع بعدد (${count}) قطعة دفعة واحدة بنجاح وتنزيل تكلفتها الكلية بالخزينة.`);
                this.closeBatchAddModal();
                App.switchTab('products');
                this.switchSubTab('units');

            } catch (err) {
                alert(err);
            }
        },

        // Unified Add Modal methods
        openUnifiedAddModal: function() {
            document.getElementById('unified-inventory-form').reset();
            
            // Populate products
            const prodSelect = document.getElementById('unified-prod-id');
            prodSelect.innerHTML = '<option value="">-- اختر موديل المنتج القائم --</option>';
            allProducts.forEach(p => {
                prodSelect.innerHTML += `<option value="${p.id}">${p.brand} (${p.year}) - ${p.cc}</option>`;
            });

            // Populate branches
            const branchSelect = document.getElementById('unified-branch');
            branchSelect.innerHTML = '';
            BRANCHES.forEach(b => {
                branchSelect.innerHTML += `<option value="${b}">${b}</option>`;
            });

            // Populate suppliers for new model
            const supSelect = document.getElementById('unified-new-supplier-id');
            supSelect.innerHTML = '<option value="">-- اختر المورد المرتبط --</option>';
            allSuppliers.forEach(s => {
                supSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.type})</option>`;
            });

            // Populate suppliers for existing model
            const existingSupSelect = document.getElementById('unified-existing-supplier-id');
            if (existingSupSelect) {
                existingSupSelect.innerHTML = '<option value="">-- اختر المورد المرتبط --</option>';
                allSuppliers.forEach(s => {
                    existingSupSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.type})</option>`;
                });
            }

            // Set defaults
            document.getElementById('unified-model-type').value = 'existing';
            this.onUnifiedModelTypeChange('existing');
            document.getElementById('unified-count').value = 5;
            this.generateUnifiedRows();

            document.getElementById('unified-inventory-modal').classList.remove('hidden');
        },

        closeUnifiedAddModal: function() {
            document.getElementById('unified-inventory-modal').classList.add('hidden');
        },

        onUnifiedModelTypeChange: function(type) {
            const existingGroup = document.getElementById('unified-existing-model-group');
            const newGroup = document.getElementById('unified-new-model-fields');
            
            if (type === 'new') {
                existingGroup.classList.add('hidden');
                newGroup.classList.remove('hidden');
                document.getElementById('unified-prod-id').removeAttribute('required');
                
                document.getElementById('unified-new-brand').setAttribute('required', 'required');
                document.getElementById('unified-new-price').setAttribute('required', 'required');
                document.getElementById('unified-new-supplier-id').setAttribute('required', 'required');
                
                MotoDB.generateNextCode('products', 'P').then(code => {
                    document.getElementById('unified-new-code').value = code;
                });
            } else {
                existingGroup.classList.remove('hidden');
                newGroup.classList.add('hidden');
                document.getElementById('unified-prod-id').setAttribute('required', 'required');
                
                document.getElementById('unified-new-brand').removeAttribute('required');
                document.getElementById('unified-new-price').removeAttribute('required');
                document.getElementById('unified-new-supplier-id').removeAttribute('required');
            }
        },

        onUnifiedExistingProductChange: function(productId) {
            const supplierSelect = document.getElementById('unified-existing-supplier-id');
            if (!supplierSelect) return;
            if (!productId) {
                supplierSelect.value = '';
                return;
            }
            const prod = allProducts.find(p => p.id === Number(productId));
            if (prod && prod.supplierId) {
                supplierSelect.value = prod.supplierId;
            } else {
                supplierSelect.value = '';
            }
        },

        generateUnifiedRows: function() {
            const count = Number(document.getElementById('unified-count').value) || 1;
            const defaultColor = document.getElementById('unified-default-color').value.trim() || 'أسود مطفي';
            const container = document.getElementById('unified-units-rows-container');
            container.innerHTML = '';

            for (let i = 1; i <= count; i++) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="text-center font-bold">${i}</td>
                    <td><input type="text" class="unified-row-chassis" required placeholder="رقم الشاسيه ${i}..." style="padding: 6px 12px; font-size:12px; width: 100%;"></td>
                    <td><input type="text" class="unified-row-motor" required placeholder="رقم الماتور ${i}..." style="padding: 6px 12px; font-size:12px; width: 100%;"></td>
                    <td><input type="text" class="unified-row-color" value="${defaultColor}" required placeholder="اللون..." style="padding: 6px 12px; font-size:12px; width: 100%;"></td>
                `;
                container.appendChild(tr);
            }
        },

        saveUnifiedAdd: async function(e) {
            e.preventDefault();

            const modelType = document.getElementById('unified-model-type').value;
            const count = Number(document.getElementById('unified-count').value) || 0;
            if (App.isDemoMode) {
                if (modelType === 'new' && allProducts.length >= 3) {
                    alert("عذراً، هذه نسخة تجريبية محدودة بـ 3 موديلات منتجات فقط. لتفعيل النسخة الكاملة يرجى التواصل مع Hossam Hamaki.");
                    return;
                }
                if (allUnits.length + count > 3) {
                    alert("عذراً، هذه نسخة تجريبية محدودة بـ 3 قطع دراجات نارية فقط. لتفعيل النسخة الكاملة يرجى التواصل مع Hossam Hamaki.");
                    return;
                }
            }
            const branch = document.getElementById('unified-branch').value;
            const cost = Number(document.getElementById('unified-cost').value);

            let productId = null;
            let supplierId = null;

            if (modelType === 'new') {
                const brand = document.getElementById('unified-new-brand').value.trim();
                const year = Number(document.getElementById('unified-new-year').value);
                const cc = document.getElementById('unified-new-cc').value.trim();
                const price = Number(document.getElementById('unified-new-price').value);
                supplierId = Number(document.getElementById('unified-new-supplier-id').value);
                const notes = document.getElementById('unified-new-notes').value.trim();
                const code = document.getElementById('unified-new-code').value;

                if (!brand || !supplierId) {
                    alert("يرجى تعبئة حقول الموديل الجديد الإلزامية.");
                    return;
                }

                try {
                    const prodObj = { code, brand, year, cc, price, supplierId, notes };
                    productId = await MotoDB.add('products', prodObj);
                    App.logActivity("إضافة موديل", `إضافة موديل منتج جديد: ${brand} (كود: ${code})`);
                } catch (err) {
                    alert("خطأ في حفظ الموديل الجديد: " + err);
                    return;
                }
            } else {
                productId = Number(document.getElementById('unified-prod-id').value);
                if (!productId) {
                    alert("يرجى اختيار موديل الدراجة القائم.");
                    return;
                }
                const existingSupSelect = document.getElementById('unified-existing-supplier-id');
                if (existingSupSelect) {
                    supplierId = Number(existingSupSelect.value);
                    if (supplierId) {
                        try {
                            const prod = allProducts.find(p => p.id === productId) || await MotoDB.getById('products', productId);
                            if (prod && prod.supplierId !== supplierId) {
                                prod.supplierId = supplierId;
                                await MotoDB.update('products', prod);
                            }
                        } catch (err) {
                            console.error("Failed to update product supplier:", err);
                        }
                    }
                }
            }

            const chassisInputs = document.querySelectorAll('.unified-row-chassis');
            const motorInputs = document.querySelectorAll('.unified-row-motor');
            const colorInputs = document.querySelectorAll('.unified-row-color');

            const unitsToAdd = [];
            const localChassisSet = new Set();
            const localMotorSet = new Set();

            for (let i = 0; i < count; i++) {
                const chassis = chassisInputs[i].value.trim();
                const motor = motorInputs[i].value.trim();
                const color = colorInputs[i].value.trim();

                if (!chassis || !motor) {
                    alert(`خطأ: يرجى إدخال الشاسيه والمحرك للسطر رقم ${i+1}.`);
                    return;
                }

                if (localChassisSet.has(chassis) || localMotorSet.has(motor)) {
                    alert(`خطأ: رقم الشاسيه أو الموتور مكرر بالجدول (السطر رقم ${i+1}).`);
                    return;
                }

                localChassisSet.add(chassis);
                localMotorSet.add(motor);

                unitsToAdd.push({
                    productId,
                    branch,
                    chassis,
                    motor,
                    color,
                    cost,
                    supplierId: supplierId || null,
                    status: 'متاح'
                });
            }

            try {
                for (let unit of unitsToAdd) {
                    await MotoDB.add('units', unit);
                }

                const totalCost = cost * count;
                const prod = allProducts.find(p => p.id === productId) || await MotoDB.getById('products', productId);
                
                // Get supplier name if we have supplierId
                let supName = '';
                if (!supplierId && prod && prod.supplierId) {
                    supplierId = prod.supplierId;
                }
                if (supplierId) {
                    const sup = allSuppliers.find(s => s.id === supplierId);
                    if (sup) supName = sup.name;
                }

                const desc = `شراء شحنة مخزون بعدد (${count}) قطعة للموديل (${prod ? prod.brand : 'موتوسيكل'})${supName ? ' من المورد (' + supName + ')' : ''} لـ (${branch})`;
                
                const txCode = await MotoDB.generateNextTxCode();
                const now = new Date();
                const nowStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

                const txObj = {
                    code: txCode,
                    date: nowStr,
                    type: 'صرف',
                    category: 'شراء بضاعة',
                    amount: totalCost,
                    description: desc,
                    user: currentRole === 'admin' ? 'Admin' : 'موظف حسابات'
                };
                await MotoDB.add('transactions', txObj);

                App.logActivity("شحن مخزون موحد", `شراء شحنة (${count}) قطع للموديل (${prod ? prod.brand : 'موتوسيكل'})${supName ? ' من المورد (' + supName + ')' : ''} لـ (${branch}) بتكلفة (${totalCost.toLocaleString('ar-EG')} ج.م)`);
                await App.saveAutoBackup();

                alert(`تم تسجيل وحفظ شحنة المخزون بالكامل بعدد (${count}) قطعة بنجاح!`);
                this.closeUnifiedAddModal();
                App.switchTab('products');
                this.switchSubTab('units');
            } catch (err) {
                alert(err);
            }
        },

        // Edit stock physical unit
        openEditUnitModal: async function(id) {
            const unit = await MotoDB.getById('units', id);
            if (!unit) return;

            document.getElementById('unit-form').reset();
            document.getElementById('unit-id').value = unit.id;
            
            const prodSelect = document.getElementById('unit-prod-id');
            prodSelect.innerHTML = '';
            allProducts.forEach(p => {
                prodSelect.innerHTML += `<option value="${p.id}" ${p.id === unit.productId ? 'selected' : ''}>${p.brand} (${p.year}) - ${p.cc}</option>`;
            });

            const branchSelect = document.getElementById('unit-branch');
            branchSelect.innerHTML = '';
            BRANCHES.forEach(b => {
                branchSelect.innerHTML += `<option value="${b}" ${b === unit.branch ? 'selected' : ''}>${b}</option>`;
            });

            // Populate and set suppliers
            const supSelect = document.getElementById('unit-supplier-id');
            if (supSelect) {
                supSelect.innerHTML = '<option value="">-- اختر المورد المرتبط --</option>';
                allSuppliers.forEach(s => {
                    supSelect.innerHTML += `<option value="${s.id}" ${s.id === unit.supplierId ? 'selected' : ''}>${s.name} (${s.type})</option>`;
                });
            }

            document.getElementById('unit-chassis').value = unit.chassis;
            document.getElementById('unit-motor').value = unit.motor;
            document.getElementById('unit-color').value = unit.color;
            document.getElementById('unit-cost').value = unit.cost;

            document.getElementById('unit-modal-title').textContent = 'تعديل قطعة شاسيه وموتور بالمخزن';
            document.getElementById('unit-modal').classList.remove('hidden');
        },

        // Transfer unit to another branch
        openTransferUnitModal: async function(id) {
            const unit = await MotoDB.getById('units', id);
            if (!unit) return;

            document.getElementById('transfer-unit-id').value = unit.id;
            document.getElementById('transfer-chassis-lbl').textContent = unit.chassis;
            document.getElementById('transfer-current-branch-lbl').textContent = unit.branch || 'الفرع الرئيسي';

            const branchSelect = document.getElementById('transfer-target-branch');
            branchSelect.innerHTML = '';
            BRANCHES.forEach(b => {
                branchSelect.innerHTML += `<option value="${b}" ${b === unit.branch ? 'selected' : ''}>${b}</option>`;
            });

            document.getElementById('transfer-unit-modal').classList.remove('hidden');
        },

        saveTransferUnit: async function(e) {
            e.preventDefault();

            const unitId = Number(document.getElementById('transfer-unit-id').value);
            const targetBranch = document.getElementById('transfer-target-branch').value;

            try {
                const unit = await MotoDB.getById('units', unitId);
                if (!unit) return;

                const oldBranch = unit.branch || 'الفرع الرئيسي';
                unit.branch = targetBranch;
                if (unit.status !== 'مباع') {
                    unit.status = 'متاح';
                }
                
                await MotoDB.update('units', unit);

                App.logActivity("تحويل مخزون", `تحويل الشاسيه (${unit.chassis}) من فرع (${oldBranch}) إلى فرع (${targetBranch}) وتحديث الحالة إلى (${unit.status})`);
                await App.saveAutoBackup();

                alert(`تم تحويل القطعة بنجاح إلى فرع: ${targetBranch}`);
                document.getElementById('transfer-unit-modal').classList.add('hidden');
                App.switchTab('products');
                this.switchSubTab('units');
            } catch (err) {
                alert("فشل عملية النقل والتحويل: " + err);
            }
        }
    },


    /* ==========================================================================
       SUBMODULE: SALES LOG & MULTI-BRANCH INVOICES
       ========================================================================== */
    Sales: {
        activeSubTab: 'checkout',
        customerMode: 'search',
        unitMode: 'select',
        selectedCustomerId: null,
        selectedProductId: null,
        selectedUnitId: null,
        isSubmitting: false,
        guarantorsCount: 2,
        editGuarantorsCount: 2,

        setGuarantorsCount: function(count) {
            this.guarantorsCount = Number(count) || 1;
            const btn1 = document.getElementById('btn-guar-count-1');
            const btn2 = document.getElementById('btn-guar-count-2');
            const g2Box = document.getElementById('g2-box');
            const g1Title = document.getElementById('g1-box-title');
            const secTitle = document.getElementById('guarantors-section-title');

            if (this.guarantorsCount === 1) {
                if (btn1) btn1.classList.add('active');
                if (btn2) btn2.classList.remove('active');
                if (g2Box) g2Box.classList.add('hidden');
                if (g1Title) g1Title.textContent = 'بيانات الضامن (الكفيل الوحيد)';
                if (secTitle) secTitle.innerHTML = '<i class="fa-solid fa-people-arrows header-icon"></i> 3. بيانات الضامن (إجباري للتقسيط - ضامن واحد)';
                
                ['g2-name', 'g2-phone', 'g2-nid', 'g2-rel', 'g2-address'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                const g2Alert = document.getElementById('g2-nid-alert');
                if (g2Alert) { g2Alert.innerHTML = ''; g2Alert.classList.add('hidden'); }
            } else {
                if (btn1) btn1.classList.remove('active');
                if (btn2) btn2.classList.add('active');
                if (g2Box) g2Box.classList.remove('hidden');
                if (g1Title) g1Title.textContent = 'الضامن الأول';
                if (secTitle) secTitle.innerHTML = '<i class="fa-solid fa-people-arrows header-icon"></i> 3. بيانات الضامنين (إجباري للتقسيط - اثنان ضامن)';
            }
        },

        toggleEditGuarantorsCount: function(count) {
            this.editGuarantorsCount = Number(count) || 1;
            const g2Box = document.getElementById('edit-sale-g2-box');
            const g1Title = document.getElementById('edit-sale-g1-title');
            if (this.editGuarantorsCount === 1) {
                if (g2Box) g2Box.style.display = 'none';
                if (g1Title) g1Title.textContent = 'بيانات الضامن (الكفيل الوحيد):';
                const g2Alert = document.getElementById('edit-sale-g2-nid-alert');
                if (g2Alert) { g2Alert.innerHTML = ''; g2Alert.classList.add('hidden'); }
            } else {
                if (g2Box) g2Box.style.display = 'block';
                if (g1Title) g1Title.textContent = 'بيانات الضامن الأول (الكفيل):';
            }
        },

        onNewCustNidInput: function() {
            const input = document.getElementById('sale-new-cust-nid');
            if (!input) return;
            App.DuplicateChecker.onNidInput(input, 'sale-new-cust-nid-alert', 'المشتري', (nid) => {
                const g1Nid = (document.getElementById('g1-nid')?.value || '').trim();
                const g2Nid = (document.getElementById('g2-nid')?.value || '').trim();
                if (g1Nid && g1Nid === nid) return 'لا يمكن أن يكون المشتري هو نفس الضامن الأول في نفس العملية!';
                if (this.guarantorsCount === 2 && g2Nid && g2Nid === nid) return 'لا يمكن أن يكون المشتري هو نفس الضامن الثاني في نفس العملية!';
                return null;
            });
        },

        onGuarNidInput: function(guarNum) {
            if (guarNum === 1) {
                const input = document.getElementById('g1-nid');
                if (!input) return;
                App.DuplicateChecker.onNidInput(input, 'g1-nid-alert', 'الضامن الأول', (nid) => {
                    let custNid = '';
                    if (this.customerMode === 'direct') {
                        custNid = (document.getElementById('sale-new-cust-nid')?.value || '').trim();
                    } else if (this.selectedCustomerId) {
                        const cust = allCustomers.find(c => c.id === this.selectedCustomerId);
                        if (cust) custNid = (App.Security.decrypt(cust.nid) || cust.nid || '').trim();
                    }
                    if (custNid && custNid === nid) return 'لا يمكن أن يكون الضامن الأول هو نفس المشتري في الفاتورة!';
                    if (this.guarantorsCount === 2) {
                        const g2Nid = (document.getElementById('g2-nid')?.value || '').trim();
                        if (g2Nid && g2Nid === nid) return 'لا يمكن تكرار نفس الرقم القومي للضامن الأول والضامن الثاني!';
                    }
                    return null;
                });
            } else {
                const input = document.getElementById('g2-nid');
                if (!input) return;
                App.DuplicateChecker.onNidInput(input, 'g2-nid-alert', 'الضامن الثاني', (nid) => {
                    let custNid = '';
                    if (this.customerMode === 'direct') {
                        custNid = (document.getElementById('sale-new-cust-nid')?.value || '').trim();
                    } else if (this.selectedCustomerId) {
                        const cust = allCustomers.find(c => c.id === this.selectedCustomerId);
                        if (cust) custNid = (App.Security.decrypt(cust.nid) || cust.nid || '').trim();
                    }
                    if (custNid && custNid === nid) return 'لا يمكن أن يكون الضامن الثاني هو نفس المشتري في الفاتورة!';
                    const g1Nid = (document.getElementById('g1-nid')?.value || '').trim();
                    if (g1Nid && g1Nid === nid) return 'لا يمكن تكرار نفس الرقم القومي للضامن الأول والضامن الثاني!';
                    return null;
                });
            }
        },

        onEditGuarNidInput: function(guarNum) {
            if (guarNum === 1) {
                const input = document.getElementById('edit-sale-g1-nid');
                if (!input) return;
                App.DuplicateChecker.onNidInput(input, 'edit-sale-g1-nid-alert', 'الضامن الأول', (nid) => {
                    if (this.editGuarantorsCount === 2) {
                        const g2Nid = (document.getElementById('edit-sale-g2-nid')?.value || '').trim();
                        if (g2Nid && g2Nid === nid) return 'لا يمكن تكرار نفس الرقم القومي للضامن الأول والضامن الثاني!';
                    }
                    return null;
                });
            } else {
                const input = document.getElementById('edit-sale-g2-nid');
                if (!input) return;
                App.DuplicateChecker.onNidInput(input, 'edit-sale-g2-nid-alert', 'الضامن الثاني', (nid) => {
                    const g1Nid = (document.getElementById('edit-sale-g1-nid')?.value || '').trim();
                    if (g1Nid && g1Nid === nid) return 'لا يمكن تكرار نفس الرقم القومي للضامن الأول والضامن الثاني!';
                    return null;
                });
            }
        },

        setCustomerMode: function(mode) {
            this.customerMode = mode;
            const searchContainer = document.getElementById('sale-cust-search-container');
            const directContainer = document.getElementById('sale-cust-direct-container');
            const btnSearch = document.getElementById('btn-sale-cust-mode-search');
            const btnDirect = document.getElementById('btn-sale-cust-mode-direct');

            if (mode === 'direct') {
                if (searchContainer) searchContainer.classList.add('hidden');
                if (directContainer) directContainer.classList.remove('hidden');
                if (btnSearch) btnSearch.classList.remove('active');
                if (btnDirect) btnDirect.classList.add('active');
                const nameInput = document.getElementById('sale-new-cust-name');
                if (nameInput) nameInput.focus();
            } else {
                if (searchContainer) searchContainer.classList.remove('hidden');
                if (directContainer) directContainer.classList.add('hidden');
                if (btnSearch) btnSearch.classList.add('active');
                if (btnDirect) btnDirect.classList.remove('active');
            }
        },

        setUnitMode: function(mode) {
            this.unitMode = mode;
            const selectContainer = document.getElementById('sale-unit-select-container');
            const directContainer = document.getElementById('sale-unit-direct-container');

            if (mode === 'direct') {
                if (selectContainer) selectContainer.classList.add('hidden');
                if (directContainer) directContainer.classList.remove('hidden');
                this.populateDirectUnitDropdowns();
                const dateInput = document.getElementById('sale-direct-purchase-date');
                if (dateInput && !dateInput.value) {
                    dateInput.value = new Date().toISOString().split('T')[0];
                }
                const mainBranch = document.getElementById('sale-branch-select')?.value;
                const dirBranch = document.getElementById('sale-direct-branch');
                if (dirBranch && mainBranch) dirBranch.value = mainBranch;
            } else {
                if (selectContainer) selectContainer.classList.remove('hidden');
                if (directContainer) directContainer.classList.add('hidden');
            }
        },

        populateDirectUnitDropdowns: function() {
            // 1. Populate Branches in sale-direct-branch
            const branchSelect = document.getElementById('sale-direct-branch');
            if (branchSelect) {
                const curVal = branchSelect.value;
                branchSelect.innerHTML = '';
                BRANCHES.forEach(b => {
                    branchSelect.innerHTML += `<option value="${b}">${b}</option>`;
                });
                const mainBranch = document.getElementById('sale-branch-select')?.value;
                if (mainBranch && BRANCHES.includes(mainBranch)) {
                    branchSelect.value = mainBranch;
                } else if (curVal && BRANCHES.includes(curVal)) {
                    branchSelect.value = curVal;
                }
            }

            // 2. Populate Models in sale-direct-model-select
            const modelSelect = document.getElementById('sale-direct-model-select');
            if (modelSelect) {
                const curModelVal = modelSelect.value || '__new__';
                modelSelect.innerHTML = '<option value="__new__">➕ كتابة موديل جديد يدوي...</option>';
                allProducts.forEach(p => {
                    modelSelect.innerHTML += `<option value="${p.id}">${p.brand} (${p.year}) - ${p.cc}</option>`;
                });
                if (curModelVal && modelSelect.querySelector(`option[value="${curModelVal}"]`)) {
                    modelSelect.value = curModelVal;
                } else {
                    modelSelect.value = '__new__';
                }
                this.onDirectModelSelectChange();
            }

            // 3. Populate Suppliers in sale-direct-supplier-select
            const supSelect = document.getElementById('sale-direct-supplier-select');
            if (supSelect) {
                const curSupVal = supSelect.value || '__new__';
                supSelect.innerHTML = '<option value="__new__">➕ كتابة مورد جديد يدوي...</option>';
                allSuppliers.forEach(s => {
                    supSelect.innerHTML += `<option value="${s.id}">${s.name} (${s.type || 'مورد'})</option>`;
                });
                if (curSupVal && supSelect.querySelector(`option[value="${curSupVal}"]`)) {
                    supSelect.value = curSupVal;
                } else {
                    supSelect.value = '__new__';
                }
                this.onDirectSupplierSelectChange();
            }
        },

        onDirectModelSelectChange: function() {
            const modelSelect = document.getElementById('sale-direct-model-select');
            const modelInput = document.getElementById('sale-direct-model-new');
            if (!modelSelect || !modelInput) return;

            if (modelSelect.value === '__new__') {
                modelInput.style.display = 'block';
                modelInput.focus();
            } else {
                modelInput.style.display = 'none';
                const prodId = Number(modelSelect.value);
                const prod = allProducts.find(p => p.id === prodId);
                if (prod) {
                    const priceInput = document.getElementById('sale-price-input');
                    if (priceInput) {
                        priceInput.value = prod.price;
                        const hint = document.getElementById('sale-original-price-hint');
                        if (hint) hint.textContent = `السعر الافتراضي: ${prod.price.toLocaleString('ar-EG')} ج.م`;
                        this.calculateInstallments();
                    }
                    if (prod.supplierId) {
                        const supSelect = document.getElementById('sale-direct-supplier-select');
                        if (supSelect && supSelect.querySelector(`option[value="${prod.supplierId}"]`)) {
                            supSelect.value = prod.supplierId;
                            this.onDirectSupplierSelectChange();
                        }
                    }
                }
            }
        },

        onDirectSupplierSelectChange: function() {
            const supSelect = document.getElementById('sale-direct-supplier-select');
            const supInput = document.getElementById('sale-direct-supplier-new');
            if (!supSelect || !supInput) return;

            if (supSelect.value === '__new__') {
                supInput.style.display = 'block';
                supInput.focus();
            } else {
                supInput.style.display = 'none';
            }
        },

        onDirectBranchChange: function() {
            const dirBranch = document.getElementById('sale-direct-branch');
            const mainBranch = document.getElementById('sale-branch-select');
            if (dirBranch && mainBranch && dirBranch.value) {
                mainBranch.value = dirBranch.value;
            }
        },

        onDirectChassisInput: function() {
            const input = document.getElementById('sale-direct-chassis');
            const alertBox = document.getElementById('sale-direct-chassis-alert');
            if (!input || !alertBox) return;
            const val = input.value.trim().toLowerCase();
            if (!val) {
                alertBox.innerHTML = '';
                alertBox.classList.add('hidden');
                return;
            }
            const match = allUnits.find(u => u.chassis && u.chassis.toLowerCase() === val);
            if (match) {
                alertBox.innerHTML = `<div style="color: #ef4444; font-size: 12px; margin-top: 4px; font-weight: bold;"><i class="fa-solid fa-triangle-exclamation"></i> تنبيه: رقم الشاسيه مسجل مسبقاً في النظام (حالته: ${match.status} - فرع: ${match.branch || 'غير محدد'})!</div>`;
                alertBox.classList.remove('hidden');
            } else {
                alertBox.innerHTML = `<div style="color: #22c55e; font-size: 12px; margin-top: 4px;"><i class="fa-solid fa-circle-check"></i> رقم الشاسيه متاح وجديد.</div>`;
                alertBox.classList.remove('hidden');
            }
        },

        onDirectMotorInput: function() {
            const input = document.getElementById('sale-direct-motor');
            const alertBox = document.getElementById('sale-direct-motor-alert');
            if (!input || !alertBox) return;
            const val = input.value.trim().toLowerCase();
            if (!val) {
                alertBox.innerHTML = '';
                alertBox.classList.add('hidden');
                return;
            }
            const match = allUnits.find(u => u.motor && u.motor.toLowerCase() === val);
            if (match) {
                alertBox.innerHTML = `<div style="color: #ef4444; font-size: 12px; margin-top: 4px; font-weight: bold;"><i class="fa-solid fa-triangle-exclamation"></i> تنبيه: رقم الماتور مسجل مسبقاً في النظام (حالته: ${match.status} - فرع: ${match.branch || 'غير محدد'})!</div>`;
                alertBox.classList.remove('hidden');
            } else {
                alertBox.innerHTML = `<div style="color: #22c55e; font-size: 12px; margin-top: 4px;"><i class="fa-solid fa-circle-check"></i> رقم الماتور متاح وجديد.</div>`;
                alertBox.classList.remove('hidden');
            }
        },

        clearSelectedCustomer: function() {
            this.selectedCustomerId = null;
            const searchInput = document.getElementById('sale-cust-search');
            if (searchInput) searchInput.value = '';
            const div = document.getElementById('selected-customer-details');
            if (div) {
                div.innerHTML = '';
                div.classList.add('hidden');
            }
        },

        switchToDirectWithQuery: function(query) {
            const dropdown = document.getElementById('sale-cust-results');
            if (dropdown) dropdown.classList.add('hidden');
            this.setCustomerMode('direct');
            if (query) {
                const trimmed = query.trim();
                if (/^\d+$/.test(trimmed)) {
                    if (trimmed.length === 14) {
                        const nidInput = document.getElementById('sale-new-cust-nid');
                        if (nidInput) {
                            nidInput.value = trimmed;
                            this.onNewCustNidInput();
                        }
                    } else {
                        const phoneInput = document.getElementById('sale-new-cust-phone');
                        if (phoneInput) phoneInput.value = trimmed;
                    }
                } else {
                    const nameInput = document.getElementById('sale-new-cust-name');
                    if (nameInput) nameInput.value = trimmed;
                }
            }
        },

        render: async function() {
            this.switchSubTab(this.activeSubTab);

            // Populate Products dropdown
            const prodSelect = document.getElementById('sale-product-select');
            prodSelect.innerHTML = '<option value="">-- اختر موديل الدراجة النارية --</option>';
            allProducts.forEach(p => {
                prodSelect.innerHTML += `<option value="${p.id}">${p.brand} (${p.year}) - ${p.cc}</option>`;
            });

            this.populateDirectUnitDropdowns();
        },

        switchSubTab: function(subTabId) {
            this.activeSubTab = subTabId;
            
            document.querySelectorAll('#sales-page .sub-tab').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById(`tab-sales-${subTabId}`).classList.add('active');

            document.querySelectorAll('#sales-page .subtab-content').forEach(div => div.classList.remove('active'));
            document.getElementById(`sales-${subTabId}-subpage`).classList.add('active');

            if (subTabId === 'checkout') {
                this.resetForm();
            } else {
                this.searchSalesLog();
            }
        },

        resetForm: function() {
            this.selectedCustomerId = null;
            this.selectedProductId = null;
            this.selectedUnitId = null;
            this.setCustomerMode('search');
            this.setUnitMode('select');

            document.getElementById('sale-cust-search').value = '';
            document.getElementById('selected-customer-details').innerHTML = '';
            document.getElementById('selected-customer-details').classList.add('hidden');

            // Reset direct customer inputs
            const directFields = document.querySelectorAll('.cust-direct-field');
            directFields.forEach(f => f.value = '');

            // Reset direct unit inputs
            ['sale-direct-chassis', 'sale-direct-motor', 'sale-direct-model-new', 'sale-direct-supplier-new', 'sale-direct-color'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const directCost = document.getElementById('sale-direct-cost');
            if (directCost) directCost.value = 0;
            const directDate = document.getElementById('sale-direct-purchase-date');
            if (directDate) directDate.value = new Date().toISOString().split('T')[0];
            
            // Reset duplicate alert boxes
            ['sale-new-cust-nid-alert', 'g1-nid-alert', 'g2-nid-alert', 'sale-direct-chassis-alert', 'sale-direct-motor-alert'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.innerHTML = ''; el.classList.add('hidden'); }
            });

            document.getElementById('sale-unit-select').innerHTML = '<option value="">-- اختر رقم الشاسيه والموتور المتاحين --</option>';
            document.getElementById('selected-unit-details').innerHTML = '';
            document.getElementById('selected-unit-details').classList.add('hidden');

            document.getElementById('sale-price-input').value = 0;
            document.getElementById('sale-original-price-hint').textContent = 'السعر الافتراضي: 0.00 ج.م';
            document.getElementById('sale-downpayment').value = 0;
            if (document.getElementById('sale-rate-input')) document.getElementById('sale-rate-input').value = 0;
            if (document.getElementById('sale-increase-group')) document.getElementById('sale-increase-group').style.display = 'none';
            document.getElementById('sale-monthly-payment').value = 0;
            document.getElementById('sale-remaining-total').textContent = '0.00 ج.م';
            document.getElementById('sale-due-today').textContent = '0.00 ج.م';
            document.getElementById('sale-first-inst-date').value = '';
            
            document.getElementById('sale-general-notes').value = '';
            
            // Reset Guarantor Fields & count
            const gFields = document.querySelectorAll('.g-field');
            gFields.forEach(f => f.value = '');
            document.getElementById('g1-rel').value = '';
            document.getElementById('g2-rel').value = '';
            document.getElementById('sale-guarantee-notes').value = '';
            this.setGuarantorsCount(2);

            // Reset type
            this.toggleSaleType('cash');
            document.querySelectorAll('input[name="sale_type"]').forEach(r => {
                if (r.value === 'cash') r.checked = true;
            });
            document.querySelectorAll('#sales-checkout-subpage .radio-pill-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.innerHTML.includes('cash')) btn.classList.add('active');
            });
        },

        searchCustomers: function(query) {
            const dropdown = document.getElementById('sale-cust-results');
            dropdown.innerHTML = '';
            
            if (query.trim().length === 0) {
                dropdown.classList.add('hidden');
                return;
            }

            const matches = allCustomers.filter(c => {
                const decPhone = App.Security.decrypt(c.phone) || c.phone || '';
                const decNid = App.Security.decrypt(c.nid) || c.nid || '';
                return c.name.toLowerCase().includes(query.toLowerCase()) ||
                       decPhone.includes(query) ||
                       decNid.includes(query) ||
                       (c.code && c.code.toLowerCase().includes(query.toLowerCase()));
            });

            if (matches.length === 0) {
                dropdown.classList.remove('hidden');
                const safeQuery = query.replace(/'/g, "\\'");
                dropdown.innerHTML = `
                    <div class="autocomplete-item" onclick="App.Sales.switchToDirectWithQuery('${safeQuery}')" style="color: var(--primary); text-align: center; padding: 12px; cursor: pointer; font-weight: bold;">
                        <i class="fa-solid fa-user-plus"></i> لا يوجد عميل مسجل بهذا الاسم - اضغط هنا لكتابة بياناته كعميل جديد مباشرة
                    </div>
                `;
                return;
            }

            dropdown.classList.remove('hidden');
            matches.forEach(c => {
                const decPhone = App.Security.decrypt(c.phone) || c.phone || '';
                const decNid = App.Security.decrypt(c.nid) || c.nid || '';
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `
                    <div>
                        <div class="title">${c.name}</div>
                        <div class="desc">كود: ${c.code} | موبايل: ${decPhone} | بطاقة: ${decNid}</div>
                    </div>
                `;
                item.onclick = () => {
                    this.selectCustomer(c);
                    dropdown.classList.add('hidden');
                };
                dropdown.appendChild(item);
            });
        },

        selectCustomer: async function(customer) {
            this.selectedCustomerId = customer.id;
            document.getElementById('sale-cust-search').value = customer.name;

            const decPhone = App.Security.decrypt(customer.phone) || customer.phone || '';
            const decNid = App.Security.decrypt(customer.nid) || customer.nid || '';

            const div = document.getElementById('selected-customer-details');
            div.classList.remove('hidden');
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px;">
                    <strong class="text-cyan"><i class="fa-solid fa-check-circle"></i> العميل المختار للفاتورة:</strong>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="App.Sales.clearSelectedCustomer()" style="font-size: 11px; padding: 3px 8px;">
                        <i class="fa-solid fa-xmark"></i> إلغاء التحديد / تغيير
                    </button>
                </div>
                <div class="form-grid" style="gap: 8px;">
                    <div class="detail-label-value"><span>كود العميل:</span> <strong>${customer.code}</strong></div>
                    <div class="detail-label-value"><span>الاسم الكامل:</span> <strong>${customer.name}</strong></div>
                    <div class="detail-label-value"><span>رقم الموبايل:</span> <strong>${decPhone}</strong></div>
                    <div class="detail-label-value"><span>رقم البطاقة الشخصية:</span> <strong>${decNid}</strong></div>
                    <div class="detail-label-value col-span-2"><span>محل الإقامة والسكن:</span> <strong>${customer.address}</strong></div>
                </div>
                <div id="selected-cust-dup-report" class="mt-2"></div>
            `;

            // Check history for selected customer
            if (decNid && decNid.length === 14) {
                const reportDiv = document.getElementById('selected-cust-dup-report');
                if (reportDiv) {
                    const res = await App.DuplicateChecker.checkNid(decNid);
                    if (res && res.hasHistory) {
                        reportDiv.innerHTML = App.DuplicateChecker.renderAlertHtml(res, 'المشتري');
                    }
                }
            }
        },

        onBranchChange: function() {
            // Trigger recalculation of available units based on product model and newly selected branch
            if (this.selectedProductId) {
                this.onProductChange(this.selectedProductId);
            }
        },

        onProductChange: function(prodId) {
            this.selectedProductId = Number(prodId);
            this.selectedUnitId = null;
            
            const unitSelect = document.getElementById('sale-unit-select');
            unitSelect.innerHTML = '<option value="">-- اختر رقم الشاسيه والموتور المتاحين --</option>';
            document.getElementById('selected-unit-details').classList.add('hidden');

            if (!prodId) return;

            const prod = allProducts.find(p => p.id === this.selectedProductId);
            if (prod) {
                document.getElementById('sale-price-input').value = prod.price;
                document.getElementById('sale-original-price-hint').textContent = `السعر الافتراضي: ${prod.price.toLocaleString('ar-EG')} ج.م`;
                this.calculateInstallments();
            }

            // Filter available units ONLY in the currently selected Branch!
            const activeBranch = document.getElementById('sale-branch-select').value;
            const availUnits = allUnits.filter(u => u.productId === this.selectedProductId && u.status === 'متاح' && u.branch === activeBranch);
            
            if (availUnits.length === 0) {
                unitSelect.innerHTML = '<option value="">⚠️ لا يوجد شاسيهات متاحة حالياً بهذا الفرع!</option>';
            } else {
                availUnits.forEach(u => {
                    unitSelect.innerHTML += `<option value="${u.id}">شاسيه: ${u.chassis} | اللون: ${u.color}</option>`;
                });
            }
        },

        onUnitChange: function(unitId) {
            this.selectedUnitId = Number(unitId);
            const div = document.getElementById('selected-unit-details');
            
            if (!unitId) {
                div.classList.add('hidden');
                return;
            }

            const unit = allUnits.find(u => u.id === this.selectedUnitId);
            if (unit) {
                div.classList.remove('hidden');
                div.innerHTML = `
                    <div class="detail-label-value"><span>رقم الشاسيه الفعلي:</span> <strong class="text-cyan">${unit.chassis}</strong></div>
                    <div class="detail-label-value"><span>رقم الموتور / المحرك:</span> <strong>${unit.motor}</strong></div>
                    <div class="detail-label-value"><span>اللون الخارجي:</span> <strong>${unit.color}</strong></div>
                    <div class="detail-label-value"><span>تكلفة التوريد (المعرض):</span> <strong>${unit.cost.toLocaleString('ar-EG')} ج.م</strong></div>
                `;
            }
        },

        toggleSaleType: function(type) {
            const pGroup = document.getElementById('sale-installment-fields');
            const gSection = document.getElementById('guarantors-selection-section');
            
            document.querySelectorAll('#sales-checkout-subpage .radio-pill-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.querySelector(`input[value="${type}"]`)) btn.classList.add('active');
            });

            if (type === 'installment') {
                pGroup.classList.remove('hidden');
                gSection.classList.remove('hidden');
            } else {
                pGroup.classList.add('hidden');
                gSection.classList.add('hidden');
            }

            this.calculateInstallments();
        },

        onCalcModeChange: function() {
            const mode = document.getElementById('sale-calc-mode').value;
            const monthsInput = document.getElementById('sale-months');
            const paymentInput = document.getElementById('sale-monthly-payment');
            const lastInstGroup = document.getElementById('sale-last-installment-group');
            const paymentHint = document.getElementById('sale-payment-hint');

            if (mode === 'normal') {
                monthsInput.removeAttribute('readonly');
                monthsInput.classList.remove('readonly-input');
                paymentInput.setAttribute('readonly', 'true');
                paymentInput.classList.add('readonly-input');
                lastInstGroup.classList.add('hidden');
                if (paymentHint) paymentHint.style.display = 'block';
            } else {
                monthsInput.setAttribute('readonly', 'true');
                monthsInput.classList.add('readonly-input');
                paymentInput.removeAttribute('readonly');
                paymentInput.classList.remove('readonly-input');
                lastInstGroup.classList.remove('hidden');
                if (paymentHint) paymentHint.style.display = 'none';
            }
            this.calculateInstallments();
        },

        calculateInstallments: function() {
            const isInstallment = document.querySelector('input[name="sale_type"]:checked').value === 'installment';
            const price = Number(document.getElementById('sale-price-input').value) || 0;

            if (!isInstallment) {
                document.getElementById('sale-due-today').textContent = price.toLocaleString('ar-EG') + " ج.م";
                const incGrp = document.getElementById('sale-increase-group');
                if (incGrp) incGrp.style.display = 'none';
                return;
            }

            const downpayment = Number(document.getElementById('sale-downpayment').value) || 0;
            const rate = Number(document.getElementById('sale-rate-input') ? document.getElementById('sale-rate-input').value : 0) || 0;
            
            const remainingBeforeRate = Math.max(0, price - downpayment);
            const increase = remainingBeforeRate * (rate / 100);
            const remaining = remainingBeforeRate + increase;

            const incGrp = document.getElementById('sale-increase-group');
            const incVal = document.getElementById('sale-increase-val');
            if (incGrp && incVal) {
                if (rate > 0) {
                    incGrp.style.display = 'block';
                    incVal.textContent = increase.toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + " ج.م (" + rate + "%)";
                } else {
                    incGrp.style.display = 'none';
                }
            }

            document.getElementById('sale-remaining-total').textContent = remaining.toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + " ج.م";
            document.getElementById('sale-due-today').textContent = downpayment.toLocaleString('ar-EG') + " ج.م";

            if (downpayment >= price) {
                document.getElementById('sale-monthly-payment').value = 0;
                document.getElementById('sale-months').value = 0;
                document.getElementById('sale-remaining-total').textContent = "0.00 ج.م";
                document.getElementById('sale-due-today').textContent = price.toLocaleString('ar-EG') + " ج.م";
                return;
            }

            const mode = document.getElementById('sale-calc-mode').value;

            if (mode === 'normal') {
                const months = Number(document.getElementById('sale-months').value) || 12;
                if (months <= 0) return;
                const monthly = Math.ceil(remaining / months);
                document.getElementById('sale-monthly-payment').value = monthly;
                document.getElementById('sale-months').style.borderColor = '';
                document.getElementById('sale-months').style.boxShadow = '';
            } else {
                const monthly = Number(document.getElementById('sale-monthly-payment').value) || 0;
                if (monthly <= 0) {
                    document.getElementById('sale-months').value = 0;
                    document.getElementById('sale-last-installment-val').textContent = "0.00 ج.م";
                    document.getElementById('sale-months').style.borderColor = '';
                    document.getElementById('sale-months').style.boxShadow = '';
                    return;
                }
                const fullMonths = Math.floor(remaining / monthly);
                const remainder = remaining % monthly;
                
                let months = 0;
                let lastInstallment = 0;

                if (remainder === 0) {
                    months = fullMonths;
                    lastInstallment = monthly;
                } else {
                    months = fullMonths + 1;
                    lastInstallment = remainder;
                }
                document.getElementById('sale-months').value = months;
                document.getElementById('sale-last-installment-val').textContent = lastInstallment.toLocaleString('ar-EG') + " ج.م";
                
                if (months > 120) {
                    document.getElementById('sale-months').style.borderColor = '#ff4d4d';
                    document.getElementById('sale-months').style.boxShadow = '0 0 5px rgba(255, 77, 77, 0.5)';
                } else {
                    document.getElementById('sale-months').style.borderColor = '';
                    document.getElementById('sale-months').style.boxShadow = '';
                }
            }
        },

        submitInvoice: async function() {
            if (this.isSubmitting) return;

            // Disable submit button & set flag at the very start
            this.isSubmitting = true;
            const btn = document.querySelector('button[onclick="App.Sales.submitInvoice()"]');
            let originalBtnHtml = "";
            if (btn) {
                originalBtnHtml = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تسجيل الفاتورة...';
            }

            let debtWarningsAlreadyConfirmed = false;
            const rejectBeforeSave = (message) => {
                if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                this.isSubmitting = false;
                alert(message);
                return false;
            };

            try {
                if (App.isDemoMode) {
                    const sales = await MotoDB.getAll('sales');
                    if (sales.length >= 3) {
                        alert("عذراً، هذه نسخة تجريبية محدودة بـ 3 عمليات بيع فقط. لتفعيل النسخة الكاملة يرجى التواصل مع Hossam Hamaki.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }
                }

                // Preflight: validate every required value before the first database write.
                const preType = document.querySelector('input[name="sale_type"]:checked')?.value || 'cash';
                const preSalePrice = Number(document.getElementById('sale-price-input')?.value) || 0;
                if (preSalePrice <= 0) { rejectBeforeSave("سعر البيع المسجل للفاتورة غير صحيح."); return; }

                let preBuyerNid = '';
                if (this.customerMode === 'direct') {
                    const n = (document.getElementById('sale-new-cust-name')?.value || '').trim();
                    const p = (document.getElementById('sale-new-cust-phone')?.value || '').trim();
                    preBuyerNid = (document.getElementById('sale-new-cust-nid')?.value || '').trim();
                    const a = (document.getElementById('sale-new-cust-address')?.value || '').trim();
                    if (!n) { rejectBeforeSave('يرجى إدخال اسم العميل الجديد كاملاً.'); return; }
                    if (!p) { rejectBeforeSave('يرجى إدخال رقم هاتف العميل الجديد.'); return; }
                    if (preBuyerNid.length !== 14 || isNaN(preBuyerNid)) { rejectBeforeSave('يرجى إدخال الرقم القومي للعميل صحيحاً ومكوناً من 14 رقماً بالتمام.'); return; }
                    if (!a) { rejectBeforeSave('يرجى إدخال محل إقامة وسكن العميل بالتفصيل.'); return; }
                } else {
                    if (!this.selectedCustomerId) { rejectBeforeSave('يرجى البحث عن واختيار العميل المشتري أولاً، أو التبديل إلى (كتابة عميل جديد مباشرة).'); return; }
                    const preCustomer = allCustomers.find(c => Number(c.id) === Number(this.selectedCustomerId));
                    if (!preCustomer) { rejectBeforeSave('بيانات العميل المختار غير متاحة. أعد اختيار العميل وحاول مرة أخرى.'); return; }
                    preBuyerNid = (App.Security.decrypt(preCustomer.nid) || preCustomer.nid || '').trim();
                }

                if (this.unitMode === 'direct') {
                    const preChassis = (document.getElementById('sale-direct-chassis')?.value || '').trim();
                    const preMotor = (document.getElementById('sale-direct-motor')?.value || '').trim();
                    if (!preChassis) { rejectBeforeSave('يرجى إدخال رقم الشاسيه للمكنة.'); return; }
                    if (!preMotor) { rejectBeforeSave('يرجى إدخال رقم الماتور / المحرك للمكنة.'); return; }
                    if (allUnits.some(u => (u.chassis || '').trim().toLowerCase() === preChassis.toLowerCase())) { rejectBeforeSave(`رقم الشاسيه (${preChassis}) مسجل مسبقاً بالنظام ولا يمكن استخدامه مرة أخرى.`); return; }
                    if (allUnits.some(u => (u.motor || '').trim().toLowerCase() === preMotor.toLowerCase())) { rejectBeforeSave(`رقم الموتور (${preMotor}) مسجل مسبقاً بالنظام ولا يمكن استخدامه مرة أخرى.`); return; }

                    const preSupplier = document.getElementById('sale-direct-supplier-select')?.value || '';
                    if (!preSupplier) { rejectBeforeSave('يرجى اختيار المورد أو كتابة مورد جديد.'); return; }
                    if (preSupplier === '__new__') {
                        if (!(document.getElementById('sale-direct-supplier-new')?.value || '').trim()) { rejectBeforeSave('يرجى إدخال اسم المورد أو اختياره من القائمة.'); return; }
                    } else if (!allSuppliers.some(s => Number(s.id) === Number(preSupplier))) {
                        rejectBeforeSave('المورد المحدد غير موجود. يرجى اختياره مرة أخرى.'); return;
                    }

                    const preModel = document.getElementById('sale-direct-model-select')?.value || '';
                    if (!preModel) { rejectBeforeSave('يرجى اختيار الموديل أو كتابة موديل جديد.'); return; }
                    if (preModel === '__new__') {
                        if (!(document.getElementById('sale-direct-model-new')?.value || '').trim()) { rejectBeforeSave('يرجى إدخال اسم الموديل أو اختياره من القائمة.'); return; }
                    } else if (!allProducts.some(p => Number(p.id) === Number(preModel))) {
                        rejectBeforeSave('الموديل المحدد غير موجود. يرجى اختياره مرة أخرى.'); return;
                    }
                } else {
                    const preUnit = allUnits.find(u => Number(u.id) === Number(this.selectedUnitId));
                    if (!preUnit || preUnit.status !== 'متاح') { rejectBeforeSave('يرجى تحديد دراجة متاحة وصالحة للبيع من المخزون.'); return; }
                }

                if (preType === 'installment') {
                    const preMonths = Number(document.getElementById('sale-months')?.value) || 0;
                    const preFirstDate = document.getElementById('sale-first-inst-date')?.value || '';
                    if (preMonths > 120) { rejectBeforeSave('خطأ: مدة التقسيط كبيرة جداً (أكثر من 10 سنوات / 120 شهراً).'); return; }
                    if (preMonths <= 0) { rejectBeforeSave('خطأ: مدة التقسيط يجب أن تكون شهراً واحداً على الأقل.'); return; }
                    if (!preFirstDate) { rejectBeforeSave('خطأ: يرجى تحديد تاريخ أول قسط قبل حفظ الفاتورة.'); return; }

                    const g1 = {
                        name: (document.getElementById('g1-name')?.value || '').trim(),
                        phone: (document.getElementById('g1-phone')?.value || '').trim(),
                        nid: (document.getElementById('g1-nid')?.value || '').trim(),
                        address: (document.getElementById('g1-address')?.value || '').trim()
                    };
                    if (!g1.name || !g1.phone || !g1.nid || !g1.address) { rejectBeforeSave('خطأ: بيانات الضامن الأول إجبارية بالكامل لإتمام البيع بالتقسيط.'); return; }
                    if (g1.nid.length !== 14 || isNaN(g1.nid)) { rejectBeforeSave('خطأ: الرقم القومي للضامن الأول يجب أن يكون 14 رقماً صحيحاً لمنع التكرار.'); return; }
                    if (preBuyerNid && preBuyerNid === g1.nid) { rejectBeforeSave('خطأ: لا يمكن أن يكون المشتري هو نفس الضامن الأول في نفس العملية!'); return; }

                    const preParties = [
                        { role: 'المشتري', nid: preBuyerNid, name: this.customerMode === 'direct' ? (document.getElementById('sale-new-cust-name')?.value || 'المشتري') : (allCustomers.find(c => Number(c.id) === Number(this.selectedCustomerId))?.name || 'المشتري') },
                        { role: 'الضامن الأول', nid: g1.nid, name: g1.name }
                    ];
                    if (this.guarantorsCount === 2) {
                        const g2 = {
                            name: (document.getElementById('g2-name')?.value || '').trim(),
                            phone: (document.getElementById('g2-phone')?.value || '').trim(),
                            nid: (document.getElementById('g2-nid')?.value || '').trim(),
                            address: (document.getElementById('g2-address')?.value || '').trim()
                        };
                        if (!g2.name || !g2.phone || !g2.nid || !g2.address) { rejectBeforeSave('خطأ: بيانات الضامن الثاني إجبارية بالكامل عند اختيار (2 ضامن).'); return; }
                        if (g2.nid.length !== 14 || isNaN(g2.nid)) { rejectBeforeSave('خطأ: الرقم القومي للضامن الثاني يجب أن يكون 14 رقماً صحيحاً لمنع التكرار.'); return; }
                        if (preBuyerNid && preBuyerNid === g2.nid) { rejectBeforeSave('خطأ: لا يمكن أن يكون المشتري هو نفس الضامن الثاني في نفس العملية!'); return; }
                        if (g1.nid === g2.nid) { rejectBeforeSave('خطأ: لا يمكن تكرار نفس الرقم القومي للضامن الأول والضامن الثاني!'); return; }
                        preParties.push({ role: 'الضامن الثاني', nid: g2.nid, name: g2.name });
                    }

                    const preDebtWarnings = [];
                    for (const party of preParties) {
                        if (party.nid && party.nid.length === 14) {
                            const report = await App.DuplicateChecker.checkNid(party.nid);
                            if (report && report.hasActiveDebts) {
                                const totalDebt = report.activeRecords.reduce((sum, r) => sum + r.unpaidAmount, 0);
                                preDebtWarnings.push(`• ${party.role} (${party.name}): لديه (${report.activeCount}) عملية سارية/فعالة متبقي عليها (${totalDebt.toLocaleString('ar-EG')} ج.م)`);
                            }
                        }
                    }
                    if (preDebtWarnings.length) {
                        const preDebtMsg = `⚠️ تنبيه سجل المعاملات السابقة:\nتم العثور على مديونيات/عمليات سارية فعالة للأطراف التالية:\n\n${preDebtWarnings.join('\n')}\n\nهل ترغب في الاستمرار وتأكيد حفظ الفاتورة بالرغم من وجود عمليات فعالة سابقة؟`;
                        if (!(await BakryDialogs.confirm(preDebtMsg))) {
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            this.isSubmitting = false;
                            return;
                        }
                    }
                    // The debt check has already been completed before any writes.
                    debtWarningsAlreadyConfirmed = true;
                }

                // Determine and validate Customer
                let finalCustomerId = this.selectedCustomerId;
                let newlyCreatedCustId = null;

                if (this.customerMode === 'direct') {
                    const custName = document.getElementById('sale-new-cust-name') ? document.getElementById('sale-new-cust-name').value.trim() : '';
                    const custPhone = document.getElementById('sale-new-cust-phone') ? document.getElementById('sale-new-cust-phone').value.trim() : '';
                    const custNid = document.getElementById('sale-new-cust-nid') ? document.getElementById('sale-new-cust-nid').value.trim() : '';
                    const custAddress = document.getElementById('sale-new-cust-address') ? document.getElementById('sale-new-cust-address').value.trim() : '';
                    const custNotes = document.getElementById('sale-new-cust-notes') ? document.getElementById('sale-new-cust-notes').value.trim() : '';

                    if (!custName) {
                        alert("يرجى إدخال اسم العميل الجديد كاملاً.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }
                    if (!custPhone) {
                        alert("يرجى إدخال رقم هاتف العميل الجديد.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }
                    if (!custNid || custNid.length !== 14 || isNaN(custNid)) {
                        alert("يرجى إدخال الرقم القومي للعميل صحيحاً ومكوناً من 14 رقماً بالتمام.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }
                    if (!custAddress) {
                        alert("يرجى إدخال محل إقامة وسكن العميل بالتفصيل.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    if (App.isDemoMode && allCustomers.length >= 3) {
                        alert("عذراً، هذه نسخة تجريبية محدودة بـ 3 عملاء فقط. لتفعيل النسخة الكاملة يرجى التواصل مع Hossam Hamaki.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    // Check if customer with this NID already exists
                    const existingWithNid = allCustomers.find(c => (c.nid || '').trim() === custNid);
                    if (existingWithNid) {
                        // If it's the exact same customer name (or user retry), link to his account directly
                        if (existingWithNid.name && existingWithNid.name.trim() === custName) {
                            finalCustomerId = existingWithNid.id;
                        } else {
                            const useExisting = await BakryDialogs.confirm(`الرقم القومي المدخل مسجل مسبقاً باسم العميل (${existingWithNid.name}). هل تريد استخدام حسابه المسجل وإتمام البيع باسمه؟`);
                            if (useExisting) {
                                finalCustomerId = existingWithNid.id;
                            } else {
                                if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                                this.isSubmitting = false;
                                return;
                            }
                        }
                    } else {
                        const newCode = await MotoDB.generateNextCode('customers', 'C');
                        const encryptedPhone = App.Security.encrypt(custPhone);
                        const encryptedNid = App.Security.encrypt(custNid);
                        const currentSaleType = document.querySelector('input[name="sale_type"]:checked').value;
                        const newCustomerObj = {
                            code: newCode,
                            name: custName,
                            phone: encryptedPhone,
                            nid: encryptedNid,
                            address: custAddress,
                            type: currentSaleType,
                            notes: custNotes
                        };
                        const newCustId = await MotoDB.add('customers', newCustomerObj);
                        newlyCreatedCustId = newCustId;
                        allCustomers.push({
                            ...newCustomerObj,
                            id: newCustId,
                            phone: custPhone,
                            nid: custNid
                        });
                        App.logActivity("إضافة عميل", `إضافة عميل جديد تلقائياً أثناء البيع: ${custName} (كود: ${newCode})`);
                        finalCustomerId = newCustId;
                    }
                } else {
                    if (!finalCustomerId) {
                        alert("يرجى البحث عن واختيار العميل المشتري أولاً، أو التبديل إلى (كتابة عميل جديد مباشرة).");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }
                }

                // Resolve customer object early to prevent TDZ ReferenceError later
                let cust = allCustomers.find(c => c.id === finalCustomerId);
                if (!cust) {
                    cust = {
                        id: finalCustomerId,
                        name: (document.getElementById('sale-new-cust-name')?.value || 'المشتري').trim(),
                        phone: (document.getElementById('sale-new-cust-phone')?.value || '').trim(),
                        nid: (document.getElementById('sale-new-cust-nid')?.value || '').trim(),
                        address: (document.getElementById('sale-new-cust-address')?.value || '').trim()
                    };
                }

                let newlyCreatedUnitId = null;
                let newlyCreatedProdId = null;
                let newlyCreatedSupId = null;

                const type = document.querySelector('input[name="sale_type"]:checked').value;
                const salePrice = Number(document.getElementById('sale-price-input').value) || 0;

                if (salePrice <= 0) {
                    alert("سعر البيع المسجل للفاتورة غير صحيح.");
                    if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                    this.isSubmitting = false;
                    return;
                }

                let branch = document.getElementById('sale-branch-select').value;
                let originalPrice = 0;

                if (this.unitMode === 'direct') {
                    const chassis = (document.getElementById('sale-direct-chassis')?.value || '').trim();
                    const motor = (document.getElementById('sale-direct-motor')?.value || '').trim();
                    const typeVal = document.getElementById('sale-direct-type')?.value || 'موتوسيكل';
                    const dirBranch = document.getElementById('sale-direct-branch')?.value;
                    if (dirBranch) branch = dirBranch;
                    const purchaseDate = document.getElementById('sale-direct-purchase-date')?.value || new Date().toISOString().split('T')[0];
                    const color = (document.getElementById('sale-direct-color')?.value || '').trim() || 'أسود';
                    const cost = Number(document.getElementById('sale-direct-cost')?.value) || 0;

                    if (!chassis) {
                        alert("يرجى إدخال رقم الشاسيه للمكنة.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    if (!motor) {
                        alert("يرجى إدخال رقم الماتور / المحرك للمكنة.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    // Check duplicate chassis
                    const dupChassis = allUnits.find(u => u.chassis && u.chassis.toLowerCase() === chassis.toLowerCase());
                    if (dupChassis) {
                        alert(`خطأ: رقم الشاسيه (${chassis}) مسجل مسبقاً بالنظام وحالته (${dupChassis.status})! لا يمكن إتمام البيع بشاسيه مكرر.`);
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    // Check duplicate motor
                    const dupMotor = allUnits.find(u => u.motor && u.motor.toLowerCase() === motor.toLowerCase());
                    if (dupMotor) {
                        alert(`خطأ: رقم الماتور (${motor}) مسجل مسبقاً بالنظام! لا يمكن إتمام البيع بماتور مكرر.`);
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    // 1. Resolve Supplier
                    const supSelectVal = document.getElementById('sale-direct-supplier-select')?.value;
                    let finalSupplierId = null;
                    let supplierName = '';
                    if (supSelectVal === '__new__') {
                        supplierName = (document.getElementById('sale-direct-supplier-new')?.value || '').trim();
                        if (!supplierName) {
                            alert("يرجى إدخال اسم المورد أو اختياره من القائمة.");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            this.isSubmitting = false;
                            return;
                        }
                        const existingSup = allSuppliers.find(s => s.name && s.name.trim().toLowerCase() === supplierName.toLowerCase());
                        if (existingSup) {
                            finalSupplierId = existingSup.id;
                            supplierName = existingSup.name;
                        } else {
                            const newSupCode = await MotoDB.generateNextCode('suppliers', 'S');
                            const newSupObj = {
                                code: newSupCode,
                                name: supplierName,
                                phone: '',
                                nid: '',
                                address: '',
                                type: typeVal === 'تروسيكل' ? 'تروسيكلات' : 'موتوسيكلات',
                                notes: 'تمت إضافته تلقائياً أثناء تسجيل فاتورة بيع'
                            };
                            finalSupplierId = await MotoDB.add('suppliers', newSupObj);
                            newlyCreatedSupId = finalSupplierId;
                            allSuppliers.push({ ...newSupObj, id: finalSupplierId });
                            App.logActivity("إضافة مورد", `إضافة مورد جديد تلقائياً أثناء البيع: ${supplierName} (${newSupCode})`);
                        }
                    } else {
                        finalSupplierId = Number(supSelectVal);
                        const existingSup = allSuppliers.find(s => s.id === finalSupplierId);
                        if (existingSup) supplierName = existingSup.name;
                    }

                    // 2. Resolve Product Model
                    const modelSelectVal = document.getElementById('sale-direct-model-select')?.value;
                    let finalProductId = null;
                    let modelName = '';
                    if (modelSelectVal === '__new__') {
                        modelName = (document.getElementById('sale-direct-model-new')?.value || '').trim();
                        if (!modelName) {
                            alert("يرجى إدخال اسم الموديل أو اختياره من القائمة.");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            this.isSubmitting = false;
                            return;
                        }
                        const existingProd = allProducts.find(p => p.brand && p.brand.trim().toLowerCase() === modelName.toLowerCase());
                        if (existingProd) {
                            finalProductId = existingProd.id;
                            modelName = existingProd.brand;
                            originalPrice = existingProd.price || salePrice;
                        } else {
                            const newProdCode = await MotoDB.generateNextCode('products', 'P');
                            const newProdObj = {
                                code: newProdCode,
                                brand: modelName,
                                year: new Date().getFullYear(),
                                cc: typeVal,
                                price: salePrice,
                                supplierId: finalSupplierId,
                                notes: 'تمت إضافته تلقائياً أثناء تسجيل فاتورة بيع'
                            };
                            finalProductId = await MotoDB.add('products', newProdObj);
                            newlyCreatedProdId = finalProductId;
                            allProducts.push({ ...newProdObj, id: finalProductId });
                            originalPrice = salePrice;
                            App.logActivity("إضافة موديل", `إضافة موديل جديد تلقائياً أثناء البيع: ${modelName} (${newProdCode})`);
                        }
                    } else {
                        finalProductId = Number(modelSelectVal);
                        const existingProd = allProducts.find(p => p.id === finalProductId);
                        if (existingProd) {
                            modelName = existingProd.brand;
                            originalPrice = existingProd.price || salePrice;
                        }
                    }

                    // 3. Create Unit directly
                    const dateStrNow = new Date().toISOString().split('T')[0];
                    const newUnitObj = {
                        productId: finalProductId,
                        chassis: chassis,
                        motor: motor,
                        color: color,
                        cost: cost,
                        branch: branch,
                        status: 'مباع',
                        createdFromSale: true,
                        soldPrice: salePrice,
                        soldDate: dateStrNow,
                        purchaseDate: purchaseDate,
                        supplierId: finalSupplierId
                    };
                    const newUnitId = await MotoDB.add('units', newUnitObj);
                    newlyCreatedUnitId = newUnitId;
                    allUnits.push({ ...newUnitObj, id: newUnitId });
                    App.logActivity("إضافة مكنة", `تسجيل مكنة جديدة برقم شاسيه (${chassis}) وماتور (${motor}) للموديل (${modelName}) أثناء البيع`);

                    if (cost > 0) {
                        const txCode = await MotoDB.generateNextTxCode();
                        const nowObj = new Date();
                        const nowStr = nowObj.getFullYear() + '-' + String(nowObj.getMonth()+1).padStart(2,'0') + '-' + String(nowObj.getDate()).padStart(2,'0') + ' ' + String(nowObj.getHours()).padStart(2,'0') + ':' + String(nowObj.getMinutes()).padStart(2,'0');
                        const txObj = {
                            code: txCode,
                            date: nowStr,
                            type: 'صرف',
                            category: 'شراء بضاعة',
                            amount: cost,
                            description: `شراء مكنة موديل (${modelName}) شاسيه (${chassis}) من المورد (${supplierName}) - فرع (${branch})`,
                            refId: newUnitId,
                            user: currentRole === 'admin' ? 'Admin' : 'موظف مبيعات'
                        };
                        await MotoDB.add('transactions', txObj);
                    }

                    this.selectedUnitId = newUnitId;
                    this.selectedProductId = finalProductId;
                } else {
                    if (!this.selectedUnitId) {
                        alert("يرجى تحديد الدراجة البخارية المراد بيعها واختيار الشاسيه المتاح بالفرع، أو التبديل إلى (كتابة بيانات مكنة وشاسيه جديد مباشرة).");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }
                    const product = allProducts.find(p => p.id === this.selectedProductId);
                    originalPrice = product ? product.price : 0;
                }

                const now = new Date();
                const dateStr = now.toISOString().split('T')[0];

                let invoiceObj = {
                    invoiceNo: await MotoDB.generateNextInvoiceNo(),
                    customerId: finalCustomerId,
                    unitId: this.selectedUnitId,
                    unitCreatedFromSale: this.unitMode === 'direct',
                    type: type,
                    branch: branch,
                    originalPrice: originalPrice,
                    salePrice: salePrice,
                    saleDate: dateStr,
                    notes: document.getElementById('sale-general-notes').value.trim(),
                    traffic_letter_status: 'pending',
                    traffic_letter_date: '',
                    traffic_letter_notes: ''
                };

                if (type === 'installment') {
                    const downpayment = Number(document.getElementById('sale-downpayment').value) || 0;
                    const months = Number(document.getElementById('sale-months').value) || 12;
                    const monthlyPayment = Number(document.getElementById('sale-monthly-payment').value) || 0;
                    const rate = Number(document.getElementById('sale-rate-input') ? document.getElementById('sale-rate-input').value : 0) || 0;
                    const remainingBeforeRate = Math.max(0, salePrice - downpayment);
                    const increaseAmount = remainingBeforeRate * (rate / 100);
                    const remainingAmount = remainingBeforeRate + increaseAmount;
                    const firstInstallmentDate = document.getElementById('sale-first-inst-date').value;

                    if (months > 120) {
                        alert("خطأ: مدة التقسيط كبيرة جداً (أكثر من 10 سنوات / 120 شهراً). يرجى زيادة قيمة القسط الشهري.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }
                    if (months <= 0) {
                        alert("خطأ: مدة التقسيط يجب أن تكون شهراً واحداً على الأقل.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }
                    if (!firstInstallmentDate) {
                        alert("خطأ: يرجى تحديد تاريخ أول قسط قبل حفظ الفاتورة.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    // Get buyer NID for conflict check
                    let buyerNid = '';
                    if (this.customerMode === 'direct') {
                        buyerNid = document.getElementById('sale-new-cust-nid').value.trim();
                    } else {
                        const bCust = allCustomers.find(c => c.id === finalCustomerId);
                        if (bCust) buyerNid = (App.Security.decrypt(bCust.nid) || bCust.nid || '').trim();
                    }

                    // Guarantor 1 validation
                    const g1_name = document.getElementById('g1-name').value.trim();
                    const g1_phone = document.getElementById('g1-phone').value.trim();
                    const g1_nid = document.getElementById('g1-nid').value.trim();
                    const g1_address = document.getElementById('g1-address').value.trim();
                    const g1_rel = document.getElementById('g1-rel').value.trim();
                    
                    if (!g1_name || !g1_phone || !g1_nid || !g1_address) {
                        alert("خطأ: بيانات الضامن الأول إجبارية بالكامل لإتمام البيع بالتقسيط.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    if (g1_nid.length !== 14 || isNaN(g1_nid)) {
                        alert("خطأ: الرقم القومي للضامن الأول يجب أن يكون 14 رقماً صحيحاً لمنع التكرار.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    if (buyerNid && buyerNid === g1_nid) {
                        alert("خطأ: لا يمكن أن يكون المشتري هو نفس الضامن الأول في نفس العملية!");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        this.isSubmitting = false;
                        return;
                    }

                    let g2_name = '';
                    let g2_phone = '';
                    let g2_nid = '';
                    let g2_address = '';
                    let g2_rel = '';

                    if (this.guarantorsCount === 2) {
                        g2_name = document.getElementById('g2-name').value.trim();
                        g2_phone = document.getElementById('g2-phone').value.trim();
                        g2_nid = document.getElementById('g2-nid').value.trim();
                        g2_address = document.getElementById('g2-address').value.trim();
                        g2_rel = document.getElementById('g2-rel').value.trim();

                        if (!g2_name || !g2_phone || !g2_nid || !g2_address) {
                            alert("خطأ: بيانات الضامن الثاني إجبارية بالكامل عند اختيار (2 ضامن).");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            this.isSubmitting = false;
                            return;
                        }

                        if (g2_nid.length !== 14 || isNaN(g2_nid)) {
                            alert("خطأ: الرقم القومي للضامن الثاني يجب أن يكون 14 رقماً صحيحاً لمنع التكرار.");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            this.isSubmitting = false;
                            return;
                        }

                        if (buyerNid && buyerNid === g2_nid) {
                            alert("خطأ: لا يمكن أن يكون المشتري هو نفس الضامن الثاني في نفس العملية!");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            this.isSubmitting = false;
                            return;
                        }

                        if (g1_nid === g2_nid) {
                            alert("خطأ: لا يمكن تكرار نفس الرقم القومي للضامن الأول والضامن الثاني!");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            this.isSubmitting = false;
                            return;
                        }
                    }

                    // Duplicate debt verification check before saving
                    const partiesToCheck = [
                        { role: 'المشتري', nid: buyerNid, name: cust ? cust.name : 'المشتري' },
                        { role: 'الضامن الأول', nid: g1_nid, name: g1_name }
                    ];
                    if (this.guarantorsCount === 2) {
                        partiesToCheck.push({ role: 'الضامن الثاني', nid: g2_nid, name: g2_name });
                    }

                    let debtWarnings = [];
                    for (const party of partiesToCheck) {
                        if (party.nid && party.nid.length === 14) {
                            const report = await App.DuplicateChecker.checkNid(party.nid);
                            if (report && report.hasActiveDebts) {
                                const totalDebt = report.activeRecords.reduce((sum, r) => sum + r.unpaidAmount, 0);
                                debtWarnings.push(`• ${party.role} (${party.name}): لديه (${report.activeCount}) عملية سارية/فعالة متبقي عليها (${totalDebt.toLocaleString('ar-EG')} ج.م)`);
                            }
                        }
                    }

                    if (debtWarnings.length > 0 && !debtWarningsAlreadyConfirmed) {
                        const confirmMsg = `⚠️ تنبيه سجل المعاملات السابقة:\nتم العثور على مديونيات/عمليات سارية فعالة للأطراف التالية:\n\n${debtWarnings.join('\n')}\n\nهل ترغب في الاستمرار وتأكيد حفظ الفاتورة بالرغم من وجود عمليات فعالة سابقة؟`;
                        if (!await BakryDialogs.confirm(confirmMsg)) {
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            this.isSubmitting = false;
                            return;
                        }
                    }

                    const sumOfOthers = monthlyPayment * (months - 1);
                    const lastInstallment = remainingAmount - sumOfOthers;

                    invoiceObj = {
                        ...invoiceObj,
                        downpayment,
                        months,
                        monthlyPayment,
                        remainingAmount,
                        lastInstallment,
                        firstInstallmentDate,
                        g1_name, g1_phone: App.Security.encrypt(g1_phone), g1_nid: App.Security.encrypt(g1_nid), g1_address, g1_rel,
                        g2_name, g2_phone: App.Security.encrypt(g2_phone), g2_nid: App.Security.encrypt(g2_nid), g2_address, g2_rel,
                        guaranteeNotes: document.getElementById('sale-guarantee-notes').value.trim()
                    };
                }

                // 1. Record Invoice
                const saleId = await MotoDB.add('sales', invoiceObj);

                // 2. Mark Unit as Sold (for existing stock unit; direct unit is already created with 'مباع')
                const unit = allUnits.find(u => u.id === this.selectedUnitId);
                if (this.unitMode !== 'direct') {
                    if (unit) {
                        unit.status = 'مباع';
                        unit.soldPrice = salePrice;
                        unit.soldDate = dateStr;
                        await MotoDB.update('units', unit);
                    }
                }

                // 3. record Safe box income
                if (!cust) cust = allCustomers.find(c => c.id === finalCustomerId);
                const prod = allProducts.find(p => p.id === this.selectedProductId);
                
                const amountReceived = type === 'cash' ? salePrice : invoiceObj.downpayment;
                const txCategory = type === 'cash' ? 'مبيعات كاش' : 'مقدم قسط';
                const txCustName = cust ? cust.name : 'المشتري';
                const txDesc = `فاتورة بيع ${type === 'cash' ? 'كاش' : 'قسط'} رقم (${invoiceObj.invoiceNo}) للعميل (${txCustName}) - فرع (${branch}) - شاسيه: ${unit.chassis}`;
                
                const txCode = await MotoDB.generateNextTxCode();
                const nowTime = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

                if (amountReceived > 0) {
                    const txObj = {
                        code: txCode,
                        date: nowTime,
                        type: 'قبض',
                        category: txCategory,
                        amount: amountReceived,
                        description: txDesc,
                        refId: saleId,
                        user: currentRole === 'admin' ? 'Admin' : 'موظف مبيعات',
                        paymentMethod: document.getElementById('sale-payment-method').value || 'نقدي'
                    };
                    await MotoDB.add('transactions', txObj);
                }

                // 4. Generate Installment Schedule (insert each installment individually for reliability)
                if (type === 'installment') {
                    // Parse firstInstallmentDate as base for schedule (avoid timezone shift)
                    const firstInstParts = invoiceObj.firstInstallmentDate.split('-');
                    const baseYear = parseInt(firstInstParts[0]);
                    const baseMonth = parseInt(firstInstParts[1]) - 1; // 0-indexed
                    const baseDay = parseInt(firstInstParts[2]);

                    for (let i = 1; i <= invoiceObj.months; i++) {
                        // i=1 => firstInstallmentDate, i=2 => firstInstallmentDate + 1 month, ...
                        const dueDate = new Date(baseYear, baseMonth + (i - 1), baseDay);
                        const yyyy = dueDate.getFullYear();
                        const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
                        const dd = String(dueDate.getDate()).padStart(2, '0');
                        const dueDateStr = `${yyyy}-${mm}-${dd}`;

                        const instObj = {
                            saleId: saleId,
                            customerId: finalCustomerId,
                            installmentNumber: i,
                            amount: (i === invoiceObj.months) ? (invoiceObj.lastInstallment || invoiceObj.monthlyPayment) : invoiceObj.monthlyPayment,
                            dueDate: dueDateStr,
                            status: 'pending',
                            paidAmount: null,
                            paidDate: null,
                            notes: ''
                        };
                        await MotoDB.add('installments', instObj);
                    }
                }

                // Log Activity & Trigger Auto Backup
                App.logActivity("تسجيل فاتورة بيع", `بيع دراجة بخارية (${prod ? prod.brand : ''}) شاسيه (${unit.chassis}) للعميل (${txCustName}) بمبلغ (${salePrice.toLocaleString('ar-EG')} ج.م)`);
                await App.saveAutoBackup();

                // Sale completed successfully - do not rollback customer
                newlyCreatedCustId = null;

                // Restore button state
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }
                this.isSubmitting = false;

                // Prompt user to print invoice immediately
                if (await BakryDialogs.confirm(`تم تسجيل الفاتورة رقم ${invoiceObj.invoiceNo} بنجاح! هل تريد فتح وطباعة الفاتورة التفصيلية الآن؟`)) {
                    this.switchSubTab('log');
                    this.viewInvoice(saleId);
                } else {
                    this.switchSubTab('log');
                }
                
                // Clear the form fields after successful submission
                this.resetForm();

            } catch (err) {
                // Rollback newly created entities if invoice failed
                if (newlyCreatedUnitId) {
                    try {
                        await MotoDB.delete('units', newlyCreatedUnitId);
                        const uIdx = allUnits.findIndex(u => u.id === newlyCreatedUnitId);
                        if (uIdx !== -1) allUnits.splice(uIdx, 1);
                    } catch (delU) { console.error("Rollback unit failed:", delU); }
                }
                if (newlyCreatedProdId) {
                    try {
                        await MotoDB.delete('products', newlyCreatedProdId);
                        const pIdx = allProducts.findIndex(p => p.id === newlyCreatedProdId);
                        if (pIdx !== -1) allProducts.splice(pIdx, 1);
                    } catch (delP) { console.error("Rollback prod failed:", delP); }
                }
                if (newlyCreatedSupId) {
                    try {
                        await MotoDB.delete('suppliers', newlyCreatedSupId);
                        const sIdx = allSuppliers.findIndex(s => s.id === newlyCreatedSupId);
                        if (sIdx !== -1) allSuppliers.splice(sIdx, 1);
                    } catch (delS) { console.error("Rollback sup failed:", delS); }
                }
                if (newlyCreatedCustId) {
                    try {
                        await MotoDB.delete('customers', newlyCreatedCustId);
                        const cIdx = allCustomers.findIndex(c => c.id === newlyCreatedCustId);
                        if (cIdx !== -1) allCustomers.splice(cIdx, 1);
                    } catch (delErr) {
                        console.error("Rollback customer failed:", delErr);
                    }
                }

                // Restore button state on error
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }
                this.isSubmitting = false;
                console.error("Invoice submission error:", err);
                alert("حدث خطأ أثناء حفظ الفاتورة: " + (err && err.message ? err.message : err));
            }
        },

        // Sales Log Table Search
        searchSalesLog: async function() {
            const term = document.getElementById('sales-log-search-term').value.trim().toLowerCase();
            const filterBranch = document.getElementById('sales-log-filter-branch').value;
            
            const tableBody = document.getElementById('sales-log-table-body');
            tableBody.innerHTML = '';

            const sales = await MotoDB.getAll('sales');
            let filtered = [...sales];

            if (filterBranch !== 'all') {
                filtered = filtered.filter(s => s.branch === filterBranch);
            }

            if (term) {
                filtered = filtered.filter(s => {
                    const cust = allCustomers.find(c => c.id === s.customerId);
                    const custName = cust ? cust.name.toLowerCase() : '';
                    const unit = allUnits.find(u => u.id === s.unitId);
                    const chassis = unit ? unit.chassis.toLowerCase() : '';
                    
                    return s.invoiceNo.toLowerCase().includes(term) ||
                           custName.includes(term) ||
                           s.branch.toLowerCase().includes(term) ||
                           chassis.includes(term);
                });
            }

            if (filtered.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">لا يوجد فواتير بيع مسجلة مطابقة للبحث.</td></tr>`;
                return;
            }

            // Sort newest first
            filtered.sort((a, b) => b.id - a.id);

            filtered.forEach(s => {
                const cust = allCustomers.find(c => c.id === s.customerId);
                const unit = allUnits.find(u => u.id === s.unitId);
                const prod = unit ? allProducts.find(p => p.id === unit.productId) : null;
                
                const custName = cust ? cust.name : 'عميل غير مسجل';
                const prodBrand = prod ? prod.brand : '-';
                const chassisNo = unit ? unit.chassis : '-';
                const tr = document.createElement('tr');
                
                tr.innerHTML = `
                    <td><strong>${s.invoiceNo}</strong></td>
                    <td>${s.saleDate}</td>
                    <td>${custName}</td>
                    <td><span class="text-xs">${s.branch || '-'}</span></td>
                    <td>${prodBrand}</td>
                    <td><span class="text-xs text-cyan font-bold">${chassisNo}</span></td>
                    <td><span class="badge-status ${s.type === 'cash' ? 'cyan' : 'success'}">${s.type === 'cash' ? 'كاش نقدي' : 'تقسيط قسط'}</span></td>
                    <td class="font-bold text-orange">${s.salePrice.toLocaleString('ar-EG')} ج.م</td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-icon-only btn-edit-row allow-acc-edit" onclick="App.Sales.openEditSaleModal(${s.id})" title="تعديل الفاتورة" data-permission="edit">
                                <i class="fa-solid fa-edit text-orange"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Sales.viewMiniInvoice(${s.id})" title="طباعة الفاتورة المصغرة">
                                <i class="fa-solid fa-receipt text-cyan"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Sales.viewInvoice(${s.id})" title="عرض الفاتورة التفصيلية والطباعة">
                                <i class="fa-solid fa-file-invoice text-orange"></i>
                            </button>
                            <button class="btn btn-danger btn-icon-only btn-delete-row allow-acc-delete" onclick="App.Sales.deleteInvoice(${s.id})" title="حذف الفاتورة بالكامل" data-permission="write">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        },

        deleteInvoice: async function(saleId) {
            if (currentRole !== 'admin' && currentRole !== 'accounting') {
                alert("خطأ: غير مسموح بحذف الفواتير إلا لمدير النظام أو المحاسب فقط.");
                return;
            }

            if (!await BakryDialogs.confirm("هل أنت متأكد من رغبتك في حذف هذه الفاتورة بالكامل؟\nسيؤدي ذلك إلى إعادة الدراجة للمخزن وحذف كافة الأقساط والمعاملات المرتبطة بها.")) {
                return;
            }

            try {
                const sale = await MotoDB.getById('sales', saleId);
                if (!sale) {
                    alert("الفاتورة غير موجودة.");
                    return;
                }

                // 1. Remove a unit that was created only as part of this direct sale.
                // Ordinary pre-existing stock is simply returned to availability.
                let removedSaleUnitId = null;
                if (sale.unitId) {
                    const unit = await MotoDB.getById('units', sale.unitId);
                    if (unit) {
                        if (sale.unitCreatedFromSale === true || unit.createdFromSale === true) {
                            await MotoDB.delete('units', unit.id);
                            removedSaleUnitId = Number(unit.id);
                            allUnits = allUnits.filter(u => Number(u.id) !== Number(unit.id));
                        } else {
                            unit.status = 'متاح';
                            unit.soldPrice = null;
                            unit.soldDate = null;
                            await MotoDB.update('units', unit);
                            const cachedUnit = allUnits.find(u => Number(u.id) === Number(unit.id));
                            if (cachedUnit) Object.assign(cachedUnit, unit);
                        }
                    }
                }

                // 2. Delete associated installments
                const installments = await MotoDB.getAll('installments');
                const saleInsts = installments.filter(i => i.saleId === saleId);
                const saleInstIds = saleInsts.map(i => i.id);
                for (let inst of saleInsts) {
                    await MotoDB.delete('installments', inst.id);
                }

                // 3. Delete associated transactions
                const txs = await MotoDB.getAll('transactions');
                for (let tx of txs) {
                    // Delete invoice transaction (downpayment or cash sale)
                    if ((tx.category === 'مبيعات كاش' || tx.category === 'مقدم قسط') && tx.refId === saleId) {
                        await MotoDB.delete('transactions', tx.id);
                    }
                    // Delete installment transactions
                    if (tx.category === 'قسط شهري' && saleInstIds.includes(tx.refId)) {
                        await MotoDB.delete('transactions', tx.id);
                    }
                    // Remove the acquisition cost linked to a direct-sale-only unit.
                    if (removedSaleUnitId !== null && tx.category === 'شراء بضاعة' && Number(tx.refId) === removedSaleUnitId) {
                        await MotoDB.delete('transactions', tx.id);
                    }
                }

                // 4. Delete the sale itself
                await MotoDB.delete('sales', saleId);

                App.logActivity("حذف فاتورة بيع", `حذف الفاتورة رقم (${sale.invoiceNo}) بالكامل وإلغاء كافة متعلقاتها${removedSaleUnitId !== null ? ' وحذف قطعة البيع المباشر المرتبطة بها' : ' وإرجاع الدراجة للمخزن'}`);
                await App.saveAutoBackup();

                alert(removedSaleUnitId !== null
                    ? "تم حذف الفاتورة وإلغاء متعلقاتها وحذف أرقام الشاسيه والموتور الخاصة بقطعة البيع المباشر."
                    : "تم حذف الفاتورة وإلغاء كافة متعلقاتها بنجاح وإرجاع الدراجة للمخزون.");
                App.switchTab('sales');
            } catch (err) {
                alert("فشل الحذف: " + err);
            }
        },

        // Detailed Printable Invoice View
        viewInvoice: async function(saleId) {
            const sale = await MotoDB.getById('sales', saleId);
            if (!sale) return;

            const cust = allCustomers.find(c => c.id === sale.customerId);
            const unit = allUnits.find(u => u.id === sale.unitId);
            const prod = unit ? allProducts.find(p => p.id === unit.productId) : null;
            const installments = await MotoDB.getAll('installments');
            const saleInsts = installments.filter(i => i.saleId === saleId).sort((a,b) => a.installmentNumber - b.installmentNumber);

            const custPhone = cust ? (App.Security.decrypt(cust.phone) || cust.phone || '-') : '-';
            const custNid = cust ? (App.Security.decrypt(cust.nid) || cust.nid || '-') : '-';
            const g1Phone = sale.g1_phone ? (App.Security.decrypt(sale.g1_phone) || sale.g1_phone) : '-';
            const g1Nid = sale.g1_nid ? (App.Security.decrypt(sale.g1_nid) || sale.g1_nid) : '-';
            const g2Phone = sale.g2_phone ? (App.Security.decrypt(sale.g2_phone) || sale.g2_phone) : '-';
            const g2Nid = sale.g2_nid ? (App.Security.decrypt(sale.g2_nid) || sale.g2_nid) : '-';

            // Guarantor details block
            let guarantorBlockHtml = '';
            if (sale.type === 'installment') {
                const hasG2 = !!(sale.g2_name || (sale.g2_nid && g2Nid !== '-' && g2Nid !== ''));
                guarantorBlockHtml = `
                    <div style="background: #e2e8f0; color: #0f172a; font-weight: 800; text-align: center; padding: 5px; border-radius: 4px; font-size: 12px; margin-bottom: 8px;">
                        ${hasG2 ? 'بيانات الضامنين وكفالة التعاقد' : 'بيانات الضامن وكفالة التعاقد'}
                    </div>
                    <div style="display: grid; grid-template-columns: ${hasG2 ? '1fr 1fr' : '1fr'}; gap: 10px; margin-bottom: 8px; font-size: 11px;">
                        <div style="background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                            <strong style="color: #2563eb; font-size: 12px; display: block; margin-bottom: 4px;">${hasG2 ? 'الضامن الأول الكفيل' : 'الضامن الكفيل'}</strong>
                            <p style="margin: 2px 0;">الاسم: <strong>${sale.g1_name || '-'}</strong></p>
                            <p style="margin: 2px 0;">الموبايل: <strong>${g1Phone}</strong> | البطاقة: <strong style="font-family: monospace;">${g1Nid}</strong></p>
                            <p style="margin: 2px 0;">الصلة: <strong>${sale.g1_rel || 'غير متوفر'}</strong></p>
                            <p style="margin: 2px 0;">السكن: <strong>${sale.g1_address || '-'}</strong></p>
                        </div>
                        ${hasG2 ? `
                        <div style="background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                            <strong style="color: #2563eb; font-size: 12px; display: block; margin-bottom: 4px;">الضامن الثاني الكفيل</strong>
                            <p style="margin: 2px 0;">الاسم: <strong>${sale.g2_name || '-'}</strong></p>
                            <p style="margin: 2px 0;">الموبايل: <strong>${g2Phone}</strong> | البطاقة: <strong style="font-family: monospace;">${g2Nid}</strong></p>
                            <p style="margin: 2px 0;">الصلة: <strong>${sale.g2_rel || 'غير متوفر'}</strong></p>
                            <p style="margin: 2px 0;">السكن: <strong>${sale.g2_address || '-'}</strong></p>
                        </div>
                        ` : ''}
                    </div>
                    <div style="font-size: 11px; background: #f8fafc; padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 8px;">
                        <strong>شروط وبنود الضمان القانونية:</strong> ${sale.guaranteeNotes || 'وقع العميل والضامنين وصولات الأمانة لإقرار دفع الأقساط.'}
                    </div>
                `;
            }

            let printStyle = document.getElementById('receipt-page-style');
            if (!printStyle) {
                printStyle = document.createElement('style');
                printStyle.id = 'receipt-page-style';
                document.head.appendChild(printStyle);
            }
            printStyle.innerHTML = '@media print { @page { size: A4 portrait; margin: 5mm 8mm 5mm 8mm; } }';

            const printBody = document.getElementById('receipt-print-body');
            printBody.innerHTML = `
                <div class="receipt-wrapper" style="background: #ffffff; color: #0f172a; padding: 24px 28px; border-radius: 8px; box-sizing: border-box; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; font-size: 12px; line-height: 1.4;">
                    <!-- Header -->
                    <div class="receipt-header" style="text-align: center; margin-bottom: 12px;">
                        ${BRANDING.logo ? `<img src="${BRANDING.logo}" style="max-height: 60px; max-width: 130px; object-fit: contain; margin: 0 auto 6px auto; display: block;">` : '<div style="font-size: 28px; margin-bottom: 4px;">🏍️</div>'}
                        <h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 800; color: #0f172a;">${BRANDING.name || 'معرض MotoMax للدراجات النارية'}</h2>
                        <p style="margin: 0 0 2px 0; font-size: 11.5px; color: #475569;">فرع البيع: <strong>${sale.branch || 'الفرع الرئيسي'}</strong></p>
                        <p style="margin: 0 0 8px 0; font-size: 11.5px; color: #475569;">هاتف المعرض: <strong>${BRANDING.phone || '-'}</strong> ${BRANDING.address ? `| <strong>${BRANDING.address}</strong>` : ''}</p>
                        <div style="border-top: 1.5px dashed #cbd5e1; margin: 8px 0 10px 0;"></div>
                        <h3 style="margin: 0; font-weight: 800; font-size: 17px; color: #0f172a;">فاتورة بيع تفصيلية رقم (${sale.invoiceNo})</h3>
                    </div>

                    <!-- Customer & Invoice Details Box -->
                    <div style="border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; padding: 10px 16px; margin-bottom: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 12px;">
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">تاريخ الفاتورة:</span> <strong style="color: #0f172a;">${sale.saleDate}</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">الفرع المصدر:</span> <strong style="color: #0f172a;">${sale.branch || '-'}</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">اسم المشتري:</span> <strong style="color: #0f172a;">${cust ? cust.name : 'عميل غير مسجل'}</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">طريقة السداد:</span> <strong style="color: #0f172a;">${sale.type === 'cash' ? 'نقدي (كاش)' : 'بيع بالتقسيط والضمان'}</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">هاتف العميل:</span> <strong style="color: #0f172a;">${custPhone}</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">بطاقة الرقم القومي:</span> <strong style="font-family: monospace; color: #0f172a;">${custNid}</strong></div>
                            ${cust && cust.address ? `
                            <div style="display: flex; gap: 6px; align-items: baseline; grid-column: span 2;"><span style="color: #64748b; white-space: nowrap;">محل الإقامة:</span> <strong style="color: #0f172a;">${cust.address}</strong></div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Motorcycle Details Table -->
                    <div style="background: #e2e8f0; color: #0f172a; font-weight: 800; text-align: center; padding: 5px; border-radius: 4px; font-size: 12px; margin-bottom: 6px;">
                        الدراجة المباعة وتفاصيل المركبة
                    </div>
                    <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 11px; margin-bottom: 12px; border: 1px solid #cbd5e1;">
                        <thead>
                            <tr style="background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1; color: #334155; font-weight: bold;">
                                <th style="padding: 6px 4px; border: 1px solid #cbd5e1;">نوع وماركة الدراجة</th>
                                <th style="padding: 6px 4px; border: 1px solid #cbd5e1;">سنة الصنع</th>
                                <th style="padding: 6px 4px; border: 1px solid #cbd5e1;">السعة</th>
                                <th style="padding: 6px 4px; border: 1px solid #cbd5e1;">رقم الشاسيه (Chassis)</th>
                                <th style="padding: 6px 4px; border: 1px solid #cbd5e1;">رقم الموتور (Engine)</th>
                                <th style="padding: 6px 4px; border: 1px solid #cbd5e1;">اللون الفعلي</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 8px 4px; font-weight: bold; border: 1px solid #cbd5e1;">${prod ? prod.brand : 'موتوسيكل'}</td>
                                <td style="padding: 8px 4px; border: 1px solid #cbd5e1;">${prod ? prod.year : '-'}</td>
                                <td style="padding: 8px 4px; border: 1px solid #cbd5e1;">${prod ? prod.cc : '-'}</td>
                                <td style="padding: 8px 4px; font-family: monospace; font-weight: bold; color: #1e40af; border: 1px solid #cbd5e1;">${unit ? unit.chassis : '-'}</td>
                                <td style="padding: 8px 4px; font-family: monospace; border: 1px solid #cbd5e1;">${unit ? unit.motor : '-'}</td>
                                <td style="padding: 8px 4px; border: 1px solid #cbd5e1;">${unit ? unit.color : '-'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Financial Summary Matrix -->
                    <div style="border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; padding: 10px 16px; margin-bottom: 12px;">
                        ${sale.type === 'installment' ? `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 12px;">
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">سعر البيع الإجمالي:</span> <strong style="color: #0f172a;">${sale.salePrice.toLocaleString('ar-EG')} ج.م</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">قيمة القسط الشهري:</span> <strong style="color: #2563eb; font-size: 13.5px;">${sale.monthlyPayment.toLocaleString('ar-EG')} ج.م</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">المقدم المسدد:</span> <strong style="color: #0f172a;">${sale.downpayment.toLocaleString('ar-EG')} ج.م</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">عدد الأقساط المستحقة:</span> <strong style="color: #0f172a;">${sale.months} أقساط</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">تاريخ أول قسط:</span> <strong style="color: #0f172a;">${saleInsts[0] ? saleInsts[0].dueDate : '-'}</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">تاريخ آخر قسط:</span> <strong style="color: #0f172a;">${saleInsts[saleInsts.length - 1] ? saleInsts[saleInsts.length - 1].dueDate : '-'}</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline; grid-column: span 2; border-top: 1.5px solid #cbd5e1; padding-top: 6px; margin-top: 2px;">
                                <span style="font-weight: 800; font-size: 13px; color: #0f172a; white-space: nowrap;">المتبقي الكلي بالأقساط:</span>
                                <strong style="font-size: 14.5px; font-weight: 800; color: #0f172a;">${sale.remainingAmount.toLocaleString('ar-EG')} ج.م</strong>
                            </div>
                        </div>
                        ` : `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 12px;">
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">سعر البيع الإجمالي:</span> <strong style="color: #0f172a;">${sale.salePrice.toLocaleString('ar-EG')} ج.م</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline;"><span style="color: #64748b; white-space: nowrap;">حالة السداد:</span> <strong style="color: #16a34a;">مسدد بالكامل نقداً (كاش)</strong></div>
                            <div style="display: flex; gap: 6px; align-items: baseline; grid-column: span 2; border-top: 1.5px solid #cbd5e1; padding-top: 6px; margin-top: 2px;">
                                <span style="font-weight: 800; font-size: 13px; color: #0f172a; white-space: nowrap;">إجمالي المبلغ المدفوع:</span>
                                <strong style="font-size: 14.5px; font-weight: 800; color: #16a34a;">${sale.salePrice.toLocaleString('ar-EG')} ج.م</strong>
                            </div>
                        </div>
                        `}
                    </div>

                    <!-- Guarantors Block -->
                    ${guarantorBlockHtml}

                    <!-- Legal Terms & Clauses -->
                    <div style="font-size: 10.5px; text-align: justify; margin: 10px 0 8px 0; line-height: 1.5; border-top: 1.5px dashed #cbd5e1; padding-top: 8px; color: #1e293b;">
                        ${sale.type === 'installment' ? `
                        <div style="text-align: center; font-weight: bold; margin-bottom: 2px; color: #0f172a;">أولاً:</div>
                        <div style="text-align: center; margin-bottom: 6px;">يلتزم المشتري بدفع الأقساط في مواعيدها، وفي حالة التأخير أو عدم السداد في مواعيد استحقاق الأقساط يلتزم كلا من الضامن الأول والثاني بالدفع بدل المشتري، وفي حالة الامتناع عن السداد سيتم اتخاذ الإجراءات القانونية اللازمة ضماناً لحق البائع.</div>
                        <div style="text-align: center; font-weight: bold; margin-bottom: 2px; color: #0f172a;">ثانياً:<br>إقرار بالاستلام:</div>
                        <div style="text-align: center;">يقر المشتري بأنه استلم المنتج موضوع هذه الفاتورة استلاماً فعلياً كاملاً، وأنه قام بفحصه ومعاينته بنفسه وتأكد من سلامته وصلاحيته وخلوه من أي عيوب ظاهرة أو نقص في مكوناته وقت الاستلام.</div>
                        ` : `
                        <div style="text-align: center; font-weight: bold; margin-bottom: 2px; color: #0f172a;">إقرار بالاستلام والمعاينة:</div>
                        <div style="text-align: center;">يقر المشتري بأنه استلم المنتج موضوع هذه الفاتورة استلاماً فعلياً كاملاً، وأنه قام بفحصه ومعاينته بنفسه وتأكد من سلامته وصلاحيته وخلوه من أي عيوب ظاهرة أو نقص في مكوناته وقت الاستلام، وسدد كامل القيمة نقداً.</div>
                        `}
                    </div>

                    <!-- Signatures -->
                    <div style="margin-top: 12px; display: flex; justify-content: space-around; text-align: center; font-size: 11.5px; border-top: 1px solid #cbd5e1; padding-top: 8px;">
                        <div style="width: 28%;">
                            <span style="font-weight: bold; color: #0f172a;">العميل المشتري</span>
                            <div style="border-top: 1.5px solid #64748b; margin-top: 16px; padding-top: 3px; color: #475569; font-size: 10.5px;">توقيع المشتري</div>
                        </div>
                        ${sale.type === 'installment' ? `
                        <div style="width: 28%;">
                            <span style="font-weight: bold; color: #0f172a;">الضامن الأول</span>
                            <div style="border-top: 1.5px solid #64748b; margin-top: 16px; padding-top: 3px; color: #475569; font-size: 10.5px;">توقيع الضامن الأول</div>
                        </div>
                        <div style="width: 28%;">
                            <span style="font-weight: bold; color: #0f172a;">الضامن الثاني</span>
                            <div style="border-top: 1.5px solid #64748b; margin-top: 16px; padding-top: 3px; color: #475569; font-size: 10.5px;">توقيع الضامن الثاني</div>
                        </div>
                        ` : `
                        <div style="width: 28%;">
                            <span style="font-weight: bold; color: #0f172a;">إدارة المعرض / الحسابات</span>
                            <div style="border-top: 1.5px solid #64748b; margin-top: 16px; padding-top: 3px; color: #475569; font-size: 10.5px;">التوقيع والختم</div>
                        </div>
                        `}
                    </div>

                    <!-- Footer Note -->
                    <div style="text-align: center; margin-top: 12px; font-size: 9.5px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 5px; font-family: 'Cairo', sans-serif;">
                        برمجة وتطوير: Hossam Hamaki | v3.2.0
                    </div>
                </div>
            `;

            document.getElementById('receipt-modal-title-lbl').textContent = `عرض وطباعة فاتورة المبيعات التفصيلية (${sale.invoiceNo})`;
            document.getElementById('receipt-print-modal').classList.remove('hidden');
        },

        // Mini invoice print view
        viewMiniInvoice: async function(saleId) {
            const sale = await MotoDB.getById('sales', saleId);
            if (!sale) return;

            const cust = allCustomers.find(c => c.id === sale.customerId);
            const unit = allUnits.find(u => u.id === sale.unitId);
            const prod = unit ? allProducts.find(p => p.id === unit.productId) : null;

            let printStyle = document.getElementById('receipt-page-style');
            if (!printStyle) {
                printStyle = document.createElement('style');
                printStyle.id = 'receipt-page-style';
                document.head.appendChild(printStyle);
            }
            printStyle.innerHTML = '@media print { @page { size: A4 portrait; margin: 5mm 8mm 5mm 8mm; } }';

            const printBody = document.getElementById('receipt-print-body');
            
            printBody.innerHTML = `
                <div class="receipt-wrapper" style="max-width: 500px; margin: 0 auto; padding: 20px; font-size: 13px;">
                    <div class="receipt-header" style="text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 10px; margin-bottom: 15px;">
                        ${BRANDING.logo ? `<img src="${BRANDING.logo}" style="max-height: 40px; max-width: 120px; object-fit: contain; margin-bottom: 5px;">` : '🏍️'}
                        <h2 style="font-size: 18px; margin: 0;">${BRANDING.name || 'معرض MotoMax'}</h2>
                        <p style="font-size: 11px; margin: 2px 0;">فرع: ${sale.branch || 'الرئيسي'} | هاتف: ${BRANDING.phone || '-'}</p>
                        <h3 style="font-size: 15px; font-weight: 800; color: #111; margin-top: 10px;">فاتورة بيع مصغرة رقم (${sale.invoiceNo})</h3>
                    </div>

                    <div style="background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 5px 0; color: var(--primary); font-size: 12px;">بيانات العميل المشتري:</h4>
                        <div>الاسم: <strong>${cust ? cust.name : 'غير مسجل'}</strong></div>
                        <div>الهاتف: <strong>${cust ? cust.phone : '-'}</strong></div>
                    </div>

                    <div style="background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 5px 0; color: var(--primary); font-size: 12px;">تفاصيل المركبة المباعة:</h4>
                        <div>الماركة/النوع: <strong>${prod ? prod.brand : 'موتوسيكل'} (${prod ? prod.year : '-'})</strong></div>
                        <div>السعة: <strong>${prod ? prod.cc : '-'} CC</strong></div>
                        <div>الشاسيه: <strong style="font-family: monospace; color: #0088cc;">${unit ? unit.chassis : '-'}</strong></div>
                        <div>الموتور: <strong style="font-family: monospace;">${unit ? unit.motor : '-'}</strong></div>
                        <div>اللون: <strong>${unit ? unit.color : '-'}</strong></div>
                    </div>

                    <div style="background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 5px 0; color: var(--primary); font-size: 12px;">تفاصيل السداد والحساب:</h4>
                        <table style="width: 100%; font-size: 12px; line-height: 1.8;">
                            <tr>
                                <td>سعر البيع بالفاتورة:</td>
                                <td style="text-align: left;"><strong>${sale.salePrice.toLocaleString('ar-EG')} ج.م</strong></td>
                            </tr>
                            ${sale.type === 'installment' ? `
                            <tr>
                                <td>المقدم المسدد:</td>
                                <td style="text-align: left;"><strong>${sale.downpayment.toLocaleString('ar-EG')} ج.م</strong></td>
                            </tr>
                            <tr>
                                <td>المتبقي بالأقساط:</td>
                                <td style="text-align: left;"><strong>${sale.remainingAmount.toLocaleString('ar-EG')} ج.م</strong></td>
                            </tr>
                            <tr>
                                <td>قيمة القسط الشهري:</td>
                                <td style="text-align: left; color: var(--primary);"><strong>${sale.monthlyPayment.toLocaleString('ar-EG')} ج.م</strong></td>
                            </tr>
                            <tr>
                                <td>عدد الأقساط الكلية:</td>
                                <td style="text-align: left;"><strong>${sale.months} أقساط</strong></td>
                            </tr>
                            ` : `
                            <tr>
                                <td>طريقة السداد:</td>
                                <td style="text-align: left;"><strong>نقدي كاش (مدفوع بالكامل)</strong></td>
                            </tr>
                            `}
                        </table>
                    </div>

                    <div class="receipt-signatures" style="margin-top: 30px; display: flex; justify-content: space-between; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                        <div class="signature-box" style="width: 30%;">
                            <span>توقيع المشتري</span>
                            <div class="signature-line" style="margin-top: 25px;">إقرار بالاستلام والالتزام</div>
                        </div>
                        ${sale.type === 'installment' ? `
                        <div class="signature-box" style="width: 30%;">
                            <span>الضامن الأول</span>
                            <div class="signature-line" style="margin-top: 25px;">توقيع الضامن الأول</div>
                        </div>
                        <div class="signature-box" style="width: 30%;">
                            <span>الضامن الثاني</span>
                            <div class="signature-line" style="margin-top: 25px;">توقيع الضامن الثاني</div>
                        </div>
                        ` : `
                        <div class="signature-box" style="width: 30%;">
                            <span>مسؤول المعرض</span>
                            <div class="signature-line" style="margin-top: 25px;">المبيعات والحسابات</div>
                        </div>
                        `}
                    </div>
                    <div style="text-align: center; margin-top: 25px; font-size: 10px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 8px; font-family: 'Cairo', sans-serif;">
                        برمجة وتطوير: Hossam Hamaki | v3.2.0
                    </div>
                </div>
            `;

            document.getElementById('receipt-modal-title-lbl').textContent = `عرض وطباعة فاتورة المبيعات المصغرة (${sale.invoiceNo})`;
            document.getElementById('receipt-print-modal').classList.remove('hidden');
        },

        // Edit sales invoice modal (Admin only)
        openEditSaleModal: async function(saleId) {
            const sale = await MotoDB.getById('sales', saleId);
            if (!sale) return;

            document.getElementById('edit-sale-id').value = sale.id;
            document.getElementById('edit-sale-invoice-no').value = sale.invoiceNo;
            document.getElementById('edit-sale-date').value = sale.saleDate;
            document.getElementById('edit-sale-price').value = sale.salePrice;
            document.getElementById('edit-sale-type-lbl').value = sale.type === 'cash' ? 'نقدي (كاش)' : 'تقسيط (أقساط)';
            const branchLbl = document.getElementById('edit-sale-branch-lbl');
            if (branchLbl) branchLbl.value = sale.branch || '-';
            document.getElementById('edit-sale-general-notes').value = sale.notes || '';

            // Populate Products dropdown
            const currentUnit = allUnits.find(u => u.id === sale.unitId);
            const currentProductId = currentUnit ? currentUnit.productId : (allProducts.length > 0 ? allProducts[0].id : null);

            const prodSelect = document.getElementById('edit-sale-product-select');
            if (prodSelect) {
                prodSelect.innerHTML = '<option value="">-- اختر موديل المنتج / الدراجة --</option>';
                allProducts.forEach(p => {
                    prodSelect.innerHTML += `<option value="${p.id}" ${p.id === currentProductId ? 'selected' : ''}>${p.brand} (${p.year}) - ${p.cc}</option>`;
                });
            }

            this.populateEditSaleUnits(currentProductId, sale.unitId, sale.branch);

            const installmentFields = document.getElementById('edit-sale-installment-fields');
            if (sale.type === 'installment') {
                installmentFields.style.display = 'grid';
                document.getElementById('edit-sale-downpayment').value = sale.downpayment;
                document.getElementById('edit-sale-months').value = sale.months;
                document.getElementById('edit-sale-monthly').value = sale.monthlyPayment;
                document.getElementById('edit-sale-guarantee-notes').value = sale.guaranteeNotes || '';

                document.getElementById('edit-sale-g1-name').value = sale.g1_name || '';
                document.getElementById('edit-sale-g1-phone').value = App.Security.decrypt(sale.g1_phone) || '';
                document.getElementById('edit-sale-g1-nid').value = App.Security.decrypt(sale.g1_nid) || '';
                document.getElementById('edit-sale-g1-rel').value = sale.g1_rel || '';
                document.getElementById('edit-sale-g1-address').value = sale.g1_address || '';

                const decG2Nid = App.Security.decrypt(sale.g2_nid) || sale.g2_nid || '';
                const hasG2 = !!(sale.g2_name || (decG2Nid && decG2Nid !== '-'));

                document.getElementById('edit-sale-g2-name').value = sale.g2_name || '';
                document.getElementById('edit-sale-g2-phone').value = App.Security.decrypt(sale.g2_phone) || '';
                document.getElementById('edit-sale-g2-nid').value = decG2Nid === '-' ? '' : decG2Nid;
                document.getElementById('edit-sale-g2-rel').value = sale.g2_rel || '';
                document.getElementById('edit-sale-g2-address').value = sale.g2_address || '';

                if (hasG2) {
                    const r2 = document.getElementById('edit-guar-count-2');
                    if (r2) r2.checked = true;
                    this.toggleEditGuarantorsCount(2);
                } else {
                    const r1 = document.getElementById('edit-guar-count-1');
                    if (r1) r1.checked = true;
                    this.toggleEditGuarantorsCount(1);
                }

                this.onEditGuarNidInput(1);
                if (hasG2) this.onEditGuarNidInput(2);

                // Get first installment date from sale or installments
                let firstInstDate = sale.firstInstallmentDate;
                if (!firstInstDate) {
                    const installments = await MotoDB.getAll('installments');
                    const saleInsts = installments.filter(inst => inst.saleId === sale.id);
                    if (saleInsts.length > 0) {
                        saleInsts.sort((a, b) => a.installmentNumber - b.installmentNumber);
                        firstInstDate = saleInsts[0].dueDate;
                    } else {
                        // Fallback to 1 month after sale date
                        const sDate = new Date(sale.saleDate);
                        const fallbackDate = new Date(sDate.getFullYear(), sDate.getMonth() + 1, sDate.getDate());
                        const yyyy = fallbackDate.getFullYear();
                        const mm = String(fallbackDate.getMonth() + 1).padStart(2, '0');
                        const dd = String(fallbackDate.getDate()).padStart(2, '0');
                        firstInstDate = `${yyyy}-${mm}-${dd}`;
                    }
                }
                document.getElementById('edit-sale-first-inst-date').value = firstInstDate;

                this.onEditSalePriceChange();
            } else {
                installmentFields.style.display = 'none';
            }

            document.getElementById('edit-sale-modal').classList.remove('hidden');
        },

        populateEditSaleUnits: function(productId, currentSaleUnitId, saleBranch) {
            const unitSelect = document.getElementById('edit-sale-unit-select');
            if (!unitSelect) return;

            unitSelect.innerHTML = '<option value="">-- اختر رقم الشاسيه والموتور المتاحين --</option>';

            if (!productId) {
                this.onEditSaleUnitChange(null);
                return;
            }

            const pId = Number(productId);
            const matchingUnits = allUnits.filter(u => {
                if (u.productId !== pId) return false;
                if (currentSaleUnitId && u.id === currentSaleUnitId) return true;
                const branchMatch = !saleBranch || u.branch === saleBranch;
                return u.status === 'متاح' && branchMatch;
            });

            if (matchingUnits.length === 0) {
                unitSelect.innerHTML = '<option value="">⚠️ لا توجد شاسيهات متاحة لهذا الموديل بالفرع!</option>';
                this.onEditSaleUnitChange(null);
                return;
            }

            let hasSelected = false;
            matchingUnits.forEach(u => {
                const isCurrent = currentSaleUnitId && u.id === currentSaleUnitId;
                const isSelected = isCurrent || (!currentSaleUnitId && !hasSelected);
                if (isSelected) hasSelected = true;
                const tag = isCurrent ? ' (الحالي للفاتورة)' : ' (متاح)';
                unitSelect.innerHTML += `<option value="${u.id}" ${isSelected ? 'selected' : ''}>شاسيه: ${u.chassis} | موتور: ${u.motor || '-'} | لون: ${u.color || '-'}${tag}</option>`;
            });

            const activeUnitId = unitSelect.value ? Number(unitSelect.value) : null;
            this.onEditSaleUnitChange(activeUnitId);
        },

        onEditSaleProductChange: async function(prodId) {
            const saleId = Number(document.getElementById('edit-sale-id').value);
            let currentUnitId = null;
            let branch = '';
            
            const sale = await MotoDB.getById('sales', saleId);
            if (sale) {
                branch = sale.branch;
                const curUnit = allUnits.find(u => u.id === sale.unitId);
                if (curUnit && curUnit.productId === Number(prodId)) {
                    currentUnitId = curUnit.id;
                }
            } else {
                const branchLbl = document.getElementById('edit-sale-branch-lbl');
                if (branchLbl) branch = branchLbl.value;
            }

            this.populateEditSaleUnits(prodId, currentUnitId, branch);
        },

        onEditSaleUnitChange: function(unitId) {
            const detailsDiv = document.getElementById('edit-sale-unit-details');
            if (!detailsDiv) return;

            if (!unitId) {
                detailsDiv.innerHTML = '<span class="text-muted" style="font-size: 11px;">لم يتم تحديد شاسيه بعد.</span>';
                return;
            }

            const uId = Number(unitId);
            const unit = allUnits.find(u => u.id === uId);
            if (!unit) {
                detailsDiv.innerHTML = '<span class="text-muted" style="font-size: 11px;">بيانات القطعة غير متوفرة.</span>';
                return;
            }

            const chassisInput = document.getElementById('edit-sale-chassis');
            const motorInput = document.getElementById('edit-sale-motor');
            if (chassisInput) chassisInput.value = unit.chassis || '';
            if (motorInput) motorInput.value = unit.motor || '';

            const prod = allProducts.find(p => p.id === unit.productId);
            const prodName = prod ? `${prod.brand} (${prod.year}) - ${prod.cc} CC` : '-';

            detailsDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;">
                    <div><span class="text-muted">الموديل:</span> <strong>${prodName}</strong></div>
                    <div><span class="text-muted">الشاسيه:</span> <strong class="text-cyan">${unit.chassis}</strong></div>
                    <div><span class="text-muted">الموتور:</span> <strong>${unit.motor || '-'}</strong></div>
                    <div><span class="text-muted">اللون:</span> <strong>${unit.color || '-'}</strong></div>
                    <div><span class="text-muted">الفرع:</span> <strong>${unit.branch || '-'}</strong></div>
                    <div><span class="text-muted">الحالة:</span> <span class="badge-status ${unit.status === 'متاح' ? 'success' : 'warning'}">${unit.status}</span></div>
                </div>
            `;
        },

        onEditSalePriceChange: function() {
            const price = Number(document.getElementById('edit-sale-price').value) || 0;
            const downpayment = Number(document.getElementById('edit-sale-downpayment').value) || 0;
            const remaining = price - downpayment;
            document.getElementById('edit-sale-remaining-lbl').textContent = remaining.toLocaleString('ar-EG') + " ج.م";
        },

        saveEditSale: async function(e) {
            e.preventDefault();

            const saleId = Number(document.getElementById('edit-sale-id').value);
            const sale = await MotoDB.getById('sales', saleId);
            if (!sale) return;

            const saleDate = document.getElementById('edit-sale-date').value;
            const salePrice = Number(document.getElementById('edit-sale-price').value) || 0;
            const notes = document.getElementById('edit-sale-general-notes').value.trim();
            const newUnitId = Number(document.getElementById('edit-sale-unit-select').value);
            const newChassis = (document.getElementById('edit-sale-chassis')?.value || '').trim();
            const newMotor = (document.getElementById('edit-sale-motor')?.value || '').trim();
            let preflightInstallments = [];
            let rescheduleApproved = true;

            if (!newUnitId) {
                alert("خطأ: يرجى اختيار منتج وشاسيه متاح وصالح للفاتورة.");
                return;
            }

            if (salePrice <= 0) {
                alert("سعر البيع يجب أن يكون أكبر من الصفر.");
                return;
            }
            if (!newChassis || !newMotor) {
                alert("يرجى إدخال رقم الشاسيه ورقم الموتور قبل حفظ تعديل الفاتورة.");
                return;
            }
            const duplicateChassisOnEdit = allUnits.find(u => Number(u.id) !== newUnitId && (u.chassis || '').trim().toLowerCase() === newChassis.toLowerCase());
            if (duplicateChassisOnEdit) {
                alert("رقم الشاسيه الجديد مسجل بالفعل لقطعة أخرى. أدخل رقماً غير مكرر.");
                return;
            }
            const duplicateMotorOnEdit = allUnits.find(u => Number(u.id) !== newUnitId && (u.motor || '').trim().toLowerCase() === newMotor.toLowerCase());
            if (duplicateMotorOnEdit) {
                alert("رقم الموتور الجديد مسجل بالفعل لقطعة أخرى. أدخل رقماً غير مكرر.");
                return;
            }
            const targetUnitPreflight = await MotoDB.getById('units', newUnitId);
            if (!targetUnitPreflight) {
                alert("القطعة المختارة غير موجودة بالمخزون. أعد اختيارها.");
                return;
            }

            // Validate installment fields and any destructive reschedule choice
            // before touching the invoice or either inventory unit.
            if (sale.type === 'installment') {
                const preDownpayment = Number(document.getElementById('edit-sale-downpayment').value) || 0;
                const preMonths = Number(document.getElementById('edit-sale-months').value) || 12;
                const preMonthly = Number(document.getElementById('edit-sale-monthly').value) || 0;
                const preFirstDate = document.getElementById('edit-sale-first-inst-date').value;
                const preG1Name = document.getElementById('edit-sale-g1-name').value.trim();
                const preG1Phone = document.getElementById('edit-sale-g1-phone').value.trim();
                const preG1Nid = document.getElementById('edit-sale-g1-nid').value.trim();
                const preG1Address = document.getElementById('edit-sale-g1-address').value.trim();
                const preG2Name = document.getElementById('edit-sale-g2-name').value.trim();
                const preG2Phone = document.getElementById('edit-sale-g2-phone').value.trim();
                const preG2Nid = document.getElementById('edit-sale-g2-nid').value.trim();
                const preG2Address = document.getElementById('edit-sale-g2-address').value.trim();
                if (!preFirstDate) { alert("خطأ: تاريخ أول قسط مطلوب لعقود التقسيط."); return; }
                if (!preG1Name || !preG1Phone || !preG1Nid || !preG1Address) { alert("خطأ: بيانات الضامن الأول مطلوبة بالكامل لعقود التقسيط."); return; }
                if (preG1Nid.length !== 14 || isNaN(preG1Nid)) { alert("خطأ: الرقم القومي للضامن الأول يجب أن يكون 14 رقماً صحيحاً."); return; }
                if (this.editGuarantorsCount === 2) {
                    if (!preG2Name || !preG2Phone || !preG2Nid || !preG2Address) { alert("خطأ: بيانات الضامن الثاني مطلوبة بالكامل عند اختيار (2 ضامن)."); return; }
                    if (preG2Nid.length !== 14 || isNaN(preG2Nid)) { alert("خطأ: الرقم القومي للضامن الثاني يجب أن يكون 14 رقماً صحيحاً."); return; }
                    if (preG1Nid === preG2Nid) { alert("خطأ: لا يمكن تكرار نفس الرقم القومي للضامن الأول والضامن الثاني!"); return; }
                }
                if (preMonths > 120) { alert("خطأ: مدة التقسيط كبيرة جداً (أكثر من 10 سنوات / 120 شهراً). يرجى زيادة قيمة القسط الشهري."); return; }
                if (preMonths <= 0) { alert("خطأ: مدة التقسيط يجب أن تكون شهراً واحداً على الأقل."); return; }
                preflightInstallments = (await MotoDB.getAll('installments')).filter(inst => Number(inst.saleId) === Number(saleId));
                const scheduleWillChange = sale.months !== preMonths || sale.monthlyPayment !== preMonthly || sale.downpayment !== preDownpayment || sale.salePrice !== salePrice || sale.firstInstallmentDate !== preFirstDate || preflightInstallments.length === 0;
                if (scheduleWillChange && preflightInstallments.some(inst => inst.status === 'paid')) {
                    rescheduleApproved = await BakryDialogs.confirm("تنبيه: تم سداد بعض الأقساط بالفعل في هذا العقد سابقاً. هل تريد إعادة جدولة الأقساط الباقية بالكامل وحذف القديمة؟");
                    if (!rescheduleApproved) return;
                }
            }

            // Disable submit button during save
            const btn = document.querySelector('#edit-sale-form button[type="submit"]');
            let originalBtnHtml = "";
            if (btn) {
                originalBtnHtml = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
            }

            try {
                const unitToEdit = await MotoDB.getById('units', newUnitId);
                if (!unitToEdit) throw new Error('القطعة المختارة غير موجودة بالمخزون.');
                // Preserve the correct origin flag so deleting the invoice later
                // never removes an ordinary inventory unit by mistake.
                sale.unitCreatedFromSale = unitToEdit.createdFromSale === true;
                unitToEdit.chassis = newChassis;
                unitToEdit.motor = newMotor;
                await MotoDB.update('units', unitToEdit);
                const cachedEditedUnit = allUnits.find(u => Number(u.id) === newUnitId);
                if (cachedEditedUnit) Object.assign(cachedEditedUnit, unitToEdit);

                sale.saleDate = saleDate;
                sale.notes = notes;

                const oldSalePrice = sale.salePrice;
                sale.salePrice = salePrice;

                // Handle unit / product changes
                const oldUnitId = sale.unitId;
                const isUnitChanged = oldUnitId !== newUnitId;

                if (isUnitChanged) {
                    // 1. Release old unit back to inventory
                    if (oldUnitId) {
                        const oldUnit = await MotoDB.getById('units', oldUnitId);
                        if (oldUnit) {
                            oldUnit.status = 'متاح';
                            oldUnit.soldPrice = null;
                            oldUnit.soldDate = null;
                            await MotoDB.update('units', oldUnit);
                        }
                    }
                    // 2. Mark new unit as sold
                    const newUnit = await MotoDB.getById('units', newUnitId);
                    if (newUnit) {
                        newUnit.status = 'مباع';
                        newUnit.soldPrice = salePrice;
                        newUnit.soldDate = saleDate;
                        await MotoDB.update('units', newUnit);
                    }
                    sale.unitId = newUnitId;

                    const newProduct = newUnit ? allProducts.find(p => p.id === newUnit.productId) : null;
                    if (newProduct) {
                        sale.originalPrice = newProduct.price;
                    }
                } else {
                    // Update current unit's soldPrice and soldDate
                    const currentUnit = await MotoDB.getById('units', sale.unitId);
                    if (currentUnit) {
                        currentUnit.soldPrice = salePrice;
                        currentUnit.soldDate = saleDate;
                        await MotoDB.update('units', currentUnit);
                    }
                }

                let recreateSchedule = false;
                let firstInstDateVal = '';
                let existingInsts = [];

                if (sale.type === 'installment') {
                    const downpayment = Number(document.getElementById('edit-sale-downpayment').value) || 0;
                    const months = Number(document.getElementById('edit-sale-months').value) || 12;
                    const monthlyPayment = Number(document.getElementById('edit-sale-monthly').value) || 0;
                    const guaranteeNotes = document.getElementById('edit-sale-guarantee-notes').value.trim();
                    firstInstDateVal = document.getElementById('edit-sale-first-inst-date').value;

                    const g1_name = document.getElementById('edit-sale-g1-name').value.trim();
                    const g1_phone = document.getElementById('edit-sale-g1-phone').value.trim();
                    const g1_nid = document.getElementById('edit-sale-g1-nid').value.trim();
                    const g1_address = document.getElementById('edit-sale-g1-address').value.trim();
                    const g1_rel = document.getElementById('edit-sale-g1-rel').value.trim();

                    const g2_name = document.getElementById('edit-sale-g2-name').value.trim();
                    const g2_phone = document.getElementById('edit-sale-g2-phone').value.trim();
                    const g2_nid = document.getElementById('edit-sale-g2-nid').value.trim();
                    const g2_address = document.getElementById('edit-sale-g2-address').value.trim();
                    const g2_rel = document.getElementById('edit-sale-g2-rel').value.trim();

                    if (!firstInstDateVal) {
                        alert("خطأ: تاريخ أول قسط مطلوب لعقود التقسيط.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        return;
                    }

                    if (!g1_name || !g1_phone || !g1_nid || !g1_address) {
                        alert("خطأ: بيانات الضامن الأول مطلوبة بالكامل لعقود التقسيط.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        return;
                    }

                    if (g1_nid.length !== 14 || isNaN(g1_nid)) {
                        alert("خطأ: الرقم القومي للضامن الأول يجب أن يكون 14 رقماً صحيحاً.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        return;
                    }

                    if (this.editGuarantorsCount === 2) {
                        if (!g2_name || !g2_phone || !g2_nid || !g2_address) {
                            alert("خطأ: بيانات الضامن الثاني مطلوبة بالكامل عند اختيار (2 ضامن).");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            return;
                        }

                        if (g2_nid.length !== 14 || isNaN(g2_nid)) {
                            alert("خطأ: الرقم القومي للضامن الثاني يجب أن يكون 14 رقماً صحيحاً.");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            return;
                        }

                        if (g1_nid === g2_nid) {
                            alert("خطأ: لا يمكن تكرار نفس الرقم القومي للضامن الأول والضامن الثاني!");
                            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                            return;
                        }
                    }

                    if (months > 120) {
                        alert("خطأ: مدة التقسيط كبيرة جداً (أكثر من 10 سنوات / 120 شهراً). يرجى زيادة قيمة القسط الشهري.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        return;
                    }
                    if (months <= 0) {
                        alert("خطأ: مدة التقسيط يجب أن تكون شهراً واحداً على الأقل.");
                        if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
                        return;
                    }

                    const remainingAmount = salePrice - downpayment;
                    const sumOfOthers = monthlyPayment * (months - 1);
                    const lastInstallment = remainingAmount - sumOfOthers;

                    existingInsts = preflightInstallments;

                    if (sale.months !== months || sale.monthlyPayment !== monthlyPayment || sale.downpayment !== downpayment || oldSalePrice !== salePrice || sale.firstInstallmentDate !== firstInstDateVal || existingInsts.length === 0) {
                        recreateSchedule = true;
                    }

                    sale.downpayment = downpayment;
                    sale.months = months;
                    sale.monthlyPayment = monthlyPayment;
                    sale.remainingAmount = remainingAmount;
                    sale.lastInstallment = lastInstallment;
                    sale.guaranteeNotes = guaranteeNotes;
                    sale.firstInstallmentDate = firstInstDateVal;

                    sale.g1_name = g1_name;
                    sale.g1_phone = App.Security.encrypt(g1_phone);
                    sale.g1_nid = App.Security.encrypt(g1_nid);
                    sale.g1_rel = g1_rel;
                    sale.g1_address = g1_address;

                    if (this.editGuarantorsCount === 2) {
                        sale.g2_name = g2_name;
                        sale.g2_phone = App.Security.encrypt(g2_phone);
                        sale.g2_nid = App.Security.encrypt(g2_nid);
                        sale.g2_rel = g2_rel;
                        sale.g2_address = g2_address;
                    } else {
                        sale.g2_name = '';
                        sale.g2_phone = '';
                        sale.g2_nid = '';
                        sale.g2_rel = '';
                        sale.g2_address = '';
                    }
                }

                await MotoDB.update('sales', sale);

                const txs = await MotoDB.getAll('transactions');
                const targetTx = txs.find(tx => tx.refId === saleId && (tx.category === 'مبيعات كاش' || tx.category === 'مقدم قسط'));
                if (targetTx) {
                    const currentUnit = allUnits.find(u => u.id === sale.unitId);
                    const cust = allCustomers.find(c => c.id === sale.customerId);
                    const chassisStr = currentUnit ? currentUnit.chassis : '';
                    targetTx.amount = sale.type === 'cash' ? salePrice : sale.downpayment;
                    const timePart = targetTx.date.includes(" ") ? targetTx.date.split(" ")[1] : "12:00";
                    targetTx.date = saleDate + " " + timePart;
                    targetTx.description = `فاتورة بيع ${sale.type === 'cash' ? 'كاش' : 'قسط'} رقم (${sale.invoiceNo}) للعميل (${cust ? cust.name : ''}) - فرع (${sale.branch}) - شاسيه: ${chassisStr}`;
                    await MotoDB.update('transactions', targetTx);
                }

                if (recreateSchedule) {
                    const oldInsts = existingInsts;
                    const hasPaid = oldInsts.some(inst => inst.status === 'paid');
                    const proceed = rescheduleApproved;

                    if (proceed) {
                        for (let inst of oldInsts) {
                            await MotoDB.delete('installments', inst.id);
                        }

                        // Parse first installment date to avoid timezone issues
                        const baseParts = firstInstDateVal.split('-');
                        const baseYear = parseInt(baseParts[0]);
                        const baseMonth = parseInt(baseParts[1]) - 1; // 0-indexed month
                        const baseDay = parseInt(baseParts[2]);

                        const insts = [];
                        for (let i = 1; i <= sale.months; i++) {
                            // i=1 starts at firstInstallmentDate, i=2 is firstInstallmentDate + 1 month, etc.
                            const dueDate = new Date(baseYear, baseMonth + (i - 1), baseDay);
                            const yyyy = dueDate.getFullYear();
                            const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
                            const dd = String(dueDate.getDate()).padStart(2, '0');
                            const dueDateStr = `${yyyy}-${mm}-${dd}`;

                            insts.push({
                                saleId: saleId,
                                customerId: sale.customerId,
                                installmentNumber: i,
                                amount: (i === sale.months) ? (sale.lastInstallment || sale.monthlyPayment) : sale.monthlyPayment,
                                dueDate: dueDateStr,
                                status: 'pending',
                                paidAmount: null,
                                paidDate: null,
                                notes: ''
                            });
                        }
                        await MotoDB.updateBatch('installments', insts);
                    }
                }

                App.logActivity("تعديل فاتورة", `تعديل بيانات الفاتورة رقم (${sale.invoiceNo}) بقيمة (${salePrice.toLocaleString('ar-EG')} ج.م)`);
                await App.saveAutoBackup();

                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }

                alert("تم تحديث وحفظ بيانات الفاتورة بنجاح!");
                document.getElementById('edit-sale-modal').classList.add('hidden');
                App.switchTab('sales');
                this.switchSubTab('log');
            } catch (err) {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }
                alert("فشل التعديل: " + err);
            }
        }
    },


    /* ==========================================================================
       SUBMODULE: INSTALLMENTS
       ========================================================================== */
    Installments: {
        activeSubTab: 'plans',
        payingInstallmentId: null,

        render: async function() {
            this.switchSubTab(this.activeSubTab);
        },

        switchSubTab: function(subTabId) {
            this.activeSubTab = subTabId;
            
            document.querySelectorAll('#installments-page .sub-tab').forEach(btn => {
                btn.classList.remove('active');
                if (btn.getAttribute('data-subtab') === subTabId) btn.classList.add('active');
            });

            document.querySelectorAll('#installments-page .subtab-content').forEach(div => div.classList.remove('active'));
            document.getElementById(`${subTabId}-subtab`).classList.add('active');

            if (subTabId === 'plans') {
                this.searchPlans();
            } else if (subTabId === 'overdues') {
                this.renderOverdues();
            } else if (subTabId === 'due-soon') {
                this.renderDueSoon();
            }
        },

        searchPlans: async function() {
            const term = document.getElementById('inst-plan-search').value.trim().toLowerCase();
            const tableBody = document.getElementById('installment-plans-table-body');
            tableBody.innerHTML = '';

            const sales = await MotoDB.getAll('sales');
            const instSales = sales.filter(s => s.type === 'installment');
            const installments = await MotoDB.getAll('installments');

            let filtered = [];

            for (let s of instSales) {
                const cust = allCustomers.find(c => c.id === s.customerId);
                const unit = allUnits.find(u => u.id === s.unitId);
                const prod = unit ? allProducts.find(p => p.id === unit.productId) : null;
                
                const custName = cust ? cust.name : 'عميل مجهول';
                const prodBrand = prod ? prod.brand : 'دراجة نارية';
                const chassisNo = unit ? unit.chassis : '';

                if (term) {
                    if (!custName.toLowerCase().includes(term) &&
                        !s.invoiceNo.toLowerCase().includes(term) &&
                        !chassisNo.toLowerCase().includes(term)) {
                        continue;
                    }
                }

                filtered.push({ s, cust, prod, unit, custName, prodBrand, chassisNo });
            }

            if (filtered.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">لا يوجد خطط أقساط مسجلة تطابق التصفية.</td></tr>`;
                return;
            }

            filtered.forEach(item => {
                const s = item.s;
                const insts = installments.filter(i => i.saleId === s.id);
                const paid = insts.filter(i => i.status === 'paid').length;
                const total = insts.length;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${s.invoiceNo}</strong></td>
                    <td>${item.custName}</td>
                    <td>${item.prodBrand} <span class="text-muted text-xs">(${item.chassisNo})</span></td>
                    <td class="font-bold text-orange">${s.salePrice.toLocaleString('ar-EG')} ج.م</td>
                    <td>${s.downpayment.toLocaleString('ar-EG')} ج.م</td>
                    <td class="font-bold text-cyan">${s.remainingAmount.toLocaleString('ar-EG')} ج.م</td>
                    <td><strong>${paid} / ${total} قسط</strong></td>
                    <td>
                        <span class="text-xs text-muted">1: ${s.g1_name}</span><br>
                        <span class="text-xs text-muted">2: ${s.g2_name}</span>
                    </td>
                    <td>
                        <button class="btn btn-secondary btn-icon-only" onclick="App.Installments.openPlanCard(${s.id})" title="عرض جدول الأقساط الكامل">
                            <i class="fa-solid fa-list-ol text-cyan"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        },

        renderOverdues: async function() {
            const tableBody = document.getElementById('overdue-installments-table-body');
            tableBody.innerHTML = '';

            const installments = await MotoDB.getAll('installments');
            const todayStr = new Date().toISOString().split('T')[0];
            const overdues = installments.filter(i => i.status === 'overdue' || (i.status === 'pending' && i.dueDate < todayStr));

            if (overdues.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-emerald font-bold p-8">ممتاز! لا يوجد أي عملاء متأخرين عن السداد حالياً في المعرض.</td></tr>`;
                return;
            }

            // Sort by due date ascending (earliest overdue first), then installment number
            overdues.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.installmentNumber || 0) - (b.installmentNumber || 0));

            for (const inst of overdues) {
                const cust = allCustomers.find(c => c.id === inst.customerId);
                const sale = await MotoDB.getById('sales', inst.saleId);
                
                const custName = cust ? cust.name : 'عميل مجهول';
                const custPhone = cust ? App.Security.decrypt(cust.phone) : 'مجهول';
                const g1Label = sale ? `${sale.g1_name} (${App.Security.decrypt(sale.g1_phone)})` : 'غير مسجل';
                const g2Label = sale ? `${sale.g2_name} (${App.Security.decrypt(sale.g2_phone)})` : 'غير مسجل';

                const dueTime = new Date(inst.dueDate).getTime();
                const nowTime = new Date().getTime();
                const diffTime = Math.abs(nowTime - dueTime);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><a href="#" onclick="event.preventDefault(); App.Installments.openPlanCard(${inst.saleId})" class="text-cyan font-bold" style="text-decoration: underline; cursor: pointer;" title="عرض جدول الأقساط الكامل">${custName}</a></td>
                    <td class="font-bold text-cyan">${custPhone}</td>
                    <td>القسط رقم ${inst.installmentNumber}</td>
                    <td class="font-bold text-crimson">${inst.amount.toLocaleString('ar-EG')} ج.م</td>
                    <td><span class="badge-status danger">${inst.dueDate}</span></td>
                    <td class="font-bold text-crimson">${diffDays} يوم تأخير</td>
                    <td><span class="text-xs text-muted">${g1Label}</span></td>
                    <td><span class="text-xs text-muted">${g2Label}</span></td>
                    <td>
                        <button class="btn btn-primary btn-icon-only" onclick="App.Installments.openPayWizard(${inst.id})" title="تحصيل القسط فوراً" data-permission="write">
                            <i class="fa-solid fa-hand-holding-dollar"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(tr);
            }

            App.applyPermissions();
        },

        renderDueSoon: async function() {
            const tableBody = document.getElementById('due-soon-installments-table-body');
            tableBody.innerHTML = '';

            const installments = await MotoDB.getAll('installments');
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const in7Days = new Date();
            in7Days.setDate(today.getDate() + 7);
            const in7DaysStr = in7Days.toISOString().split('T')[0];

            const dueSoon = installments.filter(i => i.status === 'pending' && i.dueDate >= todayStr && i.dueDate <= in7DaysStr);

            if (dueSoon.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-emerald font-bold p-8">لا يوجد أقساط تستحق اليوم أو خلال الـ 7 أيام القادمة.</td></tr>`;
                return;
            }

            // Sort by due date ascending (closest due date first), then installment number
            dueSoon.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.installmentNumber || 0) - (b.installmentNumber || 0));

            for (const inst of dueSoon) {
                const cust = allCustomers.find(c => c.id === inst.customerId);
                const sale = await MotoDB.getById('sales', inst.saleId);
                
                const custName = cust ? cust.name : 'عميل مجهول';
                const custPhone = cust ? App.Security.decrypt(cust.phone) : 'مجهول';
                const g1Label = sale ? `${sale.g1_name} (${App.Security.decrypt(sale.g1_phone)})` : 'غير مسجل';
                const g2Label = sale ? `${sale.g2_name} (${App.Security.decrypt(sale.g2_phone)})` : 'غير مسجل';

                const dueTime = new Date(inst.dueDate).getTime();
                const nowTime = new Date(todayStr).getTime();
                const diffTime = dueTime - nowTime;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let remainingLabel = '';
                if (diffDays === 0) {
                    remainingLabel = '<span class="badge-status danger">يستحق اليوم!</span>';
                } else {
                    remainingLabel = `خلال ${diffDays} يوم`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><a href="#" onclick="event.preventDefault(); App.Installments.openPlanCard(${inst.saleId})" class="text-cyan font-bold" style="text-decoration: underline; cursor: pointer;" title="عرض جدول الأقساط الكامل">${custName}</a></td>
                    <td class="font-bold text-cyan">${custPhone}</td>
                    <td>القسط رقم ${inst.installmentNumber}</td>
                    <td class="font-bold text-orange">${inst.amount.toLocaleString('ar-EG')} ج.م</td>
                    <td><span class="badge-status warning">${inst.dueDate}</span></td>
                    <td><strong class="text-cyan">${remainingLabel}</strong></td>
                    <td><span class="text-xs text-muted">${g1Label}</span></td>
                    <td><span class="text-xs text-muted">${g2Label}</span></td>
                    <td>
                        <button class="btn btn-primary btn-icon-only" onclick="App.Installments.openPayWizard(${inst.id})" title="تحصيل القسط فوراً" data-permission="write">
                            <i class="fa-solid fa-hand-holding-dollar"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(tr);
            }

            App.applyPermissions();
        },

        openPlanCard: async function(saleId) {
            const id = Number(saleId);
            const sale = await MotoDB.getById('sales', id);
            if (!sale) return;

            const cust = allCustomers.find(c => Number(c.id) === Number(sale.customerId));
            const unit = allUnits.find(u => Number(u.id) === Number(sale.unitId));
            const prod = unit ? allProducts.find(p => Number(p.id) === Number(unit.productId)) : null;
            
            const installments = await MotoDB.getAll('installments');
            const saleInsts = installments.filter(i => Number(i.saleId) === id).sort((a,b) => a.installmentNumber - b.installmentNumber);

            let tableRowsHtml = '';
            saleInsts.forEach(i => {
                const badgeColor = i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : 'warning';
                const statusLbl = i.status === 'paid' ? 'مسدد بالكامل' : i.status === 'overdue' ? 'متأخر ومستحق' : 'مستحق قادماً';
                const actionBtn = i.status !== 'paid' ? 
                    `<div style="display:flex; gap:4px;">
                        <button class="btn btn-primary btn-icon-only" onclick="App.closeDetailsViewer(); App.Installments.openPayWizard(${i.id})" title="تحصيل القسط" data-permission="write">
                            <i class="fa-solid fa-hand-holding-dollar"></i>
                        </button>
                        ${(currentRole !== 'viewer') ? `
                        <button class="btn btn-secondary btn-icon-only btn-edit-row allow-acc-edit" onclick="App.closeDetailsViewer(); App.Installments.openEditDueDate(${i.id})" title="تعديل تاريخ الاستحقاق/الملاحظات">
                            <i class="fa-solid fa-calendar-days text-orange"></i>
                        </button>
                        ` : ''}
                    </div>` : 
                    `<div style="display:flex; gap:4px;">
                        <button class="btn btn-secondary btn-icon-only" onclick="App.Installments.printReceipt(${i.id})" title="طباعة الإيصال">
                            <i class="fa-solid fa-print"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only btn-edit-row allow-acc-edit" onclick="App.closeDetailsViewer(); App.Installments.openEditPayment(${i.id})" title="تعديل قيمة/تاريخ التحصيل">
                            <i class="fa-solid fa-pen text-orange"></i>
                        </button>
                        <button class="btn btn-danger btn-icon-only btn-delete-row allow-acc-delete" onclick="App.closeDetailsViewer(); App.Installments.deletePayment(${i.id})" title="إلغاء/حذف التحصيل">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>`;

                tableRowsHtml += `
                    <tr>
                        <td>${i.status !== 'paid' ? `<input type="checkbox" class="bulk-inst-check" value="${i.id}" aria-label="تحديد القسط ${i.installmentNumber}">` : '<span>—</span>'}</td>
                        <td>القسط ${i.installmentNumber}</td>
                        <td class="font-bold">${i.amount.toLocaleString('ar-EG')} ج.م</td>
                        <td>${i.dueDate}</td>
                        <td><span class="badge-status ${badgeColor}">${statusLbl}</span></td>
                        <td>${i.paidDate || '-'}</td>
                        <td>${i.notes || '-'}</td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            });

            // Load collection notes
            const allNotes = await MotoDB.getAll('collection_notes');
            const saleNotes = allNotes.filter(n => Number(n.saleId) === id).sort((a,b) => b.id - a.id);
            
            let notesRowsHtml = '';
            if (saleNotes.length === 0) {
                notesRowsHtml = '<p class="text-muted text-xs p-2 text-center">لا يوجد أي ملاحظات تحصيل مسجلة لهذا العقد بعد.</p>';
            } else {
                notesRowsHtml = `
                    <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; background: rgba(15,23,42,0.4);">
                `;
                saleNotes.forEach(n => {
                    const deleteBtn = (currentRole === 'admin' || n.user === currentRole) ? 
                        `<button class="btn btn-danger btn-icon-only text-xs btn-delete-row" style="padding:2px 6px; font-size:10px; height:24px; width:24px; min-width:24px;" onclick="App.Installments.deleteCollectionNote(${n.id}, ${saleId})" title="حذف"><i class="fa-solid fa-trash"></i></button>` : '';
                    
                    const editBtn = (currentRole === 'admin' || n.user === currentRole) ? 
                        `<button class="btn btn-secondary btn-icon-only text-xs btn-edit-row allow-sales-edit" style="padding:2px 6px; font-size:10px; height:24px; width:24px; min-width:24px;" onclick="App.Installments.openEditCollectionNote(${n.id}, ${saleId})" title="تعديل"><i class="fa-solid fa-pen"></i></button>` : '';

                    notesRowsHtml += `
                        <div style="border-bottom: 1px dashed var(--border-color); padding: 8px 0; display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <div style="display: flex; gap: 10px; font-size: 11px; color: var(--text-muted);">
                                    <span><i class="fa-regular fa-clock"></i> ${n.date}</span>
                                    <span><i class="fa-solid fa-user"></i> الكاتب: <strong class="text-cyan">${n.user === 'admin' ? 'Admin' : n.user}</strong></span>
                                </div>
                                <p style="font-size: 13px; color: var(--text-main); margin-top: 4px; white-space: pre-wrap;">${n.note}</p>
                            </div>
                            <div style="display:flex; gap:4px; align-items:center; margin-right:10px;">
                                ${editBtn}
                                ${deleteBtn}
                            </div>
                        </div>
                    `;
                });
                notesRowsHtml += '</div>';
            }

            const notesFormHtml = currentRole !== 'viewer' ? `
                <div class="form-group mt-3" data-permission="write">
                    <label style="font-size:13px; font-weight:600;"><i class="fa-solid fa-comment-dots"></i> إضافة ملاحظة متابعة جديدة:</label>
                    <div style="display:flex; gap:10px; margin-top:5px;">
                        <textarea id="new-collection-note-text" rows="2" placeholder="اكتب تفاصيل الاتصال، وعد السداد، أو موقف العميل..." class="flex-1" style="padding: 8px; border-radius: 6px; background: rgba(15,23,42,0.6); color: #fff; border: 1px solid var(--border-color); font-size: 13px; font-family:'Cairo';"></textarea>
                        <button type="button" class="btn btn-primary" onclick="App.Installments.saveCollectionNote(${saleId})" style="padding:0 20px; font-size:13px;"><i class="fa-solid fa-paper-plane"></i> إضافة</button>
                    </div>
                </div>
            ` : '';

            const contentHtml = `
                <div class="details-summary-header">
                    <h2>جدول أقساط العقد (${sale.invoiceNo}) - العميل: ${cust ? cust.name : 'مجهول'}</h2>
                    <span class="badge-status success">${sale.months} شهر تقسيط</span>
                </div>
                <div class="details-info-table">
                    <div class="info-cell"><span>المركبة المبيعة:</span><strong>${prod ? prod.brand : 'موتوسيكل'} | شاسيه: ${unit ? unit.chassis : '-'}</strong></div>
                    <div class="info-cell"><span>سعر بيع التقسيط:</span><strong>${sale.salePrice.toLocaleString('ar-EG')} ج.م</strong></div>
                    <div class="info-cell"><span>مقدم التعاقد:</span><strong>${sale.downpayment.toLocaleString('ar-EG')} ج.م</strong></div>
                    <div class="info-cell"><span>المتبقي بالأقساط:</span><strong>${sale.remainingAmount.toLocaleString('ar-EG')} ج.م</strong></div>
                </div>

                <div class="details-section-title"><i class="fa-solid fa-list-ol"></i> دفعات الأقساط وجدول السداد المستحق</div>
                <div class="bulk-payment-toolbar"><span>حدد أكثر من قسط لتحصيلهم معاً بالقيمة الكاملة لكل قسط.</span><button type="button" class="btn btn-primary" onclick="App.Installments.paySelectedInstallments(${saleId})" data-permission="write"><i class="fa-solid fa-hand-holding-dollar"></i> تحصيل الأقساط المحددة</button></div>
                <table class="data-table small-table mt-2">
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="bulk-inst-all" aria-label="تحديد كل الأقساط المستحقة" onchange="App.Installments.toggleBulkSelection(this)"></th>
                            <th>رقم الدفعة</th>
                            <th>قيمة القسط</th>
                            <th>تاريخ الاستحقاق</th>
                            <th>حالة السداد</th>
                            <th>تاريخ التحصيل</th>
                            <th>ملاحظات</th>
                            <th>إجراء</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>

                <div class="details-section-title mt-4"><i class="fa-solid fa-comments"></i> سجل متابعة التحصيل والتواصل للعميل</div>
                ${notesRowsHtml}
                ${notesFormHtml}
            `;

            App.openDetailsViewer("خطة الأقساط وجدول السداد الفردي", contentHtml);
            App.applyPermissions();
        },

        saveCollectionNote: async function(saleId) {
            const noteText = document.getElementById('new-collection-note-text').value.trim();
            if (!noteText) {
                alert("يرجى كتابة نص الملاحظة أولاً.");
                return;
            }

            const now = new Date();
            const dateStr = now.getFullYear() + '-' + 
                            String(now.getMonth()+1).padStart(2,'0') + '-' + 
                            String(now.getDate()).padStart(2,'0') + ' ' + 
                            String(now.getHours()).padStart(2,'0') + ':' + 
                            String(now.getMinutes()).padStart(2,'0');

            const noteObj = {
                saleId: saleId,
                date: dateStr,
                user: currentRole,
                note: noteText
            };

            try {
                await MotoDB.add('collection_notes', noteObj);
                App.logActivity("إضافة ملاحظة تحصيل", `إضافة ملاحظة متابعة جديدة للعقد رقم ${saleId}`);
                await App.saveAutoBackup();
                this.openPlanCard(saleId);
            } catch (err) {
                alert("فشل إضافة الملاحظة: " + err);
            }
        },

        deleteCollectionNote: async function(noteId, saleId) {
            if (await BakryDialogs.confirm("هل تريد بالتأكيد حذف ملاحظة المتابعة هذه؟")) {
                try {
                    await MotoDB.delete('collection_notes', noteId);
                    App.logActivity("حذف ملاحظة تحصيل", `حذف ملاحظة متابعة للبيع رقم ${saleId}`);
                    await App.saveAutoBackup();
                    this.openPlanCard(saleId);
                } catch (err) {
                    alert("فشل حذف الملاحظة: " + err);
                }
            }
        },

        openEditCollectionNote: async function(noteId, saleId) {
            try {
                const noteObj = await MotoDB.getById('collection_notes', noteId);
                if (!noteObj) return;

                const newText = prompt("تعديل ملاحظة المتابعة والتحصيل للعميل:", noteObj.note);
                if (newText !== null) {
                    const trimmed = newText.trim();
                    if (!trimmed) {
                        alert("لا يمكن حفظ ملاحظة فارغة.");
                        return;
                    }

                    const now = new Date();
                    const dateStr = now.getFullYear() + '-' + 
                                    String(now.getMonth()+1).padStart(2,'0') + '-' + 
                                    String(now.getDate()).padStart(2,'0') + ' ' + 
                                    String(now.getHours()).padStart(2,'0') + ':' + 
                                    String(now.getMinutes()).padStart(2,'0') + ' (معدل)';

                    noteObj.note = trimmed;
                    noteObj.date = dateStr;
                    noteObj.user = currentRole;

                    await MotoDB.update('collection_notes', noteObj);
                    App.logActivity("تعديل ملاحظة تحصيل", `تعديل ملاحظة متابعة للبيع رقم ${saleId}`);
                    await App.saveAutoBackup();
                    this.openPlanCard(saleId);
                }
            } catch (err) {
                alert("فشل تعديل الملاحظة: " + err);
            }
        },

        toggleBulkSelection: function(master) {
            document.querySelectorAll('#details-viewer-modal .bulk-inst-check').forEach(cb => { cb.checked = master.checked; });
        },

        paySelectedInstallments: async function(saleId) {
            const ids = [...document.querySelectorAll('#details-viewer-modal .bulk-inst-check:checked')].map(x => Number(x.value));
            if (!ids.length) { alert('حدد قسطاً واحداً على الأقل.'); return; }
            if (!await BakryDialogs.confirm(`تأكيد تحصيل ${ids.length} قسط/أقساط بالقيمة الكاملة؟`)) return;
            const date = prompt('تاريخ التحصيل (YYYY-MM-DD):', new Date().toISOString().slice(0,10));
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert('تاريخ التحصيل غير صحيح.'); return; }
            const method = prompt('طريقة الدفع (نقدي / تحويل / فودافون كاش):', 'نقدي') || 'نقدي';
            try {
                const all = await MotoDB.getAll('installments');
                const selected = ids.map(id => all.find(x => Number(x.id) === id)).filter(x => x && x.status !== 'paid' && Number(x.saleId) === Number(saleId));
                if (selected.length !== ids.length) throw new Error('تغيرت حالة أحد الأقساط. حدّث الصفحة وحاول مرة أخرى.');
                const total = selected.reduce((sum, x) => sum + Number(x.amount || 0), 0);
                const sale = await MotoDB.getById('sales', Number(saleId));
                if (!sale) throw new Error('عقد البيع غير موجود.');
                for (const inst of selected) {
                    inst.status = 'paid'; inst.paidAmount = Number(inst.amount); inst.paidDate = date; inst.notes = (inst.notes ? inst.notes + ' | ' : '') + 'تحصيل جماعي';
                    await MotoDB.update('installments', inst);
                    const code = await MotoDB.generateNextTxCode();
                    await MotoDB.add('transactions', {code, date, type:'قبض', category:'قسط شهري', amount:Number(inst.amount), description:`تحصيل جماعي للقسط رقم (${inst.installmentNumber}) للعميل (${allCustomers.find(c=>c.id===inst.customerId)?.name || 'مجهول'}) - فاتورة (${sale.invoiceNo || ''})`, user: currentRole === 'admin' ? 'Admin' : 'موظف حسابات', paymentMethod:method, refId:inst.id});
                }
                sale.remainingAmount = Math.max(0, Number(sale.remainingAmount || 0) - total);
                await MotoDB.update('sales', sale);
                App.logActivity('تحصيل جماعي للأقساط', `تحصيل ${selected.length} قسط بمبلغ إجمالي ${total} ج.م للعقد ${sale.invoiceNo || saleId}`);
                await App.saveAutoBackup();
                alert(`تم تحصيل ${selected.length} قسط بنجاح. إجمالي المبلغ: ${total.toLocaleString('ar-EG')} ج.م`);
                await this.openPlanCard(saleId);
                await this.render();
            } catch (err) { alert('تعذر إتمام التحصيل الجماعي: ' + (err.message || err)); }
        },

        openPayWizard: async function(instId) {
            this.payingInstallmentId = instId;
            const inst = await MotoDB.getById('installments', instId);
            if (!inst) return;

            const cust = allCustomers.find(c => c.id === inst.customerId);
            
            document.getElementById('pay-inst-cust-name').textContent = cust ? cust.name : 'مجهول';
            document.getElementById('pay-inst-number').textContent = `القسط رقم ${inst.installmentNumber}`;
            document.getElementById('pay-inst-due-date').textContent = inst.dueDate;
            document.getElementById('pay-inst-amount').textContent = inst.amount.toLocaleString('ar-EG') + " ج.م";
            
            document.getElementById('pay-actual-amount').value = inst.amount;
            document.getElementById('pay-actual-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('pay-notes').value = '';

            document.getElementById('installment-pay-modal').classList.remove('hidden');
        },

        closePayModal: function() {
            document.getElementById('installment-pay-modal').classList.add('hidden');
        },

        submitPayment: async function() {
            const instId = this.payingInstallmentId;
            const inst = await MotoDB.getById('installments', instId);
            if (!inst) return;

            const actualPaid = Number(document.getElementById('pay-actual-amount').value);
            const notes = document.getElementById('pay-notes').value.trim();

            if (actualPaid <= 0) {
                alert("يرجى إدخال مبلغ صحيح مدفوع.");
                return;
            }

            const selectedDateStr = document.getElementById('pay-actual-date').value;
            if (!selectedDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDateStr)) {
                alert("يرجى إدخال تاريخ تحصيل صحيح (YYYY-MM-DD).");
                return;
            }

            const now = new Date();

            try {
                inst.status = 'paid';
                inst.paidAmount = actualPaid;
                inst.paidDate = selectedDateStr;
                inst.notes = notes;
                await MotoDB.update('installments', inst);

                const cust = allCustomers.find(c => c.id === inst.customerId);
                const sale = await MotoDB.getById('sales', inst.saleId);

                // Create treasury transaction
                const txCode = await MotoDB.generateNextTxCode();
                const timeStr = selectedDateStr + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
                const txObj = {
                    code: txCode,
                    date: timeStr,
                    type: 'قبض',
                    category: 'قسط شهري',
                    amount: actualPaid,
                    description: `تحصيل قسط شهري رقم (${inst.installmentNumber}) للعميل (${cust ? cust.name : 'مجهول'}) - فاتورة (${sale ? sale.invoiceNo : ''})`,
                    user: currentRole === 'admin' ? 'Admin' : 'موظف حسابات',
                    paymentMethod: document.getElementById('pay-inst-payment-method').value || 'نقدي'
                };
                await MotoDB.add('transactions', txObj);

                // Update sale remaining amount
                if (sale) {
                    sale.remainingAmount = Math.max(0, sale.remainingAmount - actualPaid);
                    await MotoDB.update('sales', sale);
                }

                // Logging activity
                App.logActivity("تحصيل قسط شهري", `تحصيل القسط رقم (${inst.installmentNumber}) للعميل (${cust ? cust.name : 'مجهول'}) بمبلغ (${actualPaid.toLocaleString('ar-EG')} ج.م)`);
                await App.saveAutoBackup();

                this.closePayModal();
                
                // If the detail card of the sale is open, refresh it
                if (document.getElementById('plan-card-modal') && !document.getElementById('plan-card-modal').classList.contains('hidden')) {
                    this.openPlanCard(inst.saleId);
                }
                
                // Refresh overdue and due tabs
                if (typeof App.Installments.render === 'function') {
                    App.Installments.render();
                } else if (typeof renderInstallments === 'function') {
                    renderInstallments();
                }

                // Payment is complete. Receipt remains available through the optional print action.

            } catch (err) {
                alert("حدث خطأ أثناء حفظ عملية التحصيل: " + err);
            }
        },

        tafqeet: function(amount) {
            const num = Number(amount) || 0;
            if (num === 0) return 'صفر جنيه مصري لا غير';

            const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
                          'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
            const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
            const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

            function convertGroup(n) {
                let parts = [];
                const h = Math.floor(n / 100);
                const rem = n % 100;
                if (h > 0) parts.push(hundreds[h]);
                if (rem > 0) {
                    if (rem < 20) {
                        parts.push(ones[rem]);
                    } else {
                        const u = rem % 10;
                        const t = Math.floor(rem / 10);
                        if (u > 0) parts.push(ones[u] + ' و' + tens[t]);
                        else parts.push(tens[t]);
                    }
                }
                return parts.join(' و');
            }

            const intPart = Math.floor(num);
            const decPart = Math.round((num - intPart) * 100);

            let parts = [];
            const millions = Math.floor((intPart % 1000000000) / 1000000);
            const thousands = Math.floor((intPart % 1000000) / 1000);
            const remainder = intPart % 1000;

            if (millions > 0) {
                if (millions === 1) parts.push('مليون');
                else if (millions === 2) parts.push('مليونان');
                else if (millions >= 3 && millions <= 10) parts.push(convertGroup(millions) + ' ملايين');
                else parts.push(convertGroup(millions) + ' مليون');
            }
            if (thousands > 0) {
                if (thousands === 1) parts.push('ألف');
                else if (thousands === 2) parts.push('ألفان');
                else if (thousands >= 3 && thousands <= 10) parts.push(convertGroup(thousands) + ' آلاف');
                else parts.push(convertGroup(thousands) + ' ألف');
            }
            if (remainder > 0) {
                parts.push(convertGroup(remainder));
            }

            let text = parts.join(' و');
            if (!text) text = 'صفر';
            let result = 'فقط وقدره ' + text + ' جنيهاً مصرياً';
            if (decPart > 0) {
                result += ' و' + convertGroup(decPart) + ' قرشاً';
            }
            result += ' لا غير';
            return result;
        },

        printReceipt: async function(instId) {
            const inst = await MotoDB.getById('installments', instId);
            if (!inst) return;

            const cust = allCustomers.find(c => Number(c.id) === Number(inst.customerId));
            const sale = await MotoDB.getById('sales', inst.saleId);
            const unit = sale ? allUnits.find(u => Number(u.id) === Number(sale.unitId)) : null;
            const prod = unit ? allProducts.find(p => Number(p.id) === Number(unit.productId)) : null;

            // Load all installments for this sale to compute accurate counts
            const allInsts = await MotoDB.getAll('installments');
            const saleInsts = allInsts.filter(i => Number(i.saleId) === Number(inst.saleId)).sort((a,b) => a.installmentNumber - b.installmentNumber);
            const totalInsts = saleInsts.length || (sale ? sale.months : 0);
            const remainingCount = saleInsts.filter(i => i.status !== 'paid' && Number(i.id) !== Number(inst.id)).length;
            const paidVal = Number(inst.paidAmount || inst.amount || 0);
            const tafqeetText = this.tafqeet(paidVal);

            // Dynamic @page size for A4 printing (Receipt occupies half A4 height)
            let printStyle = document.getElementById('receipt-page-style');
            if (!printStyle) {
                printStyle = document.createElement('style');
                printStyle.id = 'receipt-page-style';
                document.head.appendChild(printStyle);
            }
            printStyle.innerHTML = '@media print { @page { size: A4 portrait; margin: 5mm 8mm 5mm 8mm; } }';

            const printBody = document.getElementById('receipt-print-body');
            printBody.innerHTML = `
                <div class="installment-receipt-a5">
                    <!-- Receipt Header -->
                    <div class="a5-receipt-header">
                        <div class="a5-header-brand">
                            ${BRANDING.logo ? `<img src="${BRANDING.logo}" class="a5-logo" alt="Logo">` : '<div class="a5-logo-icon">🏍️</div>'}
                            <div class="a5-brand-info">
                                <h2>${BRANDING.name || 'معرض MotoMax للدراجات النارية'}</h2>
                                <p>${BRANDING.address ? `العنوان: ${BRANDING.address}` : 'المركز الرئيسي'} ${BRANDING.phone ? `| هاتف: ${BRANDING.phone}` : ''}</p>
                                ${sale && sale.branch ? `<p>فرع التحصيل: <strong>${sale.branch}</strong></p>` : ''}
                            </div>
                        </div>
                        <div class="a5-header-badge">
                            <div class="a5-badge-title">إيصال سداد قسط شهري</div>
                            <div class="a5-badge-no">REC-${inst.id + 1000}</div>
                            <div class="a5-badge-date">تاريخ السداد: ${inst.paidDate || new Date().toISOString().split('T')[0]}</div>
                        </div>
                    </div>

                    <!-- Customer & Vehicle Info Box -->
                    <div class="a5-box">
                        <div class="a5-box-title"><i class="fa-solid fa-user-check"></i> بيانات العميل والتعاقد والمركبة</div>
                        <div class="a5-grid">
                            <div class="a5-grid-item"><span class="a5-lbl">اسم العميل:</span><strong class="a5-val">${cust ? cust.name : 'غير مسجل'}</strong></div>
                            <div class="a5-grid-item"><span class="a5-lbl">رقم الفاتورة/العقد:</span><strong class="a5-val text-primary">${sale ? sale.invoiceNo : '-'}</strong></div>
                            <div class="a5-grid-item"><span class="a5-lbl">المركبة المباعة:</span><strong class="a5-val">${prod ? prod.brand : 'موتوسيكل'} ${prod && prod.model ? `(${prod.model})` : ''}</strong></div>
                            <div class="a5-grid-item"><span class="a5-lbl">رقم الهاتف:</span><strong class="a5-val" dir="ltr">${cust ? (cust.phone || '-') : '-'}</strong></div>
                            <div class="a5-grid-item"><span class="a5-lbl">الرقم القومي:</span><strong class="a5-val" style="font-family:monospace;">${cust ? (cust.nid || '-') : '-'}</strong></div>
                            <div class="a5-grid-item"><span class="a5-lbl">اللون والشاسيه:</span><strong class="a5-val">${unit ? unit.color : '-'} | <span style="font-family:monospace;">${unit ? unit.chassis : '-'}</span></strong></div>
                        </div>
                    </div>

                    <!-- Installment Details Table Box -->
                    <div class="a5-box">
                        <div class="a5-box-title"><i class="fa-solid fa-file-invoice-dollar"></i> تفاصيل القسط والمبلغ المحصل</div>
                        <table class="a5-table">
                            <thead>
                                <tr>
                                    <th>بيان الدفعة</th>
                                    <th>رقم القسط</th>
                                    <th>تاريخ الاستحقاق</th>
                                    <th>المبلغ المحصل</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>سداد دفعة قسط شهري</strong></td>
                                    <td>قسط (${inst.installmentNumber}) من أصل (${totalInsts})</td>
                                    <td>${inst.dueDate || '-'}</td>
                                    <td class="a5-amount-cell">${paidVal.toLocaleString('ar-EG')} ج.م</td>
                                </tr>
                            </tbody>
                        </table>
                        <div class="a5-tafqeet">
                            <span class="a5-tafqeet-lbl">المبلغ بالحروف:</span>
                            <strong class="a5-tafqeet-val">${tafqeetText}</strong>
                        </div>
                    </div>

                    <!-- Financial Summary Matrix -->
                    <div class="a5-summary-grid">
                        <div class="a5-summary-cell">
                            <span class="s-lbl">إجمالي العقد</span>
                            <span class="s-val">${sale ? sale.salePrice.toLocaleString('ar-EG') : 0} ج.م</span>
                        </div>
                        <div class="a5-summary-cell highlight-paid">
                            <span class="s-lbl">المسدد بالإيصال</span>
                            <span class="s-val">${paidVal.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        <div class="a5-summary-cell highlight-rem">
                            <span class="s-lbl">المتبقي من العقد</span>
                            <span class="s-val">${sale ? sale.remainingAmount.toLocaleString('ar-EG') : 0} ج.م</span>
                        </div>
                        <div class="a5-summary-cell">
                            <span class="s-lbl">الأقساط المتبقية</span>
                            <span class="s-val">${remainingCount} قسط</span>
                        </div>
                    </div>

                    ${inst.notes ? `
                    <div class="a5-notes-box">
                        <strong>ملاحظات:</strong> ${inst.notes}
                    </div>` : ''}

                    <!-- Signatures -->
                    <div class="a5-signatures-row">
                        <div class="a5-sig-box">
                            <div class="a5-sig-title">توقيع المستلم (الخزينة)</div>
                            <div class="a5-sig-line">التوقيع والختم</div>
                        </div>
                        <div class="a5-sig-box">
                            <div class="a5-sig-title">توقيع العميل المسدد</div>
                            <div class="a5-sig-line">الاسم والتوقيع</div>
                        </div>
                    </div>

                    <!-- Receipt Footer Notes -->
                    <div class="a5-footer">
                        ${BRANDING.receiptFooter ? `<div class="a5-footer-custom">${BRANDING.receiptFooter}</div>` : ''}
                        <div class="a5-footer-sys">
                            <span>المستخدم: ${currentRole === 'admin' ? 'الإدارة' : currentRole}</span>
                            <span>وقت الطباعة: ${new Date().toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</span>
                            <span>نظام Moto_ERP | Hossam Hamaki</span>
                        </div>
                    </div>

                    <!-- Cutting Guide Line for Half-A4 Page -->
                    <div class="a5-cut-guide">
                        <span>✂</span> <span>خط قص الورقة (منتصف صفحة A4)</span> <span>✂</span>
                    </div>
                </div>
            `;

            document.getElementById('receipt-modal-title-lbl').textContent = `عرض وطباعة إيصال سداد القسط المالي (REC-${inst.id + 1000})`;
            document.getElementById('receipt-print-modal').classList.remove('hidden');
        },

        deletePayment: async function(instId) {
            const inst = await MotoDB.getById('installments', instId);
            if (!inst) return;

            if (currentRole !== 'admin' && currentRole !== 'accounting') {
                alert("خطأ: غير مسموح بإلغاء التحصيلات إلا لمدير النظام أو المحاسب فقط.");
                return;
            }

            if (!await BakryDialogs.confirm("هل أنت متأكد من إلغاء وحذف عملية تحصيل هذا القسط؟\nسيتم إرجاع حالة القسط إلى 'معلق' وحذف حركة الخزينة المرتبطة به.")) {
                return;
            }

            try {
                const sale = await MotoDB.getById('sales', inst.saleId);
                const cust = allCustomers.find(c => c.id === inst.customerId);

                // Find and delete the transaction
                const txs = await MotoDB.getAll('transactions');
                const tx = txs.find(t => t.category === 'قسط شهري' && t.description.includes(`قسط شهري رقم (${inst.installmentNumber})`) && t.description.includes(`فاتورة (${sale ? sale.invoiceNo : ''})`));
                
                if (tx) {
                    await MotoDB.delete('transactions', tx.id);
                }

                // Update sale remainingAmount
                if (sale) {
                    sale.remainingAmount = sale.remainingAmount + (inst.paidAmount || inst.amount);
                    await MotoDB.update('sales', sale);
                }

                // Reset installment status
                inst.status = 'pending';
                inst.paidAmount = 0;
                inst.paidDate = null;
                inst.notes = '';
                await MotoDB.update('installments', inst);

                App.logActivity("إلغاء تحصيل قسط", `إلغاء تحصيل القسط رقم (${inst.installmentNumber}) للعميل (${cust ? cust.name : 'مجهول'})`);
                await App.saveAutoBackup();

                this.openPlanCard(inst.saleId);
                if (typeof this.render === 'function') this.render();
            } catch (err) {
                alert("فشل إلغاء التحصيل: " + err);
            }
        },

        openEditPayment: async function(instId) {
            const inst = await MotoDB.getById('installments', instId);
            if (!inst) return;

            if (currentRole !== 'admin' && currentRole !== 'accounting' && currentRole !== 'sales') {
                alert("خطأ: غير مسموح بتعديل التحصيلات.");
                return;
            }

            const sale = await MotoDB.getById('sales', inst.saleId);
            const cust = allCustomers.find(c => c.id === inst.customerId);

            const newAmountStr = prompt("أدخل قيمة المبلغ المحصل الجديد (ج.م):", inst.paidAmount || inst.amount);
            if (newAmountStr === null) return;
            const newAmount = Number(newAmountStr);
            if (isNaN(newAmount) || newAmount <= 0) {
                alert("يرجى إدخال مبلغ صحيح.");
                return;
            }

            const newDate = prompt("أدخل تاريخ التحصيل الجديد (YYYY-MM-DD):", inst.paidDate || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'));
            if (newDate === null) return;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                alert("تنسيق التاريخ غير صحيح. يجب أن يكون YYYY-MM-DD");
                return;
            }

            const newNotes = prompt("أدخل ملاحظات التحصيل الجديدة:", inst.notes || '');
            if (newNotes === null) return;

            try {
                const oldPaid = inst.paidAmount || inst.amount;
                const diff = newAmount - oldPaid;

                // Update sale remainingAmount
                if (sale) {
                    sale.remainingAmount = Math.max(0, sale.remainingAmount - diff);
                    await MotoDB.update('sales', sale);
                }

                // Find and update the transaction
                const txs = await MotoDB.getAll('transactions');
                const tx = txs.find(t => t.category === 'قسط شهري' && t.description.includes(`قسط شهري رقم (${inst.installmentNumber})`) && t.description.includes(`فاتورة (${sale ? sale.invoiceNo : ''})`));
                if (tx) {
                    tx.amount = newAmount;
                    tx.date = newDate + ' ' + (tx.date.split(' ')[1] || '00:00');
                    await MotoDB.update('transactions', tx);
                }

                // Update installment and propagate due date shift to remaining unpaid installments
                inst.paidAmount = newAmount;
                inst.paidDate = newDate;
                inst.notes = newNotes;

                const installments = await MotoDB.getAll('installments');
                const saleInsts = installments.filter(i => i.saleId === inst.saleId).sort((a,b) => a.installmentNumber - b.installmentNumber);

                const modifiedInsts = [inst];
                const dateParts = newDate.split('-');
                const baseDate = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));

                for (let other of saleInsts) {
                    if (other.installmentNumber > inst.installmentNumber && other.status !== 'paid') {
                        const diffMonths = other.installmentNumber - inst.installmentNumber;
                        const targetMonth = baseDate.getMonth() + diffMonths;
                        
                        const testDate = new Date(baseDate.getFullYear(), targetMonth, 1);
                        const lastDayOfTargetMonth = new Date(testDate.getFullYear(), testDate.getMonth() + 1, 0).getDate();
                        const targetDay = Math.min(baseDate.getDate(), lastDayOfTargetMonth);
                        
                        const calculatedDate = new Date(baseDate.getFullYear(), targetMonth, targetDay);
                        const yyyy = calculatedDate.getFullYear();
                        const mm = String(calculatedDate.getMonth() + 1).padStart(2, '0');
                        const dd = String(calculatedDate.getDate()).padStart(2, '0');
                        other.dueDate = `${yyyy}-${mm}-${dd}`;
                        modifiedInsts.push(other);
                    }
                }

                await MotoDB.updateBatch('installments', modifiedInsts);

                App.logActivity("تعديل تحصيل قسط", `تعديل تفاصيل تحصيل القسط رقم (${inst.installmentNumber}) وما يليه للعميل (${cust ? cust.name : 'مجهول'}) لتصبح بقيمة (${newAmount.toLocaleString('ar-EG')} ج.م) وتاريخ سداد جديد`);
                await App.saveAutoBackup();

                this.openPlanCard(inst.saleId);
                if (typeof this.render === 'function') this.render();
            } catch (err) {
                alert("فشل تعديل التحصيل: " + err);
            }
        },

        openEditDueDate: async function(instId) {
            const inst = await MotoDB.getById('installments', instId);
            if (!inst) return;

            if (currentRole === 'viewer') {
                alert("خطأ: غير مسموح بتعديل تواريخ استحقاق الأقساط لصلاحية العرض فقط.");
                return;
            }

            const sale = await MotoDB.getById('sales', inst.saleId);
            const cust = allCustomers.find(c => c.id === inst.customerId);

            const newDate = prompt("أدخل تاريخ الاستحقاق الجديد للقسط (YYYY-MM-DD):", inst.dueDate);
            if (newDate === null) return;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                alert("تنسيق التاريخ غير صحيح. يجب أن يكون YYYY-MM-DD");
                return;
            }

            const newNotes = prompt("أدخل ملاحظات الاستحقاق/التحصيل لهذا القسط (اختياري):", inst.notes || '');
            if (newNotes === null) return;

            try {
                // Fetch all installments for this sale
                const installments = await MotoDB.getAll('installments');
                const saleInsts = installments.filter(i => i.saleId === inst.saleId).sort((a,b) => a.installmentNumber - b.installmentNumber);

                const modifiedInsts = [];
                const dateParts = newDate.split('-');
                const baseDate = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));

                for (let other of saleInsts) {
                    if (other.id === inst.id) {
                        other.dueDate = newDate;
                        other.notes = newNotes;
                        modifiedInsts.push(other);
                    } else if (other.installmentNumber > inst.installmentNumber && other.status !== 'paid') {
                        const diffMonths = other.installmentNumber - inst.installmentNumber;
                        const targetMonth = baseDate.getMonth() + diffMonths;
                        
                        // Handle calendar differences between months safely
                        const testDate = new Date(baseDate.getFullYear(), targetMonth, 1);
                        const lastDayOfTargetMonth = new Date(testDate.getFullYear(), testDate.getMonth() + 1, 0).getDate();
                        const targetDay = Math.min(baseDate.getDate(), lastDayOfTargetMonth);
                        
                        const calculatedDate = new Date(baseDate.getFullYear(), targetMonth, targetDay);
                        const yyyy = calculatedDate.getFullYear();
                        const mm = String(calculatedDate.getMonth() + 1).padStart(2, '0');
                        const dd = String(calculatedDate.getDate()).padStart(2, '0');
                        other.dueDate = `${yyyy}-${mm}-${dd}`;
                        modifiedInsts.push(other);
                    }
                }

                // Batch update
                await MotoDB.updateBatch('installments', modifiedInsts);

                App.logActivity("تعديل تاريخ استحقاق أقساط", `تعديل تاريخ القسط رقم (${inst.installmentNumber}) وما يليه للعميل (${cust ? cust.name : 'مجهول'}) لتصبح من تاريخ (${newDate})`);
                await App.saveAutoBackup();

                this.openPlanCard(inst.saleId);
                if (typeof this.render === 'function') this.render();
            } catch (err) {
                alert("فشل تعديل التاريخ: " + err);
            }
        }
    },

    /* ==========================================================================
       SUBMODULE: ACCOUNTING & SAFEBOX MOVEMENTS
       ========================================================================== */
    Accounting: {
        currentPage: 1,
        pageSize: 25,
        totalPages: 1,
        activeSubTab: 'transactions',

        prevPage: function() {
            if (this.activeSubTab === 'transactions') {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderTransactions(true);
                }
            }
        },
        nextPage: function() {
            if (this.activeSubTab === 'transactions') {
                if (this.currentPage < this.totalPages) {
                    this.currentPage++;
                    this.renderTransactions(true);
                }
            }
        },

        render: async function() {
            await this.updateSafeMetrics();
            this.switchSubTab(this.activeSubTab);
        },

        updateSafeMetrics: async function() {
            const txs = await MotoDB.getAll('transactions');
            let safeBalance = 0;
            let totalIncome = 0;
            let totalExpense = 0;
            
            txs.forEach(t => {
                if (t.type === 'قبض') {
                    safeBalance += t.amount;
                    totalIncome += t.amount;
                } else {
                    safeBalance -= t.amount;
                    totalExpense += t.amount;
                }
            });

            const netProfit = totalIncome - totalExpense;

            document.getElementById('acc-safe-balance').textContent = safeBalance.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('acc-safe-transactions-count').textContent = `${txs.length} عمليات مسجلة بالخزينة`;
            document.getElementById('acc-total-income').textContent = totalIncome.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('acc-total-expense').textContent = totalExpense.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('acc-net-profit').textContent = netProfit.toLocaleString('ar-EG') + " ج.م";
        },

        switchSubTab: function(subTabId) {
            this.activeSubTab = subTabId;
            
            document.querySelectorAll('#accounting-page .sub-tab').forEach(btn => {
                btn.classList.remove('active');
                const btnSubtab = btn.getAttribute('data-subtab');
                if (btnSubtab === `acc-${subTabId}` || btnSubtab === subTabId) {
                    btn.classList.add('active');
                }
            });

            document.querySelectorAll('#accounting-page .subtab-content').forEach(div => div.classList.remove('active'));
            const subtabDiv = document.getElementById(`${subTabId}-subtab`) || document.getElementById(`acc-${subTabId}-subtab`);
            if (subtabDiv) subtabDiv.classList.add('active');

            if (subTabId === 'transactions') {
                this.renderTransactions();
            } else if (subTabId === 'supplier-dues') {
                this.renderSupplierDues();
            }
        },

        renderTransactions: async function(keepPage = false) {
            if (!keepPage) this.currentPage = 1;
            
            const txs = await MotoDB.getAll('transactions');
            const tableBody = document.getElementById('accounting-transactions-body');
            tableBody.innerHTML = '';

            const sortedTxs = [...txs].sort((a,b) => b.id - a.id);

            const totalMatches = sortedTxs.length;
            const totalPages = Math.ceil(totalMatches / this.pageSize) || 1;
            this.totalPages = totalPages;
            if (this.currentPage > totalPages) this.currentPage = totalPages;
            
            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            const pageItems = sortedTxs.slice(start, end);

            if (pageItems.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">لا يوجد حركات قيود مسجلة في الخزينة بعد.</td></tr>`;
                document.getElementById('acc-pagination-info').textContent = 'عرض 0 من 0 حركة';
                document.getElementById('acc-btn-prev').disabled = true;
                document.getElementById('acc-btn-next').disabled = true;
                return;
            }

            pageItems.forEach(t => {
                const tr = document.createElement('tr');
                const badgeColor = t.type === 'قبض' ? 'success' : 'danger';
                
                tr.innerHTML = `
                    <td><strong>${t.code}</strong></td>
                    <td>${t.date}</td>
                    <td><span class="badge-status ${badgeColor}">${t.type}</span></td>
                    <td><strong>${t.category}</strong></td>
                    <td class="font-bold text-${t.type === 'قبض' ? 'emerald' : 'crimson'}">${t.amount.toLocaleString('ar-EG')} ج.م</td>
                    <td><span class="text-xs text-secondary">${t.description}</span></td>
                    <td><span class="text-muted text-xs">${t.user}</span></td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-icon-only btn-edit-row allow-acc-edit" onclick="App.Accounting.openEditTransactionModal(${t.id})" title="تعديل السند">
                                <i class="fa-solid fa-edit text-orange"></i>
                            </button>
                            <button class="btn btn-danger btn-icon-only btn-delete-row allow-acc-delete" onclick="App.Accounting.deleteTransaction(${t.id})" title="حذف السند">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            document.getElementById('acc-pagination-info').textContent = `عرض ${start + 1}-${Math.min(end, totalMatches)} من ${totalMatches} حركة`;
            document.getElementById('acc-btn-prev').disabled = (this.currentPage === 1);
            document.getElementById('acc-btn-next').disabled = (this.currentPage === totalPages);
        },

        openTransactionModal: function() {
            document.getElementById('trans-id').value = '';
            document.getElementById('transaction-form').reset();
            this.onTransTypeChange('قبض');
            document.getElementById('trans-modal-title').textContent = "تسجيل مستند مالي (قبض / صرف من الخزينة)";
            // تعيين تاريخ اليوم كقيمة افتراضية
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            document.getElementById('trans-date').value = `${yyyy}-${mm}-${dd}`;
            document.getElementById('transaction-modal').classList.remove('hidden');
        },

        closeTransactionModal: function() {
            document.getElementById('transaction-modal').classList.add('hidden');
        },

        onTransTypeChange: function(type) {
            const catSelect = document.getElementById('trans-category');
            catSelect.innerHTML = '';

            if (type === 'قبض') {
                catSelect.innerHTML = `
                    <option value="رأس مال إضافي">رأس مال إضافي (حقن نقدي)</option>
                    <option value="مبيعات كاش">إيراد مبيعات كاش</option>
                    <option value="مقدم قسط">إيراد مقدم قسط</option>
                    <option value="قسط شهري">إيراد قسط شهري</option>
                    <option value="إيرادات أخرى">إيرادات أخرى متنوعة</option>
                `;
            } else {
                catSelect.innerHTML = `
                    <option value="شراء بضاعة">شراء بضاعة (دراجات وشاسيهات)</option>
                    <option value="مصاريف تشغيلية">مصاريف تشغيلية (إيجار، كهرباء...)</option>
                    <option value="رواتب وأجور">رواتب وأجور موظفين</option>
                    <option value="خدمات وصيانة">مصاريف صيانة وخدمات شحن</option>
                    <option value="مصاريف أخرى">مصاريف أخرى متنوعة</option>
                `;
            }
        },

        saveTransaction: async function(e) {
            e.preventDefault();

            const transIdVal = document.getElementById('trans-id').value;
            if (App.isDemoMode && !transIdVal) {
                const txs = await MotoDB.getAll('transactions');
                if (txs.length >= 3) {
                    alert("عذراً، هذه نسخة تجريبية محدودة بـ 3 معاملات مالية فقط. لتفعيل النسخة الكاملة يرجى التواصل مع Hossam Hamaki.");
                    return;
                }
            }
            const type = document.getElementById('trans-type').value;
            const category = document.getElementById('trans-category').value;
            const amount = Number(document.getElementById('trans-amount').value);
            const description = document.getElementById('trans-description').value.trim();
            const manualDate = document.getElementById('trans-date').value;

            if (!manualDate) {
                alert("يرجى تحديد تاريخ السند المالي.");
                return;
            }

            if (amount < 0) {
                alert("يجب كتابة مبلغ مالي صحيح.");
                return;
            }

            if (currentRole !== 'admin' && currentRole !== 'accounting') {
                alert("خطأ: غير مسموح بإجراء العمليات المالية إلا للمدير العام أو المحاسب فقط.");
                return;
            }

            const now = new Date();
            const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
            const dateStr = manualDate + ' ' + timeStr;

            try {
                if (transIdVal) {
                    const txId = Number(transIdVal);
                    const txObj = await MotoDB.getById('transactions', txId);
                    if (txObj) {
                        txObj.type = type;
                        txObj.category = category;
                        txObj.amount = amount;
                        txObj.description = description;
                        txObj.date = dateStr;
                        await MotoDB.update('transactions', txObj);
                        
                        App.logActivity("تعديل حركة خزينة", `تعديل حركة الخزينة رقم (${txObj.code}) لتصبح بقيمة (${amount.toLocaleString('ar-EG')} ج.م) تحت تصنيف (${category})`);
                    }
                } else {
                    const txCode = await MotoDB.generateNextTxCode();
                    const txObj = {
                        code: txCode,
                        date: dateStr,
                        type,
                        category,
                        amount,
                        description,
                        user: currentRole === 'admin' ? 'Admin' : 'موظف حسابات',
                        paymentMethod: document.getElementById('trans-payment-method').value || 'نقدي'
                    };
                    await MotoDB.add('transactions', txObj);

                    App.logActivity("حركة خزينة يدوية", `تسجيل حركة (${type}) بقيمة (${amount.toLocaleString('ar-EG')} ج.م) تحت تصنيف (${category}) - البيان: ${description}`);
                }
                
                await App.saveAutoBackup();
                this.closeTransactionModal();
                this.render();
            } catch (err) {
                alert(err);
            }
        },

        openEditTransactionModal: async function(id) {
            const tx = await MotoDB.getById('transactions', id);
            if (!tx) return;

            if (currentRole !== 'admin' && currentRole !== 'accounting') {
                alert("خطأ: غير مسموح بتعديل السندات إلا للمدير العام أو المحاسب فقط.");
                return;
            }

            document.getElementById('trans-id').value = tx.id;
            document.getElementById('trans-type').value = tx.type;
            this.onTransTypeChange(tx.type);
            document.getElementById('trans-category').value = tx.category;
            document.getElementById('trans-amount').value = tx.amount;
            document.getElementById('trans-description').value = tx.description;

            // تعبئة حقل التاريخ من بيانات السند المسجل
            if (tx.date) {
                // التاريخ مخزن بصيغة "YYYY-MM-DD HH:MM" أو "YYYY-MM-DD"
                document.getElementById('trans-date').value = tx.date.substring(0, 10);
            } else {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                document.getElementById('trans-date').value = `${yyyy}-${mm}-${dd}`;
            }

            document.getElementById('trans-modal-title').textContent = `تعديل المستند المالي (${tx.code})`;
            document.getElementById('transaction-modal').classList.remove('hidden');
        },

        deleteTransaction: async function(id) {
            const tx = await MotoDB.getById('transactions', id);
            if (!tx) return;

            if (currentRole !== 'admin' && currentRole !== 'accounting') {
                alert("خطأ: غير مسموح بحذف السندات إلا للمدير العام أو المحاسب فقط.");
                return;
            }

            if (!await BakryDialogs.confirm(`هل أنت متأكد من حذف السند المالي (${tx.code}) بالكامل من الخزينة؟\nملاحظة: هذا الإجراء لا يمكن التراجع عنه ويؤثر على رصيد الخزينة الإجمالي.`)) {
                return;
            }

            try {
                await MotoDB.delete('transactions', id);
                App.logActivity("حذف حركة خزينة", `حذف حركة الخزينة رقم (${tx.code}) بقيمة (${tx.amount.toLocaleString('ar-EG')} ج.م)`);
                await App.saveAutoBackup();
                this.render();
            } catch (err) {
                alert("فشل حذف السند: " + err);
            }
        },

        renderSupplierDues: async function() {
            const searchVal = document.getElementById('supplier-dues-search').value.trim().toLowerCase();
            const tableBody = document.getElementById('supplier-dues-table-body');
            tableBody.innerHTML = '';

            try {
                const dues = await MotoDB.getAll('supplier_dues');
                const suppliers = await MotoDB.getAll('suppliers');

                let filtered = [];
                dues.forEach(d => {
                    const sup = suppliers.find(s => s.id === d.supplierId);
                    const supName = sup ? sup.name : 'مورد غير معروف';
                    
                    if (searchVal) {
                        if (!supName.toLowerCase().includes(searchVal) && !d.invoiceNo.toLowerCase().includes(searchVal)) {
                            return;
                        }
                    }
                    filtered.push({ d, supName });
                });

                if (filtered.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">لا يوجد مديونيات أو أقساط موردين مسجلة.</td></tr>`;
                    return;
                }

                filtered.sort((a,b) => b.d.id - a.d.id);

                filtered.forEach(item => {
                    const d = item.d;
                    const remaining = d.totalAmount - d.paidAmount;
                    
                    let statusClass = 'warning';
                    let statusLbl = 'قيد الانتظار';
                    if (d.status === 'paid' || remaining <= 0) {
                        statusClass = 'success';
                        statusLbl = 'مسدد بالكامل';
                    } else {
                        const todayStr = new Date().toISOString().split('T')[0];
                        if (d.dueDate < todayStr) {
                            statusClass = 'danger';
                            statusLbl = 'متأخر ومستحق';
                        } else {
                            statusClass = 'warning';
                            statusLbl = 'مستمر (غير مسدد)';
                        }
                    }

                    const actionBtn = remaining > 0 ? 
                        `<button class="btn btn-primary btn-icon-only" onclick="App.Accounting.openPaySupplierModal(${d.id})" title="تسديد دفعة للمورد" data-permission="write">
                            <i class="fa-solid fa-hand-holding-dollar"></i>
                        </button>` : 
                        `<span class="text-emerald text-xs font-bold"><i class="fa-solid fa-circle-check"></i> تم السداد</span>`;

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${item.supName}</strong></td>
                        <td><span class="text-cyan font-bold">${d.invoiceNo}</span></td>
                        <td>${d.dueDate}</td>
                        <td class="font-bold text-orange">${d.totalAmount.toLocaleString('ar-EG')} ج.م</td>
                        <td class="font-bold text-emerald">${d.paidAmount.toLocaleString('ar-EG')} ج.م</td>
                        <td class="font-bold text-crimson">${remaining.toLocaleString('ar-EG')} ج.م</td>
                        <td><span class="badge-status ${statusClass}">${statusLbl}</span></td>
                        <td><span class="text-xs text-muted">${d.notes || '-'}</span></td>
                        <td class="actions-col">
                            <div class="action-buttons">
                                ${actionBtn}
                                <button class="btn btn-danger btn-icon-only btn-delete-row allow-acc-delete" onclick="App.Accounting.deleteSupplierDue(${d.id})" title="حذف المديونية" data-permission="delete">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });

                App.applyPermissions();
            } catch (err) {
                console.error("Error rendering supplier dues:", err);
            }
        },

        searchSupplierDues: function() {
            this.renderSupplierDues();
        },

        openAddSupplierDueModal: async function() {
            const selectEl = document.getElementById('sup-due-supplier-id');
            selectEl.innerHTML = '';
            
            const suppliers = await MotoDB.getAll('suppliers');
            if (suppliers.length === 0) {
                alert("تنبيه: يجب تسجيل مورد واحد على الأقل أولاً لتتمكن من إنشاء مديونيات!");
                App.switchTab('suppliers');
                return;
            }

            suppliers.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.name} (كود: ${s.code})`;
                selectEl.appendChild(opt);
            });

            document.getElementById('supplier-due-form').reset();
            const todayStr = new Date().toISOString().split('T')[0];
            document.getElementById('sup-due-date').value = todayStr;

            document.getElementById('supplier-due-modal').classList.remove('hidden');
        },

        closeAddSupplierDueModal: function() {
            document.getElementById('supplier-due-modal').classList.add('hidden');
        },

        saveSupplierDue: async function(e) {
            e.preventDefault();

            const supplierId = Number(document.getElementById('sup-due-supplier-id').value);
            const invoiceNo = document.getElementById('sup-due-invoice').value.trim();
            const dueDate = document.getElementById('sup-due-date').value;
            const totalAmount = Number(document.getElementById('sup-due-total').value);
            const notes = document.getElementById('sup-due-notes').value.trim();

            if (totalAmount < 0) {
                alert("يرجى إدخال قيمة صحيحة للفاتورة.");
                return;
            }

            const dueObj = {
                supplierId,
                invoiceNo,
                dueDate,
                totalAmount,
                paidAmount: 0,
                status: 'pending',
                notes
            };

            try {
                await MotoDB.add('supplier_dues', dueObj);
                
                const suppliers = await MotoDB.getAll('suppliers');
                const sup = suppliers.find(s => s.id === supplierId);
                const supName = sup ? sup.name : 'مورد';

                App.logActivity("تسجيل مديونية مورد", `تسجيل فاتورة بالآجل للمورد (${supName}) برقم (${invoiceNo}) وقيمة (${totalAmount.toLocaleString('ar-EG')} ج.م)`);
                await App.saveAutoBackup();
                
                this.closeAddSupplierDueModal();
                this.switchSubTab('supplier-dues');
            } catch (err) {
                alert("فشل الحفظ: " + err);
            }
        },

        openPaySupplierModal: async function(dueId) {
            const d = await MotoDB.getById('supplier_dues', dueId);
            if (!d) return;

            const suppliers = await MotoDB.getAll('suppliers');
            const sup = suppliers.find(s => s.id === d.supplierId);
            const supName = sup ? sup.name : 'مورد غير معروف';

            document.getElementById('pay-sup-due-id').value = dueId;
            document.getElementById('pay-sup-name').textContent = supName;
            document.getElementById('pay-sup-invoice').textContent = d.invoiceNo;
            document.getElementById('pay-sup-due-date-lbl').textContent = d.dueDate;
            
            const remaining = d.totalAmount - d.paidAmount;
            document.getElementById('pay-sup-remaining-lbl').textContent = remaining.toLocaleString('ar-EG') + " ج.م";
            document.getElementById('pay-sup-actual-amount').value = remaining;
            document.getElementById('pay-sup-actual-amount').max = remaining;
            document.getElementById('pay-sup-notes').value = '';

            document.getElementById('pay-supplier-modal').classList.remove('hidden');
        },

        closePaySupplierModal: function() {
            document.getElementById('pay-supplier-modal').classList.add('hidden');
        },

        submitSupplierPayment: async function(e) {
            e.preventDefault();

            const dueId = Number(document.getElementById('pay-sup-due-id').value);
            const amountToPay = Number(document.getElementById('pay-sup-actual-amount').value);
            const payNotes = document.getElementById('pay-sup-notes').value.trim();

            const d = await MotoDB.getById('supplier_dues', dueId);
            if (!d) return;

            const remaining = d.totalAmount - d.paidAmount;
            if (amountToPay <= 0 || amountToPay > remaining) {
                alert("يرجى إدخال مبلغ سداد صحيح لا يتجاوز القيمة المتبقية للمورد.");
                return;
            }

            try {
                d.paidAmount += amountToPay;
                if (d.paidAmount >= d.totalAmount) {
                    d.status = 'paid';
                }
                await MotoDB.update('supplier_dues', d);

                const suppliers = await MotoDB.getAll('suppliers');
                const sup = suppliers.find(s => s.id === d.supplierId);
                const supName = sup ? sup.name : 'مورد';

                const txCode = await MotoDB.generateNextTxCode();
                const now = new Date();
                const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

                const txObj = {
                    code: txCode,
                    date: dateStr,
                    type: 'صرف',
                    category: 'شراء بضاعة',
                    amount: amountToPay,
                    description: `سداد دفعة مالية للمورد (${supName}) - فاتورة رقم (${d.invoiceNo}) - ملاحظات: ${payNotes}`,
                    refId: dueId,
                    user: currentRole === 'admin' ? 'Admin' : 'موظف حسابات',
                    paymentMethod: document.getElementById('pay-sup-payment-method').value || 'نقدي'
                };
                await MotoDB.add('transactions', txObj);

                App.logActivity("تسديد قسط مورد", `سداد دفعة مالية للمورد (${supName}) بقيمة (${amountToPay.toLocaleString('ar-EG')} ج.م) للفاتورة (${d.invoiceNo})`);
                await App.saveAutoBackup();
                
                this.closePaySupplierModal();
                this.render();
            } catch (err) {
                alert("فشل عملية الدفع: " + err);
            }
        },

        deleteSupplierDue: async function(dueId) {
            if (await BakryDialogs.confirm("هل أنت متأكد من رغبتك في حذف مديونية المورد هذه؟ (سيؤدي ذلك لإلغاء القيد دون التأثير على عمليات الصرف السابقة)")) {
                try {
                    await MotoDB.delete('supplier_dues', dueId);
                    App.logActivity("حذف مديونية مورد", `حذف مديونية مورد بالمعرف رقم ${dueId}`);
                    await App.saveAutoBackup();
                    this.switchSubTab('supplier-dues');
                } catch (err) {
                    alert("فشل الحذف: " + err);
                }
            }
        }
    },


    /* ==========================================================================
       SUBMODULE: DEFAULTS & OVERDUES REPORT
       ========================================================================== */
    Defaults: {
        render: async function() {
            const tableBody = document.getElementById('defaults-table-body');
            if (!tableBody) {
                console.error('تقرير التعثر غير جاهز: العنصر defaults-table-body غير موجود.');
                return;
            }
            tableBody.innerHTML = '';

            const sales = await MotoDB.getAll('sales');
            const installments = await MotoDB.getAll('installments');
            const collectionNotes = await MotoDB.getAll('collection_notes');
            
            // Group overdue installments by customer
            const overdueByCustomer = {};
            const todayStr = new Date().toISOString().split('T')[0];

            installments.forEach(inst => {
                const isOverdue = inst.status === 'overdue' || (inst.status === 'pending' && inst.dueDate < todayStr);
                if (isOverdue) {
                    const custId = inst.customerId;
                    if (!overdueByCustomer[custId]) {
                        overdueByCustomer[custId] = {
                            installments: [],
                            amountSum: 0,
                            saleId: inst.saleId
                        };
                    }
                    overdueByCustomer[custId].installments.push(inst);
                    overdueByCustomer[custId].amountSum += inst.amount;
                }
            });

            const customerIds = Object.keys(overdueByCustomer);
            if (customerIds.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">لا يوجد عملاء متعثرون حالياً في النظام. المعرض بصحة جيدة!</td></tr>`;
                return;
            }

            for (let custIdStr of customerIds) {
                const custId = Number(custIdStr);
                const cust = allCustomers.find(c => c.id === custId);
                if (!cust) continue;

                const data = overdueByCustomer[custIdStr];
                const sale = sales.find(s => s.id === data.saleId);
                const invoiceNo = sale ? sale.invoiceNo : '-';

                // Find latest contact note for this customer/sale
                const custNotes = collectionNotes.filter(n => n.saleId === data.saleId);
                let latestNote = 'لا يوجد سجل تواصل.';
                if (custNotes.length > 0) {
                    custNotes.sort((a, b) => b.id - a.id);
                    latestNote = `[${custNotes[0].date}] ${custNotes[0].user}: ${custNotes[0].note}`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${cust.code}</strong></td>
                    <td><strong>${cust.name}</strong></td>
                    <td class="font-bold text-cyan">${cust.phone}</td>
                    <td><strong class="text-orange">${invoiceNo}</strong></td>
                    <td><span class="badge-status danger">متأخر ${data.installments.length} أقساط</span></td>
                    <td class="font-bold text-crimson">${data.amountSum.toLocaleString('ar-EG')} ج.م</td>
                    <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${latestNote}">
                        <span class="text-muted text-xs">${latestNote}</span>
                    </td>
                    <td class="actions-col">
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Customers.openCard(${cust.id})" title="عرض الكرت">
                                <i class="fa-solid fa-address-card text-cyan"></i>
                            </button>
                            <button class="btn btn-primary btn-icon-only" onclick="App.Defaults.addContactNoteModal(${data.saleId}, '${cust.name}')" title="تسجيل تواصل / ملاحظة">
                                <i class="fa-solid fa-comment-medical"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            }

            App.applyPermissions();
        },

        addContactNoteModal: function(saleId, customerName) {
            const noteText = prompt(`تسجيل تواصل جديد مع العميل (${customerName}):\nيرجى كتابة تفاصيل التواصل الهاتفي أو الزيارة الميدانية:`);
            if (noteText === null) return;
            if (!noteText.trim()) {
                alert("يجب كتابة نص الملاحظة لحفظها!");
                return;
            }

            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const noteObj = {
                saleId: saleId,
                date: dateStr,
                user: currentRole === 'admin' ? 'Admin' : 'موظف حسابات',
                note: noteText.trim()
            };

            MotoDB.add('collection_notes', noteObj)
                .then(async () => {
                    await App.saveAutoBackup();
                    alert("تم حفظ ملاحظة التواصل والمتابعة بنجاح!");
                    App.Defaults.render();
                })
                .catch(err => {
                    alert("فشل الحفظ: " + err);
                });
        }
    },

    /* ==========================================================================
       SUBMODULE: TRAFFIC LETTERS & LICENSING NOTIFICATIONS (جوابات وإخطارات المرور)
       ========================================================================== */
    Traffic: {
        currentFilter: 'all',
        _allRows: [],

        calculateBusinessDays: function(startDateStr, endDateStr) {
            if (!startDateStr) return 0;
            const start = new Date(startDateStr);
            const end = endDateStr ? new Date(endDateStr) : new Date();
            start.setHours(0, 0, 0, 0);
            end.setHours(0, 0, 0, 0);
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
            
            let count = 0;
            let cur = new Date(start);
            cur.setDate(cur.getDate() + 1); // start counting from the day after sale
            while (cur <= end) {
                const day = cur.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
                if (day !== 5 && day !== 6) { // Skip Friday & Saturday (official government weekend)
                    count++;
                }
                cur.setDate(cur.getDate() + 1);
            }
            return count;
        },

        render: async function() {
            const tableBody = document.getElementById('traffic-table-body');
            if (!tableBody) return;
            tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-muted" style="padding: 20px;">جاري تحميل بيانات جوابات المرور...</td></tr>';

            const sales = await MotoDB.getAll('sales');
            const todayStr = new Date().toISOString().split('T')[0];

            let criticalCount = 0;
            let approachingCount = 0;
            let pendingCount = 0;
            let receivedCount = 0;
            const totalCount = sales.length;

            const rowsData = [];

            sales.forEach(sale => {
                const cust = allCustomers.find(c => c.id === sale.customerId);
                const unit = allUnits.find(u => u.id === sale.unitId);
                const prod = unit ? allProducts.find(p => p.id === unit.productId) : null;
                
                const isReceived = sale.traffic_letter_status === 'received';
                const busDays = App.Traffic.calculateBusinessDays(sale.saleDate, todayStr);
                const remainingDays = Math.max(0, 12 - busDays);

                let statusType = 'pending';
                let statusLabel = '';
                let badgeClass = 'cyan';

                if (isReceived) {
                    statusType = 'received';
                    statusLabel = 'تم الاستلام';
                    badgeClass = 'success';
                    receivedCount++;
                } else if (busDays >= 12) {
                    statusType = 'critical';
                    statusLabel = `حرج (مر ${busDays} يوم عمل)`;
                    badgeClass = 'danger';
                    criticalCount++;
                } else if (busDays >= 9) {
                    statusType = 'approaching';
                    statusLabel = `اقترب الموعد (باقي ${remainingDays} يوم)`;
                    badgeClass = 'warning';
                    approachingCount++;
                } else {
                    statusType = 'pending';
                    statusLabel = `قيد الانتظار (مر ${busDays} يوم)`;
                    badgeClass = 'cyan';
                    pendingCount++;
                }

                rowsData.push({
                    sale,
                    cust,
                    unit,
                    prod,
                    isReceived,
                    busDays,
                    remainingDays,
                    statusType,
                    statusLabel,
                    badgeClass,
                    customerName: cust ? cust.name : 'عميل غير مسجل',
                    customerPhone: cust ? cust.phone : '-',
                    vehicleName: prod ? `${prod.brand || ''} (${prod.year || ''}) - ${prod.cc || ''}` : '-',
                    chassis: unit ? (unit.chassis || '-') : '-',
                    motor: unit ? (unit.motor || '-') : '-',
                    saleDate: sale.saleDate || '-',
                    receiveDate: sale.traffic_letter_date || '-',
                    notes: sale.traffic_letter_notes || '-'
                });
            });

            // Update metrics cards
            const elCrit = document.getElementById('metric-traffic-critical-count');
            const elAppr = document.getElementById('metric-traffic-approaching-count');
            const elPend = document.getElementById('metric-traffic-pending-count');
            const elRecv = document.getElementById('metric-traffic-received-count');
            const elTot = document.getElementById('metric-traffic-total-count');
            if (elCrit) elCrit.textContent = criticalCount;
            if (elAppr) elAppr.textContent = approachingCount;
            if (elPend) elPend.textContent = pendingCount;
            if (elRecv) elRecv.textContent = receivedCount;
            if (elTot) elTot.textContent = totalCount;

            // Update filter tabs counters
            const tabAll = document.getElementById('count-tab-all');
            const tabCrit = document.getElementById('count-tab-critical');
            const tabAppr = document.getElementById('count-tab-approaching');
            const tabPend = document.getElementById('count-tab-pending');
            const tabRecv = document.getElementById('count-tab-received');
            if (tabAll) tabAll.textContent = totalCount;
            if (tabCrit) tabCrit.textContent = criticalCount;
            if (tabAppr) tabAppr.textContent = approachingCount;
            if (tabPend) tabPend.textContent = pendingCount;
            if (tabRecv) tabRecv.textContent = receivedCount;

            // Update sidebar badge
            const sidebarBadge = document.getElementById('sidebar-traffic-badge');
            if (sidebarBadge) {
                if (criticalCount > 0) {
                    sidebarBadge.textContent = criticalCount;
                    sidebarBadge.style.display = 'inline-block';
                } else {
                    sidebarBadge.style.display = 'none';
                }
            }

            // Sort rows: Critical first (highest busDays), then Approaching, then Pending, then Received
            rowsData.sort((a, b) => {
                const order = { critical: 1, approaching: 2, pending: 3, received: 4 };
                if (order[a.statusType] !== order[b.statusType]) {
                    return order[a.statusType] - order[b.statusType];
                }
                return (b.busDays - a.busDays);
            });

            // Store current rows for search/filter
            this._allRows = rowsData;
            this.applyCurrentFilterAndSearch();
            App.applyPermissions();
        },

        setFilter: function(filterType) {
            this.currentFilter = filterType;
            
            // Update active tab UI
            const filterButtons = ['all', 'critical', 'approaching', 'pending', 'received'];
            filterButtons.forEach(f => {
                const btn = document.getElementById(`filter-traffic-${f}`);
                if (btn) {
                    if (f === filterType) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                }
            });

            this.applyCurrentFilterAndSearch();
        },

        search: function() {
            this.applyCurrentFilterAndSearch();
        },

        applyCurrentFilterAndSearch: function() {
            const tableBody = document.getElementById('traffic-table-body');
            if (!tableBody || !this._allRows) return;

            const searchTerm = (document.getElementById('traffic-search-term')?.value || '').trim().toLowerCase();
            
            let filtered = this._allRows;

            if (this.currentFilter !== 'all') {
                filtered = filtered.filter(r => r.statusType === this.currentFilter);
            }

            if (searchTerm) {
                filtered = filtered.filter(r => {
                    return (
                        r.customerName.toLowerCase().includes(searchTerm) ||
                        r.customerPhone.toLowerCase().includes(searchTerm) ||
                        r.vehicleName.toLowerCase().includes(searchTerm) ||
                        r.chassis.toLowerCase().includes(searchTerm) ||
                        r.motor.toLowerCase().includes(searchTerm) ||
                        (r.sale.invoiceNo && r.sale.invoiceNo.toLowerCase().includes(searchTerm)) ||
                        r.notes.toLowerCase().includes(searchTerm)
                    );
                });
            }

            if (filtered.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="13" class="text-center text-muted" style="padding: 30px;">لا توجد جوابات تطابق البحث أو الفلتر المختار.</td></tr>`;
                return;
            }

            tableBody.innerHTML = filtered.map((r, idx) => {
                let elapsedBadge = '';
                if (r.isReceived) {
                    elapsedBadge = `<span class="badge-status success">${r.busDays} يوم عمل</span>`;
                } else if (r.busDays >= 12) {
                    elapsedBadge = `<span class="badge-status danger font-bold animate-pulse">${r.busDays} يوم عمل (حرج)</span>`;
                } else if (r.busDays >= 9) {
                    elapsedBadge = `<span class="badge-status warning font-bold">${r.busDays} يوم عمل</span>`;
                } else {
                    elapsedBadge = `<span class="badge-status cyan">${r.busDays} يوم عمل</span>`;
                }

                let remainingBadge = '';
                if (r.isReceived) {
                    remainingBadge = `<span class="text-emerald text-xs font-bold"><i class="fa-solid fa-check"></i> مكتمل</span>`;
                } else if (r.remainingDays === 0) {
                    remainingBadge = `<span class="text-crimson font-bold text-xs"><i class="fa-solid fa-circle-exclamation"></i> 0 يوم (مستحق الآن)</span>`;
                } else {
                    remainingBadge = `<strong style="color: #fbbf24;">${r.remainingDays} يوم عمل</strong>`;
                }

                return `
                    <tr style="${r.statusType === 'critical' ? 'background: rgba(239, 68, 68, 0.04);' : ''}">
                        <td><strong class="text-orange">${r.sale.invoiceNo || `SALE-${r.sale.id}`}</strong></td>
                        <td><strong>${r.customerName}</strong></td>
                        <td class="font-bold text-cyan" dir="ltr">${r.customerPhone}</td>
                        <td>${r.saleDate}</td>
                        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.vehicleName}">${r.vehicleName}</td>
                        <td><code style="background: rgba(0,0,0,0.25); padding: 3px 6px; border-radius: 4px; font-weight: bold; color: #38bdf8;">${r.chassis}</code></td>
                        <td><code style="background: rgba(0,0,0,0.25); padding: 3px 6px; border-radius: 4px; color: var(--text-secondary);">${r.motor}</code></td>
                        <td style="text-align: center;">${elapsedBadge}</td>
                        <td style="text-align: center;">${remainingBadge}</td>
                        <td style="text-align: center;"><span class="badge-status ${r.badgeClass}">${r.statusLabel}</span></td>
                        <td style="text-align: center;">${r.isReceived ? `<span class="text-emerald font-bold">${r.receiveDate}</span>` : '<span class="text-muted">-</span>'}</td>
                        <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.notes}">
                            <span class="text-muted text-xs">${r.notes}</span>
                        </td>
                        <td class="actions-col" style="text-align: center;">
                            <div class="action-buttons" style="justify-content: center;">
                                <button class="btn btn-primary btn-sm" onclick="App.Traffic.openModal(${r.sale.id})" title="تسجيل استلام الجواب وتحديث الملاحظات">
                                    <i class="fa-solid fa-pen-to-square"></i> ${r.isReceived ? 'تعديل' : 'استلام'}
                                </button>
                                ${r.cust ? `
                                <button class="btn btn-secondary btn-icon-only" onclick="App.Customers.openCard(${r.cust.id})" title="عرض كرت العميل">
                                    <i class="fa-solid fa-address-card text-cyan"></i>
                                </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        openModal: async function(saleId) {
            const sale = await MotoDB.getById('sales', saleId);
            if (!sale) {
                alert("لم يتم العثور على بيانات الفاتورة المحددة.");
                return;
            }

            const cust = allCustomers.find(c => c.id === sale.customerId);
            const unit = allUnits.find(u => u.id === sale.unitId);
            const prod = unit ? allProducts.find(p => p.id === unit.productId) : null;
            const todayStr = new Date().toISOString().split('T')[0];
            const busDays = App.Traffic.calculateBusinessDays(sale.saleDate, todayStr);

            document.getElementById('traffic-sale-id').value = sale.id;
            document.getElementById('traffic-modal-customer-name').textContent = cust ? cust.name : 'عميل غير مسجل';
            document.getElementById('traffic-modal-customer-phone').textContent = cust ? cust.phone : '-';
            document.getElementById('traffic-modal-vehicle').textContent = prod ? `${prod.brand || ''} (${prod.year || ''}) - ${prod.cc || ''}` : '-';
            document.getElementById('traffic-modal-chassis').textContent = unit ? (unit.chassis || '-') : '-';
            document.getElementById('traffic-modal-sale-date').textContent = sale.saleDate || '-';
            
            const busBadge = document.getElementById('traffic-modal-business-days');
            if (busDays >= 12) {
                busBadge.className = 'badge-status danger font-bold';
                busBadge.textContent = `${busDays} يوم عمل (تجاوز مهلة الـ 12 يوم عمل)`;
            } else if (busDays >= 9) {
                busBadge.className = 'badge-status warning font-bold';
                busBadge.textContent = `${busDays} يوم عمل (متبقي ${12 - busDays} يوم)`;
            } else {
                busBadge.className = 'badge-status cyan';
                busBadge.textContent = `${busDays} يوم عمل (أقل من مهلة الـ 12 يوم)`;
            }

            const isReceived = sale.traffic_letter_status === 'received';
            const radioPending = document.getElementById('traffic-status-pending');
            const radioReceived = document.getElementById('traffic-status-received');
            if (isReceived) {
                radioReceived.checked = true;
            } else {
                radioPending.checked = true;
            }

            const dateInput = document.getElementById('traffic-receive-date');
            dateInput.value = sale.traffic_letter_date || todayStr;

            const notesInput = document.getElementById('traffic-notes');
            notesInput.value = sale.traffic_letter_notes || '';

            this.onStatusRadioChange();

            const modal = document.getElementById('traffic-letter-modal');
            if (modal) modal.classList.remove('hidden');
        },

        closeModal: function() {
            const modal = document.getElementById('traffic-letter-modal');
            if (modal) modal.classList.add('hidden');
        },

        onStatusRadioChange: function() {
            const isReceived = document.getElementById('traffic-status-received')?.checked;
            const dateGroup = document.getElementById('traffic-date-group');
            if (dateGroup) {
                dateGroup.style.display = isReceived ? 'block' : 'none';
            }
        },

        saveStatus: async function(e) {
            if (e) e.preventDefault();

            const saleId = Number(document.getElementById('traffic-sale-id').value);
            if (!saleId) return;

            const sale = await MotoDB.getById('sales', saleId);
            if (!sale) {
                alert("تعذر العثور على الفاتورة لحفظ البيانات.");
                return;
            }

            const isReceived = document.getElementById('traffic-status-received').checked;
            const receiveDate = document.getElementById('traffic-receive-date').value;
            const notes = document.getElementById('traffic-notes').value.trim();

            sale.traffic_letter_status = isReceived ? 'received' : 'pending';
            sale.traffic_letter_date = isReceived ? (receiveDate || new Date().toISOString().split('T')[0]) : '';
            sale.traffic_letter_notes = notes;

            try {
                await MotoDB.update('sales', sale);
                
                const cust = allCustomers.find(c => c.id === sale.customerId);
                const custName = cust ? cust.name : 'عميل';
                App.logActivity("جوابات المرور والترخيص", `${isReceived ? 'تم استلام وتأكيد تسليم' : 'تحديث حالة'} جواب المرور للعميل: ${custName} (فاتورة: ${sale.invoiceNo || sale.id})`);
                
                await App.saveAutoBackup();
                this.closeModal();
                alert("تم حفظ وتحديث بيان جواب المرور بنجاح!");
                
                await App.loadAllData();
                this.render();
            } catch (err) {
                console.error("Failed to save traffic status:", err);
                alert("خطأ أثناء حفظ البيانات: " + err);
            }
        },

        exportExcel: async function() {
            if (typeof XLSX === 'undefined') {
                alert("مكتبة التصدير إلى Excel غير متوفرة.");
                return;
            }

            if (!this._allRows || this._allRows.length === 0) {
                alert("لا توجد بيانات جوابات لتصديرها.");
                return;
            }

            const exportData = this._allRows.map((r, i) => ({
                'م': i + 1,
                'رقم الفاتورة': r.sale.invoiceNo || `SALE-${r.sale.id}`,
                'اسم العميل': r.customerName,
                'رقم الهاتف': r.customerPhone,
                'تاريخ البيع': r.saleDate,
                'نوع وموديل المركبة': r.vehicleName,
                'رقم الشاسيه': r.chassis,
                'رقم الموتور': r.motor,
                'أيام العمل المنقضية (بدون جمعة وسبت)': r.busDays,
                'الأيام المتبقية من المهلة (12 يوم)': r.isReceived ? 'مكتمل' : r.remainingDays,
                'حالة جواب المرور': r.statusLabel,
                'تاريخ استلام الجواب': r.receiveDate,
                'الملاحظات وبيان الجواب': r.notes
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "جوابات وإخطارات المرور");
            
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            XLSX.writeFile(wb, `تقرير_جوابات_المرور_${dateStr}.xlsx`);
        }
    },

    /* ==========================================================================
       SUBMODULE: REPORTS & EXCEL EXPORTS
       ========================================================================== */
    Reports: {
        activeReportTab: 'cashflow',

        switchReportTab: function(subTabId) {
            this.activeReportTab = subTabId;
            
            // Hide all subtab contents inside reports-page
            const contents = document.querySelectorAll('#reports-page .subtab-content');
            contents.forEach(c => {
                c.classList.add('hidden');
                c.classList.remove('active');
            });
            
            // Show selected subtab content
            const activeContent = document.getElementById(`rep-${subTabId}-content`);
            if (activeContent) {
                activeContent.classList.remove('hidden');
                activeContent.classList.add('active');
            }
            
            // Toggle active classes on tab buttons
            const buttons = document.querySelectorAll('#reports-page .sub-tab');
            buttons.forEach(btn => {
                btn.classList.remove('active');
            });
            const activeBtn = document.getElementById(`tab-rep-${subTabId}`);
            if (activeBtn) activeBtn.classList.add('active');

            this.calculateOnScreenReports();
        },

        render: function() {
            const today = new Date();
            const year = today.getFullYear();
            const monthStr = String(today.getMonth() + 1).padStart(2, '0');
            const firstDay = `${year}-${monthStr}-01`;
            const lastDay = new Date(year, today.getMonth() + 1, 0).toISOString().split('T')[0];

            // Set inputs
            document.getElementById('report-sales-from').value = firstDay;
            document.getElementById('report-sales-to').value = lastDay;
            document.getElementById('report-acc-from').value = firstDay;
            document.getElementById('report-acc-to').value = lastDay;

            // Set collector report date to today
            document.getElementById('rep-collector-date').value = today.toISOString().split('T')[0];

            // Switch to the active subtab to trigger initial render
            this.switchReportTab(this.activeReportTab);
        },

        calculateOnScreenReports: async function() {
            const fromDate = document.getElementById('report-acc-from').value;
            const toDate = document.getElementById('report-acc-to').value;

            try {
                const sales = await MotoDB.getAll('sales');
                const installments = await MotoDB.getAll('installments');
                const rawUnits = await MotoDB.getAll('units');
                const localBranch = localStorage.getItem('motomax_local_branch') || BRANCHES[0] || 'الفرع الرئيسي';
                const units = rawUnits.filter(u => u.branch === localBranch);
                const transactions = await MotoDB.getAll('transactions');
                const supplierDues = await MotoDB.getAll('supplier_dues');
                const products = allProducts;
                const suppliers = allSuppliers;

                // 1. Profit & Loss calculation (filtered by date)
                let revenue = 0;
                let cogs = 0;
                let opExpenses = 0;

                // Cash sales in date range
                const cashSales = sales.filter(s => s.type === 'cash' && s.saleDate >= fromDate && s.saleDate <= toDate);
                cashSales.forEach(s => {
                    revenue += s.salePrice;
                });

                // Downpayments of installment sales in date range
                const instSales = sales.filter(s => s.type === 'installment' && s.saleDate >= fromDate && s.saleDate <= toDate);
                instSales.forEach(s => {
                    revenue += s.downpayment;
                });

                // Collected installments in date range
                const paidInsts = installments.filter(i => i.status === 'paid' && i.paidDate >= fromDate && i.paidDate <= toDate);
                paidInsts.forEach(i => {
                    revenue += i.paidAmount || i.amount;
                });

                // Other revenues
                const otherRevenues = transactions.filter(t => t.type === 'قبض' && t.category === 'إيرادات أخرى');
                otherRevenues.forEach(t => {
                    const txDateOnly = t.date.split(' ')[0];
                    if (txDateOnly >= fromDate && txDateOnly <= toDate) {
                        revenue += t.amount;
                    }
                });

                // COGS (Cost of sold units) in date range
                const salesInRange = sales.filter(s => s.saleDate >= fromDate && s.saleDate <= toDate);
                salesInRange.forEach(s => {
                    const u = units.find(unit => unit.id === s.unitId);
                    if (u) {
                        cogs += u.cost || 0;
                    }
                });

                // Operating Expenses
                const opTxs = transactions.filter(t => t.type === 'صرف' && ['مصاريف تشغيلية', 'رواتب وأجور', 'خدمات وصيانة', 'مصاريف أخرى'].includes(t.category));
                opTxs.forEach(t => {
                    const txDateOnly = t.date.split(' ')[0];
                    if (txDateOnly >= fromDate && txDateOnly <= toDate) {
                        opExpenses += t.amount;
                    }
                });

                const netProfit = revenue - cogs - opExpenses;

                // Update UI Financial summaries
                document.getElementById('report-pnl-revenue').textContent = revenue.toLocaleString('ar-EG') + " ج.م";
                document.getElementById('report-pnl-cogs').textContent = cogs.toLocaleString('ar-EG') + " ج.م";
                document.getElementById('report-pnl-expenses').textContent = opExpenses.toLocaleString('ar-EG') + " ج.م";
                
                const netEl = document.getElementById('report-pnl-net');
                netEl.textContent = netProfit.toLocaleString('ar-EG') + " ج.م";
                if (netProfit >= 0) {
                    netEl.className = "val text-emerald";
                } else {
                    netEl.className = "val text-crimson";
                }

                // Balance Sheet Card (Payables vs Receivables)
                let receivables = 0;
                let payables = 0;

                // Unpaid installments
                const unpaidInsts = installments.filter(i => i.status !== 'paid');
                unpaidInsts.forEach(i => {
                    receivables += i.amount;
                });

                // Unpaid supplier dues
                const unpaidDues = supplierDues.filter(d => d.status !== 'paid');
                unpaidDues.forEach(d => {
                    const remaining = d.totalAmount - d.paidAmount;
                    if (remaining > 0) {
                        payables += remaining;
                    }
                });

                const netBalance = receivables - payables;

                document.getElementById('report-bal-receivables').textContent = receivables.toLocaleString('ar-EG') + " ج.م";
                document.getElementById('report-bal-payables').textContent = payables.toLocaleString('ar-EG') + " ج.م";
                
                const balNetEl = document.getElementById('report-bal-net');
                balNetEl.textContent = netBalance.toLocaleString('ar-EG') + " ج.م";
                if (netBalance >= 0) {
                    balNetEl.className = "val text-emerald";
                } else {
                    balNetEl.className = "val text-crimson";
                }

                // 2. Compute selected report content
                const today = new Date();
                const nowYear = today.getFullYear();
                const nowMonth = today.getMonth() + 1; // 1-indexed

                if (this.activeReportTab === 'cashflow') {
                    const monthsArabic = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
                    let cashFlowHtml = '';
                    
                    // Monthly average for expenses is disabled (set to 0)
                    const avgExpenses = 0;

                    for (let i = 0; i < 6; i++) {
                        const d = new Date();
                        d.setMonth(today.getMonth() + i);
                        const monthIndex = d.getMonth();
                        const yearVal = d.getFullYear();
                        const monthStr = `${yearVal}-${String(monthIndex + 1).padStart(2, '0')}`;
                        
                        // Expected collection: pending installments due in this month
                        const expectedCollection = installments
                            .filter(inst => inst.status !== 'paid' && inst.dueDate.startsWith(monthStr))
                            .reduce((sum, inst) => sum + inst.amount, 0);
                            
                        // Expected supplier payments: pending supplier dues in this month
                        const expectedSupplierPayments = supplierDues
                            .filter(sd => sd.status !== 'paid' && sd.dueDate.startsWith(monthStr))
                            .reduce((sum, sd) => sum + (sd.totalAmount - sd.paidAmount), 0);
                            
                        const net = expectedCollection - expectedSupplierPayments - avgExpenses;
                        const netClass = net >= 0 ? 'text-emerald' : 'text-crimson';
                        const netLabel = net >= 0 ? `فائض: ${net.toLocaleString('ar-EG')} ج.م` : `عجز: ${Math.abs(net).toLocaleString('ar-EG')} ج.م`;

                        cashFlowHtml += `
                            <tr>
                                <td><strong>${monthsArabic[monthIndex]} ${yearVal}</strong></td>
                                <td class="text-cyan font-bold">${expectedCollection.toLocaleString('ar-EG')} ج.م</td>
                                <td class="text-orange font-bold">${expectedSupplierPayments.toLocaleString('ar-EG')} ج.م</td>
                                <td class="text-muted">${avgExpenses.toLocaleString('ar-EG')} ج.م</td>
                                <td class="${netClass} font-bold">${netLabel}</td>
                            </tr>
                        `;
                    }
                    document.getElementById('rep-cashflow-table-body').innerHTML = cashFlowHtml;

                } else if (this.activeReportTab === 'collector') {
                    // Populate collector user list if empty
                    const selectEl = document.getElementById('rep-collector-user');
                    if (selectEl.options.length === 0) {
                        const users = [...new Set(installments.filter(i => i.paidDate).map(i => i.user || 'موظف حسابات'))];
                        if (!users.includes('Admin')) users.push('Admin');
                        if (!users.includes('موظف حسابات')) users.push('موظف حسابات');
                        
                        users.forEach(u => {
                            const opt = document.createElement('option');
                            opt.value = u;
                            opt.textContent = u;
                            selectEl.appendChild(opt);
                        });
                        selectEl.value = currentRole === 'admin' ? 'Admin' : 'موظف حسابات';
                    }

                    this.calculateCollectorReport();

                } else if (this.activeReportTab === 'profitability') {
                    let profitabilityHtml = '';
                    let periodTotalProfit = 0;

                    // Group sold units in date range by product brand
                    products.forEach(p => {
                        const soldUnits = units.filter(u => u.productId === p.id && u.status === 'مباع' && u.soldDate >= fromDate && u.soldDate <= toDate);
                        if (soldUnits.length > 0) {
                            let totalCost = 0;
                            let totalSalesVal = 0;
                            soldUnits.forEach(u => {
                                totalCost += u.cost || 0;
                                totalSalesVal += u.soldPrice || p.price;
                            });
                            const profit = totalSalesVal - totalCost;
                            periodTotalProfit += profit;
                            const margin = totalSalesVal > 0 ? ((profit / totalSalesVal) * 100).toFixed(1) : 0;

                            profitabilityHtml += `
                                <tr>
                                    <td><strong>${p.brand}</strong></td>
                                    <td>${soldUnits.length} وحدة</td>
                                    <td>${totalCost.toLocaleString('ar-EG')} ج.م</td>
                                    <td class="text-cyan font-bold">${totalSalesVal.toLocaleString('ar-EG')} ج.م</td>
                                    <td class="text-emerald font-bold">${profit.toLocaleString('ar-EG')} ج.م</td>
                                    <td class="text-orange font-bold">${margin}%</td>
                                </tr>
                            `;
                        }
                    });

                    if (profitabilityHtml === '') {
                        profitabilityHtml = `<tr><td colspan="6" class="text-center text-muted">لا يوجد مبيعات دراجات نارية مسجلة خلال الفترة المحددة.</td></tr>`;
                    }
                    document.getElementById('rep-profitability-table-body').innerHTML = profitabilityHtml;
                    document.getElementById('rep-profit-month-total').textContent = periodTotalProfit.toLocaleString('ar-EG') + " ج.م";

                } else if (this.activeReportTab === 'inventory') {
                    let inventoryHtml = '';
                    products.forEach(p => {
                        const available = units.filter(u => u.productId === p.id && u.status === 'متاح');
                        const count = available.length;
                        const totalCostVal = available.reduce((sum, u) => sum + (u.cost || 0), 0);
                        
                        let statusClass = 'success';
                        let statusLabel = 'ممتاز';
                        let alertBadge = '<span class="badge-status success"><i class="fa-solid fa-check"></i> مخزون كافٍ</span>';

                        if (count === 0) {
                            statusClass = 'danger';
                            statusLabel = 'نفذ بالكامل';
                            alertBadge = '<span class="badge-status danger"><i class="fa-solid fa-triangle-exclamation"></i> نفذ المخزون!</span>';
                        } else if (count < 3) {
                            statusClass = 'warning';
                            statusLabel = 'قرب النفاد';
                            alertBadge = '<span class="badge-status danger"><i class="fa-solid fa-bell"></i> أعد الطلب (أقل من 3)</span>';
                        }

                        inventoryHtml += `
                            <tr>
                                <td><strong>${p.brand}</strong></td>
                                <td class="font-bold text-cyan">${count} قطعة</td>
                                <td>${totalCostVal.toLocaleString('ar-EG')} ج.م</td>
                                <td><span class="badge-status ${statusClass}">${statusLabel}</span></td>
                                <td>${alertBadge}</td>
                            </tr>
                        `;
                    });

                    document.getElementById('rep-inventory-table-body').innerHTML = inventoryHtml;

                } else if (this.activeReportTab === 'inventoryage') {
                    const available = units.filter(u => u.status === 'متاح');
                    const totalAvailableCount = available.length || 1;
                    
                    let age0to90Count = 0;
                    let age91to180Count = 0;
                    let age180PlusCount = 0;
                    
                    let age0to90Cost = 0;
                    let age91to180Cost = 0;
                    let age180PlusCost = 0;

                    const todayTime = today.getTime();

                    available.forEach(u => {
                        const pDate = u.purchaseDate ? new Date(u.purchaseDate) : new Date('2026-04-01');
                        const ageInDays = Math.floor((todayTime - pDate.getTime()) / (1000 * 60 * 60 * 24));
                        
                        if (ageInDays > 180) {
                            age180PlusCount++;
                            age180PlusCost += u.cost || 0;
                        } else if (ageInDays > 90) {
                            age91to180Count++;
                            age91to180Cost += u.cost || 0;
                        } else {
                            age0to90Count++;
                            age0to90Cost += u.cost || 0;
                        }
                    });

                    const ageHtml = `
                        <tr>
                            <td><strong>بضاعة حديثة (أقل من 90 يوم)</strong></td>
                            <td class="font-bold text-emerald">${age0to90Count} دراجات</td>
                            <td>${age0to90Cost.toLocaleString('ar-EG')} ج.م</td>
                            <td class="text-cyan font-bold">${Math.round((age0to90Count / totalAvailableCount) * 100)}%</td>
                        </tr>
                        <tr>
                            <td><strong>بضاعة راكدة نسبياً (91 - 180 يوم)</strong></td>
                            <td class="font-bold text-orange">${age91to180Count} دراجات</td>
                            <td class="text-orange font-bold">${age91to180Cost.toLocaleString('ar-EG')} ج.م</td>
                            <td class="text-orange font-bold">${Math.round((age91to180Count / totalAvailableCount) * 100)}%</td>
                        </tr>
                        <tr>
                            <td><strong>بضاعة راكدة جداً (أكثر من 180 يوم)</strong></td>
                            <td class="font-bold text-crimson">${age180PlusCount} دراجات</td>
                            <td class="text-crimson font-bold">${age180PlusCost.toLocaleString('ar-EG')} ج.م</td>
                            <td class="text-crimson font-bold">${Math.round((age180PlusCount / totalAvailableCount) * 100)}%</td>
                        </tr>
                    `;
                    document.getElementById('rep-inventoryage-table-body').innerHTML = ageHtml;

                } else if (this.activeReportTab === 'suppliers') {
                    let suppliersHtml = '';
                    for (let s of suppliers) {
                        const dues = supplierDues.filter(d => d.supplierId === s.id);
                        
                        let totalPurchased = 0;
                        let totalPaid = 0;
                        dues.forEach(d => {
                            totalPurchased += d.totalAmount;
                            totalPaid += d.paidAmount;
                        });
                        const remaining = totalPurchased - totalPaid;

                        // Find latest payment transaction details
                        const supTx = transactions
                            .filter(t => t.type === 'صرف' && t.refId && dues.some(d => d.id === t.refId))
                            .sort((a, b) => b.id - a.id)[0];
                            
                        let lastPayStr = 'لا يوجد دفعات.';
                        if (supTx) {
                            lastPayStr = `${supTx.date.split(' ')[0]} بقيمة (${supTx.amount.toLocaleString('ar-EG')} ج.م)`;
                        }

                        suppliersHtml += `
                            <tr>
                                <td><strong>${s.code}</strong></td>
                                <td><strong>${s.name}</strong></td>
                                <td>${totalPurchased.toLocaleString('ar-EG')} ج.م</td>
                                <td class="text-emerald font-bold">${totalPaid.toLocaleString('ar-EG')} ج.م</td>
                                <td class="font-bold text-${remaining > 0 ? 'crimson' : 'emerald'}">${remaining.toLocaleString('ar-EG')} ج.م</td>
                                <td><span class="text-muted text-xs">${lastPayStr}</span></td>
                            </tr>
                        `;
                    }
                    document.getElementById('rep-suppliers-table-body').innerHTML = suppliersHtml;
                }

            } catch (err) {
                console.error("Error calculating on-screen reports:", err);
            }
        },

        calculateCollectorReport: async function() {
            try {
                const selectedCollector = document.getElementById('rep-collector-user').value;
                const selectedDate = document.getElementById('rep-collector-date').value;
                const tableBody = document.getElementById('rep-collector-table-body');
                tableBody.innerHTML = '';

                const sales = await MotoDB.getAll('sales');
                const installments = await MotoDB.getAll('installments');
                const transactions = await MotoDB.getAll('transactions');

                // Filter installments collected by this collector on this date
                const filteredInsts = installments.filter(i => 
                    i.status === 'paid' && 
                    i.paidDate === selectedDate && 
                    (i.user === selectedCollector || (!i.user && selectedCollector === 'موظف حسابات'))
                );

                let totalCollected = 0;
                const uniqueCustIds = new Set();
                let tableHtml = '';

                for (let inst of filteredInsts) {
                    const cust = allCustomers.find(c => c.id === inst.customerId);
                    const sale = sales.find(s => s.id === inst.saleId);
                    
                    totalCollected += (inst.paidAmount || inst.amount);
                    uniqueCustIds.add(inst.customerId);

                    // Try to find if transaction has a specific paymentMethod (e.g. Cash vs Bank)
                    const tx = transactions.find(t => t.type === 'قبض' && t.category === 'قسط شهري' && t.refId === sale?.id && t.description.includes(`القسط رقم (${inst.installmentNumber})`));
                    const method = tx ? tx.paymentMethod : 'نقدي';

                    tableHtml += `
                        <tr>
                            <td><strong>${cust ? cust.name : 'عميل غير مسجل'}</strong></td>
                            <td><strong class="text-cyan">${sale ? sale.invoiceNo : '-'}</strong></td>
                            <td>قسط ${inst.installmentNumber}</td>
                            <td><span class="badge-status ${method === 'بنك' ? 'success' : 'cyan'}">${method}</span></td>
                            <td class="font-bold text-emerald">${(inst.paidAmount || inst.amount).toLocaleString('ar-EG')} ج.م</td>
                            <td>${inst.paidDate}</td>
                        </tr>
                    `;
                }

                if (filteredInsts.length === 0) {
                    tableHtml = `<tr><td colspan="6" class="text-center text-muted">لا يوجد أي تحصيلات مسجلة لهذا المحصل في هذا اليوم.</td></tr>`;
                }
                tableBody.innerHTML = tableHtml;

                // Deliveries to treasury (Sum of transactions of category 'قسط شهري' and type 'قبض' by this user on this day)
                const deliveredSum = transactions
                    .filter(t => t.type === 'قبض' && t.category === 'قسط شهري' && t.user === selectedCollector && t.date.startsWith(selectedDate))
                    .reduce((sum, t) => sum + t.amount, 0);

                document.getElementById('rep-collector-total-collected').textContent = totalCollected.toLocaleString('ar-EG') + " ج.م";
                document.getElementById('rep-collector-cust-count').textContent = uniqueCustIds.size + " عملاء";
                document.getElementById('rep-collector-delivered').textContent = deliveredSum.toLocaleString('ar-EG') + " ج.م";

            } catch (err) {
                console.error("Collector Report Calculation Error:", err);
            }
        },

        triggerExcelDownload: function(sheetJsonData, sheetName, fileName) {
            if (sheetJsonData.length === 0) {
                alert("تنبيه: لا توجد بيانات مسجلة لتصديرها حالياً!");
                return;
            }
            const ws = XLSX.utils.json_to_sheet(sheetJsonData);
            ws['!dir'] = 'rtl';
            
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
        },

        exportCustomers: async function() {
            const data = allCustomers.map(c => ({
                'كود العميل': c.code,
                'الاسم الكامل': c.name,
                'رقم الموبايل': c.phone,
                'الرقم القومي (البطاقة)': c.nid,
                'محل الإقامة والسكن': c.address,
                'نوع المعاملة المبرمة': c.type === 'cash' ? 'كاش نقدي' : 'تقسيط أقساط',
                'ملاحظات': c.notes || 'لا يوجد'
            }));
            this.triggerExcelDownload(data, "العملاء والضامنين", "تقرير_العملاء");
        },

        exportSuppliers: async function() {
            const data = allSuppliers.map(s => ({
                'كود المورد': s.code,
                'اسم المورد/الشركة': s.name,
                'رقم الهاتف': s.phone,
                'السجل التجاري/البطاقة': s.nid,
                'العنوان بالتفصيل': s.address,
                'نوع المورد': s.type,
                'ملاحظات': s.notes || 'لا يوجد'
            }));
            this.triggerExcelDownload(data, "الموردين والشركات", "تقرير_الموردين");
        },

        exportSales: async function() {
            const fromDate = document.getElementById('report-sales-from').value;
            const toDate = document.getElementById('report-sales-to').value;

            const sales = await MotoDB.getAll('sales');
            const filtered = sales.filter(s => s.saleDate >= fromDate && s.saleDate <= toDate);

            const data = [];
            for (let s of filtered) {
                const cust = allCustomers.find(c => c.id === s.customerId);
                const unit = allUnits.find(u => u.id === s.unitId);
                const prod = unit ? allProducts.find(p => p.id === unit.productId) : null;

                data.push({
                    'رقم الفاتورة': s.invoiceNo,
                    'تاريخ البيع': s.saleDate,
                    'الفرع المباع منه': s.branch || '-',
                    'اسم العميل المشتري': cust ? cust.name : 'عميل غير مسجل',
                    'رقم هاتف العميل': cust ? cust.phone : '-',
                    'نوع البيع': s.type === 'cash' ? 'كاش' : 'تقسيط',
                    'الماركة والنوع': prod ? prod.brand : '-',
                    'رقم الشاسيه': unit ? unit.chassis : '-',
                    'رقم الموتور': unit ? unit.motor : '-',
                    'سعر الفاتورة الفعلي': s.salePrice,
                    'المقدم المدفوع': s.type === 'installment' ? s.downpayment : 0,
                    'عدد أشهر القسط': s.type === 'installment' ? s.months : 0,
                    'القسط الشهري': s.type === 'installment' ? s.monthlyPayment : 0,
                    'المتبقي بالأقساط': s.type === 'installment' ? s.remainingAmount : 0,
                    'الضامن الأول': s.type === 'installment' ? s.g1_name : '-',
                    'الضامن الثاني': s.type === 'installment' ? s.g2_name : '-',
                    'ملاحظات': s.notes || 'لا يوجد'
                });
            }
            this.triggerExcelDownload(data, "حركة المبيعات بالفروع", "تقرير_المبيعات_التاريخي");
        },

        exportStock: async function() {
            const data = [];
            for (let u of allUnits) {
                const prod = allProducts.find(p => p.id === u.productId);
                const unitSupId = u.supplierId || (prod ? prod.supplierId : null);
                const sup = unitSupId ? allSuppliers.find(s => s.id === unitSupId) : null;

                data.push({
                    'كود الموديل': prod ? prod.code : '-',
                    'الماركة والنوع': prod ? prod.brand : '-',
                    'رقم الشاسيه': u.chassis,
                    'رقم الموتور': u.motor,
                    'اللون الخارجي': u.color,
                    'الفرع المستودع': u.branch || '-',
                    'تكلفة الشراء': u.cost,
                    'حالة القطعة': u.status,
                    'سعر البيع الفعلي': u.soldPrice || 'لم تبع',
                    'تاريخ البيع': u.soldDate || 'غير مباع',
                    'المورد المعتمد للقطعة': sup ? sup.name : '-'
                });
            }
            this.triggerExcelDownload(data, "المخزون والقطع بالفروع", "تقرير_المخزون_الكامل");
        },

        exportInstallments: async function() {
            const installments = await MotoDB.getAll('installments');
            installments.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.installmentNumber || 0) - (b.installmentNumber || 0));
            const data = [];

            for (let inst of installments) {
                const cust = allCustomers.find(c => c.id === inst.customerId);
                const sale = await MotoDB.getById('sales', inst.saleId);
                const unit = allUnits.find(u => u.id === sale.unitId);

                data.push({
                    'رقم العقد الفاتورة': sale ? sale.invoiceNo : '-',
                    'اسم العميل المشتري': cust ? cust.name : '-',
                    'رقم هاتف العميل': cust ? cust.phone : '-',
                    'الفرع': sale ? sale.branch : '-',
                    'شاسيه الدراجة': unit ? unit.chassis : '-',
                    'رقم القسط': inst.installmentNumber,
                    'قيمة القسط': inst.amount,
                    'تاريخ استحقاق القسط': inst.dueDate,
                    'حالة القسط': inst.status === 'paid' ? 'مسدد' : inst.status === 'overdue' ? 'متأخر ومستحق فورا' : 'مستحق قادماً',
                    'تاريخ التحصيل الفعلي': inst.paidDate || '-',
                    'مبلغ السداد الفعلي': inst.paidAmount || 0,
                    'الضامن الأول': sale ? sale.g1_name : '-',
                    'ملاحظات': inst.notes || '-'
                });
            }
            this.triggerExcelDownload(data, "الأقساط والمتابعة", "تقرير_الأقساط_الكامل");
        },

        exportAccounting: async function() {
            const fromDate = document.getElementById('report-acc-from').value;
            const toDate = document.getElementById('report-acc-to').value;

            const txs = await MotoDB.getAll('transactions');
            const filtered = txs.filter(t => {
                const txDateOnly = t.date.split(' ')[0];
                return txDateOnly >= fromDate && txDateOnly <= toDate;
            });

            const data = filtered.map(t => ({
                'رقم السند': t.code,
                'التاريخ والوقت': t.date,
                'نوع السند (قبض/صرف)': t.type,
                'بند وتصنيف المعاملة': t.category,
                'قيمة المبلغ': t.amount,
                'البيان والتفاصيل': t.description,
                'الموظف': t.user
            }));

            this.triggerExcelDownload(data, "حركة الخزينة التفصيلية", "تقرير_الخزينة");
        }
    },

    /* ==========================================================================
       SUBMODULE: SETTINGS v3.0 - ADMIN SECURED WITH FULL FEATURE SET
       ========================================================================== */
    Settings: {

        /* ─────────── THEME ENGINE ─────────────────────────────────────── */
        applyTheme: function(themeName, animate = true) {
            const validThemes = ['sport', 'royal', 'red', 'emerald', 'light'];
            const theme = validThemes.includes(themeName) ? themeName : 'sport';

            const html = document.documentElement;

            if (animate) {
                html.style.transition = 'background-color 0.5s ease';
            }

            // sport theme = no data-theme attribute (uses :root defaults)
            if (theme === 'sport') {
                html.removeAttribute('data-theme');
            } else {
                html.setAttribute('data-theme', theme);
            }

            // Update swatch selection highlight
            document.querySelectorAll('.theme-swatch').forEach(sw => {
                sw.classList.toggle('selected', sw.dataset.theme === theme);
            });

            // Also sync the dropdown
            const sel = document.getElementById('set-theme-select');
            if (sel) sel.value = theme;

            // Persist only if called from user interaction (animate = true)
            if (animate) {
                BRANDING.theme = theme;
                localStorage.setItem('motomax_branding', JSON.stringify(BRANDING));
            }
        },

        onThemeDropdownChange: function(val) {
            this.applyTheme(val, true);
        },

        handleLogoUpload: function(input) {
            const file = input.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('set-logo-url').value = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        },

        clearDatabase: async function() {
            if (App.isDemoMode) {
                alert("عذراً، مسح أو إعادة تهيئة قاعدة البيانات غير متاح في النسخة التجريبية.");
                return;
            }
            if (currentRole !== 'admin') {
                alert("خطأ: غير مسموح بمسح قاعدة البيانات إلا لمدير النظام (Admin) فقط.");
                return;
            }

            const p1 = await BakryDialogs.confirm("تحذير هام جداً:\nهل أنت متأكد من مسح جميع بيانات المعرض بالكامل؟\nسيؤدي ذلك إلى مسح كافة العملاء والموردين والمبيعات والأقساط نهائياً.");
            if (!p1) return;

            const password = prompt("تأكيد هوية المدير:\nيرجى إدخال الرقم السري لمدير النظام (Admin) للمتابعة وتأكيد مسح قاعدة البيانات وتصفير البرنامج:");
            if (password === null) return;
            if (password !== PWD_CONFIG.admin) {
                alert("خطأ: الرقم السري غير صحيح! تم إلغاء عملية مسح البيانات.");
                return;
            }

            const p2 = await BakryDialogs.confirm("تأكيد أخير لمسح البيانات:\nإجراء الحذف نهائي ولا يمكن الرجوع عنه! هل أنت متأكد تماماً وتريد تفريغ البرنامج بالكامل؟");
            if (!p2) return;

            try {
                // Set the seeded flag to true so that it doesn't automatically load demo data after reload
                localStorage.setItem('motomax_seeded', 'true');
                localStorage.setItem('motomax_seeded_v4', 'true');

                const response = await fetch('/api/db/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || `HTTP error ${response.status}`);
                }

                const res = await response.json();
                if (res.success) {
                    await App.logActivity("تهيئة قاعدة البيانات", "تصفير ومسح كافة بيانات البرنامج والتهيئة للعمل الفارغ");
                    await App.saveAutoBackup();
                    alert("تم مسح كافة البيانات من المعرض بنجاح. سيتم تسجيل الخروج لإعادة تهيئة النظام.");
                    sessionStorage.clear();
                    window.location.reload();
                } else {
                    alert("فشل مسح قاعدة البيانات: " + (res.error || "خطأ غير معروف"));
                }
            } catch (err) {
                alert("فشل مسح قاعدة البيانات: " + err);
            }
        },

        /* ─────────── BRANDING ENGINE ───────────────────────────────── */
        applyBrandingToUI: function() {
            const name = BRANDING.name || 'MotoMax';

            // Update sidebar brand name - split last word for accent color
            const brandNameEl = document.getElementById('sidebar-brand-name');
            if (brandNameEl) {
                const words = name.trim().split(' ');
                if (words.length >= 2) {
                    const last = words.pop();
                    brandNameEl.innerHTML = words.join(' ') + ' <span>' + last + '</span>';
                } else {
                    brandNameEl.innerHTML = '<span>' + name + '</span>';
                }
            }

            // Update login page title (the h1 element)
            const loginTitleEl = document.getElementById('login-brand-name');
            if (loginTitleEl) {
                const words = name.trim().split(' ');
                if (words.length >= 2) {
                    const last = words.pop();
                    loginTitleEl.innerHTML = words.join(' ') + ' <span>' + last + '</span>';
                } else {
                    loginTitleEl.innerHTML = '<span>' + name + '</span>';
                }
            }

            // The showroom identity uses the text name and motorcycle icon only.
            BRANDING.logo = '';
            const loginLogoEl = document.getElementById('login-logo-img');
            const loginDefaultIcon = document.getElementById('login-default-icon');
            if (loginLogoEl) loginLogoEl.style.display = 'none';
            if (loginDefaultIcon) loginDefaultIcon.style.display = 'inline-flex';

            const obsoleteLogoEls = document.querySelectorAll('#sidebar-logo-img, #header-brand-logo');
            obsoleteLogoEls.forEach(el => { el.remove(); });
            const headerNameEl = document.getElementById('header-brand-name');
            if (headerNameEl) headerNameEl.remove();

            // Set document title
            document.title = name + ' - نظام إدارة المعرض';
        },

        saveBranding: function(e) {
            e.preventDefault();
            if (App.isDemoMode) {
                alert("عذراً، لا يمكن تغيير هوية المعرض أو الإعدادات في النسخة التجريبية.");
                return;
            }

            const name    = document.getElementById('set-brand-name').value.trim();
            const logo    = '';
            const address = document.getElementById('set-address').value.trim();
            const phone   = document.getElementById('set-phone').value.trim();
            const theme   = document.getElementById('set-theme-select').value;
            const invoiceFooter = document.getElementById('set-invoice-footer').value.trim();
            const receiptFooter = document.getElementById('set-receipt-footer').value.trim();
            const localBranch = document.getElementById('set-local-branch').value;

            // Update global branding object
            BRANDING.name    = name    || BRANDING.name;
            BRANDING.logo    = '';
            BRANDING.address = address || BRANDING.address;
            BRANDING.phone   = phone   || BRANDING.phone;
            BRANDING.theme   = theme;
            BRANDING.invoiceFooter = invoiceFooter;
            BRANDING.receiptFooter = receiptFooter;

            // Persist
            localStorage.setItem('motomax_branding', JSON.stringify(BRANDING));
            localStorage.setItem('motomax_local_branch', localBranch);

            App.logActivity("تعديل هوية المعرض", `تحديث اسم المعرض إلى (${name}) وثيم المظهر إلى (${theme})`);
            App.saveAutoBackup();

            // Apply immediately
            this.applyTheme(theme, true);
            this.applyBrandingToUI();

            // Visual feedback
            const btn = e.target.querySelector('button[type="submit"]');
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> تم الحفظ بنجاح!';
                btn.style.background = 'var(--emerald)';
                setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2000);
            }
        },

        /* ─────────── PASSWORDS ENGINE ─────────────────────────────── */
        savePasswords: function(e) {
            e.preventDefault();

            const newAdmin = document.getElementById('pwd-admin').value.trim();
            const newSales = document.getElementById('pwd-sales').value.trim();
            const newAcc   = document.getElementById('pwd-acc').value.trim();
            const newView  = document.getElementById('pwd-view').value.trim();

            if (!newAdmin || !newSales || !newAcc || !newView) {
                alert('يجب ملء جميع حقول كلمات المرور الأربعة.');
                return;
            }
            if (newAdmin.length < 4 || newSales.length < 4 || newAcc.length < 4 || newView.length < 4) {
                alert('كلمة المرور يجب أن تكون 4 أحرف على الأقل لكل دور.');
                return;
            }

            // Update the live PWD_CONFIG object
            PWD_CONFIG.admin      = newAdmin;
            PWD_CONFIG.sales      = newSales;
            PWD_CONFIG.accounting = newAcc;
            PWD_CONFIG.viewer     = newView;

            // Persist encrypted to localStorage
            localStorage.setItem('motomax_passwords', JSON.stringify(PWD_CONFIG));

            App.logActivity("تغيير كلمات المرور", "تحديث كلمات مرور أدوار وصلاحيات النظام للجميع");
            App.saveAutoBackup();

            // Clear login hint
            const hintEl = document.getElementById('login-hint');
            if (hintEl) {
                hintEl.textContent = "";
            }

            // Visual feedback
            const btn = e.target.querySelector('button[type="submit"]');
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-lock"></i> تم تحديث كلمات المرور!';
                btn.style.background = 'var(--emerald)';
                setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2500);
            }

            // Log for session security notification
            alert(`✅ تم تحديث كلمات المرور لجميع الأدوار الأربعة بنجاح وحفظها بأمان.\n\nملاحظة: إذا كان هناك جلسات مفتوحة لأدوار أخرى، سيتم طلب إعادة تسجيل الدخول منهم عند التحويل القادم.`);
        },

        /* ─────────── BRANCHES ENGINE ──────────────────────────────── */
        saveBranches: function() {
            localStorage.setItem('motomax_branches', JSON.stringify(BRANCHES));
            this.renderBranchesList();
            this.populateBranchDropdowns();
            App.logActivity("تعديل الفروع", "تحديث قائمة أو أسماء الفروع التشغيلية للمعرض");
            App.saveAutoBackup();
        },

        addBranch: function() {
            const input = document.getElementById('settings-new-branch-input');
            const name = input ? input.value.trim() : '';
            if (!name) { alert('يرجى إدخال اسم الفرع الجديد.'); return; }
            if (BRANCHES.includes(name)) { alert('هذا الفرع موجود بالفعل.'); return; }
            BRANCHES.push(name);
            input.value = '';
            this.saveBranches();
        },

        deleteBranch: async function(idx) {
            const branchName = BRANCHES[idx];
            if (BRANCHES.length <= 1) { alert('لا يمكن حذف الفرع الوحيد المتبقي.'); return; }
            if (!await BakryDialogs.confirm(`هل تريد حذف فرع "${branchName}" نهائياً؟`)) return;
            BRANCHES.splice(idx, 1);
            this.saveBranches();
        },

        saveBranchRename: function(idx) {
            const input = document.getElementById(`branch-rename-${idx}`);
            const newName = input ? input.value.trim() : '';
            if (!newName) { alert('اسم الفرع لا يمكن أن يكون فارغاً.'); return; }
            if (BRANCHES.includes(newName) && BRANCHES[idx] !== newName) {
                alert('اسم الفرع موجود بالفعل. يرجى اختيار اسم آخر.'); return;
            }
            BRANCHES[idx] = newName;
            this.saveBranches();
        },

        renderBranchesList: function() {
            const tbody = document.getElementById('settings-branches-list');
            if (!tbody) return;
            tbody.innerHTML = '';

            BRANCHES.forEach((branch, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <input type="text" id="branch-rename-${idx}" value="${branch}"
                            style="background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px;padding:6px 10px;width:100%;font-family:inherit;font-size:13px;">
                    </td>
                    <td style="text-align:center;">
                        <div class="action-buttons" style="justify-content:center;">
                            <button class="btn btn-secondary btn-icon-only" onclick="App.Settings.saveBranchRename(${idx})" title="حفظ التعديل">
                                <i class="fa-solid fa-check text-emerald" style="font-size:11px;"></i>
                            </button>
                            <button class="btn btn-danger btn-icon-only" onclick="App.Settings.deleteBranch(${idx})" title="حذف الفرع">
                                <i class="fa-solid fa-trash" style="font-size:11px;"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        },

        populateBranchDropdowns: function() {
            // Map of selector ID -> whether it has an "all branches" first option
            const dropdowns = {
                'sale-branch-select':      false,  // in new sale form
                'sale-direct-branch':      false,  // in new sale form (direct unit entry)
                'sales-log-filter-branch': true,   // in sales log filter
                'unit-branch':             false,  // in add unit modal
                'batch-branch':            false,  // in batch add modal
                'unified-branch':          false,  // in unified add modal
                'transfer-target-branch':  false,  // in transfer branch modal
                'set-local-branch':        false   // in settings local branch
            };

            Object.entries(dropdowns).forEach(([id, hasAll]) => {
                const el = document.getElementById(id);
                if (!el) return;
                const currentVal = el.value;
                el.innerHTML = hasAll ? '<option value="all">كل الفروع</option>' : '';
                BRANCHES.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b;
                    opt.textContent = b;
                    el.appendChild(opt);
                });
                if (currentVal && Array.from(el.options).some(o => o.value === currentVal)) {
                    el.value = currentVal;
                }
            });
        },

        /* ─────────── DATABASE EXPORT ─────────────────────────────── */
        exportDatabase: async function() {
            try {
                const stores = ['customers', 'suppliers', 'products', 'units', 'sales', 'installments', 'transactions'];
                const backup = {
                    _meta: {
                        app: 'MotoMax',
                        version: '3.0',
                        exportDate: new Date().toISOString(),
                        branding: BRANDING,
                        branches: BRANCHES,
                        exportedBy: currentRole
                    }
                };

                for (const store of stores) {
                    backup[store] = await MotoDB.getAll(store);
                }

                const json = JSON.stringify(backup, null, 2);
                const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const defaultFilename = `MotoMax_Backup_${dateStr}.json`;

                // If running in pywebview desktop app and we have the save_backup_manual API:
                if (window.pywebview && window.pywebview.api && window.pywebview.api.save_backup_manual) {
                    window.pywebview.api.save_backup_manual(json, defaultFilename).then(res => {
                        if (res && res.success) {
                            alert(`✅ تم تصدير قاعدة البيانات بنجاح!\n\nالمسار: ${res.filepath}`);
                        } else if (res && res.cancelled) {
                            // User cancelled, do nothing
                        } else {
                            alert('فشل تصدير قاعدة البيانات: ' + (res ? res.error : 'خطأ غير معروف'));
                        }
                    }).catch(err => {
                        alert('حدث خطأ أثناء حفظ الملف: ' + err);
                    });
                } else {
                    // Fallback to browser download if accessed via web browser directly
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = defaultFilename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    const totalRecs = stores.reduce((sum, s) => sum + (backup[s] ? backup[s].length : 0), 0);
                    alert(`✅ تم تصدير قاعدة البيانات بنجاح!\n\nالإجمالي: ${totalRecs} سجل من ${stores.length} جداول\nتاريخ التصدير: ${new Date().toLocaleString('ar-EG')}`);
                }
            } catch (err) {
                alert('فشل تصدير قاعدة البيانات: ' + err);
                console.error(err);
            }
        },

        /* ─────────── DATABASE IMPORT (SMART NON-DESTRUCTIVE MERGE) ────── */
        importDatabase: async function() {
            const fileInput = document.getElementById('db-import-file');
            if (!fileInput || !fileInput.files.length) {
                alert('يرجى اختيار ملف JSON للاستيراد أولاً.');
                return;
            }

            const file = fileInput.files[0];
            if (!file.name.endsWith('.json')) {
                alert('يجب أن يكون الملف بصيغة JSON (.json)');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const backup = JSON.parse(e.target.result);
                    
                    if (!backup._meta || backup._meta.app !== 'MotoMax') {
                        alert('خطأ: هذا الملف ليس نسخة احتياطية صحيحة من نظام MotoMax.');
                        return;
                    }

                    const conflicts = [];
                    let addedCount = 0;
                    const storesToImport = ['customers', 'suppliers', 'products', 'units', 'sales', 'installments', 'transactions'];

                    const storeArabic = {
                        customers: 'العملاء',
                        suppliers: 'الموردين',
                        products: 'المنتجات',
                        units: 'وحدات المخزون',
                        sales: 'المبيعات',
                        installments: 'جداول الأقساط',
                        transactions: 'حركة الخزينة'
                    };

                    for (const store of storesToImport) {
                        if (!backup[store] || !Array.isArray(backup[store])) continue;
                        
                        for (const record of backup[store]) {
                            // Preserve the original ID to maintain relationship integrity across tables
                            const recCopy = Object.assign({}, record);
                            const originalId = recCopy.id;

                            try {
                                await MotoDB.add(store, recCopy);
                                addedCount++;
                            } catch (addErr) {
                                // ConstraintError = duplicate unique field (NID, chassis, invoice, etc.)
                                const errMsg = String(addErr);
                                const isConstraint = errMsg.includes('مكرر') || errMsg.includes('ConstraintError') || errMsg.includes('فريدة');
                                
                                let conflictReason = 'تعارض في البيانات أو قيمة مكررة';
                                let conflictDesc = '';
                                
                                if (isConstraint) {
                                    conflictReason = 'قيمة فريدة مكررة (كود، شاسيه، بطاقة، أو فاتورة)';
                                    if (store === 'customers' && record.nid) conflictDesc = `الرقم القومي: ${record.nid} | الاسم: ${record.name}`;
                                    else if (store === 'units' && record.chassis) conflictDesc = `الشاسيه: ${record.chassis}`;
                                    else if (store === 'sales' && record.invoiceNo) conflictDesc = `رقم الفاتورة: ${record.invoiceNo}`;
                                    else conflictDesc = record.code || record.name || `سجل رقم (${originalId})`;
                                } else {
                                    conflictDesc = errMsg.substring(0, 80);
                                }

                                conflicts.push({
                                    store: storeArabic[store] || store,
                                    desc: conflictDesc,
                                    reason: conflictReason
                                });
                            }
                        }
                    }

                    // Optionally import branches from backup
                    if (backup._meta.branches && Array.isArray(backup._meta.branches)) {
                        backup._meta.branches.forEach(b => {
                            if (!BRANCHES.includes(b)) BRANCHES.push(b);
                        });
                        this.saveBranches();
                    }

                    // Reload global data
                    await App.loadAllData();
                    fileInput.value = '';

                    App.logActivity("استيراد قاعدة بيانات", `دمج واستيراد نسخة احتياطية بنجاح (تم إضافة ${addedCount} سجل وتخطي ${conflicts.length} تعارض)`);
                    App.saveAutoBackup();

                    // Show conflict report modal
                    this.showConflictReport(conflicts, addedCount);

                } catch (parseErr) {
                    alert('فشل قراءة الملف: ' + parseErr + '\n\nتأكد أن الملف بصيغة JSON صحيحة.');
                    console.error(parseErr);
                }
            };
            reader.readAsText(file);
        },

        downloadExcelTemplate: function() {
            try {
                const wb = XLSX.utils.book_new();

                // 1. Sheet Customers & Guarantors
                const wsCustomers = XLSX.utils.json_to_sheet([
                    {
                        'كود العميل': 'C-1001',
                        'الاسم الكامل': 'أحمد محمد علي',
                        'رقم الموبايل': '01012345678',
                        'الرقم القومي (البطاقة)': '29301010101234',
                        'محل الإقامة والسكن': 'طنطا، الغربية',
                        'نوع المعاملة (كاش/تقسيط)': 'تقسيط',
                        'ملاحظات': 'عميل نشط ملتزم بالدفع'
                    }
                ]);
                wsCustomers['!dir'] = 'rtl';
                XLSX.utils.book_append_sheet(wb, wsCustomers, 'العملاء والضامنين');

                // 2. Sheet Suppliers
                const wsSuppliers = XLSX.utils.json_to_sheet([
                    {
                        'كود المورد': 'S-1001',
                        'اسم المورد/الشركة': 'الشركة الهندسية للتوريدات',
                        'رقم الهاتف': '01222334455',
                        'السجل التجاري/البطاقة': 'REG-876543',
                        'العنوان بالتفصيل': 'شبرا، القاهرة',
                        'نوع المورد (موتوسيكلات/قطع غيار/خدمات)': 'موتوسيكلات',
                        'ملاحظات': 'الوكيل الرسمي لماركة بجاج'
                    }
                ]);
                wsSuppliers['!dir'] = 'rtl';
                XLSX.utils.book_append_sheet(wb, wsSuppliers, 'الموردين');

                // 3. Sheet Models
                const wsModels = XLSX.utils.json_to_sheet([
                    {
                        'كود الموديل': 'P-1001',
                        'الماركة والنوع': 'بجاج بولسار 150',
                        'سنة الموديل': 2025,
                        'السعة (CC)': '150 cc',
                        'السعر الافتراضي': 42000,
                        'كود المورد المرتبط': 'S-1001',
                        'ملاحظات': 'موديل كلاسيكي بجنط بولسار'
                    }
                ]);
                wsModels['!dir'] = 'rtl';
                XLSX.utils.book_append_sheet(wb, wsModels, 'الموديلات');

                // 4. Sheet Stock
                const wsStock = XLSX.utils.json_to_sheet([
                    {
                        'كود الموديل': 'P-1001',
                        'رقم الشاسيه': 'BJ982341908AB',
                        'رقم الموتور': 'BJ8723419',
                        'اللون الخارجي': 'أسود مطفي',
                        'الفرع المستودع': 'فرع طنطا (الرئيسي)',
                        'تكلفة الشراء': 34000,
                        'حالة القطعة (متاح/مباع)': 'متاح',
                        'سعر البيع الفعلي (للمباع)': '',
                        'تاريخ البيع (للمباع - YYYY-MM-DD)': ''
                    }
                ]);
                wsStock['!dir'] = 'rtl';
                XLSX.utils.book_append_sheet(wb, wsStock, 'المركبات المخزون');

                // 5. Sheet Sales
                const wsSales = XLSX.utils.json_to_sheet([
                    {
                        'رقم الفاتورة': 'INV-1001',
                        'كود العميل': 'C-1001',
                        'رقم الشاسيه': 'BJ982341908AB',
                        'تاريخ البيع (YYYY-MM-DD)': '2026-06-01',
                        'الفرع المباع منه': 'فرع طنطا (الرئيسي)',
                        'سعر البيع الفعلي': 45000,
                        'نوع البيع (كاش/تقسيط)': 'تقسيط',
                        'المقدم المدفوع': 15000,
                        'عدد أشهر التقسيط': 12,
                        'قسط الشهر': 2500,
                        'الضامن 1 - الاسم الكامل': 'سليمان محمود علي',
                        'الضامن 1 - رقم الهاتف': '01198765412',
                        'الضامن 1 - رقم البطاقة': '26504120108923',
                        'الضامن 1 - محل الإقامة': 'طنطا، الغربية',
                        'الضامن 1 - صلة القرابة': 'أب',
                        'الضامن 2 - الاسم الكامل': 'عصام كمال الدين',
                        'الضامن 2 - رقم الهاتف': '01023456711',
                        'الضامن 2 - رقم البطاقة': '27802110103429',
                        'الضامن 2 - محل الإقامة': 'المنصورة، الدقهلية',
                        'الضامن 2 - صلة القرابة': 'خال العميل',
                        'ملاحظات الفاتورة والضمان': 'وقع العميل والضامنين وصولات الأمانة البنكية'
                    }
                ]);
                wsSales['!dir'] = 'rtl';
                XLSX.utils.book_append_sheet(wb, wsSales, 'المبيعات والأقساط');

                XLSX.writeFile(wb, 'نموذج_إدخال_بيانات_موتوماكس.xlsx');
            } catch (err) {
                alert("فشل تنزيل النموذج: " + err);
            }
        },

        importExcelTemplate: async function() {
            const fileInput = document.getElementById('db-import-excel-file');
            if (!fileInput || !fileInput.files.length) {
                alert('يرجى اختيار ملف إكسل للاستيراد أولاً.');
                return;
            }

            const file = fileInput.files[0];
            if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                alert('يجب أن يكون الملف بصيغة إكسل (.xlsx أو .xls)');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    const conflicts = [];
                    let addedCount = 0;
                    
                    const customerMap = {};
                    const supplierMap = {};
                    const productMap = {};
                    const unitMap = {};

                    const existingCusts = await MotoDB.getAll('customers');
                    existingCusts.forEach(c => { customerMap[c.code] = c.id; });

                    const existingSups = await MotoDB.getAll('suppliers');
                    existingSups.forEach(s => { supplierMap[s.code] = s.id; });

                    const existingProds = await MotoDB.getAll('products');
                    existingProds.forEach(p => { productMap[p.code] = p.id; });

                    const existingUnits = await MotoDB.getAll('units');
                    existingUnits.forEach(u => { unitMap[u.chassis] = u.id; });

                    // 1. Process Customers
                    const sheetCust = workbook.Sheets['العملاء والضامنين'];
                    if (sheetCust) {
                        const rows = XLSX.utils.sheet_to_json(sheetCust);
                        for (const row of rows) {
                            const code = String(row['كود العميل'] || '').trim();
                            const name = String(row['الاسم الكامل'] || '').trim();
                            if (!code || !name) continue;

                            if (customerMap[code]) continue;

                            const encryptedPhone = App.Security.encrypt(String(row['رقم الموبايل'] || '').trim());
                            const encryptedNid = App.Security.encrypt(String(row['الرقم القومي (البطاقة)'] || '').trim());
                            
                            const custObj = {
                                code,
                                name,
                                phone: encryptedPhone,
                                nid: encryptedNid,
                                address: String(row['محل الإقامة والسكن'] || '').trim(),
                                type: String(row['نوع المعاملة (كاش/تقسيط)'] || '').trim() === 'كاش' ? 'cash' : 'installment',
                                notes: String(row['ملاحظات'] || '').trim()
                            };

                            try {
                                const id = await MotoDB.add('customers', custObj);
                                customerMap[code] = id;
                                addedCount++;
                            } catch (err) {
                                conflicts.push({ store: 'العملاء', desc: `كود العميل: ${code} | الاسم: ${name}`, reason: String(err) });
                            }
                        }
                    }

                    // 2. Process Suppliers
                    const sheetSup = workbook.Sheets['الموردين'];
                    if (sheetSup) {
                        const rows = XLSX.utils.sheet_to_json(sheetSup);
                        for (const row of rows) {
                            const code = String(row['كود المورد'] || '').trim();
                            const name = String(row['اسم المورد/الشركة'] || '').trim();
                            if (!code || !name) continue;

                            if (supplierMap[code]) continue;

                            const supObj = {
                                code,
                                name,
                                phone: String(row['رقم الهاتف'] || '').trim(),
                                nid: String(row['السجل التجاري/البطاقة'] || '').trim(),
                                address: String(row['العنوان بالتفصيل'] || '').trim(),
                                type: String(row['نوع المورد (موتوسيكلات/قطع غيار/خدمات)'] || 'موتوسيكلات').trim(),
                                notes: String(row['ملاحظات'] || '').trim()
                            };

                            try {
                                const id = await MotoDB.add('suppliers', supObj);
                                supplierMap[code] = id;
                                addedCount++;
                            } catch (err) {
                                conflicts.push({ store: 'الموردين', desc: `كود المورد: ${code} | الاسم: ${name}`, reason: String(err) });
                            }
                        }
                    }

                    // 3. Process Models
                    const sheetModels = workbook.Sheets['الموديلات'];
                    if (sheetModels) {
                        const rows = XLSX.utils.sheet_to_json(sheetModels);
                        for (const row of rows) {
                            const code = String(row['كود الموديل'] || '').trim();
                            const brand = String(row['الماركة والنوع'] || '').trim();
                            if (!code || !brand) continue;

                            if (productMap[code]) continue;

                            const supCode = String(row['كود المورد المرتبط'] || '').trim();
                            const supplierId = supplierMap[supCode] || 1;

                            const prodObj = {
                                code,
                                brand,
                                year: Number(row['سنة الموديل']) || 2025,
                                cc: String(row['السعة (CC)'] || '150 cc').trim(),
                                price: Number(row['السعر الافتراضي']) || 0,
                                supplierId,
                                notes: String(row['ملاحظات'] || '').trim()
                            };

                            try {
                                const id = await MotoDB.add('products', prodObj);
                                productMap[code] = id;
                                addedCount++;
                            } catch (err) {
                                conflicts.push({ store: 'الموديلات', desc: `كود الموديل: ${code} | الماركة: ${brand}`, reason: String(err) });
                            }
                        }
                    }

                    // 4. Process Stock (Units)
                    const sheetStock = workbook.Sheets['المركبات المخزون'];
                    if (sheetStock) {
                        const rows = XLSX.utils.sheet_to_json(sheetStock);
                        for (const row of rows) {
                            const chassis = String(row['رقم الشاسيه'] || '').trim();
                            const motor = String(row['رقم الموتور'] || '').trim();
                            if (!chassis || !motor) continue;

                            if (unitMap[chassis]) continue;

                            const prodCode = String(row['كود الموديل'] || '').trim();
                            const productId = productMap[prodCode];
                            if (!productId) {
                                conflicts.push({ store: 'المركبات المخزون', desc: `الشاسيه: ${chassis}`, reason: `كود الموديل المرتبط (${prodCode}) غير موجود.` });
                                continue;
                            }

                            const unitObj = {
                                productId,
                                chassis,
                                motor,
                                color: String(row['اللون الخارجي'] || 'أسود').trim(),
                                branch: String(row['الفرع المستودع'] || 'فرع طنطا (الرئيسي)').trim(),
                                cost: Number(row['تكلفة الشراء']) || 0,
                                status: String(row['حالة القطعة (متاح/مباع)'] || 'متاح').trim() === 'مباع' ? 'مباع' : 'متاح',
                                soldPrice: Number(row['سعر البيع الفعلي (للمباع)']) || null,
                                soldDate: String(row['تاريخ البيع (للمباع - YYYY-MM-DD)'] || '').trim() || null
                            };

                            try {
                                const id = await MotoDB.add('units', unitObj);
                                unitMap[chassis] = id;
                                addedCount++;
                            } catch (err) {
                                conflicts.push({ store: 'المركبات المخزون', desc: `رقم الشاسيه: ${chassis}`, reason: String(err) });
                            }
                        }
                    }

                    // 5. Process Sales & Installments
                    const sheetSales = workbook.Sheets['المبيعات والأقساط'];
                    if (sheetSales) {
                        const rows = XLSX.utils.sheet_to_json(sheetSales);
                        const installmentsToBatch = [];
                        const transactionsToBatch = [];

                        for (const row of rows) {
                            const invoiceNo = String(row['رقم الفاتورة'] || '').trim();
                            if (!invoiceNo) continue;

                            const existingSales = await MotoDB.getAll('sales');
                            if (existingSales.some(s => s.invoiceNo === invoiceNo)) continue;

                            const custCode = String(row['كود العميل'] || '').trim();
                            const customerId = customerMap[custCode];
                            if (!customerId) {
                                conflicts.push({ store: 'المبيعات', desc: `فاتورة: ${invoiceNo}`, reason: `كود العميل (${custCode}) غير مسجل.` });
                                continue;
                            }

                            const chassis = String(row['رقم الشاسيه'] || '').trim();
                            const unitId = unitMap[chassis];
                            if (!unitId) {
                                conflicts.push({ store: 'المبيعات', desc: `فاتورة: ${invoiceNo}`, reason: `رقم الشاسيه (${chassis}) غير موجود بالمخازن.` });
                                continue;
                            }

                            const type = String(row['نوع البيع (كاش/تقسيط)'] || 'كاش').trim() === 'تقسيط' ? 'installment' : 'cash';
                            const salePrice = Number(row['سعر البيع الفعلي']) || 0;
                            const downpayment = Number(row['المقدم المدفوع']) || 0;
                            const months = Number(row['عدد أشهر التقسيط']) || 0;
                            const monthlyPayment = Number(row['قسط الشهر']) || 0;
                            const remainingAmount = type === 'installment' ? (salePrice - downpayment) : 0;
                            const saleDate = String(row['تاريخ البيع (YYYY-MM-DD)'] || '').trim() || new Date().toISOString().split('T')[0];

                            const saleObj = {
                                invoiceNo,
                                customerId,
                                unitId,
                                type,
                                branch: String(row['الفرع المباع منه'] || 'فرع طنطا (الرئيسي)').trim(),
                                originalPrice: salePrice,
                                salePrice,
                                downpayment,
                                months,
                                monthlyPayment,
                                remainingAmount,
                                saleDate,
                                notes: String(row['ملاحظات الفاتورة والضمان'] || '').trim(),
                                g1_name: String(row['الضامن 1 - الاسم الكامل'] || '-').trim(),
                                g1_phone: App.Security.encrypt(String(row['الضامن 1 - رقم الهاتف'] || '').trim()),
                                g1_nid: App.Security.encrypt(String(row['الضامن 1 - رقم البطاقة'] || '').trim()),
                                g1_address: String(row['الضامن 1 - محل الإقامة'] || '-').trim(),
                                g1_rel: String(row['الضامن 1 - صلة القرابة'] || 'ضامن أول').trim(),
                                g2_name: String(row['الضامن 2 - الاسم الكامل'] || '-').trim(),
                                g2_phone: App.Security.encrypt(String(row['الضامن 2 - رقم الهاتف'] || '').trim()),
                                g2_nid: App.Security.encrypt(String(row['الضامن 2 - رقم البطاقة'] || '').trim()),
                                g2_address: String(row['الضامن 2 - محل الإقامة'] || '-').trim(),
                                g2_rel: String(row['الضامن 2 - صلة القرابة'] || 'ضامن ثان').trim(),
                                guaranteeNotes: 'مستورد من نموذج إكسل'
                            };

                            try {
                                const saleId = await MotoDB.add('sales', saleObj);
                                addedCount++;

                                const unitObj = await MotoDB.getById('units', unitId);
                                if (unitObj) {
                                    unitObj.status = 'مباع';
                                    unitObj.soldPrice = salePrice;
                                    unitObj.soldDate = saleDate;
                                    await MotoDB.update('units', unitObj);
                                }

                                if (type === 'cash') {
                                    transactionsToBatch.push({
                                        code: 'TX-TEMP',
                                        date: `${saleDate} 12:00`,
                                        type: 'قبض',
                                        category: 'مبيعات كاش',
                                        amount: salePrice,
                                        description: `إيراد فاتورة بيع كاش رقم ${invoiceNo}`,
                                        user: currentRole
                                    });
                                } else {
                                    if (downpayment > 0) {
                                        transactionsToBatch.push({
                                            code: 'TX-TEMP',
                                            date: `${saleDate} 12:00`,
                                            type: 'قبض',
                                            category: 'مقدم قسط',
                                            amount: downpayment,
                                            description: `مقدم عقد بيع بالتقسيط رقم ${invoiceNo}`,
                                            user: currentRole
                                        });
                                    }

                                    const saleDt = new Date(saleDate);
                                    for (let m = 1; m <= months; m++) {
                                        const dueDate = new Date(saleDt.getFullYear(), saleDt.getMonth() + m, 1);
                                        const dueDateStr = dueDate.toISOString().split('T')[0];

                                        installmentsToBatch.push({
                                            saleId,
                                            customerId,
                                            installmentNumber: m,
                                            amount: monthlyPayment,
                                            dueDate: dueDateStr,
                                            status: 'pending',
                                            paidAmount: null,
                                            paidDate: null,
                                            notes: 'مجدول تلقائياً من الإكسل'
                                        });
                                    }
                                }
                            } catch (err) {
                                conflicts.push({ store: 'المبيعات', desc: `فاتورة: ${invoiceNo}`, reason: String(err) });
                            }
                        }

                        if (installmentsToBatch.length > 0) {
                            await MotoDB.updateBatch('installments', installmentsToBatch);
                            addedCount += installmentsToBatch.length;
                        }
                        if (transactionsToBatch.length > 0) {
                            for (let tx of transactionsToBatch) {
                                tx.code = await MotoDB.generateNextTxCode();
                                await MotoDB.add('transactions', tx);
                                addedCount++;
                            }
                        }
                    }

                    await App.loadAllData();
                    fileInput.value = '';

                    App.logActivity("استيراد إكسل الموحد", `دمج واستيراد بيانات إكسل بنجاح (تم إضافة ${addedCount} سجل وتخطي ${conflicts.length} تعارض)`);
                    App.saveAutoBackup();

                    this.showConflictReport(conflicts, addedCount);
                } catch (parseErr) {
                    alert('فشل استيراد ملف إكسل: ' + parseErr);
                    console.error(parseErr);
                }
            };
            reader.readAsArrayBuffer(file);
        },

        showConflictReport: function(conflicts, addedCount) {
            const tbody = document.getElementById('conflict-report-table-body');
            if (!tbody) return;

            tbody.innerHTML = '';
            if (conflicts.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--emerald); padding:20px;">
                    <i class="fa-solid fa-circle-check"></i> تم دمج جميع السجلات بنجاح كامل! لم يتم اكتشاف أي تعارضات.
                </td></tr>`;
            } else {
                conflicts.forEach(c => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span class="badge-status warning">${c.store}</span></td>
                        <td style="font-size:12px;">${c.desc}</td>
                        <td style="font-size:11px; color: var(--amber);">${c.reason}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // Update header summary
            const headerEl = document.querySelector('#conflict-report-modal .alert-content h3');
            if (headerEl) headerEl.textContent = `اكتمل الاستيراد والدمج! تم إضافة ${addedCount} سجل جديد`;

            document.getElementById('conflict-report-modal').classList.remove('hidden');
        },

        /* ─────────── RENDER (MAIN ENTRY POINT FOR SETTINGS PAGE) ────── */
        render: function() {
            // ── ADMIN LOCK: Non-admins see the lock screen
            const lockScreen   = document.getElementById('settings-lock-screen');
            const adminWrapper = document.getElementById('settings-admin-wrapper');

            if (currentRole !== 'admin') {
                if (lockScreen)   lockScreen.classList.remove('hidden');
                if (adminWrapper) adminWrapper.style.display = 'none';
                return;
            } else {
                if (lockScreen)   lockScreen.classList.add('hidden');
                if (adminWrapper) adminWrapper.style.display = '';
            }

            // ── Load saved branding into form fields
            const brandName = document.getElementById('set-brand-name');
            const logoUrl   = document.getElementById('set-logo-url');
            const addrEl    = document.getElementById('set-address');
            const phoneEl   = document.getElementById('set-phone');
            const themeEl   = document.getElementById('set-theme-select');
            const localBranchEl = document.getElementById('set-local-branch');

            if (brandName) brandName.value = BRANDING.name || '';
            if (logoUrl)   logoUrl.value   = BRANDING.logo || '';
            if (addrEl)    addrEl.value    = BRANDING.address || '';
            if (phoneEl)   phoneEl.value   = BRANDING.phone || '';
            if (themeEl)   themeEl.value   = BRANDING.theme || 'sport';
            if (localBranchEl) {
                localBranchEl.value = localStorage.getItem('motomax_local_branch') || BRANCHES[0] || '';
            }

            const invoiceFooterEl = document.getElementById('set-invoice-footer');
            const receiptFooterEl = document.getElementById('set-receipt-footer');
            if (invoiceFooterEl) invoiceFooterEl.value = BRANDING.invoiceFooter || '';
            if (receiptFooterEl) receiptFooterEl.value = BRANDING.receiptFooter || '';

            // Update swatch selection
            this.applyTheme(BRANDING.theme || 'sport', false);
            this.lockSettingsIfDemo();

            // ── Load current passwords into form fields
            const pwdAdmin = document.getElementById('pwd-admin');
            const pwdSales = document.getElementById('pwd-sales');
            const pwdAcc   = document.getElementById('pwd-acc');
            const pwdView  = document.getElementById('pwd-view');

            if (pwdAdmin) pwdAdmin.value = PWD_CONFIG.admin      || '';
            if (pwdSales) pwdSales.value = PWD_CONFIG.sales      || '';
            if (pwdAcc)   pwdAcc.value   = PWD_CONFIG.accounting || '';
            if (pwdView)  pwdView.value  = PWD_CONFIG.viewer     || '';

            // ── Render branches list
            this.renderBranchesList();

            // ── Load database and backup configurations from API
            fetch('/api/db/backup/config')
                .then(res => res.json())
                .then(data => {
                    if (data.db) {
                        document.getElementById('settings-db-engine').value = data.db.engine || 'sqlite';
                        document.getElementById('settings-db-sqlite-file').value = data.db.sqlite_file || 'motomax.db';
                        document.getElementById('settings-db-host').value = data.db.host || 'localhost';
                        document.getElementById('settings-db-port').value = data.db.port || 3306;
                        document.getElementById('settings-db-name').value = data.db.database || 'motomax';
                        document.getElementById('settings-db-user').value = data.db.user || 'root';
                        document.getElementById('settings-db-password').value = data.db.password || '';
                        
                        this.onDbEngineChange(data.db.engine || 'sqlite');
                    }
                    if (data.backup) {
                        const localVal = data.backup.backup_local_enable ? 'yes' : 'no';
                        const cloudVal = data.backup.backup_cloud_enable ? 'yes' : 'no';
                        
                        document.querySelectorAll('input[name="backup_local"]').forEach(r => {
                            if (r.value === localVal) r.checked = true;
                        });
                        this.toggleBackupLocal(localVal);
                        
                        document.querySelectorAll('input[name="backup_cloud"]').forEach(r => {
                            if (r.value === cloudVal) r.checked = true;
                        });
                        this.onBackupCloudToggle(data.backup.backup_cloud_enable);
                        
                        document.getElementById('settings-cloud-provider').value = data.backup.backup_cloud_provider || 'webhook';
                        document.getElementById('settings-webhook-url').value = data.backup.webhook_url || '';
                        document.getElementById('settings-s3-endpoint').value = data.backup.s3_endpoint || '';
                        document.getElementById('settings-s3-bucket').value = data.backup.s3_bucket || '';
                        document.getElementById('settings-s3-access-key').value = data.backup.s3_access_key || '';
                        document.getElementById('settings-s3-secret-key').value = data.backup.s3_secret_key || '';
                        
                        this.onCloudProviderChange(data.backup.backup_cloud_provider || 'webhook');
                    }
                    this.lockSettingsIfDemo();
                })
                .catch(err => {
                    console.error("Error loading db/backup config:", err);
                });
        },

        lockSettingsIfDemo: function() {
            if (App.isDemoMode) {
                // Disable customization fields
                ['set-brand-name', 'set-logo-url', 'set-address', 'set-phone', 'set-invoice-footer', 'set-receipt-footer', 'set-theme-select', 'set-local-branch'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = true;
                });
                
                // Disable password fields
                ['pwd-admin', 'pwd-sales', 'pwd-acc', 'pwd-view'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = true;
                });
                
                // Disable database config fields
                ['settings-db-engine', 'settings-db-sqlite-file', 'settings-db-host', 'settings-db-port', 'settings-db-name', 'settings-db-user', 'settings-db-password'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = true;
                });

                // Disable backup config fields
                ['settings-cloud-provider', 'settings-webhook-url', 'settings-s3-endpoint', 'settings-s3-bucket', 'settings-s3-access-key', 'settings-s3-secret-key'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = true;
                });

                // Disable backup radio inputs
                document.querySelectorAll('input[name="backup_local"], input[name="backup_cloud"]').forEach(r => {
                    r.disabled = true;
                });
                
                // Disable local logo file upload button
                const fileBtn = document.querySelector('button[onclick*="set-logo-file"]');
                if (fileBtn) fileBtn.disabled = true;
                
                // Disable all submit buttons inside customization forms in settings
                const submitBtns = document.querySelectorAll('#settings-admin-wrapper form button[type="submit"]');
                submitBtns.forEach(btn => btn.disabled = true);
                
                // Disable branches actions
                const addBranchBtn = document.querySelector('button[onclick*="addBranch"]');
                if (addBranchBtn) addBranchBtn.disabled = true;
                
                // Disable clear database button
                const clearDbBtn = document.querySelector('button[onclick*="clearDatabase"]');
                if (clearDbBtn) clearDbBtn.disabled = true;
            }
        },

        /* ─────────── DATABASE & BACKUP UI LOGIC ──────────────────────── */
        onDbEngineChange: function(engine) {
            const sqliteField = document.getElementById('db-field-sqlite');
            const serverFields = document.getElementById('db-fields-server');
            const portField = document.getElementById('settings-db-port');
            
            if (engine === 'sqlite') {
                if (sqliteField) sqliteField.classList.remove('hidden');
                if (serverFields) serverFields.classList.add('hidden');
            } else {
                if (sqliteField) sqliteField.classList.add('hidden');
                if (serverFields) serverFields.classList.remove('hidden');
                if (portField) {
                    portField.value = (engine === 'mysql') ? 3306 : 5432;
                }
            }
        },

        toggleBackupLocal: function(val) {
            document.querySelectorAll('#settings-page #btn-backup-local-yes, #settings-page #btn-backup-local-no').forEach(btn => {
                btn.classList.remove('active');
            });
            if (val === 'yes') {
                document.getElementById('btn-backup-local-yes').classList.add('active');
            } else {
                document.getElementById('btn-backup-local-no').classList.add('active');
            }
        },

        onBackupCloudToggle: function(enabled) {
            const fields = document.getElementById('cloud-backup-fields');
            document.querySelectorAll('#settings-page #btn-backup-cloud-yes, #settings-page #btn-backup-cloud-no').forEach(btn => {
                btn.classList.remove('active');
            });
            if (enabled) {
                document.getElementById('btn-backup-cloud-yes').classList.add('active');
                if (fields) fields.classList.remove('hidden');
            } else {
                document.getElementById('btn-backup-cloud-no').classList.add('active');
                if (fields) fields.classList.add('hidden');
            }
        },

        onCloudProviderChange: function(provider) {
            const webhookField = document.getElementById('cloud-field-webhook');
            const s3Fields = document.getElementById('cloud-fields-s3');
            
            if (provider === 'webhook') {
                if (webhookField) webhookField.classList.remove('hidden');
                if (s3Fields) s3Fields.classList.add('hidden');
            } else {
                if (webhookField) webhookField.classList.add('hidden');
                if (s3Fields) s3Fields.classList.remove('hidden');
            }
        },

        /* ─────────── DATABASE & BACKUP SAVE / TEST / MIGRATE ────────── */
        saveDbAndBackupConfig: function(event) {
            event.preventDefault();
            
            const config = {
                db: {
                    engine: document.getElementById('settings-db-engine').value,
                    sqlite_file: document.getElementById('settings-db-sqlite-file').value,
                    host: document.getElementById('settings-db-host').value,
                    port: Number(document.getElementById('settings-db-port').value),
                    database: document.getElementById('settings-db-name').value,
                    user: document.getElementById('settings-db-user').value,
                    password: document.getElementById('settings-db-password').value
                },
                backup: {
                    backup_local_enable: document.querySelector('input[name="backup_local"]:checked').value === 'yes',
                    backup_cloud_enable: document.querySelector('input[name="backup_cloud"]:checked').value === 'yes',
                    backup_cloud_provider: document.getElementById('settings-cloud-provider').value,
                    s3_endpoint: document.getElementById('settings-s3-endpoint').value,
                    s3_bucket: document.getElementById('settings-s3-bucket').value,
                    s3_access_key: document.getElementById('settings-s3-access-key').value,
                    s3_secret_key: document.getElementById('settings-s3-secret-key').value,
                    webhook_url: document.getElementById('settings-webhook-url').value
                }
            };
            
            fetch('/api/db/backup/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    alert('✅ تم حفظ إعدادات قاعدة البيانات والنسخ الاحتياطي بنجاح! سيقوم النظام باستخدام الإعدادات الجديدة للعمليات والنسخ الاحتياطي اليومي.');
                    window.location.reload();
                } else {
                    alert('❌ فشل حفظ الإعدادات: ' + res.error);
                }
            })
            .catch(err => {
                alert('❌ خطأ في الاتصال بالخادم لحفظ الإعدادات: ' + err);
            });
        },

        testDbConnection: function() {
            const db_config = {
                engine: document.getElementById('settings-db-engine').value,
                sqlite_file: document.getElementById('settings-db-sqlite-file').value,
                host: document.getElementById('settings-db-host').value,
                port: Number(document.getElementById('settings-db-port').value),
                database: document.getElementById('settings-db-name').value,
                user: document.getElementById('settings-db-user').value,
                password: document.getElementById('settings-db-password').value
            };
            
            fetch('/api/db/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(db_config)
            })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    alert("✅ تم الاتصال بنجاح بخادم قاعدة البيانات المحدد!");
                } else {
                    alert("❌ فشل الاتصال بخادم قاعدة البيانات:\n\n" + res.error);
                }
            })
            .catch(err => {
                alert("❌ خطأ في الاتصال بالخادم لإجراء الفحص: " + err);
            });
        },

        migrateLocalData: async function() {
            const confirmMsg = "تحذير: سيتم قراءة كافة البيانات المخزنة حالياً في متصفحك (IndexedDB) ونقلها لخادم قاعدة البيانات الجديد.\n\nسيؤدي هذا لمسح البيانات الموجودة في السيرفر الجديد واستبدالها ببيانات المتصفح الحالية.\n\nهل أنت متأكد وتريد المتابعة؟";
            if (!await BakryDialogs.confirm(confirmMsg)) return;
            
            const progressModal = document.getElementById('backup-progress-modal');
            const progressTitle = document.getElementById('backup-progress-title');
            const progressMsg = document.getElementById('backup-progress-message');
            
            if (progressModal) {
                progressTitle.textContent = "جاري قراءة البيانات المحلية...";
                progressMsg.textContent = "يرجى الانتظار، نقوم الآن باستخراج البيانات وتجهيز ملف النقل...";
                progressModal.classList.remove('hidden');
            }
            
            const readIndexedDB = () => {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open('MotoMaxDB', 3);
                    request.onerror = () => reject("فشل فتح قاعدة البيانات المحلية.");
                    request.onsuccess = async (event) => {
                        const db = event.target.result;
                        const backup = {};
                        const stores = ['customers', 'suppliers', 'products', 'units', 'sales', 'installments', 'transactions', 'collection_notes', 'supplier_dues', 'audit_logs'];
                        
                        try {
                            for (let storeName of stores) {
                                if (!db.objectStoreNames.contains(storeName)) continue;
                                const transaction = db.transaction(storeName, 'readonly');
                                const store = transaction.objectStore(storeName);
                                
                                const items = await new Promise((res, rej) => {
                                    const req = store.getAll();
                                    req.onsuccess = () => res(req.result);
                                    req.onerror = () => rej();
                                });
                                backup[storeName] = items;
                            }
                            db.close();
                            resolve(backup);
                        } catch (e) {
                            db.close();
                            reject(e);
                        }
                    };
                });
            };
            
            readIndexedDB()
                .then(localData => {
                    if (progressTitle) progressTitle.textContent = "جاري رفع البيانات للخادم الجديد...";
                    if (progressMsg) progressMsg.textContent = "يرجى الانتظار، نقوم الآن بتهيئة الجداول الجديدة وحقن السجلات فيها...";
                    
                    return fetch('/api/db/migrate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(localData)
                    });
                })
                .then(res => res.json())
                .then(res => {
                    if (progressModal) progressModal.classList.add('hidden');
                    if (res.success) {
                        alert("✅ تم نقل البيانات بنجاح تام لقاعدة البيانات الجديدة! سيتم الآن إعادة تشغيل الصفحة لتحديث السجلات.");
                        window.location.reload();
                    } else {
                        alert("❌ فشل نقل البيانات: " + res.error);
                    }
                })
                .catch(err => {
                    if (progressModal) progressModal.classList.add('hidden');
                    alert("❌ فشل عملية نقل البيانات: " + err);
                });
        },

        /* ─────────── SHUTDOWN AND AUTOMATIC EXIT BACKUP ──────────────── */
        shutdownApp: async function() {
            const confirmMsg = "تنبيه: أنت على وشك إيقاف خادم النظام وإغلاق البرنامج بالكامل.\n\nهل تريد تشغيل النسخ الاحتياطي وحفظ البيانات سحابياً ومحلياً والمتابعة؟";
            if (!await BakryDialogs.confirm(confirmMsg)) return;
            
            const progressModal = document.getElementById('backup-progress-modal');
            const progressTitle = document.getElementById('backup-progress-title');
            const progressMsg = document.getElementById('backup-progress-message');
            
            if (progressModal) {
                progressTitle.textContent = "جاري حفظ النسخ الاحتياطية...";
                progressMsg.textContent = "يرجى الانتظار وعدم إغلاق المتصفح. نقوم الآن بحفظ البيانات محلياً ورفعها سحابياً لتأمين النظام قبل الخروج...";
                progressModal.classList.remove('hidden');
            }
            
            fetch('/api/db/shutdown', {
                method: 'POST'
            })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    if (progressTitle) progressTitle.innerHTML = "✅ تم الإغلاق بنجاح!";
                    let detailMsg = "تم حفظ النسخة الاحتياطية بنجاح.\n";
                    if (res.results) {
                        detailMsg += `- النسخ المحلي: ${res.results.local}\n`;
                        detailMsg += `- النسخ السحابي: ${res.results.cloud}`;
                    }
                    if (progressMsg) progressMsg.innerText = detailMsg + "\n\nيمكنك إغلاق هذه الصفحة الآن بأمان.";
                    
                    setTimeout(() => {
                        window.close();
                    }, 3000);
                } else {
                    if (progressModal) progressModal.classList.add('hidden');
                    alert("❌ فشل إيقاف الخادم: " + res.error);
                }
            })
            .catch(err => {
                if (progressTitle) progressTitle.innerHTML = "✅ تم إيقاف خادم النظام!";
                if (progressMsg) progressMsg.innerText = "خادم النظام توقف عن العمل بنجاح. يمكنك إغلاق صفحة المتصفح الآن بأمان.";
                setTimeout(() => {
                    window.close();
                }, 3000);
            });
        }
    },

    /* ==========================================================================
       SUBMODULE: AUDIT / OPERATIONS LOG (ADMIN ONLY)
       ========================================================================== */
    Audit: {
        currentPage: 1,
        pageSize: 30,
        prevPage: function() {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.render(true);
            }
        },
        nextPage: function() {
            this.currentPage++;
            this.render(true);
        },
        render: async function(keepPage = false) {
            if (!keepPage) this.currentPage = 1;
            
            const logs = await MotoDB.getAll('audit_logs');
            const term = document.getElementById('audit-search-term').value.trim().toLowerCase();
            const filterRole = document.getElementById('audit-filter-role').value;
            
            let filtered = [...logs];
            
            if (filterRole !== 'all') {
                filtered = filtered.filter(l => l.user === filterRole);
            }
            
            if (term) {
                filtered = filtered.filter(l => 
                    l.action.toLowerCase().includes(term) ||
                    l.details.toLowerCase().includes(term) ||
                    l.user.toLowerCase().includes(term)
                );
            }
            
            const sortedLogs = filtered.sort((a,b) => b.id - a.id);
            const tableBody = document.getElementById('audit-logs-table-body');
            tableBody.innerHTML = '';
            
            const totalMatches = sortedLogs.length;
            const totalPages = Math.ceil(totalMatches / this.pageSize) || 1;
            if (this.currentPage > totalPages) this.currentPage = totalPages;
            
            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            const pageItems = sortedLogs.slice(start, end);
            
            if (pageItems.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد سجلات عمليات مطابقة للبحث.</td></tr>`;
                document.getElementById('audit-pagination-info').textContent = 'عرض 0 من 0 حركة';
                document.getElementById('audit-btn-prev').disabled = true;
                document.getElementById('audit-btn-next').disabled = true;
                return;
            }
            
            const roleLabels = {
                admin: 'مدير النظام (Admin)',
                sales: 'موظف مبيعات (Sales)',
                accounting: 'موظف حسابات (Accounting)',
                viewer: 'موظف إداري (Viewer)'
            };
            
            pageItems.forEach((l) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${l.id}</strong></td>
                    <td>${l.timestamp}</td>
                    <td><span class="badge-status ${l.user === 'admin' ? 'orange' : 'success'}">${roleLabels[l.user] || l.user}</span></td>
                    <td><strong>${l.action}</strong></td>
                    <td><span class="text-xs text-secondary">${l.details}</span></td>
                `;
                tableBody.appendChild(tr);
            });
            
            document.getElementById('audit-pagination-info').textContent = `عرض ${start + 1}-${Math.min(end, totalMatches)} من ${totalMatches} حركة`;
            document.getElementById('audit-btn-prev').disabled = (this.currentPage === 1);
            document.getElementById('audit-btn-next').disabled = (this.currentPage === totalPages);
            
            App.applyPermissions();
        },
        clearLogs: async function() {
            const password = prompt("تنبيه: أنت على وشك مسح كامل سجل العمليات نهائياً!\nالرجاء إدخال الرقم السري لمدير النظام لتأكيد المسح:");
            if (password === null) return;
            
            if (password === PWD_CONFIG.admin) {
                if (await BakryDialogs.confirm("هل أنت متأكد تماماً من رغبتك في حذف وحذف كامل السجل الإداري؟ لا يمكن التراجع عن هذه الخطوة.")) {
                    try {
                        const res = await fetch('/api/db/audit_logs', {
                            method: 'DELETE'
                        });
                        if (res.ok) {
                            alert("تم مسح سجل العمليات بالكامل بنجاح.");
                            App.logActivity("مسح سجل العمليات", "تم تفريغ وحذف سجل العمليات بالكامل من قبل المدير.");
                            this.currentPage = 1;
                            this.render();
                        } else {
                            alert("فشل مسح سجل العمليات.");
                        }
                    } catch (e) {
                        alert("حدث خطأ أثناء مسح السجل: " + e);
                    }
                }
            } else {
                alert("الرقم السري للمدير غير صحيح! تم إلغاء مسح السجل.");
            }
        }
    }
};
