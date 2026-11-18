const $ = id => document.getElementById(id);
const RAW = 'https://raw.githubusercontent.com/aldrsze/links/main/README.md';
let link = null;

const say = m => { $('status').textContent = m; };
const section = () => $('newSection').value.trim() || $('section').value;

// remember the password in this browser so it is one less thing to type
try { $('pw').value = localStorage.getItem('trove-pw') || ''; } catch {}
$('pw').addEventListener('change', () => {
  try { localStorage.setItem('trove-pw', $('pw').value); } catch {}
});

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
  $('manualField').hidden = true;
}

function paintDiff(j, isNew) {
  const box = $('diff');
  box.textContent = '';
  const head = document.createElement('div');
  head.className = 'diff-head';
  head.textContent = 'section: ' + j.section + (isNew ? ' (new)' : '');
  box.appendChild(head);
  for (const line of j.diff.split('\n')) {
    const row = document.createElement('div');
    row.className = line.startsWith('+ ') ? 'diff-add' : 'diff-line';
    row.textContent = line;
    box.appendChild(row);
  }
}

function paint(j) {
  const isNew = !j.sections.includes(j.section);
  $('bullet').textContent = j.bullet;
  paintDiff(j, isNew);
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
  if (!$('url').value.trim()) {
    say('Paste a link first.');
    $('url').focus();
    return;
  }
  $('review').hidden = true;
  $('check').disabled = true;
  say('Checking the link...');
  try {
    show(await api('/api/preview', { url: $('url').value, manual: $('manual').value }));
  } catch (e) {
    say('Error: ' + e.message);
    if (e.data && e.data.needManual) {
      $('manualField').hidden = false;
      $('manual').focus();
    }
  }
  $('check').disabled = false;
};

// pasting a link starts the check right away
$('url').addEventListener('paste', () => {
  setTimeout(() => {
    if (/^https?:\/\//i.test($('url').value.trim()) && !$('check').disabled) $('check').click();
  }, 0);
});

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
  $('retry').disabled = true;
  say('Writing a description...');
  try {
    show(await api('/api/preview', { url: link.url, retry: true }));
  } catch (e) { say('Error: ' + e.message); }
  $('retry').disabled = false;
};

// asks the model for the section again, the description you see stays
$('retrySection').onclick = async () => {
  if (!link) return;
  if (!$('desc').value.trim()) {
    say('Add a description first.');
    $('desc').focus();
    return;
  }
  $('retrySection').disabled = true;
  say('Choosing a section...');
  try {
    const old = section();
    const j = await api('/api/preview', { url: link.url, description: $('desc').value, retrySection: true });
    show(j);
    // the ai is allowed to say "no better section", tell it plainly
    if (j.section === old) say('The model chose "' + j.section + '" again. Type a new section above if that is wrong.');
  } catch (e) { say('Error: ' + e.message); }
  $('retrySection').disabled = false;
};

$('pr').onclick = async () => {
  $('pr').disabled = true;
  say('Opening a pull request...');
  try {
    const j = await api('/api/pr', { url: link.url, description: $('desc').value, section: section() });
    // make the pull request address clickable
    const st = $('status');
    st.textContent = 'Pull request #' + j.number + ' opened: ';
    const a = document.createElement('a');
    a.href = j.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = j.url;
    st.appendChild(a);
    $('review').hidden = true;
    link = null;
    $('url').value = '';
    $('manual').value = '';
    $('manualField').hidden = true;
    $('url').focus();
  } catch (e) {
    say('Error: ' + e.message);
    $('pr').disabled = false;
  }
};
$('cancel').onclick = () => {
  $('review').hidden = true;
  link = null;
  say('');
  $('url').focus();
};

// ctrl/cmd+enter creates the pull request when the review is open
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !$('review').hidden && !$('pr').disabled) {
    e.preventDefault();
    $('pr').click();
  }
});

// typing a new section and pressing enter is the same as leaving the box
for (const id of ['desc', 'newSection']) {
  $(id).addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      refresh();
    }
  });
}
for (const id of ['url', 'manual']) {
  $(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('check').click();
    }
  });
}

async function loadList() {
  $('reload').disabled = true;
  $('reload').textContent = 'Reloading...';
  try {
    const r = await fetch(RAW, { cache: 'no-store' });
    if (!r.ok) {
      $('list').textContent = 'Could not load the list. Reload to try again. (' + r.status + ')';
    } else {
      const text = await r.text();
      $('list').textContent = text.trim() ? text : 'The list is empty.';
    }
  } catch (e) {
    $('list').textContent = 'Could not load the list. Reload to try again.';
  }
  $('reload').disabled = false;
  $('reload').textContent = 'Reload';
}
$('reload').onclick = loadList;
loadList();
