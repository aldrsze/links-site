// groq prompts: one fetch helper, two prompts
import { cfg } from './github.js';
import { cleanSection } from './links.js';

// the wait in seconds, from whichever header groq sends
function rateLimitSeconds(r) {
  const after = r.headers.get('retry-after');
  if (after && !isNaN(Number(after))) return Math.max(0, Math.ceil(Number(after)));
  const reset = r.headers.get('x-ratelimit-reset');
  if (reset && !isNaN(Number(reset))) return Math.max(0, Math.ceil(Number(reset) - Date.now() / 1000));
  return null;
}

// retry raises the temperature so a second try is not the same line again
async function groqChat(env, system, user, retry) {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.GROQ_API_KEY },
    body: JSON.stringify({
      model: cfg(env).model,
      temperature: retry ? 0.7 : 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  if (r.status === 429) {
    const wait = rateLimitSeconds(r);
    const msg = wait === null ? 'Rate limit reached, try again later' : 'Rate limit reached, try again in ' + wait + 's';
    throw Object.assign(new Error(msg), { status: 429 });
  }
  if (!r.ok) throw new Error(`groq failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return JSON.parse(j.choices[0].message.content);
}

export async function askGroq(env, link, meta, sections, retry = false) {
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
    'section: pick the existing section that clearly belongs to the same group as this link, judged by what the thing does, not what it is built with.',
    'If no existing section is a close fit, invent a new one: one to three words, title case, like "CLI tools" or "Self-hosted".',
    'A new section must group similar things together, not describe this one link.',
    'Do not park a link in a broad section just because it could loosely fit.',
    'If two sections fit, set ambiguous to true and still give your best section.'
  ].join(' ');
  const user = JSON.stringify({ link: link.url, title: meta.title, source_description: meta.description, sections });
  return groqChat(env, system, user, retry);
}

// picks only the section, so a retry keeps the description you already have
export async function askSection(env, link, description, sections, retry = false) {
  const system = [
    'You sort one-line entries into the sections of a personal links list.',
    'Reply with JSON only: {"section": string, "ambiguous": boolean}.',
    'Pick the existing section that clearly belongs to the same group as this link, judged by what the thing does, not what it is built with.',
    'If no existing section is a close fit, invent a new one: one to three words, title case, like "CLI tools" or "Self-hosted".',
    'A new section must group similar things together, not describe this one link.',
    'Do not park a link in a broad section just because it could loosely fit.',
    'If two sections fit, set ambiguous to true and still give your best section.'
  ].join(' ');
  const user = JSON.stringify({ link: { label: link.label, url: link.url }, description, sections });
  const ai = await groqChat(env, system, user, retry);
  return { section: cleanSection(ai.section), ambiguous: !!ai.ambiguous };
}
