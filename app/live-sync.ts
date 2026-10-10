'use client';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { projectFetch } from './project-api';

export type LiveSelection = {
  layerId: string;
  selector: string;
  label?: string;
} | null;
export type LivePeer = {
  id: string;
  userId: string;
  name: string;
  color: string;
  page: string;
  selection: LiveSelection;
};

/** Live editor channel: teammates' pages and selections, plus instant save notifications. */
export function useLiveChannel({
  enabled,
  projectId,
  page,
  onRevision,
}: {
  enabled: boolean;
  projectId?: string;
  page: string;
  onRevision: () => void;
}) {
  const [clientId] = useState(() =>
    typeof crypto === 'undefined' ? '' : crypto.randomUUID(),
  );
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [connected, setConnected] = useState(false);
  const state = useRef<{ page: string; selection: LiveSelection }>({
    page,
    selection: null,
  });
  const revision = useRef(onRevision);
  useLayoutEffect(() => {
    revision.current = onRevision;
  }, [onRevision]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const publish = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      projectFetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...state.current }),
      }).catch(() => {});
    }, 120);
  }, [clientId]);
  useEffect(() => {
    if (!enabled || !clientId || typeof EventSource === 'undefined') return;
    const params = new URLSearchParams({ clientId, page: state.current.page });
    if (projectId) params.set('project', projectId);
    const source = new EventSource('/api/live?' + params);
    source.addEventListener('hello', () => {
      setConnected(true);
      publish();
      // Catch up on anything saved while the stream was reconnecting.
      revision.current();
    });
    source.addEventListener('presence', (event) => {
      const { peers } = JSON.parse((event as MessageEvent).data) as {
        peers: LivePeer[];
      };
      setPeers(peers.filter((peer) => peer.id !== clientId));
    });
    source.addEventListener('revision', (event) => {
      const { by } = JSON.parse((event as MessageEvent).data) as { by: string };
      if (by !== clientId) revision.current();
    });
    source.onerror = () => setConnected(false);
    return () => {
      source.close();
      clearTimeout(timer.current);
      setConnected(false);
      setPeers([]);
    };
  }, [enabled, projectId, clientId, publish]);
  const setSelection = useCallback(
    (page: string, selection: LiveSelection) => {
      const previous = state.current;
      if (
        previous.page === page &&
        previous.selection?.selector === selection?.selector &&
        previous.selection?.label === selection?.label
      )
        return;
      state.current = { page, selection };
      publish();
    },
    [publish],
  );
  return { clientId, peers, connected, setSelection };
}
