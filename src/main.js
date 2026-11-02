import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const state = { data: null, filter: 'all', view: 'home', theme: localStorage.getItem('keu_theme') || 'light', page: 1, pageSize: 10, lastNotifyKey: '' };
const money = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0));
const val = id => $(id).value.trim();
const monthNow = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') };

// Pengecekan Shift Kiri
let isLeftShiftDown = false;
document.addEventListener('keydown', e => { if (e.code === 'ShiftLeft') isLeftShiftDown = true; });
document.addEventListener('keyup', e => { if (e.code === 'ShiftLeft') isLeftShiftDown = false; });

function addMonths(monthKey, count) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + count, 1);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function unformatRibuan(str) {
  return Number(String(str).replace(/[^0-9]/g, '')) || 0;
}

window.formatInputRibuan = function(e) {
  let v = e.target.value.replace(/[^0-9]/g, '');
  e.target.value = v !== '' ? new Intl.NumberFormat('id-ID').format(v) : '';
}

document.addEventListener('DOMContentLoaded', () => {
  window.setTheme(state.theme, false);
  $('monthPicker').value = monthNow();
  window.loadDashboard();
  ['trxAmount', 'limitInput', 'openingInput'].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener('input', window.formatInputRibuan);
  });

  const isAdmin = sessionStorage.getItem('keu_admin') === 'true';
  if (isAdmin) {
    $('menuInput').classList.remove('hide');
    $('adminBtn').classList.add('hide'); // Sembunyikan ikon gerigi
    $('logoutBtn').classList.remove('hide'); // Tampilkan tombol logout merah
  }

  // Klik Gerigi dengan Pop-up UI
  $('adminBtn').addEventListener('click', () => {
    if (isLeftShiftDown && !isAdmin) {
      $('loginModal').classList.remove('hide');
      setTimeout(() => $('adminUser').focus(), 100);
    } else if (!isLeftShiftDown) {
      // Petunjuk jika diklik biasa tanpa Shift Kiri
      toast('Gunakan Shift Kiri + Klik untuk masuk panel admin.');
    }
  });
});

// Menutup Pop-up Modal Login
window.closeLogin = function() {
  $('loginModal').classList.add('hide');
  $('adminUser').value = '';
  $('adminPass').value = '';
}

// Submit Form Modal
window.submitLogin = async function(e) {
  e.preventDefault();
  const username = val('adminUser');
  const password = val('adminPass');
  
  showLoader(true);
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();
  showLoader(false);
  
  if (error || !data) return toast('Username atau Password salah!');
  
  toast('Akses admin dibuka!');
  sessionStorage.setItem('keu_admin', 'true');
  window.closeLogin();
  setTimeout(() => location.reload(), 1000);
};

// Tombol Logout Merah
window.logoutAdmin = function() {
  if (confirm('Yakin ingin keluar dari akses Admin?')) {
    sessionStorage.removeItem('keu_admin');
    location.reload();
  }
};

window.setTheme = function(theme, save = true) {
  if(!['light','dark','pink'].includes(theme)) theme = 'light';
  state.theme = theme; 
  document.body.setAttribute('data-theme', theme);
  if(save) localStorage.setItem('keu_theme', theme);
  $('themeBtn').textContent = theme === 'dark' ? '🌙' : theme === 'pink' ? '🌸' : '☀️';
}
window.cycleTheme = function() { window.setTheme(state.theme === 'light' ? 'dark' : state.theme === 'dark' ? 'pink' : 'light') }
window.setView = function(view) {
  state.view = view;
  ['home','input'].forEach(v => { $('view' + v.charAt(0).toUpperCase() + v.slice(1)).classList.toggle('active', v === view) });
  ['Home','Input'].forEach(v => { $('menu' + v).classList.toggle('active', v.toLowerCase() === view) });
}

window.loadDashboard = async function() {
  showLoader(true);
  const month = $('monthPicker').value || monthNow();
  try {
    const [trxRes, monthRes, limitRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('month', month).order('created_at', { ascending: false }),
      supabase.from('months').select('opening_balance').eq('month', month).maybeSingle(),
      supabase.from('limits').select('limit_amount').eq('month', month).maybeSingle()
    ]);

    const transactions = trxRes.data || [];
    const opening = monthRes.data?.opening_balance || 0;
    const limit = limitRes.data?.limit_amount || 0;

    let income = 0; let expense = 0;
    transactions.forEach(t => {
      if (t.type === 'masuk') income += Number(t.amount);
      if (t.type === 'keluar') expense += Number(t.amount);
    });

    state.data = {
      month, nextMonth: addMonths(month, 1),
      opening, income, expense, total: opening + income - expense,
      limit, limitPercent: limit > 0 ? Math.round((expense / limit) * 100) : 0,
      transactions
    };
    render(); checkBudgetNotification();
  } catch(e) { toast('Error: ' + e.message); }
  showLoader(false);
}

function render() {
  const d = state.data; if(!d) return;
  $('monthText').textContent = d.month; 
  $('openingNum').textContent = money(d.opening);
  $('incomeNum').textContent = money(d.income); 
  $('expenseNum').textContent = money(d.expense);
  
  // Fitur Baru: Sisa Bulan Ini (Masuk - Keluar)
  $('sisaBulanNum').textContent = money(d.income - d.expense);
  
  $('totalNum').textContent = money(d.total); // Sisa Sebelumnya + Masuk - Keluar
  $('openingInput').value = d.opening ? new Intl.NumberFormat('id-ID').format(d.opening) : '';
  $('limitInput').value = d.limit ? new Intl.NumberFormat('id-ID').format(d.limit) : '';
  $('nextInfo').textContent = 'Otomatis: total bulan ' + d.month + ' menjadi sisa sebelumnya bulan ' + d.nextMonth + '.';
  renderLimit(); renderRows();
}

function renderLimit() {
  const d = state.data, pct = d.limit > 0 ? Math.min(100, Math.round(d.expense / d.limit * 100)) : 0;
  $('limitInfo').textContent = d.limit > 0 ? `${money(d.expense)} dari ${money(d.limit)} (${d.limitPercent}%)` : 'Belum ada limit.';
  const b = $('limitBar'); b.style.width = pct + '%';
  b.classList.toggle('warn', d.limitPercent >= 80 && d.limitPercent < 100);
  b.classList.toggle('danger', d.limitPercent >= 100);
}

function rowsForRender() {
  const d = state.data, rows = [];
  if(Number(d.opening || 0) > 0 && state.filter === 'all') rows.push({ created_at: d.month, type: 'sisa', name: 'Sisa Sebelumnya', amount: d.opening });
  (d.transactions || []).forEach(r => { if(state.filter === 'all' || r.type === state.filter) rows.push(r) });
  return rows;
}

function renderRows() {
  const rows = rowsForRender(), totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  if(state.page > totalPages) state.page = totalPages;
  const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  $('empty').classList.toggle('hide', rows.length > 0); $('pager').classList.toggle('hide', rows.length <= state.pageSize);
  $('pagerInfo').textContent = `Halaman ${state.page} / ${totalPages} · ${rows.length} data`;
  $('trxBody').innerHTML = pageRows.map(r => `<tr><td>${esc(r.created_at ? r.created_at.substring(0,10) : '')}</td><td><span class="pill ${r.type==='masuk'?'in':r.type==='keluar'?'out':'sisa'}">${esc(r.type)}</span></td><td>${esc(r.name)}</td><td>${money(r.amount)}</td></tr>`).join('');
}

async function syncNextOpening(currentMonth) {
  const [trxRes, monthRes] = await Promise.all([
    supabase.from('transactions').select('amount, type').eq('month', currentMonth),
    supabase.from('months').select('opening_balance').eq('month', currentMonth).maybeSingle()
  ]);

  let income = 0; let expense = 0;
  (trxRes.data || []).forEach(t => {
    if (t.type === 'masuk') income += Number(t.amount);
    if (t.type === 'keluar') expense += Number(t.amount);
  });

  const opening = monthRes.data?.opening_balance || 0;
  const total = opening + income - expense;
  const nextMonth = addMonths(currentMonth, 1);

  await supabase.from('months').upsert({ month: nextMonth, opening_balance: total, updated_at: new Date() });
}

window.saveOpening = async function(e) {
  e.preventDefault(); showLoader(true);
  const month = $('monthPicker').value; const amount = unformatRibuan(val('openingInput'));
  const { error } = await supabase.from('months').upsert({ month, opening_balance: amount, updated_at: new Date() });
  if (!error) await syncNextOpening(month);
  showLoader(false);
  if (error) return toast(error.message);
  toast('Sisa tersimpan.'); window.loadDashboard();
}

window.saveLimit = async function(e) {
  e.preventDefault(); showLoader(true);
  const month = $('monthPicker').value; const amount = unformatRibuan(val('limitInput'));
  const { error } = await supabase.from('limits').upsert({ month, limit_amount: amount, updated_at: new Date() });
  showLoader(false);
  if (error) return toast(error.message);
  toast('Limit tersimpan.'); window.loadDashboard(); checkBudgetNotification(true);
}

window.addTransaction = async function(e) {
  e.preventDefault(); showLoader(true);
  const month = $('monthPicker').value;
  const payload = { month, type: val('trxType'), name: val('trxName'), amount: unformatRibuan(val('trxAmount')) };
  const { error } = await supabase.from('transactions').insert([payload]);
  if (!error) await syncNextOpening(month);
  showLoader(false);
  if (error) return toast(error.message);
  $('trxName').value = ''; $('trxAmount').value = '';
  toast('Ditambahkan.'); window.loadDashboard(); checkBudgetNotification(true);
}

window.changePage = function(delta) {
  const rows = rowsForRender(), pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(pages, Math.max(1, state.page + delta)); renderRows();
}

window.setFilter = function(type) {
  state.filter = type; state.page = 1;
  ['All','Masuk','Keluar'].forEach(x => $('filter' + x).classList.toggle('active', x.toLowerCase() === type));
  renderRows();
}

window.requestNotify = function() {
  if (!('Notification' in window)) return toast('Browser belum mendukung notifikasi.');
  Notification.requestPermission().then(p => toast(p === 'granted' ? 'Notifikasi aktif.' : 'Izin notifikasi belum aktif.'));
}

function checkBudgetNotification(force) {
  const d = state.data; if (!d || !d.limit || d.limit <= 0) return;
  const key = d.month + ':' + d.expense + ':' + d.limit;
  if (!force && state.lastNotifyKey === key) return;
  state.lastNotifyKey = key;
  let title = '', body = '';
  if (d.limitPercent >= 100) { title = 'Limit terlampaui'; body = `Keluar ${money(d.expense)} dari limit ${money(d.limit)} bulan ${d.month}.`; }
  else if (d.limitPercent >= 80) { title = 'Hampir mencapai limit'; body = `Keluar sudah ${d.limitPercent}%: ${money(d.expense)} dari ${money(d.limit)}.`; }
  if (!title) return; toast(body);
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, tag: 'keuangan-limit-' + d.month }) } catch(e) {} }
}

function toast(msg) {
  $('toast').textContent = msg; $('toast').classList.remove('hide');
  clearTimeout(window.__toast); window.__toast = setTimeout(() => $('toast').classList.add('hide'), 2400);
}
function showLoader(show) { $('loader').classList.toggle('hide', !show) }
function esc(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])) }
