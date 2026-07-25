// ──────────────────────────────────────────────────────────────
// 軽量YAMLパーサー（外部ライブラリ不要）
// ──────────────────────────────────────────────────────────────

const DEFAULT_YAML = `\
# ここに科目を登録してください（例）
# - name: 写真表現1
#   subject: 写真表現1
#   excluded: "0000"
#   Wed: 1000-1400
#   Thu: 1000-1500
#   codes: B12, B15, B18, B20, B21, B22, D41, D43, D44

# 複数の科目を登録する場合はここに追記
# - name: 別の科目
#   subject: 別の科目
#   excluded: "0000"
#   Wed: 0900-1200
#   codes: B12, B15
`;

/**
 * YAMLテキストをパースしてコース配列を返す
 * @param {string} text
 * @returns {{ name:string, subject:string, excluded:string, days:{day:string,start:string,end:string}[], codes:string[] }[]}
 */
function parseCourseYaml(text) {
  const DAY_KEYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const courses  = [];
  let current    = null;

  const lines = text.split('\n');
  for (let raw of lines) {
    // コメント除去
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    // 新アイテム（- name: ...）
    const itemMatch = line.match(/^-\s+name\s*:\s*(.+)$/);
    if (itemMatch) {
      current = { name: itemMatch[1].trim(), subject: '', excluded: '0000', days: [], codes: [] };
      courses.push(current);
      continue;
    }

    if (!current) continue;

    // インデントされたキー: value
    const kvMatch = line.match(/^\s+([\w]+)\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].trim();
    const val = kvMatch[2].trim().replace(/^["']|["']$/g, '');

    if (key === 'subject')  { current.subject  = val; continue; }
    if (key === 'excluded') { current.excluded = val; continue; }
    if (key === 'codes') {
      current.codes = val.split(/[\s,]+/).map(s => s.toUpperCase().trim()).filter(Boolean);
      continue;
    }

    // 曜日キー（Wed: 1000-1400）
    if (DAY_KEYS.includes(key)) {
      const timeMatch = val.match(/^(\d{3,4})\s*[-~]\s*(\d{3,4})$/);
      if (timeMatch) {
        const fmt = t => t.length === 3 ? '0' + t : t;  // 930 → 0930
        current.days.push({ day: key, start: fmt(timeMatch[1]), end: fmt(timeMatch[2]) });
      }
      continue;
    }
  }

  return courses;
}
