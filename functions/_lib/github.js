// server plumbing and the github api calls

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

export const unb64 = s =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));

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
