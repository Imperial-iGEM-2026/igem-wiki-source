'use client';
/* oxlint-disable next/no-img-element -- Private attachments use authenticated media URLs, without an image proxy. */
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChatHistory } from './chat-history';
import {
  Sparkles,
  Eye,
  Check,
  Copy,
  Unplug,
  Info,
  SquarePen,
  Search,
} from 'lucide-react';
import {
  AssistantDiff,
  pageDiffFiles,
  selectionDiffFiles,
  assistantConversationKey,
  type DiffFiles,
} from './assistant-diff';
import { uploadMedia } from './upload-media';
import { AssistantComposer, type ChatImage } from './assistant-composer';
import { aiRequest, type AiActivity } from './ai-request';
import { AssistantActivity } from './assistant-activity';
import type { PageContext, PageProposal } from './page-proposal';
import { validateLayout } from './canvas-schema';
import type { DesignTarget } from './studio-target';
import { cssError } from './custom-css';
export type CssLayer = {
  id: string;
  name: string;
  kind: string;
  selectors: string[];
};
export type AssistantRequest = { id: string; text: string; selector: string };
type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  activities?: AiActivity[];
  images?: ChatImage[];
};
const chats = new Map<
  string,
  { id: string; messages: ChatMessage[]; revision: number; owner: string }
>();
function chatOwner(identityKey: string): string {
  try {
    return JSON.parse(identityKey)[0] || identityKey;
  } catch {
    return identityKey;
  }
}
export function CssPanel({
  identityKey = 'local',
  actionsHost,
  diffBefore,
  diffAfter,
  value,
  onChange,
  onEnd,
  disabled,
  page,
  layers,
  enabled,
  onEnabled,
  onPreview,
  previewCss,
  target,
  showCode,
  onShowCode,
  getPageContext,
  pageRevision,
  onPagePreview,
  onPageApply,
  incomingRequest,
  onRequestConsumed,
}: {
  identityKey?: string;
  actionsHost?: HTMLElement | null;
  diffBefore?: DiffFiles;
  diffAfter?: DiffFiles;
  getPageContext?: () => PageContext;
  pageRevision?: string;
  onPagePreview?: (proposal: PageProposal | null) => void;
  onPageApply?: (proposal: PageProposal, context: PageContext) => Promise<void>;
  incomingRequest?: AssistantRequest | null;
  onRequestConsumed?: () => void;
  target: DesignTarget | null;
  showCode: boolean;
  onShowCode: (show: boolean) => void;
  previewCss?: string;
  value: string;
  onChange: (css: string) => void;
  onEnd: () => void;
  disabled: boolean;
  page: string;
  layers: CssLayer[];
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  onPreview: (css: string | undefined) => void;
}) {
  const chatKey = assistantConversationKey(identityKey, page, target?.selector);
  const owner = chatOwner(identityKey);
  const [history, setHistory] = useState<ChatMessage[]>(
    () => chats.get(chatKey)?.messages || [],
  );
  const [conversationId, setConversationId] = useState(
    () => chats.get(chatKey)?.id || crypto.randomUUID(),
  );
  const historyRevision = useRef(chats.get(chatKey)?.revision || 0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [settledHistory, setSettledHistory] = useState<{
    id: string;
    messages: ChatMessage[];
  } | null>(null);
  const savingHistory = Boolean(
    history.length &&
    (settledHistory?.id !== conversationId ||
      settledHistory?.messages !== history),
  );
  const [saveRetry, setSaveRetry] = useState(0);
  const chatLog = useRef<HTMLDivElement>(null);
  const panelRoot = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState(''),
    [effort, setEffort] = useState('medium'),
    [working, setWorking] = useState(false),
    [message, setMessage] = useState('');
  const [activities, setActivities] = useState<AiActivity[]>([]);
  const activityRef = useRef<AiActivity[]>([]);
  const progress = (event: AiActivity) => {
    const previous = activityRef.current;
    const index = previous.findIndex(
      (item) => item.phase === event.phase && item.id === event.id,
    );
    const next = [...previous.filter((_, i) => i !== index), event];
    activityRef.current = next;
    setActivities(next);
  };
  useEffect(() => {
    chatLog.current?.scrollTo(0, chatLog.current.scrollHeight);
  }, [activities]);
  const [images, setImages] = useState<ChatImage[]>([]);
  const [attaching, setAttaching] = useState(false);
  const attachmentBusy = useRef(false);
  async function attach(files: File[]) {
    if (attachmentBusy.current || working || disabled || !codex) return;
    if (
      images.length + files.length > 4 ||
      files.some(
        (file) =>
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          file.size > 5 * 1024 * 1024,
      ) ||
      images.reduce((sum, image) => sum + image.size, 0) +
        files.reduce((sum, file) => sum + file.size, 0) >
        10 * 1024 * 1024
    ) {
      setMessage(
        'Attach up to four PNG, JPEG or WebP images, at most 5 MiB each and 10 MiB combined.',
      );
      return;
    }
    attachmentBusy.current = true;
    setAttaching(true);
    setMessage('');
    try {
      for (const file of files) {
        const uploaded = await uploadMedia(file, () => {});
        setImages((previous) => [
          ...previous,
          { url: uploaded.url, name: file.name, size: file.size },
        ]);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Image upload failed.',
      );
    } finally {
      attachmentBusy.current = false;
      setAttaching(false);
    }
  }
  const [codex, setCodex] = useState(false);
  const [model, setModel] = useState<string>();
  const [statusError, setStatusError] = useState('');
  const [applying, setApplying] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null),
    [proposal, setProposal] = useState<{
      css: string;
      explanation: string;
      before: string;
      pageProposal?: PageProposal;
      context?: PageContext;
      revision?: string;
    } | null>(null);
  const previewing = previewCss !== undefined && previewCss === proposal?.css;
  const controller = useRef<AbortController | null>(null),
    gutter = useRef<HTMLPreElement>(null),
    codeInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    aiRequest<{ enabled: boolean; provider?: string; model?: string }>(
      '/api/ai/status',
      {
        signal: abort.signal,
      },
    )
      .then((data) => {
        if (typeof data.enabled !== 'boolean')
          throw Error(
            'The AI status endpoint returned an invalid configuration response. Check the backend release.',
          );
        setAvailable(data.enabled);
        setStatusError('');
        setCodex(data.provider === 'codex');
        setModel(typeof data.model === 'string' ? data.model : undefined);
        if (data.provider === 'codex') setEffort('medium');
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setAvailable(false);
          setStatusError(
            error instanceof Error
              ? error.message
              : 'Could not check AI status.',
          );
        }
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, []);
  useEffect(
    () => () => {
      onPreview(undefined);
      onPagePreview?.(null);
    },
    [onPreview, onPagePreview],
  );
  useEffect(() => {
    onPreview(undefined);
    onPagePreview?.(null);
  }, [value, pageRevision, onPreview, onPagePreview]);
  const error = cssError(value),
    stale =
      proposal &&
      (proposal.before !== value ||
        (proposal.pageProposal && proposal.revision !== pageRevision));
  async function generate(request = prompt) {
    if (
      disabled ||
      working ||
      attaching ||
      !available ||
      (!request.trim() && !images.length)
    )
      return;
    request = request.trim() || 'What do you notice in these images?';
    const sentImages = images;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setWorking(true);
    activityRef.current = [];
    setActivities([]);
    setMessage('');
    setProposal(null);
    onPreview(undefined);
    onPagePreview?.(null);
    const before = value;
    const context = codex ? { ...getPageContext!(), target } : undefined;
    setHistory(
      (previous) =>
        [
          ...previous,
          { role: 'user', text: request.trim(), images: sentImages },
        ].slice(-100) as ChatMessage[],
    );
    setPrompt('');
    setImages([]);
    try {
      const result = await aiRequest<{
        kind?: 'chat' | 'proposal';
        reply?: string;
        css?: string;
        layout?: PageProposal['layout'];
        fields?: PageProposal['fields'];
        explanation?: string;
      }>(
        codex ? '/api/ai/page' : '/api/ai/css',
        {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: request.trim(),
            ...(codex ? context : { css: value }),
            page,
            layers,
            effort,
            ...(codex ? { images: sentImages } : {}),
            messages: history.slice(-6).map((item) => ({
              role: item.role,
              content: item.text.slice(0, 4000),
            })),
            ...(target ? { target } : {}),
          }),
        },
        codex
          ? (event) => {
              if (!abort.signal.aborted) progress(event);
            }
          : undefined,
      );
      if (abort.signal.aborted) return;
      if (codex && result.kind === 'chat') {
        if (typeof result.reply !== 'string' || !result.reply.trim())
          throw Error('Codex returned an empty chat reply.');
        setHistory(
          (previous) =>
            [
              ...previous,
              {
                role: 'assistant',
                text: result.reply!,
                activities: activityRef.current,
              },
            ].slice(-100) as ChatMessage[],
        );
        return;
      }
      if (
        codex &&
        (!validateLayout(result.layout) || !Array.isArray(result.fields))
      )
        throw Error('Codex returned an invalid page proposal.');
      const resultCss = codex ? result.layout?.customCss || '' : result.css;
      if (typeof resultCss !== 'string' || cssError(resultCss))
        throw Error('The AI response did not contain supported CSS.');
      setHistory(
        (previous) =>
          [
            ...previous,
            {
              role: 'assistant',
              text:
                result.reply ||
                result.explanation ||
                'Your design proposal is ready.',
              activities: activityRef.current,
            },
          ].slice(-100) as ChatMessage[],
      );
      setProposal({
        css: resultCss,
        ...(codex
          ? {
              pageProposal: {
                layout: result.layout!,
                fields: result.fields!,
                explanation: result.explanation || '',
              },
              context,
              revision: pageRevision,
            }
          : {}),
        explanation: result.explanation || '',
        before,
      });
    } catch (error) {
      if (!abort.signal.aborted) {
        setImages(sentImages);
        setPrompt((draft) => draft || request);
        setMessage(
          error instanceof Error ? error.message : 'AI request failed.',
        );
      }
    } finally {
      if (controller.current === abort) setWorking(false);
    }
  }
  const consumed = useRef<string | null>(null);
  function newChat() {
    controller.current?.abort();
    controller.current = null;
    setWorking(false);
    setConversationId(crypto.randomUUID());
    historyRevision.current = 0;
    setHistoryError('');
    setHistory([]);
    setPrompt('');
    setImages([]);
    activityRef.current = [];
    setActivities([]);
    setMessage('');
    setProposal(null);
    onPreview(undefined);
    onPagePreview?.(null);
    onShowCode(false);
    consumed.current = incomingRequest?.id || null;
    onRequestConsumed?.();
    panelRoot.current
      ?.querySelector<HTMLTextAreaElement>(
        '.studio-assistant-composer textarea',
      )
      ?.focus();
  }
  function clearLocalHistory(ids: string[], all: boolean) {
    for (const [key, chat] of chats) {
      if (chat.owner === owner && (all || ids.includes(chat.id)))
        chats.delete(key);
    }
    if (all || ids.includes(conversationId)) newChat();
  }
  const receiveDeletion = useEffectEvent(clearLocalHistory);
  useEffect(() => {
    const revision = ++historyRevision.current;
    chats.set(chatKey, {
      id: conversationId,
      messages: history,
      revision,
      owner,
    });
    if (chats.size > 100) chats.delete(chats.keys().next().value!);
    chatLog.current?.scrollTo(0, chatLog.current.scrollHeight);
    if (!history.length) return;
    let current = true;
    void aiRequest<{ deleted?: boolean }>('/api/ai/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: conversationId,
        revision,
        page,
        target: (target?.label || 'Entire page').slice(0, 240),
        messages: history.map((m) => ({
          role: m.role,
          text: (
            m.text +
            (m.images?.length
              ? '\n' +
                m.images
                  .map((image) => '[Image: ' + image.name + ']')
                  .join('\n')
              : '')
          ).slice(0, 30000),
        })),
      }),
    })
      .then((result) => {
        if (result.deleted) receiveDeletion([conversationId], false);
        if (current) setHistoryError('');
      })
      .catch(() => {
        if (current) setHistoryError('Chat history could not be saved.');
      })
      .finally(() => {
        if (current)
          setSettledHistory({ id: conversationId, messages: history });
      });
    return () => {
      current = false;
    };
  }, [chatKey, history, conversationId, page, target?.label, saveRetry, owner]);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('prion-chat-history');
    channel.onmessage = (event) => {
      const data = event.data;
      if (
        data?.owner === owner &&
        Array.isArray(data.ids) &&
        data.ids.every((id: unknown) => typeof id === 'string')
      )
        receiveDeletion(data.ids, data.all === true);
    };
    return () => channel.close();
  }, [owner]);
  function historyDeleted(ids: string[], all: boolean) {
    clearLocalHistory(ids, all);
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('prion-chat-history');
      channel.postMessage({ owner, ids, all });
      channel.close();
    }
  }
  const receiveRequest = useEffectEvent((request: AssistantRequest) => {
    // An empty selector addresses the whole page (multi-element requests).
    if ((request.selector || undefined) !== target?.selector) {
      onRequestConsumed?.();
      return;
    }
    if (!available || disabled) {
      setPrompt(request.text);
      setMessage(
        !available
          ? ''
          : 'Your draft is in the input. Finish the current edit or unlock the layer to send it.',
      );
    } else {
      void generate(request.text);
    }
    onRequestConsumed?.();
  });
  useEffect(() => {
    if (
      !incomingRequest ||
      available === null ||
      working ||
      consumed.current === incomingRequest.id
    )
      return;
    // Claim before dispatch: rerenders cannot submit the same dock message twice.
    consumed.current = incomingRequest.id;
    receiveRequest(incomingRequest);
  }, [incomingRequest, available, working]);
  return (
    <div className="studio-css-panel" ref={panelRoot}>
      {actionsHost &&
        createPortal(
          <>
            <button
              className="studio-header-code"
              type="button"
              onClick={newChat}
              disabled={
                attaching || applying || savingHistory || Boolean(historyError)
              }
              title="New chat"
            >
              <SquarePen size={15} aria-hidden="true" /> New chat
            </button>
            <button
              className="studio-header-code"
              type="button"
              aria-label="Search chat history"
              title="Search your chats"
              onClick={() => setHistoryOpen(true)}
            >
              <Search size={16} aria-hidden="true" />
            </button>
          </>,
          actionsHost,
        )}
      {historyOpen && (
        <ChatHistory
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          pendingIds={[
            ...new Set([
              conversationId,
              ...[...chats.values()]
                .filter((chat) => chat.owner === owner)
                .map((chat) => chat.id),
            ]),
          ].slice(0, 100)}
          onDeleted={historyDeleted}
        />
      )}
      {historyError && (
        <output className="studio-chat-save-error">
          {historyError}{' '}
          <button onClick={() => setSaveRetry((n) => n + 1)}>Retry</button>
        </output>
      )}
      <div className="studio-assistant-scroll" ref={chatLog} hidden={showCode}>
        <div className="studio-ai-target">
          <span className="studio-ai-kicker">
            <Sparkles size={14} /> Context
          </span>
          <strong>{target?.label || 'Entire page'}</strong>
          <p>
            {target
              ? 'Ask about this element or describe a change.'
              : 'Ask a question, explore an idea, or request a page change.'}
          </p>
        </div>
        <div className="studio-group">
          <div
            className="studio-chat-log"
            role="log"
            aria-label="Design conversation"
            aria-live="polite"
          >
            {!history.length && (
              <p className="studio-chat-empty">
                Say hello, ask a question, or share an idea.
              </p>
            )}
            {history.map((item, index) => (
              <div key={index} className={'studio-chat-message ' + item.role}>
                <strong>
                  {item.role === 'user' ? 'You' : codex ? 'Codex' : 'Luna'}
                </strong>
                {item.activities && (
                  <AssistantActivity events={item.activities} working={false} />
                )}
                {item.images?.length ? (
                  <div className="studio-chat-images">
                    {item.images.map((image) => (
                      <a
                        key={image.url}
                        href={image.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={image.url} alt={image.name} loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}
                <p>{item.text}</p>
              </div>
            ))}
            {working && (
              <div className="studio-chat-message assistant">
                <strong>{codex ? 'Codex' : 'Luna'}</strong>
                <AssistantActivity events={activities} working />
              </div>
            )}
            {proposal && (
              <div className="studio-proposal">
                <h3>Proposed change</h3>

                <details className="studio-advanced">
                  <summary>
                    {proposal.pageProposal
                      ? 'View proposed page changes'
                      : 'View generated CSS'}
                  </summary>
                  <textarea
                    aria-label="Proposed CSS"
                    readOnly
                    value={
                      proposal.pageProposal
                        ? JSON.stringify(proposal.pageProposal, null, 2)
                        : proposal.css
                    }
                    rows={10}
                    spellCheck={false}
                  />
                </details>
                {stale && (
                  <p className="studio-css-error">
                    The page changed after this request. Generate a new proposal
                    to preserve those edits.
                  </p>
                )}
                <div className="studio-actions">
                  <button
                    disabled={disabled || applying || Boolean(stale)}
                    onClick={() => {
                      onEnabled(true);
                      onPreview(previewing ? undefined : proposal.css);
                      onPagePreview?.(
                        previewing ? null : proposal.pageProposal || null,
                      );
                    }}
                  >
                    <Eye size={14} />
                    {previewing ? 'End preview' : 'Preview proposal'}
                  </button>
                  <button
                    className="studio-primary"
                    disabled={
                      disabled ||
                      applying ||
                      Boolean(stale) ||
                      Boolean(proposal.pageProposal && !previewing)
                    }
                    onClick={async () => {
                      if (proposal.pageProposal && proposal.context) {
                        setApplying(true);
                        try {
                          await onPageApply?.(
                            proposal.pageProposal,
                            proposal.context,
                          );
                          onPreview(undefined);
                          onPagePreview?.(null);
                          setProposal(null);
                          setMessage(
                            'Page content, layout and styles saved together.',
                          );
                        } catch (error) {
                          setMessage(
                            error instanceof Error
                              ? error.message
                              : 'Could not apply proposal.',
                          );
                        } finally {
                          setApplying(false);
                        }
                        return;
                      }
                      onPreview(undefined);
                      onChange(proposal.css);
                      onEnd();
                      setProposal(null);
                      setMessage(
                        'Proposal applied to your layout draft. Review it, then save.',
                      );
                    }}
                  >
                    <Check size={14} />
                    {applying
                      ? 'Saving…'
                      : proposal.pageProposal
                        ? 'Apply and save page'
                        : 'Use proposal'}
                  </button>
                  <button
                    disabled={applying}
                    onClick={() => {
                      onPreview(undefined);
                      setProposal(null);
                      onPagePreview?.(null);
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>

          {available === false && (
            <output className="studio-assistant-status">
              <Unplug size={14} aria-hidden="true" />
              <span>
                <strong>AI isn’t connected</strong>
                <span className="studio-status-detail">
                  {statusError ||
                    'An administrator can connect AI in server settings.'}
                </span>
                {prompt.trim() && (
                  <span className="studio-status-detail">
                    Your draft is kept in the input, ready to send once
                    connected.
                  </span>
                )}
              </span>
            </output>
          )}
          {message && (
            <output className="studio-assistant-status">
              <Info size={14} aria-hidden="true" />
              <span>{message}</span>
            </output>
          )}
        </div>
      </div>
      <section
        className="studio-css-page"
        hidden={!showCode}
        aria-label="Advanced CSS"
      >
        <p className="studio-help">
          Style this page’s sections. Rules are scoped to page content and
          included in static export. Inspector values may require{' '}
          <code>!important</code> to override.
        </p>
        <div className="studio-css-heading">
          <strong>Page stylesheet</strong>
          <button aria-pressed={enabled} onClick={() => onEnabled(!enabled)}>
            {enabled ? 'Preview on' : 'Preview off'}
          </button>
        </div>
        {target && (
          <div className="studio-css-selectors studio-selected-selector">
            <strong>Selected element</strong>
            <button
              title="Copy selected element selector"
              onClick={() => {
                navigator.clipboard
                  .writeText(target.selector)
                  .then(() => setMessage('Selector copied.'))
                  .catch(() =>
                    setMessage('Select and copy the selector manually.'),
                  );
              }}
            >
              <code>{target.selector}</code>
              <Copy size={12} />
            </button>
            <button
              disabled={disabled}
              onClick={() => {
                const next =
                  value.trimEnd() +
                  (value.trim() ? '\n\n' : '') +
                  target.selector +
                  ' {\n  \n}\n';
                onChange(next);
                onEnd();
                requestAnimationFrame(() => {
                  codeInput.current?.focus();
                  codeInput.current?.setSelectionRange(
                    next.length - 3,
                    next.length - 3,
                  );
                });
              }}
            >
              Add targeted rule
            </button>
          </div>
        )}
        <div className="studio-code-editor">
          <pre ref={gutter} aria-hidden="true">
            {value
              .split('\n')
              .map((_, i) => i + 1)
              .join('\n')}
          </pre>
          <textarea
            ref={codeInput}
            aria-label="Page CSS code"
            spellCheck={false}
            disabled={disabled}
            value={value}
            placeholder={
              (target?.selector || '.feature h2') + ' {\n  color: #176e51;\n}'
            }
            onChange={(e) => onChange(e.target.value)}
            onBlur={onEnd}
            onScroll={(e) => {
              if (gutter.current)
                gutter.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const input = e.currentTarget,
                  start = input.selectionStart,
                  end = input.selectionEnd;
                onChange(value.slice(0, start) + '  ' + value.slice(end));
                requestAnimationFrame(() => {
                  input.selectionStart = input.selectionEnd = start + 2;
                });
              }
            }}
          />
        </div>
        <p
          className={error ? 'studio-css-error' : 'studio-help'}
          role={error ? 'alert' : undefined}
        >
          {error ||
            `${value.length.toLocaleString()} characters · Save layout to share changes.`}
        </p>
        <details className="studio-css-selectors">
          <summary>Page selectors</summary>
          <code>.page-canvas</code>
          {layers.map((layer) => (
            <div key={layer.id}>
              <strong>{layer.name}</strong>
              {layer.selectors.map((selector) => (
                <button
                  key={selector}
                  title="Copy selector"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(selector)
                      .then(() => setMessage('Selector copied.'))
                      .catch(() =>
                        setMessage('Select and copy the selector manually.'),
                      );
                  }}
                >
                  <code>{selector}</code>
                  <Copy size={12} />
                </button>
              ))}
            </div>
          ))}
        </details>
      </section>
      <div className="studio-assistant-bottom" hidden={showCode}>
        {proposal && !stale && diffAfter ? (
          <AssistantDiff
            label="Proposed changes"
            before={diffAfter}
            after={
              proposal.pageProposal
                ? {
                    ...Object.fromEntries(
                      Object.entries(diffAfter).filter(
                        ([key]) =>
                          key.startsWith('text/') || key.startsWith('site/'),
                      ),
                    ),
                    ...pageDiffFiles(page, proposal.pageProposal.layout, {
                      ...proposal.context?.fields,
                      ...Object.fromEntries(
                        proposal.pageProposal.fields.map((field) => [
                          field.id,
                          { value: field.value },
                        ]),
                      ),
                    }),
                  }
                : { ...diffAfter, 'styles.css': proposal.css }
            }
          />
        ) : diffBefore && diffAfter ? (
          <AssistantDiff
            label={
              target ? 'Changes to selection' : 'Page changes this session'
            }
            before={selectionDiffFiles(diffBefore, target)}
            after={selectionDiffFiles(diffAfter, target)}
          />
        ) : null}

        <AssistantComposer
          model={model}
          images={images}
          onAttach={(files) => void attach(files)}
          onRemoveImage={(url) =>
            setImages((previous) =>
              previous.filter((image) => image.url !== url),
            )
          }
          attaching={attaching}
          prompt={prompt}
          onPromptChange={setPrompt}
          effort={effort}
          onEffortChange={setEffort}
          working={working}
          codex={codex}
          disabled={disabled}
          available={available}
          onSend={() => void generate()}
          onCancel={() => controller.current?.abort()}
        />
        <p className="studio-composer-hint">
          Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}
