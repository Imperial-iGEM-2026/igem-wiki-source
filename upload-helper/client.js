const token = document.querySelector('meta[name="helper-session"]').content;
history.replaceState(null, '', location.pathname);
const $ = (id) => document.getElementById(id);
const publicationComplete = (p) => !!(p?.complete || /^https:\/\/gitlab\.igem\.org\/2026\/[^/]+\/-\/merge_requests\/\d+$/.test(p?.url || ''));
let state,
  formJob = '',
  localWorking = false;
async function api(name, body) {
  const r = await fetch('/api/' + name, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'X-Helper-Session': token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
async function fileUpload(url, file) {
  const r = await fetch('/api/' + url, {
    method: 'POST',
    headers: { 'X-Helper-Session': token },
    body: file,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
}
function run(fn) {
  return async () => {
    if (localWorking) return;
    localWorking = true;
    updateButtons();
    if (state) renderStatus();
    try {
      $('error').textContent = '';
      await fn();
    } catch (e) {
      $('error').textContent = e.message;
    } finally {
      localWorking = false;
      await refresh().catch(showError);
      updateButtons();
    }
  };
}
$('import').onclick = run(async () => {
  const fs = [...$('zips').files],
    kinds = {
      '01-website-source.zip': 'source',
      '02-static-assets.zip': 'assets',
      '03-video-audio.zip': 'media',
    };
  if (
    ![2, 3].includes(fs.length) ||
    fs.some((f) => !kinds[f.name]) ||
    new Set(fs.map((f) => f.name)).size !== fs.length ||
    !['01-website-source.zip', '02-static-assets.zip'].every((name) =>
      fs.some((f) => f.name === name),
    )
  )
    throw Error(
      'Select 01-website-source.zip and 02-static-assets.zip together.',
    );
  await api('new', { teamId: $('teamId').value });
  for (const f of fs) await fileUpload('import?kind=' + kinds[f.name], f);
  await api('prepare', {});
});
$('resume').onclick = run(() => api('resume', { id: $('jobs').value }));
for (const button of document.querySelectorAll('[data-login]'))
  button.onclick = run(() => api('login', { kind: button.dataset.login }));
$('upload').onclick = run(() => api('upload', {}));
$('pause').onclick = run(() => api('pause', {}));
$('addFont').onclick = run(async () => {
  const file = $('fontFile').files[0];
  if (!file) throw Error('Choose a font file');
  await fileUpload(
    'font?' +
      new URLSearchParams({
        name: file.name,
        family: $('fontFamily').value,
        weight: $('fontWeight').value,
      }),
    file,
  );
});
$('review').onclick = run(() =>
  api('review', {
    attributionUrl: $('attribution').value,
    systemFonts: $('systemFonts').checked,
  }),
);
$('publish').onclick = run(() => api('publish', {}));
let seenCleanup = '';
$('helpOpen').onclick = () => $('helpDialog').showModal();
for (const button of document.querySelectorAll('[data-close]'))
  button.onclick = () => $(button.dataset.close).close();
const scan = run(async () => {
  $('cleanupStatus').textContent =
    'Checking sign-in and scanning team storage…';
  try {
    await api('scan-storage', {});
  } catch (e) {
    $('cleanupStatus').textContent = e.message;
    throw e;
  }
});
$('scanStorage').onclick = scan;
$('retryScan').onclick = scan;
$('showCleanup').onclick = () => $('cleanupDialog').showModal();
$('confirmTeam').oninput = updateButtons;
$('confirmDelete').onchange = updateButtons;
$('fileFilter').onchange = () => {
  signature = '';
  refresh().catch(showError);
};
$('deleteStorage').onclick = run(async () => {
  try {
    await api('delete-storage', {
      id: state.cleanup.id,
      confirmTeam: $('confirmTeam').value,
      acknowledged: $('confirmDelete').checked,
    });
    $('cleanupDialog').close();
  } catch (e) {
    $('cleanupError').textContent = e.message;
  }
});
function showError(e) {
  $('error').textContent =
    e.message ||
    'Cannot reach the helper. Check that its terminal is still open.';
}
function updateButtons() {
  if (!state) return;
  const working = state.busy || localWorking;
  for (const button of document.querySelectorAll('button')) {
    if (button.dataset.close || ['helpOpen', 'showCleanup'].includes(button.id))
      continue;
    button.disabled = working;
  }
  $('pause').disabled =
    !state.busy ||
    !['upload', 'scan-storage', 'delete-storage'].includes(
      state.activity?.action,
    );
  for (const id of ['upload', 'review', 'addFont', 'scanStorage'])
    $(id).disabled ||= !state.job?.team;
  for (const b of document.querySelectorAll('[data-login]'))
    b.disabled ||= !state.job?.team;
  $('resume').disabled ||= !state.jobs.length;
  $('publish').disabled =
    working || !state.proposal || publicationComplete(state.job?.publication);
  $('publish').textContent = state.job?.publication?.attempted && !publicationComplete(state.job.publication)
    ? '2. Retry / resume GitLab upload' : '2. Send to GitLab for review';
  const p = state.cleanup;
  $('deleteStorage').disabled =
    working ||
    !p ||
    p.started ||
    !p.files.length ||
    Date.now() - p.createdAt > 900000 ||
    $('confirmTeam').value !== p.team ||
    !$('confirmDelete').checked;
}
function renderStatus() {
  const rows = state.job?.rows || [],
    done = rows.filter((r) => r.url).length;
  const recordings = rows.filter((r) =>
    ['video', 'audio', 'embed'].includes(r.kind),
  );
  const assets = rows.filter((r) => !recordings.includes(r));
  const count = (list) =>
    `${list.filter((r) => r.url).length} / ${list.length} URLs saved`;
  $('assetCount').textContent = state.job?.team
    ? assets.length
      ? count(assets)
      : 'No files needed'
    : 'Import a project first';
  $('recordingDestination').hidden = !recordings.length;
  const todoCount = state.job?.recordingTodoCount || 0;
  $('recordingTodoNotice').hidden = !todoCount;
  $('recordingTodoNotice').textContent =
    `${todoCount} recording TODO${todoCount === 1 ? '' : 's'} will appear in the exported website. Add Video Universe embeds in the editor, then export again to replace them. The helper does not upload these recordings.`;
  $('mediaCount').textContent = state.job?.team
    ? recordings.length
      ? count(recordings)
      : 'Not needed for this export'
    : 'Import a project first';
  $('progressCount').textContent = `${done} / ${rows.length}`;
  $('progress').max = Math.max(rows.length, 1);
  $('progress').value = done;
  const a = state.activity || {},
    phase = localWorking ? 'working' : a.phase;
  $('busy').textContent =
    state.busy || localWorking
      ? 'Working'
      : phase === 'error'
        ? 'Attention'
        : phase === 'paused'
          ? 'Paused'
          : 'Ready';
  const titles = {
    upload: 'Uploading media',
    review: 'Checking source',
    publish: 'Sending to GitLab',
    'scan-storage': 'Scanning team storage',
    'delete-storage': 'Removing team files',
  };
  $('statusTitle').textContent = state.busy
    ? titles[a.action] || 'Working on your project'
    : phase === 'error'
      ? 'Needs your attention'
      : phase === 'paused'
        ? 'Progress saved · paused'
        : !state.job?.team
          ? 'Start with your export'
          : done < rows.length
            ? 'Ready to continue'
            : 'Media links are ready';
  $('statusMessage').textContent = localWorking
    ? 'Processing your request. Keep this window open…'
    : a.message || 'Choose the two ZIPs in step 1.';
  $('statusPanel').dataset.phase = phase;
  if (!state.busy && phase === 'complete') {
    const completedTitles = {
      upload: 'Upload pass complete',
      review: 'Source changes ready',
      publish: 'Review in GitLab',
      'scan-storage': 'Storage preview ready',
      'delete-storage': 'Team files removed',
    };
    if (completedTitles[a.action])
      $('statusTitle').textContent = completedTitles[a.action];
  }
  $('gitlabStatus').textContent = state.job?.publication?.mediaRemoved
    ? 'Media removed · existing source has broken links'
    : publicationComplete(state.job?.publication)
      ? 'Source sent · review in GitLab'
      : state.job?.publication?.attempted
        ? `Upload incomplete · ${state.job.publication.next || 0} files confirmed`
        : state.proposal
          ? 'Source checked · ready to send'
          : 'Website code · not sent yet';
  const publishHint = !state.job?.team
    ? 'Import your export in step 1 to begin.'
    : publicationComplete(state.job?.publication)
      ? 'Open the saved GitLab review link below to continue.'
      : state.busy || localWorking
        ? 'Wait for the current operation to finish.'
        : phase === 'error' && ['review', 'publish'].includes(a.action)
          ? a.message
          : state.proposal && state.job?.publication?.attempted
            ? 'Retry / resume checks the saved branch before continuing. Confirmed files are not sent again.'
            : state.proposal
              ? `${state.proposal.total} source files checked. Review the list below, then click 2. Send to GitLab for review.`
              : done < rows.length
                ? `${rows.length - done} media files still need URLs in step 2. Then sign in to GitLab and click 1. Check source changes.`
                : 'Sign in to GitLab, then click 1. Check source changes. This enables step 2.';
  if ($('publishHint').textContent !== publishHint)
    $('publishHint').textContent = publishHint;
  $('review').classList.toggle('secondary', !!state.proposal);
  $('nextStep').textContent = state.busy
    ? 'Watch the status here. Keep the helper browser and terminal open.'
    : phase === 'error'
      ? 'Follow the message above, then retry that step. Saved uploads are kept.'
      : state.job?.publication?.mediaRemoved
        ? 'Re-upload removed media and review your existing GitLab branch before publishing.'
        : !state.job?.team
          ? 'Choose your 3 export ZIPs in step 1, then import.'
          : assets.some((r) => !r.url)
            ? 'Open iGEM Uploads, sign in, then click Upload / check remaining files.'
            : recordings.some((r) => !r.url)
              ? 'Finish any previous recording’s form, open Video Universe’s upload page, then check remaining files.'
              : publicationComplete(state.job?.publication)
                ? 'Open the GitLab link below. Review and merge the request, then check its build.'
                : state.job?.publication?.attempted
                  ? 'Check source changes if needed, then retry / resume the GitLab upload. Saved progress will be verified first.'
                  : 'Review recording details if needed, then open GitLab and complete step 3.';
  $('fileSummary').textContent =
    `Files & upload status · ${rows.length - done} remaining`;
  const p = state.cleanup;
  if (!state.busy && p && !p.started && phase !== 'error')
    $('nextStep').textContent =
      'Review the storage preview. Delete only after checking the team and file list, or close it to keep everything.';
  $('showCleanup').hidden = !p || !!p.started;
  $('cleanupStatus').textContent = p
    ? p.started
      ? `${p.deleted.length} / ${p.files.length} files removed. Scan again to review remaining files.`
      : `${p.files.length} files found in team ${p.teamId}, including ${p.folders} subfolders. Nothing deleted.`
    : '';
  const storageAction = ['scan-storage', 'delete-storage'].includes(a.action);
  const accessNeeded = ['SIGN_IN_REQUIRED', 'STORAGE_ACCESS_REQUIRED'].includes(
    a.code,
  );
  const showNotice = storageAction && phase === 'error';
  const newlyVisible = showNotice && $('cleanupNotice').hidden;
  $('cleanupNotice').hidden = !showNotice;
  if (showNotice) {
    const title = accessNeeded
      ? 'Sign in to continue'
      : 'Storage action stopped';
    // Polling should not keep announcing the same notification to screen readers.
    if ($('cleanupNoticeTitle').textContent !== title)
      $('cleanupNoticeTitle').textContent = title;
    if ($('cleanupNoticeText').textContent !== a.message)
      $('cleanupNoticeText').textContent = a.message;
    $('cleanupSignIn').hidden = !accessNeeded;
    $('retryScan').textContent = accessNeeded
      ? 'Check sign-in & scan'
      : 'Scan again';
  }
  if (newlyVisible)
    $('cleanupNotice').scrollIntoView({
      block: 'nearest',
      behavior: 'instant',
    });
  if (storageAction && state.busy) $('cleanupStatus').textContent = a.message;
  if (p && seenCleanup !== p.id) {
    seenCleanup = p.id;
    $('confirmTeam').value = '';
    $('confirmDelete').checked = false;
    $('cleanupError').textContent = '';
    $('cleanupTeam').textContent =
      `${p.team} · Team ID ${p.teamId} · ${p.files.length} files. Type “${p.team}” below to confirm.`;
    $('cleanupFiles').replaceChildren(
      ...p.files.map((f) => {
        const e = document.createElement('p');
        e.textContent = (f.folder ? f.folder + '/' : '') + f.name;
        return e;
      }),
    );
    if (!p.started && !$('cleanupDialog').open) $('cleanupDialog').showModal();
  }
}
let signature = '';
let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    state = await api('state');
    $('helperVersion').textContent = state.version ? 'v' + state.version : '';
    renderStatus();
    const selected = $('jobs').value;
    const jobSignature = JSON.stringify([state.jobs, state.jobLabels]);
    if ($('jobs').dataset.signature !== jobSignature) {
      $('jobs').dataset.signature = jobSignature;
      $('jobs').replaceChildren(
        ...state.jobs.map((id) => {
          const o = document.createElement('option');
          o.value = id;
          o.textContent = state.jobLabels?.[id] || id;
          o.selected = id === selected;
          return o;
        }),
      );
    }
    $('project').textContent = state.job?.team
      ? `Project: ${state.job.team} · ${state.job.rows.length} media files`
      : '';
    if (state.job?.id !== formJob) {
      formJob = state.job?.id || '';
      $('attribution').value = state.job?.attributionUrl || '';
      $('systemFonts').checked = !!state.job?.systemFonts;
    }
    if (!$('attribution').value && state.job?.attributionUrl)
      $('attribution').value = state.job.attributionUrl;
    const filter = $('fileFilter').value;
    const sig = filter + JSON.stringify(state.job?.rows || []);
    if (signature !== sig) {
      signature = sig;
      $('files').replaceChildren(
        ...(state.job?.rows || [])
          .filter(
            (r) =>
              filter === 'all' ||
              (filter === 'done'
                ? !!r.url
                : filter === 'error'
                  ? !!r.uploadError
                  : !r.url),
          )
          .map((row) => {
            const div = document.createElement('div');
            div.className = 'file-row';
            const title = document.createElement('strong');
            title.textContent = row.file || row.source;
            const status = document.createElement('span');
            status.textContent = row.url
              ? '✓ URL saved'
              : row.uploadError
                ? row.uploadError
                : row.processingComplete
                  ? 'Processed — collecting URL after this batch'
                  : row.attempted
                    ? 'Upload pending — check official tab'
                    : !row.file
                      ? 'Missing file — choose the original or use an existing iGEM upload'
                      : 'Ready to upload';
            div.append(title, status);
            if (row.url) {
              const a = document.createElement('a');
              a.href = row.url;
              a.target = '_blank';
              a.rel = 'noreferrer';
              a.textContent = 'View on iGEM ↗';
              div.append(a);
            } else {
              const existing = document.createElement('button');
              existing.className = 'secondary';
              existing.textContent = 'Use an existing upload';
              existing.onclick = run(async () => {
                const url = prompt(
                  'Paste the official iGEM CDN or Video Universe embed URL for this file.',
                );
                if (url) await api('mapping', { source: row.source, url });
              });
              div.append(existing);
              if (
                row.attempted &&
                !row.processingComplete &&
                !['video', 'audio', 'embed'].includes(row.kind)
              ) {
                const retry = document.createElement('button');
                retry.className = 'secondary';
                retry.textContent = 'Retry rejected file';
                retry.onclick = run(async () => {
                  if (
                    confirm(
                      'Did iGEM explicitly reject this file? Only retry rejected files, not uploads still processing.',
                    )
                  )
                    await api('retry-rejected', { source: row.source });
                });
                div.append(retry);
              }
              if (!row.file) {
                const input = document.createElement('input');
                input.type = 'file';
                input.onchange = run(() =>
                  fileUpload(
                    'original?' +
                      new URLSearchParams({
                        source: row.source,
                        name: input.files[0].name,
                      }),
                    input.files[0],
                  ),
                );
                div.append(input);
              }
            }
            return div;
          }),
      );
    }
    const logSignature = JSON.stringify(state.events);
    if ($('events').dataset.signature !== logSignature) {
      $('events').dataset.signature = logSignature;
      $('events').replaceChildren(
        ...state.events.slice(-30).map((event) => {
          const p = document.createElement('p'),
            t = document.createElement('time');
          t.textContent = event.time;
          p.append(t, document.createTextNode(event.text));
          return p;
        }),
      );
    }
    $('changes').textContent = state.proposal
      ? `${state.proposal.total} files to create or update\n` +
        state.proposal.files.map((f) => `${f.action}  ${f.path}`).join('\n')
      : '';
    $('publication').replaceChildren();
    if (state.job?.publication?.url) {
      const a = document.createElement('a');
      a.href = state.job.publication.url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent =
        state.job.publication.message || 'Check the upload branch in GitLab ↗';
      $('publication').append(a);
    }
    updateButtons();
  } finally {
    refreshing = false;
  }
}
setInterval(() => refresh().catch(showError), 1500);
await refresh().catch(showError);
