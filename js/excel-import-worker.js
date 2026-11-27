/* Bakry ERP — parse XLS/XLSX away from the main UI thread. */
self.onmessage = function(event) {
    try {
        importScripts('./xlsx.full.min.js');
        const workbook = XLSX.read(event.data, { type: 'array', cellDates: true });
        const sheets = {};
        const firstSheetName = (workbook.SheetNames || [])[0];
        for (const name of workbook.SheetNames || []) {
            const sheet = workbook.Sheets[name];
            // The smart single-sheet matcher only needs a matrix for the first
            // worksheet. Legacy multi-sheet import uses object records. Avoid
            // retaining two complete copies of every worksheet in memory.
            sheets[name] = sheet ? {
                rows: name === firstSheetName
                    ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
                    : [],
                records: XLSX.utils.sheet_to_json(sheet, { defval: '' })
            } : { rows: [], records: [] };
        }
        self.postMessage({ ok: true, sheetNames: workbook.SheetNames || [], sheets });
    } catch (error) {
        self.postMessage({ ok: false, error: error && error.message ? error.message : String(error) });
    }
};
