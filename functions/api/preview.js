import {
  json, checkAuth, normalize, getMeta, askGroq, rawReadme, splitLines,
  parseSections, plan, renderDiff, cleanDescription, cleanSection
} from '../_lib/readme.js';

// POST { url, manual?, description?, section? }
// first call (url only): fetch page, ask groq, return suggestion + diff
// later calls (with description + section): no ai, just recompute the diff
export async function onRequestPost({ request, env }) {
  try {
    checkAuth(request, env);
    const body = await request.json();
    const link = normalize(body.url);
    const text = await rawReadme(env);
    const sections = parseSections(splitLines(text).lines).map(s => s.name);

    let description = cleanDescription(body.description);
    let section = cleanSection(body.section);
    let ambiguous = false;

    if (!description) {
      const manual = cleanDescription(body.manual);
      const meta = manual ? { title: '', description: manual } : await getMeta(link, env).catch(e => ({ error: e.message }));
      if (meta.error || !meta.description) {
        return json({ needManual: true, error: (meta.error || 'page has no description') + '. type a one-line description and try again.' }, 422);
      }
      const ai = await askGroq(env, link, meta, sections);
      description = cleanDescription(ai.description);
      section = sections.includes(ai.section) ? ai.section : sections[0];
      ambiguous = !!ai.ambiguous || !sections.includes(ai.section);
    }
    if (!section) section = sections[0];
    if (!description) throw new Error('empty description');

    const p = plan(text, link, section, description);
    return json({
      link, description, section, sections, ambiguous,
      bullet: p.bullet,
      diff: renderDiff(p.lines, p.at),
      duplicates: p.dups,
      blocked: p.dups.some(d => d.section === section)
    });
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
}
