'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, MessageSquare, Search, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { aiRequest } from './ai-request';
type Summary = {
  id: string;
  page: string;
  target: string;
  title: string;
  updated: number;
  projectName?: string;
  excerpt: string;
};
type Transcript = Summary & { messages: { role: string; text: string }[] };
export function ChatHistory({
  open,
  onOpenChange,
  pendingIds,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingIds: string[];
  onDeleted: (ids: string[], all: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [confirmation, setConfirmation] = useState<'delete' | 'clear' | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const requestKey = JSON.stringify([query, selected, refresh]);
  const [loadedKey, setLoadedKey] = useState('');
  const loading = requestKey !== loadedKey;
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () => {
        setError('');
        void (
          selected
            ? aiRequest<Transcript>(
                '/api/ai/chats?id=' + encodeURIComponent(selected),
                { signal: abort.signal },
              ).then((data) => {
                if (!abort.signal.aborted) setTranscript(data);
              })
            : aiRequest<{ chats: Summary[] }>(
                '/api/ai/chats?q=' + encodeURIComponent(query),
                { signal: abort.signal },
              ).then((data) => {
                if (!abort.signal.aborted) setResults(data.chats);
              })
        )
          .catch((e) => {
            if (!abort.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!abort.signal.aborted) setLoadedKey(requestKey);
          });
      },
      selected ? 0 : 180,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [open, query, selected, requestKey]);
  async function removeHistory() {
    if (!confirmation || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await aiRequest<{ deletedIds: string[] }>(
        '/api/ai/chats',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            confirmation === 'clear'
              ? { action: 'clear', pendingIds }
              : { action: 'delete', id: selected },
          ),
        },
      );
      onDeleted(result.deletedIds, confirmation === 'clear');
      setNotice(
        confirmation === 'clear'
          ? 'Your chat history has been cleared.'
          : 'Conversation deleted.',
      );
      setConfirmation(null);
      setSelected(null);
      setTranscript(null);
      setResults([]);
      setRefresh((value) => value + 1);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Could not delete chat history. Try again.',
      );
    } finally {
      setDeleting(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) onOpenChange(next);
      }}
    >
      <DialogContent
        className="studio-chat-history"
        showCloseButton={!deleting}
      >
        <DialogTitle>
          {confirmation
            ? confirmation === 'clear'
              ? 'Clear all your chat history?'
              : 'Delete this conversation?'
            : selected
              ? 'Saved conversation'
              : 'Search your chats'}
        </DialogTitle>
        <DialogDescription>
          {confirmation
            ? confirmation === 'clear'
              ? 'This permanently deletes your saved conversations across all projects. Other users’ chats and your page edits are kept.'
              : 'This permanently deletes this conversation from your history. Your page edits are kept.'
            : 'Only your chats are shown, across your projects. Saved conversations are read-only.'}
        </DialogDescription>
        {confirmation ? (
          <>
            {deleteError && <p role="alert">{deleteError}</p>}
            <div className="chat-history-confirm-actions">
              <button
                disabled={deleting}
                onClick={() => {
                  setConfirmation(null);
                  setDeleteError('');
                }}
              >
                Cancel
              </button>
              <button
                className="chat-history-danger"
                disabled={deleting}
                onClick={() => void removeHistory()}
              >
                <Trash2 size={15} />
                {deleting
                  ? 'Deleting…'
                  : confirmation === 'clear'
                    ? 'Clear all history'
                    : 'Delete conversation'}
              </button>
            </div>
          </>
        ) : (
          <>
            {notice && (
              <output className="chat-history-notice">{notice}</output>
            )}
            {selected ? (
              <button
                className="chat-history-back"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft size={15} /> Back to results
              </button>
            ) : (
              <label className="chat-history-search">
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label="Search chat history"
                  placeholder="Search messages…"
                  maxLength={200}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}
            <div className="chat-history-results" aria-busy={loading}>
              {loading ? (
                <output>Loading your chats…</output>
              ) : error ? (
                <p role="alert">{error}</p>
              ) : selected ? (
                <>
                  <h3>{transcript?.title}</h3>
                  <small>
                    {transcript?.page} · {transcript?.target}
                  </small>
                  {transcript?.messages.map((m, i) => (
                    <div key={i} className={'chat-history-message ' + m.role}>
                      <strong>{m.role === 'user' ? 'You' : 'Assistant'}</strong>
                      <p>{m.text}</p>
                    </div>
                  ))}
                </>
              ) : results.length ? (
                results.map((chat) => (
                  <button
                    className="chat-history-result"
                    key={chat.id}
                    onClick={() => setSelected(chat.id)}
                  >
                    <MessageSquare size={17} aria-hidden="true" />
                    <span>
                      <strong>{chat.title}</strong>
                      <small>
                        {chat.projectName || 'Project'} · {chat.page} ·{' '}
                        {new Date(chat.updated).toLocaleDateString()}
                      </small>
                      <p>{chat.excerpt}</p>
                    </span>
                  </button>
                ))
              ) : (
                <p>
                  {query
                    ? 'No chats match your search.'
                    : 'Your conversations will appear here after you send a message.'}
                </p>
              )}
            </div>
            <div className="chat-history-footer">
              <button
                className="chat-history-delete"
                disabled={loading || Boolean(error)}
                onClick={() => {
                  setDeleteError('');
                  setConfirmation(selected ? 'delete' : 'clear');
                }}
              >
                <Trash2 size={15} aria-hidden="true" />{' '}
                {selected ? 'Delete conversation' : 'Clear all history'}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
