const statusEl   = document.getElementById('status');
const courseSelect = document.getElementById('courseSelect');
const versionEl  = document.getElementById('version');

versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

// ──────────────────────────────────────────────
// 科目リストをストレージから読み込んでセレクトに表示
// ──────────────────────────────────────────────
chrome.storage.local.get(['courses'], result => {
  const courses = result.courses || [];
  courseSelect.innerHTML = '';

  if (!courses.length) {
    courseSelect.innerHTML = '<option value="">（科目未設定 → ⚙設定へ）</option>';
    return;
  }
  for (let i = 0; i < courses.length; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = courses[i].name;
    courseSelect.appendChild(opt);
  }
});

// ──────────────────────────────────────────────
// ページ内で実行される自動入力関数
// ──────────────────────────────────────────────
function autofillInPage(course) {
  function setVal(input, value) {
    try {
      const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (ns) ns.call(input, value); else input.value = value;
    } catch(e) { input.value = value; }
    ['input','change','blur'].forEach(t =>
      input.dispatchEvent(new Event(t, { bubbles: true }))
    );
  }

  function resetCheckboxes(row) {
    // 従事内容チェックボックスをすべて外してから正しいものをチェックする
    for (const cb of row.querySelectorAll('input[type="checkbox"]')) {
      if (cb.checked) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function fillRow(row, dayConfig, course) {
    resetCheckboxes(row); // チェックボックスを全解除してからセット
    const inputs     = Array.from(row.querySelectorAll('input'));
    const textInputs = inputs.filter(i => !i.type || i.type === 'text');
    const checkboxes = inputs.filter(i => i.type === 'checkbox');

    let sIdx = -1, eIdx = -1, xIdx = -1, subIdx = -1;

    textInputs.forEach((inp, idx) => {
      const ph   = inp.placeholder || '';
      const name = (inp.name || inp.id || '').toLowerCase();
      if (sIdx   < 0 && (ph.match(/09.?30/) || name.match(/start|kaishi|kms/))) sIdx   = idx;
      else if (eIdx   < 0 && (ph.match(/12.?00/) || name.match(/end|shuryo|kme/))) eIdx   = idx;
      else if (xIdx   < 0 && (ph.match(/00.?00/) || name.match(/jog|excl|except|jogai/))) xIdx   = idx;
      else if (subIdx < 0 && name.match(/kamoku|subj|kmok/)) subIdx = idx;
    });

    const claimed = idx => idx === sIdx || idx === eIdx || idx === xIdx || idx === subIdx;
    if (sIdx   < 0 && textInputs.length > 0 && !claimed(0)) sIdx   = 0;
    if (eIdx   < 0 && textInputs.length > 1 && !claimed(1)) eIdx   = 1;
    if (xIdx   < 0 && textInputs.length > 2 && !claimed(2)) xIdx   = 2;
    if (subIdx < 0 && textInputs.length > 3 && !claimed(3)) subIdx = 3;

    if (sIdx   >= 0) setVal(textInputs[sIdx],   dayConfig.start);
    if (eIdx   >= 0) setVal(textInputs[eIdx],   dayConfig.end);
    if (xIdx   >= 0) setVal(textInputs[xIdx],   course.excluded);
    if (subIdx >= 0) setVal(textInputs[subIdx], course.subject);

    for (const cb of checkboxes) {
      const val = (cb.value || '').toUpperCase().trim();
      if (course.codes.includes(val)) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function getDoc() {
    const frames = document.querySelectorAll('iframe, frame');
    for (const f of frames) {
      try {
        const doc = f.contentDocument || f.contentWindow?.document;
        if (doc && doc.querySelector('tr td')) return doc;
      } catch(e) {}
    }
    return document;
  }

  const doc  = getDoc();
  const dayMap = {};
  for (const d of course.days) dayMap[d.day] = d;

  const ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','月','火','水','木','金','土','日'];

  let count = 0;
  for (const row of doc.querySelectorAll('tr')) {
    const cells   = Array.from(row.querySelectorAll('td'));
    const dayCell = cells.find(c => ALL_DAYS.includes(c.textContent.trim()));
    if (!dayCell) continue;

    const rawDay = dayCell.textContent.trim();
    const JA_TO_EN = {'月':'Mon','火':'Tue','水':'Wed','木':'Thu','金':'Fri','土':'Sat','日':'Sun'};
    const day = JA_TO_EN[rawDay] || rawDay;

    if (dayMap[day]) {
      fillRow(row, dayMap[day], course);
      count++;
    }
  }
  return count;
}

// デバッグ
function debugInPage() {
  const ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','月','火','水','木','金','土','日'];
  function getDoc() {
    const frames = document.querySelectorAll('iframe, frame');
    for (const f of frames) {
      try {
        const doc = f.contentDocument || f.contentWindow?.document;
        if (doc && doc.querySelector('tr td')) return { doc, inFrame: true };
      } catch(e) {}
    }
    return { doc: document, inFrame: false };
  }
  const { doc, inFrame } = getDoc();
  console.log('iframe使用:', inFrame);
  const rows = Array.from(doc.querySelectorAll('tr')).slice(0, 40);
  const dump = rows.map((row, i) => ({
    row: i,
    tds: Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim().slice(0, 20)),
    inputs: Array.from(row.querySelectorAll('input')).map(inp => ({
      type: inp.type||'text', name: inp.name, id: inp.id,
      placeholder: inp.placeholder, value: inp.value
    }))
  })).filter(r => r.tds.length > 0);
  console.log('[勤務表デバッグ]', JSON.stringify(dump, null, 2));
  return dump.length;
}

// ──────────────────────────────────────────────
// ページ内に関数を注入して実行
// ──────────────────────────────────────────────
async function runInTab(fn, args) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('アクティブなタブなし');
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fn,
    args: args || [],
  });
  return result?.result;
}

document.getElementById('fillBtn').addEventListener('click', async () => {
  const idx = parseInt(courseSelect.value);
  if (isNaN(idx)) {
    statusEl.className = 'err';
    statusEl.textContent = '❌ まず⚙設定で科目を登録してください';
    return;
  }

  const result = await new Promise(r => chrome.storage.local.get(['courses'], r));
  const course = result.courses?.[idx];
  if (!course) { statusEl.textContent = '❌ 科目データが見つかりません'; return; }

  statusEl.className = '';
  statusEl.textContent = '入力中...';
  try {
    const count = await runInTab(autofillInPage, [course]);
    statusEl.className = count > 0 ? 'ok' : 'warn';
    statusEl.textContent = count > 0
      ? `✅ ${count} 行を入力しました`
      : '⚠️ 該当する曜日行が見つかりませんでした';
  } catch (e) {
    statusEl.className = 'err';
    statusEl.textContent = `❌ ${e.message}`;
  }
});

document.getElementById('clearBtn').addEventListener('click', async () => {
  statusEl.className = '';
  statusEl.textContent = 'クリア中...';
  try {
    const count = await runInTab(function() {
      function getDoc() {
        const frames = document.querySelectorAll('iframe, frame');
        for (const f of frames) {
          try {
            const doc = f.contentDocument || f.contentWindow?.document;
            if (doc && doc.querySelector('tr td')) return doc;
          } catch(e) {}
        }
        return document;
      }
      const ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','月','火','水','木','金','土','日'];
      const doc = getDoc();
      let count = 0;
      for (const row of doc.querySelectorAll('tr')) {
        const cells   = Array.from(row.querySelectorAll('td'));
        const dayCell = cells.find(c => ALL_DAYS.includes(c.textContent.trim()));
        if (!dayCell) continue;
        for (const inp of row.querySelectorAll('input')) {
          if (!inp.type || inp.type === 'text') {
            inp.value = '';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (inp.type === 'checkbox' && inp.checked) {
            inp.checked = false;
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        count++;
      }
      return count;
    }, []);
    statusEl.className = 'ok';
    statusEl.textContent = `✅ ${count} 行をクリアしました`;
  } catch(e) {
    statusEl.className = 'err';
    statusEl.textContent = `❌ ${e.message}`;
  }
});

document.getElementById('debugBtn').addEventListener('click', async () => {
  try {
    const rows = await runInTab(debugInPage, []);
    statusEl.className = 'ok';
    statusEl.textContent = `✅ ${rows}行分をコンソールに出力 (F12)`;
  } catch (e) {
    statusEl.className = 'err';
    statusEl.textContent = `❌ ${e.message}`;
  }
});

document.getElementById('optBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
