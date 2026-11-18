const $ = id => document.getElementById(id);
const RAW = 'https://raw.githubusercontent.com/aldrsze/links/main/README.md';
let link = null;

const say = m => { $('status').textContent = m; };
const section = () => $('newSection').value.trim() || $('section').value;

async function api(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-password': $('pw').value },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({ error: 'bad response ' + r.status }));
  if (!r.ok) throw Object.assign(new Error(j.error || r.status), { data: j });
  return j;
}

function show(j) {
  link = j.link;
  $('label').value = j.link.label;
  $('desc').value = j.description;
  $('section').innerHTML = j.sections.map(s => `<option></option>`).join('');
  [...$('section').options].forEach((o, i) => { o.textContent = o.value = j.sections[i]; });
  // an ai-made section goes in the text box, the dropdown keeps its first item
  if (j.sections.includes(j.section)) {
    $('section').value = j.section;
    $('newSection').value = '';
  } else {
    $('section').value = j.sections[0];
    $('newSection').value = j.section;
  }
  paint(j);
  $('review').hidden = false;
}

function paint(j) {
  const isNew = !j.sections.includes(j.section);
  $('bullet').textContent = j.bullet;
  $('diff').textContent = 'section: ' + j.section + (isNew ? ' (new)' : '') + '\n\n' + j.diff;
  let msg = isNew ? 'The model made a new section. Rename it above if you like, then check the diff.\n' : '';
  if (j.ambiguous) msg += 'Two sections could fit. Pick one above.\n';
  if (j.duplicates.length) {
    msg += 'Already listed:\n' + j.duplicates.map(d => `  [${d.section}] ${d.line}`).join('\n') + '\n';
    msg += j.blocked ? 'It is in this section. Pick another one.' : 'It is in another section, so this is allowed.';
  }
  say(msg || 'Looks right? Create the pull request.');
  $('pr').disabled = j.blocked;
}

$('check').onclick = async () => {
  $('review').hidden = true;
  try {
    say('Checking the link...');
    show(await api('/api/preview', { url: $('url').value, manual: $('manual').value }));
  } catch (e) { say('Error: ' + e.message); }
};

// editing description or section only recomputes the diff, no ai call
async function refresh() {
  if (!link) return;
  if (!$('desc').value.trim()) {
    $('pr').disabled = true;
    say('Add a description first.');
    return;
  }
  try {
    const j = await api('/api/preview', { url: link.url, description: $('desc').value, section: section() });
    paint(j);
  } catch (e) {
    $('pr').disabled = true;
    say('Error: ' + e.message);
  }
}
$('section').onchange = () => { $('newSection').value = ''; refresh(); };
$('newSection').onchange = refresh;
$('desc').onchange = refresh;

// same as the first check: fetch the page again and ask the model for a new line
$('retry').onclick = async () => {
  if (!link) return;
  try {
    say('Writing a description...');
    const j = await api('/api/preview', { url: link.url, retry: true });
    show(j);
  } catch (e) { say('Error: ' + e.message); }
};

// asks the model for the section again, the description you see stays
$('retrySection').onclick = async () => {
  if (!link) return;
  if (!$('desc').value.trim()) {
    say('Add a description first.');
    return;
  }
  try {
    say('Choosing a section...');
    const old = section();
    const j = await api('/api/preview', { url: link.url, description: $('desc').value, retrySection: true });
    show(j);
    // the ai is allowed to say "no better section", tell it plainly
    if (j.section === old) say('The model chose "' + j.section + '" again. Type a new section above if that is wrong.');
  } catch (e) { say('Error: ' + e.message); }
};

$('pr').onclick = async () => {
  try {
    say('Opening a pull request...');
    const j = await api('/api/pr', { url: link.url, description: $('desc').value, section: section() });
    say('Pull request #' + j.number + ' opened: ' + j.url);
    $('review').hidden = true;
    link = null;
    $('url').value = '';
    $('manual').value = '';
  } catch (e) { say('Error: ' + e.message); }
};
$('cancel').onclick = () => { $('review').hidden = true; link = null; say(''); };

async function loadList() {
  try {
    const r = await fetch(RAW, { cache: 'no-store' });
    if (!r.ok) {
      $('list').textContent = 'Could not load the list. Reload to try again. (' + r.status + ')';
      return;
    }
    const text = await r.text();
    $('list').textContent = text.trim() ? text : 'The list is empty.';
  } catch (e) {
    $('list').textContent = 'Could not load the list. Reload to try again.';
  }
}
$('reload').onclick = loadList;
loadList();
