import { useEffect, useState } from 'react';
import { LoaderCircle, Check, Wrench } from 'lucide-react';
import { activityLabels, type AiActivity } from './ai-request';
export function AssistantActivity({
  events,
  working,
}: {
  events: AiActivity[];
  working: boolean;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!working) return;
    const start = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [working]);
  const latest = events.at(-1);
  const tools = events.filter((event) =>
    ['tool', 'command', 'file', 'search'].includes(event.phase),
  );
  return (
    <div className="studio-ai-activity">
      {working && (
        <output className="studio-ai-live">
          <LoaderCircle size={15} className="studio-ai-spinner" />
          <span>
            {activityLabels[latest?.phase || 'connecting'] || 'Working'}
            <span className="studio-ai-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </span>
          <time aria-label="Elapsed seconds">{seconds}s</time>
        </output>
      )}
      {tools.length > 0 && (
        <details open={working}>
          <summary>
            {tools.length} tool {tools.length === 1 ? 'activity' : 'activities'}
          </summary>
          {tools.map((event, i) => (
            <div className="studio-ai-tool" key={i}>
              <Wrench size={13} />
              <span>{activityLabels[event.phase]}</span>
              {event.state === 'complete' ? (
                <Check size={13} aria-label="Completed" />
              ) : (
                <LoaderCircle
                  size={13}
                  className={working ? 'studio-ai-spinner' : ''}
                />
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
