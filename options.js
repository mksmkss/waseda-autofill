const yamlInput = document.getElementById('yamlInput');
const statusEl  = document.getElementById('status');
const previewEl = document.getElementById('preview');

// Load saved YAML (or default)
chrome.storage.local.get(['courseYaml'], result => {
  yamlInput.value = result.courseYaml || DEFAULT_YAML;
});

function showPreview(courses) {
  if (!courses.length) {
    previewEl.innerHTML = '<p class="err">科目が見つかりません。YAMLを確認してください。</p>';
    return;
  }
  let html = '<h3>📋 パース結果プレビュー</h3><table><tr><th>科目名</th><th>曜日</th><th>開始</th><th>終了</th><th>除外</th><th>コード</th></tr>';
  for (const c of courses) {
    if (!c.days.length) {
      html += `<tr><td>${c.name}</td><td colspan="4" style="color:#c33">曜日が設定されていません</td><td>${c.codes.join(', ')}</td></tr>`;
    }
    for (const d of c.days) {
      html += `<tr>
        <td>${c.name}</td>
        <td>${d.day}</td>
        <td>${d.start}</td>
        <td>${d.end}</td>
        <td>${c.excluded}</td>
        <td>${c.codes.join(', ')}</td>
      </tr>`;
    }
  }
  html += '</table>';
  previewEl.innerHTML = html;
}

document.getElementById('checkBtn').addEventListener('click', () => {
  try {
    const courses = parseCourseYaml(yamlInput.value);
    showPreview(courses);
    statusEl.className = 'ok';
    statusEl.textContent = `✅ ${courses.length} 科目を認識`;
  } catch (e) {
    statusEl.className = 'err';
    statusEl.textContent = `❌ ${e.message}`;
  }
});

document.getElementById('saveBtn').addEventListener('click', () => {
  try {
    const courses = parseCourseYaml(yamlInput.value);
    if (!courses.length) throw new Error('科目が見つかりません');
    chrome.storage.local.set({ courseYaml: yamlInput.value, courses }, () => {
      statusEl.className = 'ok';
      statusEl.textContent = `✅ 保存しました（${courses.length} 科目）`;
      showPreview(courses);
    });
  } catch (e) {
    statusEl.className = 'err';
    statusEl.textContent = `❌ ${e.message}`;
  }
});
