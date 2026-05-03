import { apiClient } from './client';

export type UsageRange = '1h' | '24h' | '7d' | '30d';
export type UsageResultFilter = '' | 'success' | 'failed';

export interface UsageQueryParams {
  range?: UsageRange;
  start?: string;
  end?: string;
  model?: string;
  provider?: string;
  source_hash?: string;
  auth_index?: string;
  auth_id_hash?: string;
  result?: UsageResultFilter;
  page?: number;
  page_size?: number;
}

export interface UsageSummary {
  request_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  average_latency_ms: number;
  rpm: number;
  tpm: number;
  total_cost?: number;
  cost_available?: boolean;
}

export interface UsageBreakdownRow {
  key: string;
  display_name?: string;
  request_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  average_latency_ms: number;
  total_cost?: number;
  cost_available?: boolean;
}

export interface UsageTimeBucket {
  bucket: string;
  request_count: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_cost?: number;
  cost_available?: boolean;
}

export interface UsageOverview {
  summary: UsageSummary;
  hourly_series: UsageTimeBucket[];
  daily_series: UsageTimeBucket[];
  models: UsageBreakdownRow[];
  providers: UsageBreakdownRow[];
  api_keys: UsageBreakdownRow[];
  range_start?: string;
  range_end?: string;
  timezone: string;
}

export interface UsageEvent {
  id: number;
  request_id: string;
  timestamp: string;
  provider: string;
  model: string;
  endpoint: string;
  api_group_key: string;
  source_display: string;
  source_type?: string;
  source_key?: string;
  source_hash: string;
  auth_index: string;
  auth_id_hash: string;
  auth_type: string;
  failed: boolean;
  status_code: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
  cost_available?: boolean;
  created_at: string;
}

export interface SourceOption {
  display: string;
  hash: string;
  source_type?: string;
  source_key?: string;
}

export interface UsageEventsPage {
  events: UsageEvent[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  models: string[];
  providers: string[];
  sources: SourceOption[];
}

export interface UsageCredentialRow {
  provider?: string;
  source_display: string;
  source_type?: string;
  source_key?: string;
  source_hash: string;
  auth_index: string;
  auth_id_hash: string;
  auth_type: string;
  request_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  average_latency_ms: number;
}

export interface UsageFilterOptions {
  models: string[];
  providers: string[];
  sources: SourceOption[];
}

export interface UsageAnalysis {
  providers: UsageBreakdownRow[];
  models: UsageBreakdownRow[];
}

const emptySummary: UsageSummary = {
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
  total_cost: 0,
  cost_available: false,
};

const buildParams = (params: UsageQueryParams = {}) => {
  const out: Record<string, string | number> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = value;
  });
  return out;
};

const normalizeOverview = (data: UsageOverview): UsageOverview => ({
  ...data,
  summary: data.summary || emptySummary,
  hourly_series: data.hourly_series || [],
  daily_series: data.daily_series || [],
  models: data.models || [],
  providers: data.providers || [],
  api_keys: data.api_keys || [],
  timezone: data.timezone || '',
});

const normalizeAnalysis = (data: UsageAnalysis): UsageAnalysis => ({
  providers: data.providers || [],
  models: data.models || [],
});

const normalizeEventsPage = (data: UsageEventsPage): UsageEventsPage => ({
  ...data,
  events: data.events || [],
  models: data.models || [],
  providers: data.providers || [],
  sources: data.sources || [],
});

const normalizeFilterOptions = (data: UsageFilterOptions): UsageFilterOptions => ({
  models: data.models || [],
  providers: data.providers || [],
  sources: data.sources || [],
});

export const usageApi = {
  getOverview: async (params?: UsageQueryParams) =>
    normalizeOverview(await apiClient.get<UsageOverview>('/usage/overview', { params: buildParams(params) })),

  getAnalysis: async (params?: UsageQueryParams) =>
    normalizeAnalysis(await apiClient.get<UsageAnalysis>('/usage/analysis', { params: buildParams(params) })),

  getEvents: async (params?: UsageQueryParams) =>
    normalizeEventsPage(await apiClient.get<UsageEventsPage>('/usage/events', { params: buildParams(params) })),

  getCredentials: async (params?: UsageQueryParams) =>
    (await apiClient.get<UsageCredentialRow[]>('/usage/credentials', { params: buildParams(params) })) || [],

  getFilterOptions: async (params?: UsageQueryParams) =>
    normalizeFilterOptions(
      await apiClient.get<UsageFilterOptions>('/usage/filter-options', { params: buildParams(params) })
    ),

  async getSQLiteEnabled(): Promise<boolean> {
    const data = await apiClient.get<Record<string, unknown>>('/usage-sqlite-enabled');
    return Boolean(data?.['usage-sqlite-enabled'] ?? data?.usageSQLiteEnabled ?? false);
  },

  setSQLiteEnabled: (enabled: boolean) =>
    apiClient.put('/usage-sqlite-enabled', { value: enabled }),
};
