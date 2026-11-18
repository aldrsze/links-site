import { json, checkAuth, cfg, gh, normalize, plan, cleanDescription, cleanSection, unb64 } from '../_lib/readme.js';

const b64 = s => {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};

// POST { url, description, section }
// label and url are rebuilt server side; the browser never sends the bullet itself
export async function onRequestPost({ request, env }) {
  try {
    checkAuth(request, env);
    if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set');
    const c = cfg(env);
    const body = await request.json();
    const link = normalize(body.url);
    const description = cleanDescription(body.description);
    const section = cleanSection(body.section);
    if (!description || !section) throw new Error('description and section are required');

    // 1. base branch sha
    let r = await gh(env, `/repos/${c.repo}/git/ref/heads/${c.branch}`);
    if (!r.ok) throw new Error('branch lookup failed: ' + r.status);
    const baseSha = (await r.json()).object.sha;

    // 2. current file (fresh, with sha)
    r = await gh(env, `/repos/${c.repo}/contents/${c.file}?ref=${c.branch}`);
    if (!r.ok) throw new Error('file read failed: ' + r.status);
    const file = await r.json();
    const p = plan(unb64(file.content), link, section, description);
    if (p.dups.some(d => d.section === section)) {
      return json({ error: `already listed in "${section}"` }, 409);
    }

    // 3. branch, commit, pull request
    const slug = link.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const branch = `add-${slug}-${Date.now().toString(36)}`;
    r = await gh(env, `/repos/${c.repo}/git/refs`, {
      method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha })
    });
    if (!r.ok) throw new Error('branch create failed: ' + r.status + ' ' + await r.text());

    r = await gh(env, `/repos/${c.repo}/contents/${c.file}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `add ${link.label}`, content: b64(p.text), sha: file.sha, branch })
    });
    if (!r.ok) throw new Error('commit failed: ' + r.status + ' ' + await r.text());

    r = await gh(env, `/repos/${c.repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: `add ${link.label}`,
        head: branch,
        base: c.branch,
        body: `section: ${section}\n\n\`\`\`\n${p.bullet}\n\`\`\``
      })
    });
    if (!r.ok) throw new Error('pull request failed: ' + r.status + ' ' + await r.text());
    const pr = await r.json();
    return json({ url: pr.html_url, number: pr.number });
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
}
