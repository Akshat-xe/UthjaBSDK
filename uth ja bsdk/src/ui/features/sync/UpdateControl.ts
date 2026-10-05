type SourceStatus = 'running' | 'success' | 'partial' | 'setup_required' | 'failed';

interface SyncSource {
  status: SourceStatus;
  items?: unknown[];
  error?: string;
  analysisError?: string;
  reviewed?: number;
  harvest?: {
    status?: string;
    totalFound?: number;
    total?: number;
    newCount?: number;
  };
}

interface SyncSnapshot {
  success?: boolean;
  running: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
  sources: Record<string, SyncSource>;
  error?: string;
}

interface MobilePublishStatus {
  status: 'idle' | 'waiting_for_sync' | 'publishing' | 'published' | 'not_configured' | 'failed';
  revision: string | null;
  reason: string | null;
}

const labels: Record<string, string> = {
  newton: 'NST attendance',
  rishiverse: 'RUFP attendance',
  gmail: 'Academic mail',
  radar: 'Opportunity Radar',
};

const order = ['newton', 'rishiverse', 'gmail', 'radar'];
const button = document.querySelector<HTMLButtonElement>('#globalUpdateButton');
const dialog = document.querySelector<HTMLDialogElement>('#globalUpdateDialog');
const title = document.querySelector<HTMLElement>('#globalUpdateTitle');
const summary = document.querySelector<HTMLElement>('#globalUpdateSummary');
const list = document.querySelector<HTMLOListElement>('#globalUpdateSources');
const progress = document.querySelector<HTMLElement>('#globalUpdateProgress');
const updatedAt = document.querySelector<HTMLElement>('#globalUpdatedAt');
const closeButton = document.querySelector<HTMLButtonElement>('#globalUpdateClose');

let current: SyncSnapshot | null = null;
let polling = false;
let starting = false;

function displayTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusText(status?: SourceStatus): string {
  switch (status) {
    case 'running':
      return 'In progress';
    case 'success':
      return 'Done';
    case 'partial':
      return 'Partly updated';
    case 'setup_required':
      return 'Setup needed';
    case 'failed':
      return 'Could not update';
    default:
      return 'Waiting';
  }
}

function sourceMessage(source?: SyncSource): string {
  if (!source) return '';
  if (source.error || source.analysisError) return source.error || source.analysisError || '';
  if (source.harvest) {
    const total = source.harvest.totalFound ?? source.harvest.total;
    if (total != null)
      return `${total} event listings checked · ${source.harvest.newCount || 0} new`;
  }
  if (source.reviewed != null) return `${source.reviewed} event summaries refreshed`;
  return source.status === 'running' ? 'Fetching the latest data' : '';
}

function render(snapshot: SyncSnapshot): void {
  current = snapshot;
  const sources = snapshot.sources || {};
  const entries = order.map((key) => [key, sources[key]] as const);
  const complete = entries.filter(([, source]) => source && source.status !== 'running').length;
  const issues = entries.filter(
    ([, source]) => source && ['partial', 'setup_required', 'failed'].includes(source.status),
  ).length;
  const successful = entries.filter(([, source]) => source?.status === 'success').length;
  const hasIssues = issues > 0;
  if (dialog)
    dialog.dataset.state = snapshot.running
      ? 'running'
      : snapshot.finishedAt
        ? hasIssues
          ? 'partial'
          : 'complete'
        : 'ready';
  const value = snapshot.running
    ? Math.round((complete / order.length) * 100)
    : snapshot.finishedAt
      ? 100
      : 0;

  if (button) {
    button.dataset.running = String(snapshot.running);
    button.setAttribute('aria-busy', String(snapshot.running));
    button.title = snapshot.running
      ? 'View update progress'
      : 'Update attendance, mail, and events';
    button.querySelector('span:last-child')!.textContent = snapshot.running
      ? 'Updating…'
      : 'Update all';
  }
  if (title)
    title.textContent = snapshot.running
      ? 'Your updates are in progress'
      : issues
        ? 'Update finished with a few issues'
        : snapshot.finishedAt
          ? 'Everything is up to date'
          : 'Update your campus data';
  if (summary)
    summary.textContent = snapshot.running
      ? `${complete} of ${order.length} sources finished. You can keep this window open while the others update.`
      : snapshot.finishedAt
        ? `${successful} of ${order.length} sources updated${issues ? ` · ${issues} need attention` : ''}`
        : 'One tap checks attendance, academic mail, and nearby events.';
  if (progress) {
    progress.setAttribute('aria-valuenow', String(value));
    progress.classList.toggle('is-running', snapshot.running);
    progress.querySelector<HTMLElement>('i')!.style.width =
      `${snapshot.running && value === 0 ? 12 : value}%`;
  }
  if (list) {
    list.replaceChildren(
      ...entries.map(([key, source]) => {
        const item = document.createElement('li');
        item.dataset.status = source?.status || 'waiting';
        const name = document.createElement('strong');
        name.textContent = labels[key];
        const state = document.createElement('span');
        state.className = 'update-source-state';
        state.textContent = statusText(source?.status);
        const message = document.createElement('small');
        message.textContent = sourceMessage(source);
        item.append(name, state);
        if (message.textContent) item.append(message);
        return item;
      }),
    );
  }
  if (updatedAt) {
    updatedAt.dataset.base = snapshot.running
      ? `Started ${displayTime(snapshot.startedAt)}`
      : snapshot.finishedAt
        ? `Last updated ${displayTime(snapshot.finishedAt)}`
        : 'No update has run on this device yet.';
    updatedAt.textContent = updatedAt.dataset.base;
  }

  window.dispatchEvent(new CustomEvent('dashboard:sync-status', { detail: snapshot }));
}

function showDialog(): void {
  if (dialog && !dialog.open) dialog.showModal();
}

async function readStatus(): Promise<SyncSnapshot> {
  const response = await fetch('/api/sync/status', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not read update status.');
  return response.json() as Promise<SyncSnapshot>;
}

async function readMobilePublishStatus(): Promise<MobilePublishStatus> {
  const response = await fetch('/api/mobile-publish/status', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not read phone publish status.');
  return response.json() as Promise<MobilePublishStatus>;
}

function renderMobilePublish(status: MobilePublishStatus): void {
  if (!updatedAt) return;
  const label =
    status.status === 'published'
      ? 'Phone snapshot ready'
      : status.status === 'publishing' || status.status === 'waiting_for_sync'
        ? 'Preparing phone snapshot…'
        : status.status === 'failed'
          ? `Phone snapshot failed (${status.reason || 'unknown'})`
          : status.status === 'not_configured'
            ? 'Phone snapshot is not configured'
            : 'No phone snapshot published in this session';
  updatedAt.textContent = `${updatedAt.dataset.base || ''} · ${label}`;
}

async function pollMobilePublish(): Promise<void> {
  try {
    const status = await readMobilePublishStatus();
    renderMobilePublish(status);
    if (status.status === 'publishing' || status.status === 'waiting_for_sync')
      window.setTimeout(() => void pollMobilePublish(), 900);
  } catch {
    if (updatedAt)
      updatedAt.textContent = `${updatedAt.dataset.base || ''} · Phone publish status unavailable`;
  }
}

async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const snapshot = await readStatus();
    const previousFinishedAt = current?.finishedAt;
    render(snapshot);
    if (!snapshot.running) void pollMobilePublish();
    if (snapshot.running) {
      window.setTimeout(() => {
        polling = false;
        void poll();
      }, 850);
      return;
    }
    if (snapshot.finishedAt && snapshot.finishedAt !== previousFinishedAt) {
      window.dispatchEvent(new CustomEvent('dashboard:sync-complete', { detail: snapshot }));
    }
  } catch (error) {
    if (summary)
      summary.textContent =
        error instanceof Error ? error.message : 'Update status is temporarily unavailable.';
  } finally {
    polling = false;
  }
}

async function startUpdate(): Promise<void> {
  showDialog();
  if (current?.running || starting) return;
  starting = true;
  if (button) {
    button.disabled = true;
    button.querySelector('span:last-child')!.textContent = 'Starting…';
  }
  if (summary) summary.textContent = 'Connecting to your local update service…';
  void pollMobilePublish();
  try {
    const response = await fetch('/api/sync', { method: 'POST' });
    if (!response.ok && response.status !== 409) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Could not start the update.');
    }
    await poll();
  } catch (error) {
    if (summary)
      summary.textContent = error instanceof Error ? error.message : 'Could not start the update.';
    if (title) title.textContent = 'Update could not start';
  } finally {
    starting = false;
    if (button) button.disabled = false;
  }
}

button?.addEventListener('click', () => {
  if (current?.running) showDialog();
  else void startUpdate();
});
closeButton?.addEventListener('click', () => dialog?.close());
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

void readStatus()
  .then((snapshot) => {
    render(snapshot);
    void pollMobilePublish();
    if (snapshot.running) {
      showDialog();
      void poll();
    }
  })
  .catch(() => {});
