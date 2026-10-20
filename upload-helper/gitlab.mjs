import { createHash } from 'node:crypto';

export function checkGitResponse(result, method, endpoint) {
  const { status, data, contentType = '', requestId = '' } = result;
  const context = `${method} ${endpoint.split('?')[0]} · HTTP ${status}`;
  const reference = requestId ? ` Request ID: ${requestId}.` : '';
  let message;
  if (status === 413)
    message = 'GitLab or its proxy rejected the upload because the request is too large.';
  else if (status === 429)
    message = 'GitLab is rate limiting requests. Wait a few minutes, then retry.';
  else if ([401, 403].includes(status))
    message = 'GitLab denied this request. Check the sign-in and repository permissions in the helper’s GitLab browser. A proxy/security check can also deny access.';
  else if (status >= 500)
    message = 'GitLab or its proxy is temporarily unavailable. Retry after it recovers.';
  else if (status === 404 && data !== null && data !== undefined)
    return result;
  else if (status >= 400)
    message = `GitLab rejected the request. ${JSON.stringify(data?.message || data?.error || '').slice(0, 400)}`;
  else if (data === null || data === undefined) {
    if (status === 204) return result;
    message = `GitLab returned ${contentType.includes('html') ? 'an HTML page' : 'a non-JSON response'} instead of API data. Open the helper’s GitLab tab and complete any sign-in or security check, then retry.`;
  }
  if (message) {
    const error = new Error(`${message} (${context}).${reference}`);
    error.status = status;
    throw error;
  }
  return result;
}

export function publicationComplete(publication) {
  // Recognise successful uploads saved by older helpers too.
  return !!(publication?.complete ||
    /^https:\/\/gitlab\.igem\.org\/2026\/[^/]+\/-\/merge_requests\/\d+$/.test(publication?.url || ''));
}

const messageFor = (digest, start, end) =>
  `Update reviewed reGELerate wiki source [${digest.slice(0, 16)}:${start}-${end}]`;
const commitBody = (plan, state, start, end) => ({
  branch: state.branch,
  ...(state.head ? {} : { start_sha: plan.sha }),
  commit_message: messageFor(state.digest, start, end),
  actions: plan.actions.slice(start, end),
});

// A conservative request budget, not an assertion about iGEM's server limit.
const REQUEST_BYTES = 512 * 1024;
export const publicationDigest = (plan) =>
  createHash('sha256').update(JSON.stringify([plan.base, plan.sha, plan.actions])).digest('hex');

export function publicationTarget(plan, branch, prior) {
  const digest = publicationDigest(plan);
  if (prior?.digest && prior.digest !== digest && !publicationComplete(prior))
    return { branch: `${branch}-${digest.slice(0, 12)}`, publication: undefined, replacedBranch: prior.branch };
  return { branch: prior?.branch || branch, publication: prior };
}

export async function publishGitLab(git, plan, branch, prior = {}, persist = async () => {}, log = () => {}) {
  if (publicationComplete(prior)) return prior;
  if (!plan.actions.length && !prior.attempted)
    return { complete: true, url: '', message: 'The repository already matches these files.' };
  const digest = publicationDigest(plan);
  if (prior.digest && prior.digest !== digest)
    throw Error('The reviewed source changed since this upload started. Keep the existing review branch; import a fresh export to start a separate upload.');
  const state = {
    ...prior, attempted: true, branch, digest,
    next: prior.next || 0, head: prior.head || null,
    url: prior.url || `https://gitlab.igem.org/${decodeURIComponent(plan.base.split('/').at(-1))}/-/tree/${branch}`,
  };
  const checkpoint = async () => persist(structuredClone(state));
  const readHead = async () => {
    const result = await git('GET', `${plan.base}/repository/branches/${encodeURIComponent(branch)}`);
    if (result.status === 404) return null;
    if (result.status !== 200 || !result.data?.commit?.id)
      throw Error('GitLab did not confirm the review branch. Retry after checking the helper’s GitLab tab.');
    return result.data.commit;
  };
  let remote = await readHead();
  if (!prior.digest && remote)
    throw Error('A branch from an earlier upload already exists. Open its saved GitLab link and review it before starting a fresh export. It has not been overwritten.');

  // A lost response may mean the commit succeeded. Verify its parent, marker
  // and exact contents before advancing; never blindly repeat a write.
  if (state.pending && remote?.id !== state.head) {
    const { start, end } = state.pending;
    if (!remote) {
      if (state.head) throw Error('The upload branch was removed. Import a fresh export to start again.');
    } else {
      if (remote.parent_ids?.length !== 1 ||
          remote.parent_ids[0] !== (state.head || plan.sha) ||
          remote.message?.trim() !== messageFor(digest, start, end))
        throw Error('The upload branch changed outside this helper. Review it in GitLab; no files were overwritten.');
      for (const action of plan.actions.slice(start, end)) {
        const file = await git('GET', `${plan.base}/repository/files/${encodeURIComponent(action.file_path)}?ref=${remote.id}`);
        if (file.status !== 200 || Buffer.from(file.data.content, 'base64').toString('utf8') !== action.content)
          throw Error('The recovered GitLab commit does not match the reviewed files. Review the branch before continuing.');
      }
      state.head = remote.id;
      state.next = end;
      delete state.pending;
      await checkpoint();
      log(`Recovered upload: ${state.next} / ${plan.actions.length} source files confirmed.`);
    }
  }
  if ((remote?.id || null) !== state.head)
    throw Error('The upload branch changed outside this helper. Review it in GitLab; no files were overwritten.');
  await checkpoint();
  while (state.next < plan.actions.length) {
    const start = state.next;
    let end = state.pending?.end || start + 1;
    if (!state.pending) {
      while (end < plan.actions.length &&
        Buffer.byteLength(JSON.stringify(commitBody(plan, state, start, end + 1))) <= REQUEST_BYTES)
        end++;
    }
    state.pending = { start, end };
    await checkpoint();
    // Recheck between batches; file last_commit_id also protects updates.
    remote = await readHead();
    if ((remote?.id || null) !== state.head)
      throw Error('The upload branch changed while sending files. Review it in GitLab before retrying.');
    const body = commitBody(plan, state, start, end);
    log(`Sending source files ${start + 1}–${end} of ${plan.actions.length} (${Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 1024)} KiB)…`);
    let result;
    try {
      result = await git('POST', `${plan.base}/repository/commits`, body);
    } catch (error) {
      if (error.status === 413 && end - start > 1) {
        state.pending.end = start + Math.ceil((end - start) / 2);
        await checkpoint();
        log('GitLab rejected the request size. Retrying with a smaller file batch…');
        continue;
      }
      if (error.status === 413)
        error.message += ` The individual source file is ${plan.actions[start].file_path}. Remove embedded image/base64 data or split this source file; media belongs in iGEM static uploads.`;
      throw error;
    }
    if (result.status !== 201 || !result.data?.id)
      throw Error('GitLab did not confirm the source commit. Retry to check whether it was received.');
    state.head = result.data.id;
    state.next = end;
    delete state.pending;
    await checkpoint();
  }
  // Reuse a request if the previous response was lost, or creation failed
  // after all commits had already reached GitLab.
  log('Source files confirmed. Checking the GitLab merge request…');
  const requests = await git('GET', `${plan.base}/merge_requests?source_branch=${encodeURIComponent(branch)}&target_branch=main&scope=all&per_page=100`);
  if (requests.status !== 200 || !Array.isArray(requests.data))
    throw Error('GitLab did not return the merge request list. Source is saved on the branch; retry to finish.');
  let mr = requests.data.find((item) => item.source_branch === branch && item.target_branch === 'main');
  if (!mr) {
    const result = await git('POST', `${plan.base}/merge_requests`, {
      source_branch: branch, target_branch: 'main', title: 'Update reGELerate wiki',
      description: 'Updated wiki source and verified iGEM media mappings. Includes a CC BY 4.0 LICENSE for original team wiki source and content; third-party material retains its own licences. Upload guides and Markdown files are excluded.',
      remove_source_branch: true,
    });
    if (result.status !== 201 || !result.data?.web_url)
      throw Error('Source uploaded, but GitLab did not confirm the review request. Retry to finish.');
    mr = result.data;
  }
  state.complete = true;
  state.url = mr.web_url;
  state.message = mr.state === 'merged' ? 'This upload has already been merged in GitLab.'
    : mr.state === 'closed' ? 'This upload’s merge request is closed. Open it in GitLab to review its status.'
      : 'Source uploaded. Review and merge in GitLab to publish.';
  await checkpoint();
  return state;
}
