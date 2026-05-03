import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconChartLine,
  IconRefreshCw,
  IconShield,
  IconTimer,
  IconTrendingUp,
} from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useNotificationStore } from '@/stores';
import {
  usageApi,
  type SourceOption,
  type UsageBreakdownRow,
  type UsageCredentialRow,
  type UsageEvent,
  type UsageEventsPage,
  type UsageOverview,
  type UsageQueryParams,
  type UsageRange,
  type UsageResultFilter,
  type UsageTimeBucket,
} from '@/services/api/usage';
import styles from './UsagePage.module.scss';

const PAGE_SIZE = 25;
type UsageRangeOption = UsageRange | 'custom';

const emptySummary = {
  request_count: 0,
  success_count: 0,
  failure_count: 0,
  success_rate: 0,
  total_tokens: 0,
  input_tokens: 0,
  output_tokens: 0,
  reasoning_tokens: 0,
  cached_tokens: 0,
  average_latency_ms: 0,
  rpm: 0,
  tpm: 0,
};

const emptyOverview: UsageOverview = {
  summary: emptySummary,
  hourly_series: [],
  daily_series: [],
  models: [],
  providers: [],
  api_keys: [],
  timezone: '',
};

const emptyEvents: UsageEventsPage = {
  events: [],
  total_count: 0,
  page: 1,
  page_size: PAGE_SIZE,
  total_pages: 0,
  models: [],
  providers: [],
  sources: [],
};

const rangeOptions: SelectOption[] = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'custom', label: 'Custom' },
];

const resultOptions: SelectOption[] = [
  { value: '', label: 'usage.all_results' },
  { value: 'success', label: 'usage.success' },
  { value: 'failed', label: 'usage.failed' },
];

const formatCount = (value: number | undefined) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value ?? 0);

const formatCompact = (value: number | undefined) =>
  new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value ?? 0);

const formatPercent = (value: number | undefined) =>
  `${Math.round((value ?? 0) * 1000) / 10}%`;

const formatLatency = (value: number | undefined) => {
  const latency = value ?? 0;
  if (latency >= 1000) return `${(latency / 1000).toFixed(2)}s`;
  return `${Math.round(latency)}ms`;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const displayKey = (value: string) => value || '-';

const toDateTimeLocal = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocal = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

function seriesLabel(bucket: string) {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
  }).format(date);
}

function MiniUsageChart({ series }: { series: UsageTimeBucket[] }) {
  const { t } = useTranslation();
  const chart = useMemo(() => {
    const visible = series.slice(-36);
    const maxRequests = Math.max(...visible.map((item) => item.request_count), 1);
    const maxTokens = Math.max(...visible.map((item) => item.total_tokens), 1);
    const width = 720;
    const height = 220;
    const innerHeight = 150;
    const top = 28;
    const left = 24;
    const right = 24;
    const step = visible.length > 1 ? (width - left - right) / (visible.length - 1) : 1;
    const barWidth = Math.max(4, Math.min(18, step * 0.42));

    const tokenPoints = visible
      .map((item, index) => {
        const x = left + index * step;
        const y = top + innerHeight - (item.total_tokens / maxTokens) * innerHeight;
        return `${x},${y}`;
      })
      .join(' ');

    return { visible, width, height, innerHeight, top, left, step, barWidth, maxRequests, tokenPoints };
  }, [series]);

  if (chart.visible.length === 0) {
    return (
      <div className={styles.chartEmpty}>
        {t('usage.empty_chart', { defaultValue: 'No usage trend data for this range.' })}
      </div>
    );
  }

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label={t('usage.trend_chart', { defaultValue: 'Usage trend chart' })}
      >
        <line x1="24" x2="696" y1="178" y2="178" className={styles.chartAxis} />
        {chart.visible.map((item, index) => {
          const x = chart.left + index * chart.step;
          const barHeight = (item.request_count / chart.maxRequests) * chart.innerHeight;
          return (
            <g key={`${item.bucket}-${index}`}>
              <rect
                x={x - chart.barWidth / 2}
                y={chart.top + chart.innerHeight - barHeight}
                width={chart.barWidth}
                height={Math.max(2, barHeight)}
                rx="3"
                className={styles.requestBar}
              />
              {index === 0 || index === chart.visible.length - 1 ? (
                <text x={x} y="206" textAnchor="middle" className={styles.chartTick}>
                  {seriesLabel(item.bucket)}
                </text>
              ) : null}
            </g>
          );
        })}
        <polyline points={chart.tokenPoints} className={styles.tokenLine} />
      </svg>
      <div className={styles.chartLegend}>
        <span>
          <i className={styles.legendBar} />
          {t('usage.requests', { defaultValue: 'Requests' })}
        </span>
        <span>
          <i className={styles.legendLine} />
          {t('usage.tokens', { defaultValue: 'Tokens' })}
        </span>
      </div>
    </div>
  );
}

function BreakdownTable({ rows, label }: { rows: UsageBreakdownRow[]; label: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{label}</th>
            <th>{t('usage.requests', { defaultValue: 'Requests' })}</th>
            <th>{t('usage.success_rate', { defaultValue: 'Success' })}</th>
            <th>{t('usage.tokens', { defaultValue: 'Tokens' })}</th>
            <th>{t('usage.avg_latency', { defaultValue: 'Avg latency' })}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row) => (
            <tr key={row.key}>
              <td className={styles.primaryCell}>{displayKey(row.display_name || row.key)}</td>
              <td>{formatCount(row.request_count)}</td>
              <td>{formatPercent(row.success_rate)}</td>
              <td>{formatCompact(row.total_tokens)}</td>
              <td>{formatLatency(row.average_latency_ms)}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.emptyCell}>
                {t('usage.no_rows', { defaultValue: 'No rows in this range.' })}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function CredentialsTable({ rows }: { rows: UsageCredentialRow[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('usage.source', { defaultValue: 'Source' })}</th>
            <th>{t('usage.auth_index', { defaultValue: 'Auth index' })}</th>
            <th>{t('usage.auth_type', { defaultValue: 'Auth type' })}</th>
            <th>{t('usage.requests', { defaultValue: 'Requests' })}</th>
            <th>{t('usage.failures', { defaultValue: 'Failures' })}</th>
            <th>{t('usage.tokens', { defaultValue: 'Tokens' })}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={`${row.source_hash}-${row.auth_index}-${row.auth_id_hash}-${row.auth_type}`}>
              <td>
                <div className={styles.identityCell}>
                  <span>{row.source_display || row.source_hash || '-'}</span>
                  {row.auth_id_hash ? <small>{row.auth_id_hash}</small> : null}
                </div>
              </td>
              <td>{row.auth_index || '-'}</td>
              <td>{row.auth_type || '-'}</td>
              <td>{formatCount(row.request_count)}</td>
              <td className={row.failure_count > 0 ? styles.dangerText : undefined}>
                {formatCount(row.failure_count)}
              </td>
              <td>{formatCompact(row.total_tokens)}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className={styles.emptyCell}>
                {t('usage.no_credentials', { defaultValue: 'No credential activity in this range.' })}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function EventsTable({ events }: { events: UsageEvent[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('usage.time', { defaultValue: 'Time' })}</th>
            <th>{t('usage.model', { defaultValue: 'Model' })}</th>
            <th>{t('usage.provider', { defaultValue: 'Provider' })}</th>
            <th>{t('usage.source', { defaultValue: 'Source' })}</th>
            <th>{t('usage.status', { defaultValue: 'Status' })}</th>
            <th>{t('usage.tokens', { defaultValue: 'Tokens' })}</th>
            <th>{t('usage.latency', { defaultValue: 'Latency' })}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id || `${event.request_id}-${event.timestamp}-${event.model}`}>
              <td>{formatDateTime(event.timestamp)}</td>
              <td className={styles.primaryCell}>{displayKey(event.model)}</td>
              <td>{displayKey(event.provider)}</td>
              <td>{event.source_display || event.source_hash || '-'}</td>
              <td>
                <span className={`${styles.statusBadge} ${event.failed ? styles.failed : styles.ok}`}>
                  {event.failed
                    ? t('usage.failed', { defaultValue: 'Failed' })
                    : t('usage.success', { defaultValue: 'Success' })}
                </span>
              </td>
              <td>{formatCompact(event.total_tokens)}</td>
              <td>{formatLatency(event.latency_ms)}</td>
            </tr>
          ))}
          {events.length === 0 ? (
            <tr>
              <td colSpan={7} className={styles.emptyCell}>
                {t('usage.no_events', { defaultValue: 'No request events in this range.' })}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function UsagePage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const [range, setRange] = useState<UsageRangeOption>('24h');
  const [customStart, setCustomStart] = useState(() =>
    toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000))
  );
  const [customEnd, setCustomEnd] = useState(() => toDateTimeLocal(new Date()));
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [sourceHash, setSourceHash] = useState('');
  const [result, setResult] = useState<UsageResultFilter>('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sqliteEnabled, setSQLiteEnabled] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<UsageOverview>(emptyOverview);
  const [eventsPage, setEventsPage] = useState<UsageEventsPage>(emptyEvents);
  const [models, setModels] = useState<UsageBreakdownRow[]>([]);
  const [providers, setProviders] = useState<UsageBreakdownRow[]>([]);
  const [credentials, setCredentials] = useState<UsageCredentialRow[]>([]);
  const [filterOptions, setFilterOptions] = useState<{
    models: string[];
    providers: string[];
    sources: SourceOption[];
  }>({ models: [], providers: [], sources: [] });
  const requestSeqRef = useRef(0);

  const query = useMemo<UsageQueryParams>(
    () => ({
      ...(range === 'custom'
        ? {
            start: toIsoFromLocal(customStart),
            end: toIsoFromLocal(customEnd),
          }
        : { range }),
      model,
      provider,
      source_hash: sourceHash,
      result,
      page,
      page_size: PAGE_SIZE,
    }),
    [customEnd, customStart, model, page, provider, range, result, sourceHash]
  );

  const loadUsage = useCallback(async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    if (connectionStatus !== 'connected') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [enabled, overviewData, analysisData, eventsData, credentialsData, optionsData] =
        await Promise.all([
          usageApi.getSQLiteEnabled(),
          usageApi.getOverview(query),
          usageApi.getAnalysis(query),
          usageApi.getEvents(query),
          usageApi.getCredentials(query),
          usageApi.getFilterOptions(
            range === 'custom'
              ? { start: toIsoFromLocal(customStart), end: toIsoFromLocal(customEnd) }
              : { range }
          ),
        ]);

      if (requestSeqRef.current !== requestSeq) {
        return;
      }

      setSQLiteEnabled(enabled);
      setOverview(overviewData);
      setModels(analysisData.models || []);
      setProviders(analysisData.providers || []);
      setEventsPage(eventsData);
      setCredentials(credentialsData || []);
      setFilterOptions({
        models: optionsData.models || [],
        providers: optionsData.providers || [],
        sources: optionsData.sources || [],
      });
    } catch (err) {
      if (requestSeqRef.current !== requestSeq) {
        return;
      }
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      setError(message);
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [connectionStatus, customEnd, customStart, query, range, t]);

  useHeaderRefresh(loadUsage);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const resetPage = () => setPage(1);

  const modelOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('usage.all_models', { defaultValue: 'All models' }) },
      ...filterOptions.models.map((item) => ({ value: item, label: item })),
    ],
    [filterOptions.models, t]
  );

  const providerOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('usage.all_providers', { defaultValue: 'All providers' }) },
      ...filterOptions.providers.map((item) => ({ value: item, label: item })),
    ],
    [filterOptions.providers, t]
  );

  const sourceOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('usage.all_sources', { defaultValue: 'All sources' }) },
      ...filterOptions.sources.map((item) => ({
        value: item.hash,
        label: item.display || item.hash,
      })),
    ],
    [filterOptions.sources, t]
  );

  const localizedResultOptions = useMemo<SelectOption[]>(
    () =>
      resultOptions.map((item) => ({
        ...item,
        label: t(item.label),
      })),
    [t]
  );

  const localizedRangeOptions = useMemo<SelectOption[]>(
    () =>
      rangeOptions.map((item) => ({
        ...item,
        label: item.value === 'custom' ? t('usage.custom_range') : item.label,
      })),
    [t]
  );

  const series = range === '1h' || range === '24h' ? overview.hourly_series : overview.daily_series;
  const summary = overview.summary || emptySummary;
  const hasUsage = summary.request_count > 0;
  const disableControls = connectionStatus !== 'connected' || loading;
  const totalPages = Math.max(eventsPage.total_pages || 0, 1);

  const updateSQLiteEnabled = async (enabled: boolean) => {
    const previousEnabled = sqliteEnabled;
    setSQLiteEnabled(enabled);
    try {
      await usageApi.setSQLiteEnabled(enabled);
      showNotification(t('usage.toggle_saved', { defaultValue: 'Usage collection setting saved.' }), 'success');
      await loadUsage();
    } catch (err) {
      setSQLiteEnabled(previousEnabled);
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      showNotification(message, 'error');
    }
  };

  return (
    <div className={styles.usagePage}>
      <section className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            {t('usage.eyebrow', { defaultValue: 'SQLite usage dashboard' })}
          </span>
          <h1>{t('usage.title', { defaultValue: 'Usage' })}</h1>
          <p>
            {t('usage.subtitle', {
              defaultValue: 'Inspect request volume, token flow, latency, failures, and credential health.',
            })}
          </p>
        </div>
        <div className={styles.headerActions}>
          <ToggleSwitch
            checked={sqliteEnabled ?? false}
            disabled={sqliteEnabled === null || connectionStatus !== 'connected'}
            onChange={updateSQLiteEnabled}
            label={t('usage.sqlite_enabled', { defaultValue: 'SQLite' })}
          />
          <Button variant="secondary" onClick={loadUsage} loading={loading}>
            <IconRefreshCw size={16} />
            {t('common.refresh')}
          </Button>
        </div>
      </section>

      <Card className={styles.filters}>
        <Select
          value={range}
          options={localizedRangeOptions}
          onChange={(value) => {
            setRange(value as UsageRangeOption);
            resetPage();
          }}
          ariaLabel={t('usage.range', { defaultValue: 'Range' })}
        />
        {range === 'custom' ? (
          <>
            <Input
              type="datetime-local"
              name="usage-start"
              autoComplete="off"
              value={customStart}
              onChange={(event) => {
                setCustomStart(event.target.value);
                resetPage();
              }}
              disabled={disableControls}
              aria-label={t('usage.start_time', { defaultValue: 'Start time' })}
            />
            <Input
              type="datetime-local"
              name="usage-end"
              autoComplete="off"
              value={customEnd}
              onChange={(event) => {
                setCustomEnd(event.target.value);
                resetPage();
              }}
              disabled={disableControls}
              aria-label={t('usage.end_time', { defaultValue: 'End time' })}
            />
          </>
        ) : null}
        <Select
          value={model}
          options={modelOptions}
          onChange={(value) => {
            setModel(value);
            resetPage();
          }}
          disabled={disableControls}
          ariaLabel={t('usage.model', { defaultValue: 'Model' })}
        />
        <Select
          value={provider}
          options={providerOptions}
          onChange={(value) => {
            setProvider(value);
            resetPage();
          }}
          disabled={disableControls}
          ariaLabel={t('usage.provider', { defaultValue: 'Provider' })}
        />
        <Select
          value={sourceHash}
          options={sourceOptions}
          onChange={(value) => {
            setSourceHash(value);
            resetPage();
          }}
          disabled={disableControls}
          ariaLabel={t('usage.source', { defaultValue: 'Source' })}
        />
        <Select
          value={result}
          options={localizedResultOptions}
          onChange={(value) => {
            setResult(value as UsageResultFilter);
            resetPage();
          }}
          disabled={disableControls}
          ariaLabel={t('usage.result', { defaultValue: 'Result' })}
        />
      </Card>

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <section className={styles.statGrid}>
        <Card className={styles.statCard}>
          <IconChartLine size={20} />
          <span>{t('usage.requests', { defaultValue: 'Requests' })}</span>
          <strong>{loading ? '-' : formatCount(summary.request_count)}</strong>
          <small>
            {t('usage.success_failure_short', {
              success: formatCount(summary.success_count),
              failure: formatCount(summary.failure_count),
            })}
          </small>
        </Card>
        <Card className={styles.statCard}>
          <IconTrendingUp size={20} />
          <span>{t('usage.tokens', { defaultValue: 'Tokens' })}</span>
          <strong>{loading ? '-' : formatCompact(summary.total_tokens)}</strong>
          <small>
            {t('usage.input_output_short', {
              input: formatCompact(summary.input_tokens),
              output: formatCompact(summary.output_tokens),
            })}
          </small>
        </Card>
        <Card className={styles.statCard}>
          <IconShield size={20} />
          <span>{t('usage.success_rate', { defaultValue: 'Success rate' })}</span>
          <strong>{loading ? '-' : formatPercent(summary.success_rate)}</strong>
          <small>
            {t('usage.rpm_tpm_short', {
              rpm: formatCompact(summary.rpm),
              tpm: formatCompact(summary.tpm),
            })}
          </small>
        </Card>
        <Card className={styles.statCard}>
          <IconTimer size={20} />
          <span>{t('usage.avg_latency', { defaultValue: 'Avg latency' })}</span>
          <strong>{loading ? '-' : formatLatency(summary.average_latency_ms)}</strong>
          <small>{overview.timezone || '-'}</small>
        </Card>
      </section>

      <Card
        title={t('usage.trend', { defaultValue: 'Trend' })}
        extra={<span className={styles.cardHint}>{range}</span>}
        className={styles.chartCard}
      >
        <MiniUsageChart series={series} />
      </Card>

      {!loading && !hasUsage ? (
        <EmptyState
          title={t('usage.empty_title', { defaultValue: 'No usage recorded yet' })}
          description={t('usage.empty_desc', {
            defaultValue: 'Send traffic through CLIProxyAPI with SQLite usage enabled to populate this page.',
          })}
        />
      ) : null}

      <section className={styles.twoColumn}>
        <Card title={t('usage.models', { defaultValue: 'Models' })}>
          <BreakdownTable rows={models} label={t('usage.model', { defaultValue: 'Model' })} />
        </Card>
        <Card title={t('usage.providers', { defaultValue: 'Providers' })}>
          <BreakdownTable rows={providers} label={t('usage.provider', { defaultValue: 'Provider' })} />
        </Card>
      </section>

      <Card title={t('usage.credentials', { defaultValue: 'Credential health' })}>
        <CredentialsTable rows={credentials} />
      </Card>

      <Card
        title={t('usage.recent_events', { defaultValue: 'Recent requests' })}
        extra={
          <div className={styles.pagination}>
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              {t('common.back')}
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              {t('common.next', { defaultValue: 'Next' })}
            </Button>
          </div>
        }
      >
        <EventsTable events={eventsPage.events} />
      </Card>
    </div>
  );
}
