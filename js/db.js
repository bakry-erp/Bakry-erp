/* ==========================================================================
   MotoMax Database Layer - SQL API Wrapper
   ========================================================================== */

const MotoDB = {
    // 1. Initialize API Connection
    init: function() {
        return new Promise((resolve, reject) => {
            fetch('/api/license/status')
                .then(res => {
                    if (res.ok) {
                        console.log("MotoMax SQL Database API Connected.");
                        this.checkAndSeedData().then(resolve).catch(reject);
                    } else {
                        reject("فشل الاتصال بخادم قاعدة البيانات.");
                    }
                })
                .catch(err => {
                    console.error("DB connection error:", err);
                    reject("خادم النظام غير متصل.");
                });
        });
    },

    // 2. Core Generic CRUD Methods
    getAll: function(storeName) {
        return new Promise((resolve, reject) => {
            fetch(`/api/db/${storeName}`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                    return res.json();
                })
                .then(data => resolve(data))
                .catch(err => {
                    console.error(`Error reading ${storeName}:`, err);
                    reject(`فشل قراءة البيانات من جدول ${storeName}`);
                });
        });
    },

    getById: function(storeName, id) {
        return new Promise((resolve, reject) => {
            fetch(`/api/db/${storeName}/${id}`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                    return res.json();
                })
                .then(data => resolve(data))
                .catch(err => {
                    console.error(`Error reading ${storeName} id=${id}:`, err);
                    reject(`فشل قراءة السجل بالرمز ${id} من جدول ${storeName}`);
                });
        });
    },

    add: function(storeName, item) {
        return new Promise((resolve, reject) => {
            fetch(`/api/db/${storeName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(errData => { throw new Error(errData.error || `HTTP error ${res.status}`); });
                }
                return res.json();
            })
            .then(data => resolve(data.id))
            .catch(err => {
                console.error(`Add Error in ${storeName}:`, err);
                const errMsg = String(err);
                if (errMsg.includes('duplicate') || errMsg.includes('UNIQUE') || errMsg.includes('مكرر')) {
                    reject("خطأ: القيمة مدخلة مسبقاً في النظام ويجب أن تكون فريدة (رقم البطاقة أو الشاسيه أو الموتور مكرر)!");
                } else {
                    reject(`فشل إضافة السجل لجدول ${storeName}`);
                }
            });
        });
    },

    update: function(storeName, item) {
        return new Promise((resolve, reject) => {
            fetch(`/api/db/${storeName}/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(errData => { throw new Error(errData.error || `HTTP error ${res.status}`); });
                }
                return res.json();
            })
            .then(data => resolve(data.id))
            .catch(err => {
                console.error(`Update Error in ${storeName}:`, err);
                const errMsg = String(err);
                if (errMsg.includes('duplicate') || errMsg.includes('UNIQUE') || errMsg.includes('تعارض')) {
                    reject("خطأ: تعارض بيانات! قد تكون القيمة مكررة في سجل آخر.");
                } else {
                    reject(`فشل تحديث السجل في جدول ${storeName}`);
                }
            });
        });
    },

    updateBatch: function(storeName, items) {
        return new Promise((resolve, reject) => {
            if (!items || items.length === 0) {
                resolve();
                return;
            }
            fetch(`/api/db/batch-update/${storeName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(items)
            })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                resolve();
            })
            .catch(err => {
                console.error(`Batch Update Error in ${storeName}:`, err);
                reject(`فشل تحديث مجموعة السجلات في جدول ${storeName}`);
            });
        });
    },

    delete: function(storeName, id) {
        return new Promise((resolve, reject) => {
            fetch(`/api/db/${storeName}/${id}`, {
                method: 'DELETE'
            })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                resolve(true);
            })
            .catch(err => {
                console.error(`Delete Error in ${storeName} id=${id}:`, err);
                reject(`فشل حذف السجل ${id} من جدول ${storeName}`);
            });
        });
    },

    // 3. Auto Code Generators
    generateNextCode: async function(storeName, prefix) {
        const items = await this.getAll(storeName);
        if (items.length === 0) return `${prefix}-1001`;
        
        let maxNum = 1000;
        items.forEach(item => {
            if (item.code) {
                const parts = item.code.split('-');
                if (parts.length === 2) {
                    const num = parseInt(parts[1]);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        });
        
        return `${prefix}-${maxNum + 1}`;
    },

    generateNextInvoiceNo: async function() {
        const items = await this.getAll('sales');
        if (items.length === 0) return `INV-1001`;
        
        let maxNum = 1000;
        items.forEach(item => {
            if (item.invoiceNo) {
                const parts = item.invoiceNo.split('-');
                if (parts.length === 2) {
                    const num = parseInt(parts[1]);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        });
        
        return `INV-${maxNum + 1}`;
    },

    generateNextTxCode: async function() {
        const items = await this.getAll('transactions');
        if (items.length === 0) return `TX-1001`;
        
        let maxNum = 1000;
        items.forEach(item => {
            if (item.code) {
                const parts = item.code.split('-');
                if (parts.length === 2) {
                    const num = parseInt(parts[1]);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        });
        
        return `TX-${maxNum + 1}`;
    },

    // 4. Data Seeder
        checkAndSeedData: async function() {
            return; // Seeder disabled for production raw version

        const checkCusts = await this.getAll('customers');
        if (checkCusts.length > 0) {
            localStorage.setItem('motomax_seeded_v4', 'true');
            console.log("Database has data. Skipping seeder.");
            return;
        }

        console.log("Database is empty. Initializing Demo Data...");
        localStorage.setItem('motomax_seeded_v4', 'true');

        try {
            // A. Seed Suppliers
            const suppliers = [
                { code: 'S-1001', name: 'الشركة الهندسية للتوريدات (بجاج)', phone: '01098765432', nid: 'REG-876543', address: 'شبرا، القاهرة', type: 'موتوسيكلات', notes: 'الوكيل الحصري لدراجات بجاج الهندية' },
                { code: 'S-1002', name: 'مجموعة غبور للتجارة (هوندا وتي في إس)', phone: '01123456789', nid: 'REG-982133', address: 'شارع قصر العيني، القاهرة', type: 'موتوسيكلات', notes: 'موزع معتمد لماركات Honda و TVS' },
                { code: 'S-1003', name: 'شركة نيو ايرا للتجارة والتوريد', phone: '01222446688', nid: 'REG-549821', address: 'مصر الجديدة، القاهرة', type: 'موتوسيكلات', notes: 'شريك تجاري للمعدات والتجهيزات' }
            ];

            const supIds = [];
            for (let sup of suppliers) {
                const id = await this.add('suppliers', sup);
                supIds.push(id);
            }

            // B. Seed Products (Models)
            const products = [
                { code: 'P-1001', brand: 'بجاج Boxer', year: 2025, cc: '150 cc', price: 65000, supplierId: supIds[0], notes: 'بجاج بوكسر مناسبة للعمل الشاق' },
                { code: 'P-1002', brand: 'TVS HLX 150cc', year: 2025, cc: '150 cc', price: 78000, supplierId: supIds[1], notes: 'تي في إس هيلوكس دراجة بجودة هندية عالية' },
                { code: 'P-1003', brand: 'TVS King', year: 2025, cc: '200 cc', price: 90000, supplierId: supIds[1], notes: 'توكتوك تي في إس كينج مميز' }
            ];

            const prodIds = [];
            for (let prod of products) {
                const id = await this.add('products', prod);
                prodIds.push(id);
            }

            // C. Seed Customers
            const customers = [
                { code: 'C-1001', name: 'أحمد محمد عبد الرحمن', phone: '01011223344', nid: '29304120102345', address: 'شارع الجلاء، طنطا، الغربية', type: 'cash', notes: 'عميل دائم' },
                { code: 'C-1002', name: 'مصطفى محمود علي الشريف', phone: '01144556677', nid: '29009181208765', address: 'ميت غمر، الدقهلية', type: 'installment', notes: 'عميل تقسيط ملتزم' },
                { code: 'C-1003', name: 'سيد حسن أبو العلا', phone: '01288990011', nid: '28503250100432', address: 'الدقي، الجيزة', type: 'installment', notes: 'يحتاج متابعة مستمرة' },
                { code: 'C-1004', name: 'مريم علي حسن سليمان', phone: '01533221100', nid: '29811050209432', address: 'شارع التسعين، التجمع الخامس، القاهرة', type: 'cash', notes: 'عميلة كاش' }
            ];

            const custIds = [];
            for (let cust of customers) {
                const id = await this.add('customers', cust);
                custIds.push(id);
            }

            // D. Seed Product Units with purchaseDate for stock age reporting
            const units = [
                // بجاج Boxer (2 units available) -> triggers low stock alert
                { productId: prodIds[0], chassis: 'BJBOXER001', motor: 'MTRBOXER01', color: 'أسود مطفي', cost: 52000, branch: 'فرع طنطا (الرئيسي)', status: 'متاح', purchaseDate: '2026-05-20' },
                { productId: prodIds[0], chassis: 'BJBOXER002', motor: 'MTRBOXER02', color: 'أزرق ملكي', cost: 52000, branch: 'فرع القاهرة', status: 'متاح', purchaseDate: '2026-05-22' },
                
                // TVS HLX 150cc (12 units total: 6 sold, 6 available)
                { productId: prodIds[1], chassis: 'TVSHLX001', motor: 'MTRHLX01', color: 'أحمر', cost: 60000, branch: 'فرع طنطا (الرئيسي)', status: 'مباع', soldPrice: 78000, soldDate: '2026-05-15', purchaseDate: '2026-04-10' },
                { productId: prodIds[1], chassis: 'TVSHLX002', motor: 'MTRHLX02', color: 'أسود برتقالي', cost: 60000, branch: 'فرع طنطا (الرئيسي)', status: 'مباع', soldPrice: 78000, soldDate: '2026-05-01', purchaseDate: '2026-04-12' },
                { productId: prodIds[1], chassis: 'TVSHLX003', motor: 'MTRHLX03', color: 'رمادي فضي', cost: 60000, branch: 'فرع الجيزة', status: 'متاح', purchaseDate: '2026-05-01' },
                { productId: prodIds[1], chassis: 'TVSHLX004', motor: 'MTRHLX04', color: 'كحلي', cost: 60000, branch: 'فرع القاهرة', status: 'متاح', purchaseDate: '2026-02-10' }, // >90 days ago
                { productId: prodIds[1], chassis: 'TVSHLX005', motor: 'MTRHLX05', color: 'أبيض', cost: 60000, branch: 'فرع الجيزة', status: 'متاح', purchaseDate: '2025-11-20' }, // >180 days ago
                { productId: prodIds[1], chassis: 'TVSHLX006', motor: 'MTRHLX06', color: 'أسود', cost: 60000, branch: 'فرع القاهرة', status: 'متاح', purchaseDate: '2026-05-20' },
                { productId: prodIds[1], chassis: 'TVSHLX007', motor: 'MTRHLX07', color: 'رمادي', cost: 60000, branch: 'فرع طنطا (الرئيسي)', status: 'متاح', purchaseDate: '2026-05-21' },
                { productId: prodIds[1], chassis: 'TVSHLX008', motor: 'MTRHLX08', color: 'أزرق', cost: 60000, branch: 'فرع طنطا (الرئيسي)', status: 'متاح', purchaseDate: '2026-05-22' },
                { productId: prodIds[1], chassis: 'TVSHLX009', motor: 'MTRHLX09', color: 'أحمر', cost: 60000, branch: 'فرع القاهرة', status: 'مباع', soldPrice: 78000, soldDate: '2026-06-03', purchaseDate: '2026-05-15' }, // sold this month
                { productId: prodIds[1], chassis: 'TVSHLX010', motor: 'MTRHLX10', color: 'أسود', cost: 60000, branch: 'فرع الجيزة', status: 'مباع', soldPrice: 78000, soldDate: '2026-06-04', purchaseDate: '2026-05-18' },  // sold this month
                { productId: prodIds[1], chassis: 'TVSHLX011', motor: 'MTRHLX11', color: 'فضي', cost: 60000, branch: 'فرع القاهرة', status: 'مباع', soldPrice: 78000, soldDate: '2026-06-04', purchaseDate: '2026-05-19' },  // sold this month
                { productId: prodIds[1], chassis: 'TVSHLX012', motor: 'MTRHLX12', color: 'أبيض', cost: 60000, branch: 'فرع طنطا (الرئيسي)', status: 'مباع', soldPrice: 78000, soldDate: '2026-06-05', purchaseDate: '2026-05-20' },  // sold this month

                // TVS King (4 units total: 1 sold, 3 available)
                { productId: prodIds[2], chassis: 'TVSKING001', motor: 'MTRKING01', color: 'أصفر', cost: 75000, branch: 'فرع طنطا (الرئيسي)', status: 'متاح', purchaseDate: '2026-05-01' },
                { productId: prodIds[2], chassis: 'TVSKING002', motor: 'MTRKING02', color: 'أصفر أخضر', cost: 75000, branch: 'فرع القاهرة', status: 'متاح', purchaseDate: '2026-05-05' },
                { productId: prodIds[2], chassis: 'TVSKING003', motor: 'MTRKING03', color: 'أحمر أسود', cost: 75000, branch: 'فرع الجيزة', status: 'متاح', purchaseDate: '2026-04-15' },
                { productId: prodIds[2], chassis: 'TVSKING004', motor: 'MTRKING04', color: 'أصفر', cost: 75000, branch: 'فرع طنطا (الرئيسي)', status: 'مباع', soldPrice: 90000, soldDate: '2026-05-10', purchaseDate: '2026-04-20' }
            ];

            const unitIds = [];
            for (let unit of units) {
                const id = await this.add('units', unit);
                unitIds.push(id);
            }

            // E. Seed Sales
            const sale1 = {
                invoiceNo: 'INV-1001', customerId: custIds[3], unitId: unitIds[2], type: 'cash',
                branch: 'فرع طنطا (الرئيسي)', originalPrice: 78000, salePrice: 78000, downpayment: 0,
                months: 0, monthlyPayment: 0, remainingAmount: 0, saleDate: '2026-05-15', notes: 'فاتورة بيع كاش.'
            };
            const sale1Id = await this.add('sales', sale1);

            const sale2 = {
                invoiceNo: 'INV-1002', customerId: custIds[1], unitId: unitIds[3], type: 'installment',
                branch: 'فرع طنطا (الرئيسي)', originalPrice: 78000, salePrice: 78000, downpayment: 18000,
                months: 12, monthlyPayment: 5000, remainingAmount: 60000, saleDate: '2026-05-01', notes: 'عقد تقسيط.',
                g1_name: 'سليمان محمود الشريف', g1_phone: App.Security.encrypt('01198765412'), g1_nid: App.Security.encrypt('26504120108923'), g1_address: 'ميت غمر، الدقهلية', g1_rel: 'أب',
                g2_name: 'عصام كمال الدين فتحي', g2_phone: App.Security.encrypt('01023456711'), g2_nid: App.Security.encrypt('27802110103429'), g2_address: 'المنصورة، الدقهلية', g2_rel: 'خال العميل',
                guaranteeNotes: 'وقع العميل والضامنين وصولات الأمانة البنكية.'
            };
            const sale2Id = await this.add('sales', sale2);

            const sale3 = {
                invoiceNo: 'INV-1003', customerId: custIds[3], unitId: unitIds[17], type: 'cash',
                branch: 'فرع طنطا (الرئيسي)', originalPrice: 90000, salePrice: 90000, downpayment: 0,
                months: 0, monthlyPayment: 0, remainingAmount: 0, saleDate: '2026-06-02', notes: 'فاتورة بيع كاش.'
            };
            await this.add('sales', sale3);

            const sale4 = {
                invoiceNo: 'INV-1004', customerId: custIds[2], unitId: unitIds[10], type: 'installment',
                branch: 'فرع طنطا (الرئيسي)', originalPrice: 78000, salePrice: 78000, downpayment: 20000,
                months: 12, monthlyPayment: 5000, remainingAmount: 58000, saleDate: '2026-06-03', notes: 'عقد تقسيط شهر يونيو.',
                g1_name: 'رأفت حسن أبو العلا', g1_phone: App.Security.encrypt('01211112222'), g1_nid: App.Security.encrypt('26001150100432'), g1_address: 'الدقي، الجيزة', g1_rel: 'عم العميل',
                g2_name: 'منير عبد القدوس سليم', g2_phone: App.Security.encrypt('01033334444'), g2_nid: App.Security.encrypt('27209090100456'), g2_address: 'العجوزة، الجيزة', g2_rel: 'صديق العميل',
                guaranteeNotes: 'وصولات أمانة موقعة.'
            };
            const sale4Id = await this.add('sales', sale4);

            // F. Seed Installment Schedules
            // Installments for Sale 2 (due on 1st of each month starting June 2026)
            for (let i = 1; i <= 12; i++) {
                const dueDate = new Date(2026, 4 + i, 1);
                const dateStr = dueDate.toISOString().split('T')[0];
                const instObj = {
                    saleId: sale2Id,
                    customerId: custIds[1],
                    installmentNumber: i,
                    amount: 5000,
                    dueDate: dateStr,
                    status: i === 1 ? 'paid' : 'pending',
                    paidAmount: i === 1 ? 5000 : null,
                    paidDate: i === 1 ? '2026-06-01' : null,
                    notes: i === 1 ? 'سداد القسط الأول في موعده' : ''
                };
                await this.add('installments', instObj);
            }

            // Installments for Sale 4 (due on 3rd of each month starting July 2026)
            for (let i = 1; i <= 12; i++) {
                const dueDate = new Date(2026, 5 + i, 3);
                const dateStr = dueDate.toISOString().split('T')[0];
                const instObj = {
                    saleId: sale4Id,
                    customerId: custIds[2],
                    installmentNumber: i,
                    amount: 5000,
                    dueDate: dateStr,
                    status: 'pending',
                    paidAmount: null, paidDate: null, notes: ''
                };
                await this.add('installments', instObj);
            }

            // Seed some supplier dues
            const supplierDues = [
                { supplierId: supIds[0], invoiceNo: 'SD-BOXER-01', dueDate: '2026-05-10', totalAmount: 130000, paidAmount: 130000, status: 'paid', notes: 'شحنة بجاج بوكسر' },
                { supplierId: supIds[1], invoiceNo: 'SD-HLX-01', dueDate: '2026-06-15', totalAmount: 420000, paidAmount: 0, status: 'pending', notes: 'شحنة تي في إس هيلوكس' },
                { supplierId: supIds[1], invoiceNo: 'SD-HLX-02', dueDate: '2026-06-25', totalAmount: 150000, paidAmount: 0, status: 'pending', notes: 'شحنة تي في إس إضافية' }
            ];
            for (let sd of supplierDues) {
                await this.add('supplier_dues', sd);
            }

            // G. Seed Transactions - precisely matching target metrics: Cash: 125,000 | Bank: 50,000 | Total: 175,000
            const txs = [
                { code: 'TX-1001', date: '2026-04-01 10:00', type: 'قبض', category: 'رأس مال إضافي', amount: 100000, description: 'حقن سيولة نقدية في الخزينة لافتتاح الدورة المالية لمعرض MotoMax', user: 'Admin', paymentMethod: 'نقدي' },
                { code: 'TX-1002', date: '2026-04-01 10:05', type: 'قبض', category: 'رأس مال إضافي', amount: 50000, description: 'إيداع رأس مال تأسيسي في حساب البنك', user: 'Admin', paymentMethod: 'بنك' },
                { code: 'TX-1003', date: '2026-05-15 12:45', type: 'قبض', category: 'مبيعات كاش', amount: 45000, description: 'مبيعات كاش دراجات نارية', user: 'موظف مبيعات', paymentMethod: 'نقدي' },
                { code: 'TX-1004', date: '2026-05-28 16:00', type: 'صرف', category: 'مصاريف تشغيلية', amount: 20000, description: 'مصاريف صالة العرض الكلية وإيجار المحل ورواتب', user: 'موظف حسابات', paymentMethod: 'نقدي' }
            ];

            for (let tx of txs) {
                await this.add('transactions', tx);
            }

            console.log("Demo Data Seeded Successfully with Multi-Branch Support!");

        } catch (error) {
            console.error("Seeder Error:", error);
        }
    }
};