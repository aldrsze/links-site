// readme parsing and the insertion plan
import { cleanDescription } from './links.js';

export function splitLines(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { lines: text.split(/\r?\n/), eol };
}

export function parseSections(lines) {
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) heads.push({ level: m[1].length, name: m[2], idx: i });
  });
  const lvl2 = heads.filter(h => h.level === 2);
  return lvl2.length ? lvl2 : heads;
}

function sectionEnd(lines, start) {
  for (let i = start + 1; i < lines.length; i++) if (/^#{1,6}\s+/.test(lines[i])) return i;
  return lines.length;
}

const bulletLabel = line => (line.match(/^- \[([^\]]+)\]/) || [])[1] ?? null;

export function findDuplicates(lines, url, label) {
  const secs = parseSections(lines);
  const hits = [];
  lines.forEach((l, i) => {
    if (!l.startsWith('- [')) return;
    if (l.includes(`](${url})`) || (bulletLabel(l) || '').toLowerCase() === label.toLowerCase()) {
      let sec = '';
      for (const s of secs) if (s.idx < i) sec = s.name;
      hits.push({ line: l, section: sec });
    }
  });
  return hits;
}

// builds the new file content; bullet goes in alphabetically (case-insensitive)
export function plan(text, link, section, description) {
  if (!section) throw new Error('no section to add the link to');
  const { lines, eol } = splitLines(text);
  const bullet = `- [${link.label}](${link.url}) — ${cleanDescription(description)}`;
  const out = lines.slice();
  const sec = parseSections(out).find(s => s.name === section);
  let at;
  if (!sec) {
    while (out.length && out[out.length - 1] === '') out.pop();
    out.push('', '## ' + section, '', bullet, '');
    at = out.length - 2;
  } else {
    const end = sectionEnd(out, sec.idx);
    let last = -1;
    at = -1;
    for (let i = sec.idx + 1; i < end; i++) {
      const lb = bulletLabel(out[i]);
      if (lb === null) continue;
      last = i;
      if (at === -1 && lb.toLowerCase() > link.label.toLowerCase()) at = i;
    }
    if (at === -1) {
      if (last !== -1) {
        at = last + 1;
      } else {
        at = sec.idx + 1;
        if (out[at] !== '') {
          out.splice(at, 0, '');
        }
        at++;
      }
    }
    out.splice(at, 0, bullet);
  }
  // keep a blank line between the bullet and a heading right below it
  const next = out[at + 1];
  if (next !== undefined && next !== '' && next.startsWith('#')) out.splice(at + 1, 0, '');
  // keep the trailing newline the file already had
  if (text.endsWith('\n') && out[out.length - 1] !== '') out.push('');
  return { bullet, lines: out, at, text: out.join(eol), dups: findDuplicates(lines, link.url, link.label) };
}

export function renderDiff(lines, at) {
  const from = Math.max(0, at - 2), to = Math.min(lines.length, at + 3);
  return lines.slice(from, to).map((l, i) => (from + i === at ? '+ ' : '  ') + l).join('\n');
}
