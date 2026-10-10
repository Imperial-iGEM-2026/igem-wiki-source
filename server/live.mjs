// Live editor channel (Server-Sent Events): who is on which page, what each
// editor has selected, and a nudge when a saved revision changes. State is
// in memory; the process is a single self-hosted Node server.
const colors = [
  '#e5484d',
  '#f76b15',
  '#0090ff',
  '#30a46c',
  '#8e4ec6',
  '#d6409f',
  '#12a594',
  '#6e56cf',
];
const clientPattern = /^[a-zA-Z0-9-]{8,64}$/;
const maxClientsPerUser = 12;

function colorFor(userId) {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}
function validSelection(selection) {
  return (
    selection === null ||
    (selection &&
      typeof selection === 'object' &&
      typeof selection.layerId === 'string' &&
      /^[a-zA-Z0-9-]{1,90}$/.test(selection.layerId) &&
      typeof selection.selector === 'string' &&
      selection.selector.length <= 400 &&
      (selection.label === undefined ||
        (typeof selection.label === 'string' && selection.label.length <= 120)))
  );
}

export function createLiveHub() {
  const clients = new Map();
  // AI agents connected through an MCP link appear as peers while active.
  const agents = new Map();
  const agentTimeout = 90000;
  const peers = (project) =>
    [...clients.values(), ...agents.values()]
      .filter((client) => client.project === project)
      .map(({ id, userId, name, color, page, selection }) => ({
        id,
        userId,
        name,
        color,
        page,
        selection,
      }));
  function send(client, event, data) {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function broadcast(project, event, data) {
    for (const client of clients.values())
      if (client.project === project) send(client, event, data);
  }
  const announce = (project) =>
    broadcast(project, 'presence', { peers: peers(project) });
  function drop(client) {
    if (clients.get(client.id) !== client) return;
    clients.delete(client.id);
    clearInterval(client.ping);
    announce(client.project);
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const agent of agents.values())
      if (now - agent.seen > agentTimeout) {
        agents.delete(agent.id);
        announce(agent.project);
      }
  }, 30000);
  sweep.unref?.();
  return {
    agent(project, { id, name, page, layerId, label }) {
      agents.set(id, {
        id,
        userId: id,
        name,
        color: '#6e56cf',
        project,
        page,
        seen: Date.now(),
        selection: layerId
          ? {
              layerId,
              selector: `[data-layer-id="${layerId}"]`,
              label: label || '',
            }
          : null,
      });
      announce(project);
    },
    connect(req, res, { project, user, clientId, page }) {
      if (!clientPattern.test(clientId || '')) return false;
      const own = [...clients.values()].filter(
        (client) => client.userId === user.userId && client.id !== clientId,
      );
      if (own.length >= maxClientsPerUser) own[0].res.end();
      const previous = clients.get(clientId);
      if (previous) {
        clients.delete(clientId);
        clearInterval(previous.ping);
        previous.res.end();
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });
      res.write('retry: 3000\n\n');
      const client = {
        id: clientId,
        res,
        project,
        userId: user.userId,
        name: user.displayName,
        color: colorFor(user.userId),
        page: /^[a-z0-9-]{1,100}$/.test(page || '') ? page : '',
        selection: null,
        // Comments keep Nginx (60 s) and Cloudflare (100 s) from idling the stream out.
        ping: setInterval(() => res.write(': ping\n\n'), 20000),
      };
      clients.set(clientId, client);
      send(client, 'hello', { clientId, color: client.color });
      announce(project);
      req.on('close', () => drop(client));
      res.on('error', () => drop(client));
      return true;
    },
    update(project, user, body) {
      const client = clients.get(body?.clientId);
      if (
        !client ||
        client.project !== project ||
        client.userId !== user.userId ||
        typeof body.page !== 'string' ||
        !/^[a-z0-9-]{1,100}$/.test(body.page) ||
        !validSelection(body.selection ?? null)
      )
        return false;
      client.page = body.page;
      client.selection = body.selection
        ? {
            layerId: body.selection.layerId,
            selector: body.selection.selector,
            label: body.selection.label || '',
          }
        : null;
      announce(project);
      return true;
    },
    changed(project, ids, by) {
      broadcast(project, 'revision', {
        ids,
        by: clientPattern.test(by || '') ? by : '',
      });
    },
    closeAll() {
      clearInterval(sweep);
      agents.clear();
      for (const client of clients.values()) {
        clearInterval(client.ping);
        client.res.end();
      }
      clients.clear();
    },
  };
}
