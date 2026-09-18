const monthNames = ['يناير','فبراير','مارس','بريل','مايو','يونيو','يوليو','غسطس','سبتمبر','كتوبر','نوفمبر','ديسمبر'];
const arabicDigits = value => String(value);
const money = value => `${arabicDigits(Math.round(value).toLocaleString('en-US'))} دج`;
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}`;
const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

let selectedMonth = new Date();
const defaults = { workers: [['العامل ١',1800],['العامل ٢',1800],['العامل ٣',1800],['العامل ٤',1800],['العامل ٥',1800],['العامل ٦',1800]], diggers: [['حفار ١',350],['حفار ٢',350],['حفار ٣',350],['حفار ٤',350]], trucks: [['الشاحنة ٠١',0],['الشاحنة ٠٢',0]] };

function loadInitialState() {
  try {
    const raw = localStorage.getItem('workshopData');
    if (!raw) {
      return { workers: [], diggers: [], trucks: [], entries: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      workers: Array.isArray(parsed?.workers) ? parsed.workers : [],
      diggers: Array.isArray(parsed?.diggers) ? parsed.diggers : [],
      trucks: Array.isArray(parsed?.trucks) ? parsed.trucks : [],
      entries: Array.isArray(parsed?.entries) ? parsed.entries : []
    };
  } catch (error) {
    return { workers: [], diggers: [], trucks: [], entries: [] };
  }
}

let state = loadInitialState();
const currentMonthKey = () => monthKey(selectedMonth);
const currentMonthLabel = () => `${monthNames[selectedMonth.getMonth()]} ${arabicDigits(selectedMonth.getFullYear())}`;
const qs = selector => document.querySelector(selector);

function normalizeDiggers() {
  state.diggers = (state.diggers || []).map((digger, index) => {
    const oilThreshold = safeNumber(digger.oilThreshold, 230);
    const oilWarningThreshold = safeNumber(digger.oilWarningThreshold, Math.max(0, oilThreshold - 20));
    const oilChanges = Array.isArray(digger.oilChanges) ? digger.oilChanges.map(entry => ({
      id: entry.id || crypto.randomUUID(),
      date: entry.date || new Date().toISOString().slice(0,10),
      hours: safeNumber(entry.hours, 0),
      counter: safeNumber(entry.counter, safeNumber(entry.hours, 0))
    })) : [];

    return {
      id: digger.id || crypto.randomUUID(),
      name: digger.name || `حفار ${arabicDigits(index + 1)}`,
      rate: safeNumber(digger.rate, 0),
      serviceHours: safeNumber(digger.serviceHours, 0),
      oilThreshold,
      oilWarningThreshold,
      oilChanges,
      lastOilChangeDate: digger.lastOilChangeDate || (oilChanges.length ? oilChanges[oilChanges.length - 1].date : '')
    };
  });
}

function normalizeState() {
  const hasSavedData = !!localStorage.getItem('workshopData');
  Object.keys(defaults).forEach(type => {
    if (!Array.isArray(state[type])) state[type] = [];
    if (!hasSavedData && !state[type].length) {
      state[type] = defaults[type].map(([name, rate]) => ({ id: crypto.randomUUID(), name, rate }));
    }
  });

  state.workers = (state.workers || []).map(worker => ({
    id: worker.id || crypto.randomUUID(),
    name: worker.name || 'عامل',
    rate: safeNumber(worker.rate, 0),
    monthlySalary: safeNumber(worker.monthlySalary, 0),
    workDays: safeNumber(worker.workDays, 0),
    overtimeHours: safeNumber(worker.overtimeHours, 0),
    overtimeRate: safeNumber(worker.overtimeRate, 0),
    advance: safeNumber(worker.advance, 0),
    personalExpenses: Array.isArray(worker.personalExpenses) ? worker.personalExpenses.map(expense => ({
      id: expense.id || crypto.randomUUID(),
      amount: safeNumber(expense.amount, 0),
      note: expense.note || 'مصروف شخصي',
      date: expense.date || new Date().toISOString().slice(0, 10)
    })) : []
  }));

  state.trucks = (state.trucks || []).map(truck => ({
    id: truck.id || crypto.randomUUID(),
    name: truck.name || 'شاحنة',
    rate: safeNumber(truck.rate, 0)
  }));

  normalizeDiggers();

  state.entries = (state.entries || []).map(entry => {
    const normalized = { ...entry, amount: safeNumber(entry.amount, 0), month: entry.month || (entry.date || '').slice(0, 7) };
    if (entry.type === 'workers') {
      normalized.attendance = safeNumber(entry.attendance ?? (safeNumber(normalized.amount) > 0 ? 1 : 0), 0);
      normalized.overtimeHours = safeNumber(entry.overtimeHours, 0);
      normalized.amount = normalized.attendance;
    }
    return normalized;
  });

  state.entries.forEach(entry => {
    if (entry.type === 'workers') {
      entry.attendance = safeNumber(entry.attendance ?? (safeNumber(entry.amount) > 0 ? 1 : 0), 0);
      entry.overtimeHours = safeNumber(entry.overtimeHours, 0);
      entry.amount = entry.attendance;
    }
  });

  state.diggers.forEach(digger => {
    const totalHours = state.entries
      .filter(entry => entry.type === 'diggers' && entry.personId === digger.id)
      .reduce((sum, entry) => sum + safeNumber(entry.amount, 0), 0);

    if (digger.serviceHours === 0 && totalHours > 0) {
      digger.serviceHours = totalHours;
    }
  });
}

normalizeState();

const save = () => localStorage.setItem('workshopData', JSON.stringify(state));
const getConfig = () => JSON.parse(localStorage.getItem('supabaseConfig') || 'null');

async function supabaseRequest(table, method, body) {
  const config = getConfig();
  if (!config?.url || !config?.key) return;
  const response = await fetch(`${config.url}/rest/v1/${table}`, {
    method,
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
}

async function supabaseFetch(table) {
  const config = getConfig();
  if (!config?.url || !config?.key) return [];
  const response = await fetch(`${config.url}/rest/v1/${table}?select=*`, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
  return response.json();
}

async function loadFromSupabase() {
  const config = getConfig();
  if (!config?.url || !config?.key) return;
  try {
    const [workers, diggers, trucks, workerEntries, diggerEntries, truckEntries] = await Promise.all([
      supabaseFetch('workers'),
      supabaseFetch('diggers'),
      supabaseFetch('trucks'),
      supabaseFetch('worker_entries'),
      supabaseFetch('digger_entries'),
      supabaseFetch('truck_entries')
    ]);

    if (workers.length) {
      state.workers = workers.map(row => ({
        id: row.id,
        name: row.name,
        rate: Number(row.daily_rate) || 0,
        monthlySalary: Number(row.monthly_salary) || 0,
        workDays: Number(row.work_days) || 0,
        overtimeHours: Number(row.overtime_hours) || 0,
        overtimeRate: Number(row.overtime_rate) || 0,
        advance: Number(row.advance) || 0
      }));
    }

    if (diggers.length) {
      state.diggers = diggers.map(row => ({
        id: row.id,
        name: row.name,
        rate: Number(row.hourly_rate) || 0,
        serviceHours: Number(row.service_hours) || 0,
        oilThreshold: Number(row.oil_threshold) || 230,
        oilWarningThreshold: Number(row.oil_warning_threshold) || 210,
        oilChanges: Array.isArray(row.oil_changes) ? row.oil_changes : [],
        lastOilChangeDate: row.last_oil_change_date || ''
      }));
    }

    if (trucks.length) {
      state.trucks = trucks.map(row => ({ id: row.id, name: row.name, rate: Number(row.hauling_rate) || 0 }));
    }

    state.entries = [
      ...workerEntries.map(row => ({
        id: row.id, type: 'workers', personId: row.worker_id, date: row.entry_date, month: row.entry_date.slice(0, 7), amount: Number(row.days ?? 0), attendance: Number(row.attendance ?? (Number(row.days ?? 0) > 0 ? 1 : 0)), overtimeHours: Number(row.overtime_hours || 0)
      })),
      ...diggerEntries.map(row => ({
        id: row.id, type: 'diggers', personId: row.digger_id, date: row.entry_date, month: row.entry_date.slice(0, 7), amount: Number(row.hours || 0)
      })),
      ...truckEntries.map(row => ({
        id: row.id, type: 'trucks', personId: row.truck_id, date: row.entry_date, month: row.entry_date.slice(0, 7), amount: Number(row.loads || 0)
      }))
    ];

    normalizeState();
    qs('#syncLabel').textContent = 'متصل ب Supabase';
  } catch (error) {
    qs('#syncLabel').textContent = 'تعذر الاتصال محليا';
    console.warn(error);
  }
}

async function syncToSupabase() {
  const config = getConfig();
  if (!config?.url || !config?.key) return;

  try {
    await Promise.all([
      supabaseRequest('workers', 'POST', state.workers.map(({ id, name, rate, monthlySalary, workDays, overtimeHours, overtimeRate, advance }) => ({ id, name, daily_rate: rate, monthly_salary: monthlySalary, work_days: workDays, overtime_hours: overtimeHours, overtime_rate: overtimeRate, advance }))),
      supabaseRequest('diggers', 'POST', state.diggers.map(({ id, name, rate, serviceHours, oilThreshold, oilWarningThreshold, oilChanges, lastOilChangeDate }) => ({
        id,
        name,
        hourly_rate: rate,
        service_hours: Number(serviceHours) || 0,
        oil_threshold: Number(oilThreshold) || 230,
        oil_warning_threshold: Number(oilWarningThreshold) || 210,
        oil_changes: oilChanges,
        last_oil_change_date: lastOilChangeDate || ''
      }))),
      supabaseRequest('trucks', 'POST', state.trucks.map(({ id, name, rate }) => ({ id, name, hauling_rate: Number(rate) || 0 })))
    ]);

    const grouped = { workers: [], diggers: [], trucks: [] };
    state.entries.forEach(entry => {
      const row = { id: entry.id, entry_date: entry.date };
      if (entry.type === 'workers') {
        grouped.workers.push({ ...row, worker_id: entry.personId, days: Number(entry.amount) || 0, attendance: Number(entry.attendance ?? (Number(entry.amount) > 0 ? 1 : 0)), overtime_hours: Number(entry.overtimeHours || 0) });
      }
      if (entry.type === 'diggers') {
        grouped.diggers.push({ ...row, digger_id: entry.personId, hours: Number(entry.amount) || 0 });
      }
      if (entry.type === 'trucks') {
        grouped.trucks.push({ ...row, truck_id: entry.personId, loads: Number(entry.amount) || 0 });
      }
    });

    await Promise.all([
      supabaseRequest('worker_entries', 'POST', grouped.workers),
      supabaseRequest('digger_entries', 'POST', grouped.diggers),
      supabaseRequest('truck_entries', 'POST', grouped.trucks)
    ]);
    qs('#syncLabel').textContent = 'متصل ب Supabase';
  } catch (error) {
    qs('#syncLabel').textContent = 'تعذر الاتصال محليا';
    console.warn(error);
  }
}

const workerEntryAttendance = (personId, month = currentMonthKey()) => state.entries.filter(entry => entry.type === 'workers' && entry.personId === personId && entry.month === month).reduce((sum, entry) => sum + safeNumber(entry.attendance ?? (safeNumber(entry.amount) > 0 ? 1 : 0), 0), 0);
const workerEntryOvertime = (personId, month = currentMonthKey()) => state.entries.filter(entry => entry.type === 'workers' && entry.personId === personId && entry.month === month).reduce((sum, entry) => sum + safeNumber(entry.overtimeHours, 0), 0);
const workerStatusLabel = entry => entry?.type === 'workers' ? (safeNumber(entry.attendance ?? entry.amount) > 0 ? 'حاضر' : 'غائب') : 'سجل';
const workerAttendedDays = (personId, month = currentMonthKey()) => [...new Set(state.entries.filter(entry => entry.type === 'workers' && entry.personId === personId && entry.month === month && safeNumber(entry.attendance ?? entry.amount) > 0).map(entry => entry.date))].sort();
const workerOvertimeDays = (personId, month = currentMonthKey()) => state.entries.filter(entry => entry.type === 'workers' && entry.personId === personId && entry.month === month).map(entry => ({ date: entry.date, hours: safeNumber(entry.overtimeHours, 0) })).filter(item => item.hours > 0).sort((a, b) => a.date.localeCompare(b.date));

function showToast(message) {
  const toast = qs('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function entriesFor(type, id) {
  return state.entries.filter(entry => entry.type === type && entry.personId === id && entry.month === currentMonthKey());
}

function renderExportOptions() {
  qs('#exportMonth').textContent = currentMonthLabel();
  qs('#exportPeople').innerHTML = Object.keys({ workers: 'العمال', diggers: 'الحفارات', trucks: 'الشاحنات' }).map(type => `
    <fieldset class="export-group">
      <legend><label><input type="checkbox" class="export-category" data-export-type="${type}" checked> ${type === 'workers' ? 'العمال' : type === 'diggers' ? 'الحفارات' : 'الشاحنات'}</label></legend>
      ${state[type].map(person => `<label class="export-person"><input type="checkbox" class="export-person-check" data-export-type="${type}" data-export-person="${person.id}" checked> ${person.name}</label>`).join('')}
    </fieldset>
  `).join('');
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadExport() {
  const selected = { workers: [], diggers: [], trucks: [] };
  document.querySelectorAll('.export-person-check:checked').forEach(input => selected[input.dataset.exportType].push(input.dataset.exportPerson));
  if (!Object.values(selected).some(items => items.length)) {
    showToast('اختر فئة و شخصا واحدا على القل');
    return;
  }

  const key = currentMonthKey();
  const rows = [['كشف شهري لشهر ' + currentMonthLabel()], [''], ['اسم العامل', 'عدد يام العمل', 'اليومية', 'الساعات الضافية', 'ثمن الساعة', 'التسبيق', 'صافي الدفع']];
  Object.keys(selected).forEach(type => {
    if (type !== 'workers') return;
    selected[type].forEach(id => {
      const person = state[type].find(item => item.id === id);
      if (!person) return;
      const days = workerEntryAttendance(person.id, key);
      const overtimeHours = workerEntryOvertime(person.id, key);
      const dailyRate = Number(person.rate) || 0;
      const overtimeRate = Number(person.overtimeRate) || 0;
      const advance = Number(person.advance) || 0;
      const dailyTotal = days * dailyRate;
      const overtimeTotal = overtimeHours * overtimeRate;
      const net = dailyTotal + overtimeTotal - advance;
      rows.push([person.name, days, dailyRate, overtimeHours, overtimeRate, advance, net]);
    });
  });
  if (rows.length === 3) rows.push(['لا توجد بيانات للعاملين في هذا الشهر']);
  const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `كشف-شهري-${currentMonthKey()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  qs('#exportModal').classList.remove('open');
  showToast('تم تصدير ملف Excel');
}

function renderMonths() {
  qs('#dashboardMonth').textContent = currentMonthLabel();
  document.querySelectorAll('.current-month').forEach(el => el.textContent = currentMonthLabel());
  qs('#workersCount').textContent = arabicDigits(state.workers.length);
  qs('#trucksCount').textContent = arabicDigits(state.trucks.length);
}

function renderPeople(type) {
  const grid = qs(`#${type}Grid`);
  grid.innerHTML = '';

  state[type].forEach(person => {
    if (type === 'workers') {
      const entries = entriesFor(type, person.id);
      const amount = entries.reduce((sum, entry) => sum + safeNumber(entry.amount, 0), 0);
      const attendanceTotal = workerEntryAttendance(person.id);
      const overtimeTotal = workerEntryOvertime(person.id);
      const workDays = safeNumber(person.workDays) || attendanceTotal;
      const overtimeHours = safeNumber(person.overtimeHours) || overtimeTotal;
      const total = (workDays * safeNumber(person.rate)) + (overtimeHours * safeNumber(person.overtimeRate)) - safeNumber(person.advance);
      const personalExpensesTotal = (person.personalExpenses || []).reduce((sum, item) => sum + safeNumber(item.amount, 0), 0);
      const recentExpenses = (person.personalExpenses || []).slice().reverse().slice(0, 5).map(item => `
        <li>
          <span>${item.date} • ${item.note || 'مصروف شخصي'}</span>
          <strong>${money(safeNumber(item.amount, 0))}</strong>
        </li>
      `).join('') || '<li>لا توجد مصاريف مسجلة</li>';

      const html = `
        <article class="person-card">
          <div class="card-header">
            <div>
              <input class="edit-name" type="text" data-id="${person.id}" value="${person.name}">
              <small>عامل يومي</small>
            </div>
            <button class="remove-person" type="button" data-remove-person="workers" data-person="${person.id}" title="حذف العامل">×</button>
          </div>
          <div class="worker-fields">
            <label>الراتب الشهري<input type="number" min="0" data-field="monthlySalary" data-id="${person.id}" value="${person.monthlySalary}"><small>دج</small></label>
            <label>عدد يام العمل<input type="number" min="0" step="0.5" data-field="workDays" data-id="${person.id}" value="${workDays}" data-worker-days-list="${person.id}" title="اضغط لعرض يام الحضور"><small>يوم</small></label>
            <label>اليومية<input type="number" min="0" data-field="rate" data-id="${person.id}" value="${person.rate}"><small>دج</small></label>
            <label>الساعات الضافية<input type="number" min="0" step="0.5" data-field="overtimeHours" data-id="${person.id}" value="${overtimeHours}" data-worker-overtime-list="${person.id}" title="اضغط لعرض ساعات ضافية يومية"><small>ساعة</small></label>
            <label>ثمن الساعة<input type="number" min="0" data-field="overtimeRate" data-id="${person.id}" value="${person.overtimeRate}"><small>دج</small></label>
            <label>التسبيقة<input type="number" min="0" data-field="advance" data-id="${person.id}" value="${person.advance}"><small>دج</small></label>
          </div>
          <div class="total-row">
            <span>الجمالي</span>
            <strong>${money(total)}</strong>
          </div>
          <div class="expense-box">
            <div class="expense-header">
              <strong>مصاريف العامل</strong>
              <span>${money(personalExpensesTotal)}</span>
            </div>
            <ul class="expense-list">${recentExpenses}</ul>
            <button type="button" class="expense-button" data-worker-expense="${person.id}">＋ إضافة مصروف</button>
          </div>
        </article>
      `;
      grid.insertAdjacentHTML('beforeend', html);
      return;
    }

    if (type === 'trucks') {
      const total = entriesFor(type, person.id).reduce((sum, entry) => sum + safeNumber(entry.amount, 0), 0) * safeNumber(person.rate, 0);
      const html = `
        <article class="person-card truck-card">
          <div class="card-header">
            <div>
              <input class="edit-name" type="text" data-id="${person.id}" value="${person.name}">
              <small>شاحنة</small>
            </div>
            <button class="remove-person" type="button" data-remove-person="trucks" data-person="${person.id}" title="حذف الشاحنة">×</button>
          </div>
          <div class="digger-fields truck-fields">
            <label>عدد الحمولات<input type="number" min="0" step="1" value="${entriesFor(type, person.id).reduce((sum, entry) => sum + safeNumber(entry.amount, 0), 0)}" readonly><small>حمولة هذا الشهر</small></label>
            <label>ثمن الحمولة<input type="number" min="0" step="1" data-rate="${person.id}" value="${person.rate}"><small>دج</small></label>
            <label>المجموع<input type="text" value="${money(total)}" readonly><small>مصاريف الشهر</small></label>
          </div>
        </article>
      `;
      grid.insertAdjacentHTML('beforeend', html);
      return;
    }

    const serviceHours = safeNumber(person.serviceHours, 0);
    const threshold = safeNumber(person.oilThreshold, 230);
    const warning = safeNumber(person.oilWarningThreshold, 210);
    const remaining = Math.max(0, threshold - serviceHours);
    const due = serviceHours >= warning;
    const lastOil = person.oilChanges?.length ? person.oilChanges[person.oilChanges.length - 1] : null;
    const oilLog = (person.oilChanges || []).slice().reverse().slice(0, 5).map(change => `
      <li>
        <span>${change.date}</span>
        <strong>${safeNumber(change.counter || change.hours, 0)} ساعة</strong>
      </li>
    `).join('') || '<li>لا توجد تغييرات مسجلة</li>';

    const html = `
      <article class="person-card digger-card">
        <div class="card-header">
          <div>
            <input class="edit-name" type="text" data-id="${person.id}" value="${person.name}">
            <small>حفارة</small>
          </div>
          <button class="remove-person" type="button" data-remove-person="diggers" data-person="${person.id}" title="حذف الحفارة">×</button>
        </div>
        <div class="digger-fields">
          <label>عدد الساعات<input type="number" min="0" step="0.5" value="${serviceHours}" readonly><small>ساعة هذا التدوير</small></label>
          <label>سعر الساعة<input type="number" min="0" data-field="rate" data-id="${person.id}" value="${person.rate}"><small>دج</small></label>
          <label>المجموع<input type="text" value="${money(serviceHours * safeNumber(person.rate, 0))}" readonly><small>تسديد هذا الدور</small></label>
        </div>
        <div class="service-box ${due ? 'service-due' : ''}">
          <div>
            <strong>${due ? 'تنبيه زيت قريب' : 'عداد الزيت'}</strong>
            <small>${serviceHours} / ${threshold} ساعة • ${due ? `تبقى ${remaining} ساعة` : `متبقي ${remaining} ساعة`}</small>
          </div>
          <button type="button" data-oil-change="${person.id}">${due ? 'تغيير الزيت الآن' : 'تغيير الزيت'}</button>
        </div>
        <div class="oil-history">
          <h4>سجل تغييرات الزيت</h4>
          <ul>${oilLog}</ul>
          ${lastOil ? `<p>آخر تغيير: ${lastOil.date} • ${safeNumber(lastOil.counter || lastOil.hours, 0)} ساعة</p>` : '<p>لم يتم تغيير الزيت بعد.</p>'}
        </div>
      </article>
    `;
    grid.insertAdjacentHTML('beforeend', html);
  });
}

function renderSummary() {
  const totals = { workers: 0, diggers: 0, trucks: 0 };
  const units = { workers: 0, diggers: 0, trucks: 0 };

  state.entries.filter(entry => entry.month === currentMonthKey()).forEach(entry => {
    const amount = safeNumber(entry.amount, 0);
    const person = state[entry.type]?.find(item => item.id === entry.personId);
    units[entry.type] += amount;
    if (entry.type === 'diggers') totals.diggers += amount * safeNumber(person?.rate, 0);
    if (entry.type === 'trucks') totals.trucks += amount * safeNumber(person?.rate, 0);
  });

  state.workers.forEach(worker => {
    const attendanceDays = workerEntryAttendance(worker.id, currentMonthKey());
    const overtimeHours = workerEntryOvertime(worker.id, currentMonthKey());
    totals.workers += safeNumber(worker.monthlySalary) > 0 ? safeNumber(worker.monthlySalary) : (attendanceDays * safeNumber(worker.rate)) + (overtimeHours * safeNumber(worker.overtimeRate)) - safeNumber(worker.advance);
    units.workers += attendanceDays;
  });

  qs('#workerTotal').textContent = money(totals.workers);
  qs('#diggerTotal').textContent = money(totals.diggers);
  qs('#truckTotal').textContent = money(totals.trucks);
  qs('#workerMeta').textContent = `${arabicDigits(units.workers)} يوم حضور`;
  qs('#diggerMeta').textContent = `${arabicDigits(units.diggers)} ساعة عمل`;
  qs('#truckMeta').textContent = `${arabicDigits(units.trucks)} رحلة مسجلة`;

  const recent = state.entries.filter(e => e.month === currentMonthKey()).slice(-5).reverse();
  const list = qs('#activityList');
  list.innerHTML = recent.length ? recent.map(entry => {
    const person = state[entry.type]?.find(item => item.id === entry.personId);
    if (entry.type === 'workers') {
      const status = workerStatusLabel(entry);
      return `<div class="activity-row"><span class="activity-dot"></span><div><strong>${person?.name || 'سجل محذوف'}</strong><small>حضور يومي · ${entry.date}</small></div><b>${status}${status === 'غائب' ? '' : ' · ' + arabicDigits(entry.amount) + ' يوم'}</b></div>`;
    }
    return `<div class="activity-row"><span class="activity-dot"></span><div><strong>${person?.name || 'سجل محذوف'}</strong><small>${entry.type === 'diggers' ? 'ساعات حفر' : 'شحنات'} · ${entry.date}</small></div><b>${arabicDigits(entry.amount)} ${entry.type === 'diggers' ? 'ساعة' : 'شحنة'}</b></div>`;
  }).join('') : `<div class="empty-state"><span>✦</span><strong>لا توجد حركات بعد</strong><p>ابد بضافة حضور و ساعات و شحنات لهذا الشهر.</p></div>`;
}

function render() {
  renderMonths();
  ['workers', 'diggers', 'trucks'].forEach(renderPeople);
  renderSummary();
  save();
  syncToSupabase();
}

function addPerson(type) {
  const person = {
    id: crypto.randomUUID(),
    name: type === 'trucks' ? `الشاحنة ${arabicDigits(state.trucks.length + 1)}` : `العامل ${arabicDigits(state.workers.length + 1)}`,
    rate: type === 'trucks' ? 0 : 1800,
    ...(type === 'workers' ? { monthlySalary: 0, workDays: 0, overtimeHours: 0, overtimeRate: 0, advance: 0 } : {}),
    ...(type === 'diggers' ? { serviceHours: 0, oilThreshold: 230, oilWarningThreshold: 210, oilChanges: [] } : {})
  };

  state[type].push(person);
  render();
  showToast(type === 'trucks' ? 'تمت ضافة شاحنة جديدة' : type === 'diggers' ? 'تمت ضافة حفارة جديدة' : 'تمت ضافة عامل جديد');
}

function removePerson(type, id) {
  const person = state[type].find(item => item.id === id);
  if (!person || !window.confirm(`هل تريد حذف ${person.name}`)) return;
  state[type] = state[type].filter(item => item.id !== id);
  state.entries = state.entries.filter(entry => entry.personId !== id);
  render();
  showToast('تم حذف العنصر');
}

function openEntry(type = 'workers', personId = '') {
  qs('#entryModal').classList.add('open');
  qs('#entryType').value = type;
  qs('#entryDate').value = new Date().toISOString().slice(0, 10);
  const select = qs('#entryPerson');
  select.innerHTML = state[type].map(p => `<option value="${p.id}" ${p.id === personId ? 'selected' : ''}>${p.name}</option>`).join('');
  updateEntryLabels();
}

function updateEntryLabels() {
  const type = qs('#entryType').value;
  const workerFields = qs('#workerEntryFields');
  const amountLabel = qs('#amountLabel');
  const amountInput = amountLabel.querySelector('input');
  const isWorker = type === 'workers';
  workerFields.style.display = isWorker ? 'grid' : 'none';
  amountLabel.style.display = isWorker ? 'none' : 'block';
  qs('#amountLabel').firstChild.textContent = type === 'workers' ? 'عدد اليام' : type === 'diggers' ? 'عدد الساعات' : 'عدد الحمولات';
  amountInput.min = type === 'trucks' ? '1' : '0';
  amountInput.step = type === 'trucks' ? '1' : '0.5';
  amountInput.value = isWorker ? '1' : amountInput.value;
  qs('#modalTitle').textContent = type === 'workers' ? 'تسجيل حضور' : type === 'diggers' ? 'تسجيل ساعات الحفارات' : 'تسجيل حمولات';
}

function notifyDueDiggers() {
  const due = state.diggers.filter(person => safeNumber(person.serviceHours, 0) >= safeNumber(person.oilWarningThreshold, 210));
  if (!due.length) return;
  const message = due.map(person => `${person.name}: ${safeNumber(person.serviceHours, 0)} ساعة / ${safeNumber(person.oilThreshold, 230)} ساعة`).join(' • ');
  showToast(`تنبيه زيت: ${message}`);
}

document.addEventListener('click', event => {
  const view = event.target.closest('[data-view]');
  if (view) {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.view === view.dataset.view));
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === `${view.dataset.view}View`));
    qs('#pageLabel').textContent = view.dataset.view === 'dashboard' ? 'لوحة المتابعة' : view.dataset.view === 'workers' ? 'العمال اليوميون' : view.dataset.view === 'diggers' ? 'الحفارات' : 'الشاحنات';
    qs('#sidebar').classList.remove('open');
  }

  const add = event.target.closest('[data-add-person]');
  if (add) addPerson(add.dataset.addPerson);

  const remove = event.target.closest('[data-remove-person]');
  if (remove) removePerson(remove.dataset.removePerson, remove.dataset.person);

  const entry = event.target.closest('[data-open-entry]');
  if (entry) openEntry(entry.dataset.openEntry, entry.dataset.person || '');

  if (event.target.closest('[data-month]')) {
    selectedMonth.setMonth(selectedMonth.getMonth() + (event.target.closest('[data-month]').dataset.month === 'next' ? 1 : -1));
    render();
  }

  if (event.target.closest('[data-close-modal]')) qs('#entryModal').classList.remove('open');
  if (event.target.closest('[data-close-settings]')) qs('#settingsModal').classList.remove('open');
  if (event.target.closest('[data-close-export]')) qs('#exportModal').classList.remove('open');

  const oilButton = event.target.closest('[data-oil-change]');
  if (oilButton) {
    const person = state.diggers.find(item => item.id === oilButton.dataset.oilChange);
    if (!person) return;
    const currentHours = safeNumber(person.serviceHours, 0);
    const defaultDate = new Date().toISOString().slice(0, 10);
    const dateValue = window.prompt(`تاريخ تغيير زيت ${person.name}\nالافتراضي: ${defaultDate}`, defaultDate) || defaultDate;
    const confirmMessage = `تكيد تغيير زيت ${person.name}\nالعداد الحالي: ${currentHours} ساعة\nالتاريخ: ${dateValue}`;
    if (!window.confirm(confirmMessage)) return;

    person.oilChanges = person.oilChanges || [];
    person.oilChanges.push({ id: crypto.randomUUID(), date: dateValue, hours: currentHours, counter: currentHours });
    person.lastOilChangeDate = dateValue;
    person.serviceHours = 0;
    render();
    showToast(`تم تسجيل تغيير زيت ${person.name} عند ${currentHours} ساعة`);
  }
});

qs('#entryType').addEventListener('change', () => {
  const type = qs('#entryType').value;
  qs('#entryPerson').innerHTML = state[type].map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  updateEntryLabels();
});

qs('#entryForm').addEventListener('submit', event => {
  event.preventDefault();
  const type = qs('#entryType').value;
  const personId = qs('#entryPerson').value;
  const date = qs('#entryDate').value;
  const person = state[type].find(item => item.id === personId);
  const attendance = type === 'workers' ? Number(qs('#entryAttendance').value) : 1;
  const overtimeHours = type === 'workers' ? Number(qs('#entryOvertime').value) || 0 : 0;
  const amount = type === 'workers' ? attendance : Number(qs('#entryAmount').value) || 0;

  if (type === 'workers') {
    const existing = state.entries.find(entry => entry.type === 'workers' && entry.personId === personId && entry.date === date);
    if (existing) {
      existing.date = date;
      existing.month = date.slice(0, 7);
      existing.amount = attendance;
      existing.attendance = attendance;
      existing.overtimeHours = overtimeHours;
      qs('#entryModal').classList.remove('open');
      render();
      showToast(attendance === 0 ? 'تم تعديل حالة العامل لى غائب' : 'تم تحديث حضور العامل بنجاح');
      return;
    }
  }

  state.entries.push({ id: crypto.randomUUID(), type, personId, date, month: date.slice(0, 7), amount, attendance, overtimeHours });

  if (type === 'diggers' && person) {
    person.serviceHours = safeNumber(person.serviceHours, 0) + safeNumber(amount, 0);
  }

  qs('#entryModal').classList.remove('open');
  render();
  notifyDueDiggers();
  showToast('تم حفظ السجل بنجاح');
});

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-worker-expense]');
  if (trigger) {
    const person = state.workers.find(item => item.id === trigger.dataset.workerExpense);
    if (!person) return;
    const amount = Number(window.prompt(`مبلغ مصروف ${person.name}\nمثال: 1000`, '0'));
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('أدخل مبلغًا صحيحًا أكبر من صفر');
      return;
    }
    const note = window.prompt(`وصف المصروف لـ ${person.name}\nمثال: شراء سجائر`, 'مصروف شخصي') || 'مصروف شخصي';
    person.personalExpenses = person.personalExpenses || [];
    person.personalExpenses.push({
      id: crypto.randomUUID(),
      amount,
      note,
      date: new Date().toISOString().slice(0, 10)
    });
    render();
    showToast(`تم تسجيل مصروف ${person.name} بقيمة ${money(amount)}`);
    return;
  }

  const daysTrigger = event.target.closest('[data-worker-days-list]');
  if (!daysTrigger) return;
  const person = state.workers.find(item => item.id === daysTrigger.dataset.workerDaysList);
  if (!person) return;
  const dates = workerAttendedDays(person.id);
  const message = dates.length ? `يام حضور ${person.name} في ${currentMonthLabel()}:\n${dates.join('\n')}` : `لا توجد يام حضور مسجلة ل ${person.name} في ${currentMonthLabel()}`;
  window.alert(message);
});

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-worker-overtime-list]');
  if (!trigger) return;
  const person = state.workers.find(item => item.id === trigger.dataset.workerOvertimeList);
  if (!person) return;
  const overtime = workerOvertimeDays(person.id);
  const message = overtime.length ? `ساعات ضافية ل ${person.name} في ${currentMonthLabel()}:\n${overtime.map(item => `${item.date} → ${item.hours} ساعة`).join('\n')}` : `لا توجد ساعات ضافية مسجلة ل ${person.name} في ${currentMonthLabel()}`;
  window.alert(message);
});

document.addEventListener('change', event => {
  if (!event.target.matches('.edit-name, .rate input, [data-field]')) return;

  const card = event.target.closest('.person-card');
  const type = card?.classList.contains('truck-card') ? 'trucks' : card?.classList.contains('digger-card') ? 'diggers' : 'workers';
  const person = state[type].find(p => p.id === event.target.dataset.id || p.id === event.target.dataset.rate);
  if (!person) return;

  if (event.target.dataset.field) {
    person[event.target.dataset.field] = Number(event.target.value);
  } else if (event.target.dataset.rate) {
    person.rate = Number(event.target.value);
  } else {
    person.name = event.target.value;
  }

  render();
  showToast('تم تحديث البيانات');
});

qs('#themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', document.body.classList.contains('dark'));
});

qs('#mobileMenu').addEventListener('click', () => qs('#sidebar').classList.toggle('open'));
qs('#quickAdd').addEventListener('click', () => openEntry());
qs('#openExport').addEventListener('click', () => {
  renderExportOptions();
  qs('#exportModal').classList.add('open');
});
qs('#downloadExport').addEventListener('click', downloadExport);

document.addEventListener('change', event => {
  if (event.target.matches('.export-category')) {
    const type = event.target.dataset.exportType;
    document.querySelectorAll(`.export-person-check[data-export-type="${type}"]`).forEach(input => input.checked = event.target.checked);
  }
});

qs('#openSettings').addEventListener('click', () => qs('#settingsModal').classList.add('open'));
qs('#settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  localStorage.setItem('supabaseConfig', JSON.stringify({ url: qs('#supabaseUrl').value, key: qs('#supabaseKey').value }));
  qs('#settingsModal').classList.remove('open');
  qs('#syncLabel').textContent = qs('#supabaseUrl').value ? 'اتصال Supabase محفوظ' : 'يحفظ محليا';
  showToast('تم حفظ عدادات الاتصال');
});

qs('#todayLabel').textContent = new Intl.DateTimeFormat('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
if (localStorage.getItem('darkMode') === 'true') document.body.classList.add('dark');
const config = getConfig();
if (config) {
  qs('#supabaseUrl').value = config.url || '';
  qs('#supabaseKey').value = config.key || '';
  qs('#syncLabel').textContent = 'اتصال Supabase محفوظ';
}

(async () => {
  await loadFromSupabase();
  render();
  notifyDueDiggers();
})();
