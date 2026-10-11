/* ذكّرني — main app logic */
(() => {
  'use strict';

  // ───────── platform ─────────
  const Cap = window.capacitorExports && window.capacitorExports.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const LN = isNative ? window.capacitorLocalNotifications.LocalNotifications : null;
  const SR = isNative ? window.capacitorSpeechRecognition.SpeechRecognition : null;

  const $ = (id) => document.getElementById(id);
  const CHANNEL_ID = 'reminders';
  const ACTION_TYPE = 'REMINDER_ACTIONS';

  // ───────── storage ─────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  let items = store.get('dk_items', []);
  let settings = Object.assign({ lang: 'ar-LB', snooze: 10 }, store.get('dk_settings', {}));
  let filter = 'all';
  let editing = null;          // item being edited
  let formCat = 'personal';
  const save = () => store.set('dk_items', items);
  const saveSettings = () => store.set('dk_settings', settings);

  function nextNotifId() {
    let n = store.get('dk_seq', 1000) + 1;
    if (n > 2000000000) n = 1001;
    store.set('dk_seq', n);
    return n;
  }

  // ───────── dates ─────────
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const MONTHS = ['كانون التاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين التاني', 'كانون الأول'];
  const REPEAT_LABEL = { none: '', daily: '🔁 كل يوم', weekly: '🔁 كل أسبوع', monthly: '🔁 كل شهر' };
  const CAT = { personal: '👤', work: '💼', home: '🏠', assoc: '🤝' };

  function fmtTime(d) {
    let h = d.getHours(); const m = pad(d.getMinutes());
    const p = h < 12 ? 'الصبح' : h < 15 ? 'الضهر' : h < 18 ? 'العصر' : 'المسا';
    h = h % 12 || 12;
    return `${h}:${m} ${p}`;
  }
  function fmtWhen(d) {
    if (!d) return 'بلا وقت';
    const now = new Date();
    const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
    if (sameDay(d, now)) return `اليوم ${fmtTime(d)}`;
    if (sameDay(d, tmr)) return `بكرا ${fmtTime(d)}`;
    const diff = (d - now) / 86400000;
    if (diff > 0 && diff < 7) return `${DAYS[d.getDay()]} ${fmtTime(d)}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${fmtTime(d)}`;
  }

  // next occurrence for repeating items (keeps list sorted correctly)
  function nextOccurrence(item, from = new Date()) {
    if (!item.at) return null;
    const d = new Date(item.at);
    if (item.repeat === 'none') return d;
    let guard = 0;
    while (d <= from && guard++ < 1000) {
      if (item.repeat === 'daily') d.setDate(d.getDate() + 1);
      else if (item.repeat === 'weekly') d.setDate(d.getDate() + 7);
      else if (item.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    }
    return d;
  }

  // ───────── notifications ─────────
  const webTimers = {};

  async function setupNotifications() {
    if (!isNative) return;
    try {
      await LN.createChannel({
        id: CHANNEL_ID, name: 'التذكيرات', description: 'تذكيرات ذكّرني',
        importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#22c55e'
      });
    } catch (e) { console.warn(e); }
    try {
      await LN.registerActionTypes({
        types: [{
          id: ACTION_TYPE,
          actions: [
            { id: 'done', title: '✓ خلص' },
            { id: 'snooze', title: '⏰ أجّل' }
          ]
        }]
      });
    } catch (e) { console.warn(e); }

    LN.addListener('localNotificationActionPerformed', (ev) => {
      const extra = (ev.notification && ev.notification.extra) || {};
      const item = items.find(i => i.id === extra.itemId);
      if (ev.actionId === 'done') { if (item) markDone(item, true); }
      else if (ev.actionId === 'snooze') { if (item) snooze(item); }
      else if (item && ev.actionId === 'tap') { render(); openForm(item); }
    });
    LN.addListener('localNotificationReceived', () => render());
  }

  async function ensurePermissions(ask = true) {
    if (!isNative) {
      if ('Notification' in window && Notification.permission === 'default' && ask) await Notification.requestPermission();
      return true;
    }
    let p = await LN.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LN.requestPermissions();
    return p.display === 'granted';
  }

  function buildSchedule(item) {
    const d = new Date(item.at);
    if (item.repeat === 'none') return { at: d, allowWhileIdle: true };
    const on = { hour: d.getHours(), minute: d.getMinutes() };
    if (item.repeat === 'weekly') on.weekday = d.getDay() + 1;  // Capacitor: Sunday = 1
    if (item.repeat === 'monthly') on.day = d.getDate();
    return { on, allowWhileIdle: true };
  }

  async function scheduleItem(item) {
    await cancelItem(item);
    if (!item.at) return;
    if (item.done && item.repeat === 'none') return;
    if (item.repeat === 'none' && new Date(item.at) <= new Date()) return;
    const n = {
      id: item.notifId,
      title: `${CAT[item.cat] || '🔔'} ذكّرني`,
      body: item.text,
      largeBody: item.text,
      channelId: CHANNEL_ID,
      actionTypeId: ACTION_TYPE,
      smallIcon: 'ic_stat_reminder',
      iconColor: '#22c55e',
      autoCancel: true,
      extra: { itemId: item.id },
      schedule: buildSchedule(item)
    };
    if (isNative) {
      try { await LN.schedule({ notifications: [n] }); }
      catch (e) {
        // smallIcon missing → fall back to app icon
        delete n.smallIcon;
        await LN.schedule({ notifications: [n] });
      }
    } else {
      const ms = nextOccurrence(item) - new Date();
      if (ms > 0 && ms < 2147483647) {
        webTimers[item.id] = setTimeout(() => {
          if ('Notification' in window && Notification.permission === 'granted') new Notification('🔔 ذكّرني', { body: item.text });
          else alert('🔔 ' + item.text);
          if (item.repeat !== 'none') scheduleItem(item);
          render();
        }, ms);
      }
    }
  }

  async function cancelItem(item) {
    if (isNative) {
      const ids = [{ id: item.notifId }];
      if (item.snoozeId) ids.push({ id: item.snoozeId });
      try { await LN.cancel({ notifications: ids }); } catch {}
    } else if (webTimers[item.id]) { clearTimeout(webTimers[item.id]); delete webTimers[item.id]; }
  }

  async function snooze(item) {
    const mins = +settings.snooze || 10;
    const at = new Date(Date.now() + mins * 60000);
    if (item.repeat === 'none') {
      item.at = at.toISOString(); item.done = false;
      save(); await scheduleItem(item);
    } else if (isNative) {
      item.snoozeId = nextNotifId(); save();
      await LN.schedule({ notifications: [{
        id: item.snoozeId, title: '⏰ ذكّرني (مأجّل)', body: item.text, channelId: CHANNEL_ID,
        actionTypeId: ACTION_TYPE, extra: { itemId: item.id }, schedule: { at, allowWhileIdle: true }
      }] });
    }
    render();
    toast(`تأجّل ${mins} دقايق`);
  }

  async function markDone(item, val) {
    if (item.repeat === 'none') {
      item.done = val;
      if (val) await cancelItem(item); else await scheduleItem(item);
    } else {
      item.lastDone = val ? new Date().toISOString() : null;
    }
    save(); render();
  }

  // Re-schedule everything on start (covers app updates / cleared alarms)
  async function rescheduleAll() {
    if (isNative) {
      try {
        const pending = await LN.getPending();
        const pendingIds = new Set(pending.notifications.map(n => n.id));
        for (const it of items) {
          if (!it.done && !pendingIds.has(it.notifId)) await scheduleItem(it);
        }
      } catch (e) { console.warn(e); }
    } else {
      for (const it of items) await scheduleItem(it);
    }
  }

  // ───────── speech ─────────
  let webRec = null;

  async function listen() {
    if (isNative) {
      try {
        const avail = await SR.available();
        if (!avail.available) { toast('التعرّف عالصوت مش متوفر — نزّل تطبيق Google'); return; }
        let perm = await SR.checkPermissions();
        if (perm.speechRecognition !== 'granted') perm = await SR.requestPermissions();
        if (perm.speechRecognition !== 'granted') { toast('لازم تسمح بالميكروفون'); return; }
        const res = await SR.start({
          language: settings.lang, maxResults: 3, prompt: 'احكي تذكيرك…', partialResults: false, popup: true
        });
        const text = res && res.matches && res.matches[0];
        if (text) handleSpoken(text);
      } catch (e) {
        const msg = String(e && e.message || e);
        if (!/cancel|No match|ERROR_NO_MATCH|7/.test(msg)) toast('ما فهمت، جرّب مرّة تانية');
      }
      return;
    }
    // Browser fallback (Chrome)
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) { toast('المتصفح ما بيدعم الصوت — اكتب بدالها'); $('quickInput').focus(); return; }
    webRec = new Rec();
    webRec.lang = settings.lang; webRec.interimResults = true; webRec.maxAlternatives = 1;
    let finalText = '';
    $('listening').classList.remove('hidden'); $('partial').textContent = '';
    webRec.onresult = (e) => {
      let t = '';
      for (const r of e.results) { t += r[0].transcript; if (r.isFinal) finalText = t; }
      $('partial').textContent = t;
    };
    webRec.onerror = () => { $('listening').classList.add('hidden'); };
    webRec.onend = () => {
      $('listening').classList.add('hidden');
      const t = finalText || $('partial').textContent;
      if (t) handleSpoken(t);
    };
    webRec.start();
  }

  function handleSpoken(text) {
    const r = window.parseReminder(text);
    openForm(null, { text: r.task, at: r.confident ? r.at : null, repeat: r.repeat, heard: text, confident: r.confident, noTime: !r.confident });
  }

  // ───────── form ─────────
  function openForm(item, draft) {
    editing = item || null;
    const src = item || draft || {};
    $('sheetTitle').textContent = item ? 'تعديل التذكير' : 'تذكير جديد';
    $('fText').value = src.text || '';
    const hasTime = item ? !!item.at : !(draft && draft.noTime);
    const at = src.at ? (item ? nextOccurrence(item) : new Date(src.at)) : new Date(Date.now() + 3600000);
    $('fAt').value = toLocalInput(at);
    setHasTime(hasTime);
    $('fRepeat').value = src.repeat || 'none';
    formCat = src.cat || 'personal';
    document.querySelectorAll('#catPick .chip').forEach(b => b.classList.toggle('active', b.dataset.cat === formCat));
    $('btnDelete').classList.toggle('hidden', !item);
    const heard = $('heard');
    if (draft && draft.heard) {
      heard.textContent = `سمعت: «${draft.heard}»` + (draft.confident ? '' : ' — ما في وقت، رح ينحفظ بلا تذكير. فيك تفعّل الوقت.');
      heard.classList.remove('hidden');
    } else heard.classList.add('hidden');
    $('sheet').classList.remove('hidden');
  }
  function setHasTime(on) {
    $('fHasTime').checked = on;
    $('timeFields').classList.toggle('hidden', !on);
  }
  $('fHasTime').addEventListener('change', (e) => setHasTime(e.target.checked));

  function closeForm() { $('sheet').classList.add('hidden'); editing = null; }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('fText').value.trim();
    const hasTime = $('fHasTime').checked;
    const at = hasTime ? new Date($('fAt').value) : null;
    const repeat = hasTime ? $('fRepeat').value : 'none';
    if (!text) return;
    if (hasTime) {
      if (isNaN(at)) { toast('اختار الوقت'); return; }
      if (repeat === 'none' && at <= new Date()) { toast('الوقت لازم يكون بالمستقبل'); return; }
      await ensurePermissions(true);
    }
    const atIso = at ? at.toISOString() : null;
    let item = editing;
    if (item) {
      Object.assign(item, { text, at: atIso, repeat, cat: formCat, done: false });
    } else {
      item = { id: 'r' + Date.now().toString(36), notifId: nextNotifId(), text, at: atIso, repeat, cat: formCat, done: false, created: new Date().toISOString() };
      items.push(item);
    }
    save();
    await scheduleItem(item);
    closeForm(); render();
    toast(item.at ? `✓ رح ذكّرك ${fmtWhen(nextOccurrence(item))}` : '✓ انحفظت بلا وقت');
  });

  $('btnCancel').onclick = closeForm;
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeForm(); });
  $('btnDelete').onclick = async () => {
    if (!editing) return;
    await cancelItem(editing);
    items = items.filter(i => i !== editing); save();
    closeForm(); render(); toast('انحذف');
  };
  $('catPick').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    formCat = b.dataset.cat;
    document.querySelectorAll('#catPick .chip').forEach(x => x.classList.toggle('active', x === b));
  });
  document.querySelectorAll('.quick-times .chip').forEach(b => b.onclick = () => {
    const now = new Date(); let d = new Date(now);
    if (b.dataset.q === '+10m') d = new Date(now.getTime() + 600000);
    else if (b.dataset.q === '+1h') d = new Date(now.getTime() + 3600000);
    else if (b.dataset.q === 'tonight') { d.setHours(20, 0, 0, 0); if (d <= now) d.setDate(d.getDate() + 1); }
    else if (b.dataset.q === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    $('fAt').value = toLocalInput(d);
  });

  // ───────── list ─────────
  function render() {
    const now = new Date();
    const list = $('list');
    const visible = items.filter(i => filter === 'all' || i.cat === filter);
    $('emptyState').classList.toggle('hidden', items.length > 0);

    const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
    const endTomorrow = new Date(endToday); endTomorrow.setDate(endTomorrow.getDate() + 1);
    const groups = { overdue: [], today: [], tomorrow: [], later: [], notime: [], repeat: [], done: [] };

    for (const it of visible) {
      if (it.repeat !== 'none') { groups.repeat.push(it); continue; }
      if (it.done) { groups.done.push(it); continue; }
      if (!it.at) { groups.notime.push(it); continue; }
      const d = new Date(it.at);
      if (d < now) groups.overdue.push(it);
      else if (d <= endToday) groups.today.push(it);
      else if (d <= endTomorrow) groups.tomorrow.push(it);
      else groups.later.push(it);
    }
    const key = (i) => { const d = nextOccurrence(i); return d ? d.getTime() : new Date(i.created).getTime(); };
    const byTime = (a, b) => key(a) - key(b);
    Object.values(groups).forEach(g => g.sort(byTime));
    groups.done.reverse();

    const titles = { overdue: '⚠️ فات وقتهم', today: 'اليوم', tomorrow: 'بكرا', later: 'بعدين', notime: '📝 بلا وقت', repeat: 'متكرّرين', done: 'خلصوا' };
    list.innerHTML = '';
    for (const key of Object.keys(groups)) {
      const g = groups[key]; if (!g.length) continue;
      const sec = document.createElement('section');
      sec.innerHTML = `<h3>${titles[key]} <span class="count">${g.length}</span></h3>`;
      for (const it of g) sec.appendChild(card(it, key));
      list.appendChild(sec);
    }
    $('todayLabel').textContent = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  }

  function card(it, group) {
    const el = document.createElement('div');
    const doneToday = it.repeat !== 'none' && it.lastDone && sameDay(new Date(it.lastDone), new Date());
    el.className = 'item' + (it.done || doneToday ? ' done' : '') + (group === 'overdue' ? ' overdue' : '');
    const when = fmtWhen(nextOccurrence(it));
    el.innerHTML = `
      <button class="check" aria-label="خلص">${it.done || doneToday ? '✓' : ''}</button>
      <div class="body">
        <div class="text"></div>
        <div class="meta"><span>${CAT[it.cat] || ''}</span><span>${when}</span><span>${REPEAT_LABEL[it.repeat]}</span></div>
      </div>
      ${group === 'overdue' ? '<button class="snz" aria-label="أجّل">⏰</button>' : ''}`;
    el.querySelector('.text').textContent = it.text;
    el.querySelector('.check').onclick = (e) => { e.stopPropagation(); markDone(it, !(it.done || doneToday)); };
    const s = el.querySelector('.snz'); if (s) s.onclick = (e) => { e.stopPropagation(); snooze(it); };
    el.onclick = () => openForm(it);
    return el;
  }

  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    filter = b.dataset.cat;
    document.querySelectorAll('#filters .chip').forEach(x => x.classList.toggle('active', x === b));
    render();
  });

  // ───────── composer ─────────
  $('btnMic').onclick = listen;
  $('btnStopListen').onclick = () => webRec && webRec.stop();
  $('quickInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim(); if (!v) return;
      e.target.value = ''; e.target.blur();
      handleSpoken(v);
    }
  });

  // ───────── settings ─────────
  $('btnSettings').onclick = async () => {
    $('sLang').value = settings.lang; $('sSnooze').value = String(settings.snooze);
    $('settings').classList.remove('hidden');
    refreshExactState();
  };
  $('btnCloseSettings').onclick = () => $('settings').classList.add('hidden');
  $('settings').addEventListener('click', (e) => { if (e.target === $('settings')) $('settings').classList.add('hidden'); });
  $('sLang').onchange = (e) => { settings.lang = e.target.value; saveSettings(); };
  $('sSnooze').onchange = (e) => { settings.snooze = +e.target.value; saveSettings(); };
  $('btnPerm').onclick = async () => {
    const ok = await ensurePermissions(true);
    if (isNative) { try { await SR.requestPermissions(); } catch {} }
    toast(ok ? '✓ الإشعارات مسموحة' : 'الإشعارات مش مسموحة — فتّحها من إعدادات التلفون');
  };
  async function refreshExactState() {
    if (!isNative || !LN.checkExactNotificationSetting) { $('exactState').textContent = ''; return; }
    try {
      const r = await LN.checkExactNotificationSetting();
      $('exactState').textContent = r.exact_alarm === 'granted' ? '✓ مسموح' : '✗ مش مسموح';
    } catch { $('exactState').textContent = ''; }
  }
  $('btnExact').onclick = async () => {
    if (isNative && LN.changeExactNotificationSetting) {
      try { await LN.changeExactNotificationSetting(); } catch {}
      setTimeout(refreshExactState, 800);
    } else toast('هيدا بس عالأندرويد');
  };
  $('btnTest').onclick = async () => {
    await ensurePermissions(true);
    const at = new Date(Date.now() + 10000);
    if (isNative) {
      await LN.schedule({ notifications: [{ id: 999, title: '🔔 ذكّرني', body: 'تجربة: التذكيرات شغّالة ✓', channelId: CHANNEL_ID, schedule: { at, allowWhileIdle: true } }] });
    } else setTimeout(() => ('Notification' in window && Notification.permission === 'granted') ? new Notification('🔔 ذكّرني', { body: 'تجربة ✓' }) : alert('🔔 تجربة ✓'), 10000);
    toast('سكّر التطبيق وإستنى 10 ثواني');
  };
  $('btnClearDone').onclick = () => {
    const n = items.filter(i => i.done).length;
    items = items.filter(i => !i.done); save(); render();
    toast(n ? `انمسح ${n}` : 'ما في شي يتمسح');
  };
  if (isNative) document.addEventListener('resume', refreshExactState);

  // ───────── toast ─────────
  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // Android back button closes sheets
  if (isNative && Cap.Plugins && Cap.Plugins.App) {
    try { Cap.Plugins.App.addListener('backButton', () => { closeForm(); $('settings').classList.add('hidden'); }); } catch {}
  }

  // ───────── boot ─────────
  (async () => {
    render();
    await setupNotifications();
    await rescheduleAll();
    if (!store.get('dk_onboarded', false)) {
      store.set('dk_onboarded', true);
      await ensurePermissions(true);
      $('btnSettings').click();
    }
    setInterval(render, 60000);
  })();
})();
