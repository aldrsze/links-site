// link normalization and page metadata, server side so there is no CORS problem

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

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
}

export async function getMeta(link, env) {
  if (link.kind === 'github') {
    const h = { 'user-agent': 'trove', accept: 'application/vnd.github+json' };
    if (env.GITHUB_TOKEN) h.authorization = 'Bearer ' + env.GITHUB_TOKEN;
    const r = await fetch(`https://api.github.com/repos/${link.owner}/${link.repo}`, { headers: h });
    if (!r.ok) throw new Error('github repo lookup failed: ' + r.status);
    const j = await r.json();
    return { title: j.full_name, description: j.description || '' };
  }
  const r = await fetch(link.url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; trove)', accept: 'text/html' },
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
  // many docs and wiki pages have no meta description at all, use the intro paragraph
  if (!description) description = firstParagraph(html);
  return { title, description };
}

// the first paragraph with real prose, so a wiki page still gives the model something
function firstParagraph(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  for (const p of body.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []) {
    const text = decode(p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (text.length >= 60) return text.slice(0, 400);
  }
  return '';
}
