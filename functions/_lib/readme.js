// shared helpers for the pages functions

export const cfg = env => ({
  repo: env.REPO || 'aldrsze/links',
  branch: env.BRANCH || 'main',
  file: env.FILE || 'README.md',
  model: env.GROQ_MODEL || 'openai/gpt-oss-120b'
});

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export function checkAuth(request, env) {
  if (env.SITE_PASSWORD && request.headers.get('x-password') !== env.SITE_PASSWORD) {
    throw Object.assign(new Error('wrong password'), { status: 401 });
  }
}

// ---------- link normalization ----------
export function normalize(raw) {
  const u = new URL(String(raw).trim());
  if (!/^https?:$/.test(u.protocol)) throw new Error('only http(s) links');
  const host = u.hostname.replace(/^www\./, '');
  const isPrivate = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[)/.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate || !host.includes('.')) {
    throw new Error('not a public host');
  }
  if (host === 'github.com') {
    const [owner, repo] = u.pathname.split('/').filter(Boolean);
    if (owner && repo) {
      const name = repo.replace(/\.git$/, '');
      return { kind: 'github', label: `${owner}/${name}`, url: `https://github.com/${owner}/${name}`, owner, repo: name };
    }
  }
  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
  return { kind: 'site', label: host, url: `${u.origin}${path}`, host };
}

export const cleanDescription = s =>
  String(s || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '').slice(0, 120);

export const cleanSection = s =>
  String(s || '').replace(/[\r\n#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

export const unb64 = s =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));

// ---------- page metadata (server side, so no CORS problem) ----------
function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}
export async function getMeta(link, env) {
  if (link.kind === 'github') {
    const h = { 'user-agent': 'links-site', accept: 'application/vnd.github+json' };
    if (env.GITHUB_TOKEN) h.authorization = 'Bearer ' + env.GITHUB_TOKEN;
    const r = await fetch(`https://api.github.com/repos/${link.owner}/${link.repo}`, { headers: h });
    if (!r.ok) throw new Error('github repo lookup failed: ' + r.status);
    const j = await r.json();
    return { title: j.full_name, description: j.description || '' };
  }
  const r = await fetch(link.url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; links-site)', accept: 'text/html' },
    redirect: 'follow'
  });
  if (!r.ok) throw new Error('page fetch failed: ' + r.status);
  const html = (await r.text()).slice(0, 300000);
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  // og:description is usually the hand-written one, name=description is often templated
  let description = '';
  let fallback = '';
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const c = tag.match(/content=["']([\s\S]*?)["']/i);
    if (!c || !c[1].trim()) continue;
    if (/property=["']og:description["']/i.test(tag)) {
      description = decode(c[1]);
      break;
    }
    if (!fallback && /name=["']description["']/i.test(tag)) fallback = decode(c[1]);
  }
  if (!description) description = fallback;
  return { title, description };
}

// ---------- groq ----------
export async function askGroq(env, link, meta, sections) {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set');
  const system = [
    'You write one-line entries for a personal links list.',
    'Reply with JSON only: {"description": string, "section": string, "ambiguous": boolean}.',
    'description: one line, 6 to 12 words, lowercase unless it starts with a proper name, no trailing period.',
    'Say what the thing does or gives you, not what it is called; the name is already the link text.',
    'Keep the concrete noun: repo, CLI, wiki, emulator, cheatsheets, config, index.',
    'Drop marketing words: powerful, modern, fast, simple, seamless, blazing, ultimate, cutting-edge, robust, lovely.',
    'Drop filler openers: "a tool that", "this site", "a collection of". No hype, no comparisons, no calls to action.',
    'Use only facts from the input. If the source description is thin, name the category instead of inventing features.',
    'Style examples: "curated index of free media, tools, and sites", "vim fork focused on extensibility", "terminal UI for git", "resources for anime, manga, and novels".',
    'section: exactly one of the provided section names, chosen by what the thing does, not what it is built with.',
    'If two sections fit or none fits, set ambiguous to true and still give your best section.'
  ].join(' ');
  const user = JSON.stringify({ link: link.url, title: meta.title, source_description: meta.description, sections });
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.GROQ_API_KEY },
    body: JSON.stringify({
      model: cfg(env).model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  if (!r.ok) throw new Error(`groq failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

// ---------- readme parsing ----------
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

// ---------- github ----------
export const gh = (env, path, init = {}) =>
  fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      'user-agent': 'links-site',
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + env.GITHUB_TOKEN,
      ...(init.body ? { 'content-type': 'application/json' } : {})
    }
  });

export async function rawReadme(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set');
  const c = cfg(env);
  const r = await gh(env, `/repos/${c.repo}/contents/${c.file}?ref=${c.branch}`);
  if (!r.ok) throw new Error('could not read the repo file: ' + r.status);
  const j = await r.json();
  return unb64(j.content);
}
