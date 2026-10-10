'use client';
import { useEffect, useState } from 'react';
import { Folder, Plus, Globe, Check } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { projectFetch, type Projects } from './project-api';

export function StudioProjects({
  current,
  onSwitch,
}: {
  current: string;
  onSwitch: (id: string) => void;
}) {
  const [data, setData] = useState<Projects | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    projectFetch('/api/projects', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error('Could not load projects.');
        setData(await r.json());
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function change() {
    setBusy(true);
    setError('');
    try {
      const response = await projectFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'default', id: current }),
      });
      const result = (await response.json()) as Projects & {
        id: string;
        error?: string;
      };
      if (!response.ok)
        throw Error(result.error || 'Could not update projects.');
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update project.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="studio-projects">
      <div className="studio-projects-heading">
        <span>
          <Folder size={14} /> Project
        </span>
        <button
          aria-label="New project"
          title="New project"
          onClick={() => onSwitch('__library__')}
        >
          <Plus size={15} />
        </button>
      </div>
      <Select
        value={current}
        onValueChange={(v) => {
          if (v && v !== current) onSwitch(v);
        }}
        disabled={busy || !data}
      >
        <SelectTrigger
          className="studio-project-picker"
          aria-label="Current project"
        >
          <SelectValue>
            {data?.projects.find((p) => p.id === current)?.name ||
              'Loading project…'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          className="studio-select-menu"
          align="start"
          alignItemWithTrigger={false}
        >
          {data?.projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.id === data.defaultId ? ' · Default' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        className="studio-default-project"
        disabled={busy || !data || data.defaultId === current}
        onClick={() => void change()}
      >
        {data?.defaultId === current ? (
          <Check size={13} />
        ) : (
          <Globe size={13} />
        )}
        {data?.defaultId === current
          ? 'Displayed at main URL'
          : 'Display at main URL'}
      </button>
      {error && (
        <p role="alert" className="studio-css-error">
          {error}
        </p>
      )}
    </div>
  );
}
