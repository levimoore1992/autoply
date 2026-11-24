import React from 'react';
import { create } from 'zustand';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink } from 'lucide-react';
import { apiFetchJson } from '../utils/api-config';
import { queryKeys } from '../hooks/queries';
import { useToast } from './Toast';
import type { DiscoveryResult } from '../../types/discovery';

// Preserve search and selection while navigating between extension sections.
const useSearch = create<{
  searchedFor: string;
  query: string;
  region: 'us' | 'all';
  result?: DiscoveryResult;
  selected: string[];
  update: (
    changes: Partial<{
      searchedFor: string;
      query: string;
      region: 'us' | 'all';
      result: DiscoveryResult;
      selected: string[];
    }>
  ) => void;
}>((set) => ({
  searchedFor: '',
  query: 'software engineer',
  region: 'us',
  selected: [],
  update: (changes) => set(changes),
}));

/** Discover public remote listings and queue only the user's selected jobs. */
export function JobSearchSection() {
  const { query, region, result, selected, update, searchedFor } = useSearch();
  const client = useQueryClient();
  const toast = useToast();
  const search = useMutation({
    mutationFn: () =>
      apiFetchJson<DiscoveryResult>('/jobs/discover', {
        method: 'POST',
        body: JSON.stringify({ query, region }),
      }),
    onSuccess: (data) => {
      update({ result: data, selected: [], searchedFor: query });
    },
  });
  const add = useMutation({
    mutationFn: () =>
      apiFetchJson<{ added: number; skipped: number }>('/jobs/discover/add', {
        method: 'POST',
        body: JSON.stringify({ ids: selected }),
      }),
    onSuccess: (data) => {
      const current = useSearch.getState();
      update({
        selected: [],
        result: current.result && {
          ...current.result,
          jobs: current.result.jobs.filter((job) => !selected.includes(job.id)),
        },
      });
      void client.invalidateQueries({ queryKey: queryKeys.applications });
      toast.success(
        `${data.added} jobs added to review.${data.skipped ? ` ${data.skipped} already tracked.` : ''}`
      );
    },
  });
  const busy = search.isPending || add.isPending;
  const error = search.error || add.error;
  return (
    <section
      aria-labelledby="job-search-heading"
      className="rounded-xl border border-(--border-default) bg-(--bg-secondary) p-4 space-y-3"
    >
      <h3 id="job-search-heading" className="text-sm font-semibold text-(--text-primary)">
        Find remote jobs
      </h3>
      <p className="text-xs text-(--text-secondary)">
        Search real listings from{' '}
        <a
          href="https://jobicy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-300 underline"
        >
          Jobicy
        </a>
        ’s free feed. Select jobs to review before applying.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add.reset();
          search.mutate();
        }}
        className="space-y-2"
      >
        <label className="block text-xs text-(--text-secondary)">
          Job title or keywords
          <input
            value={query}
            onChange={(event) => update({ query: event.target.value })}
            required
            minLength={2}
            maxLength={120}
            disabled={busy}
            placeholder="e.g. backend engineer"
            className="mt-1 block w-full rounded-lg border border-(--border-default) bg-(--bg-primary) px-3 py-2 text-sm text-(--text-primary)"
          />
        </label>
        <label className="block text-xs text-(--text-secondary)">
          Remote location eligibility
          <select
            value={region}
            onChange={(event) => update({ region: event.target.value as 'us' | 'all' })}
            disabled={busy}
            className="mt-1 block w-full rounded-lg border border-(--border-default) bg-(--bg-primary) px-3 py-2 text-sm text-(--text-primary)"
          >
            <option value="us">US eligible or worldwide</option>
            <option value="all">All locations (check restrictions)</option>
          </select>
        </label>
        <button
          disabled={busy || query.trim().length < 2}
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <Search aria-hidden="true" size={15} />
          {search.isPending ? 'Searching…' : 'Find jobs'}
        </button>
      </form>
      <p className="text-xs text-(--text-secondary)">
        Latest 100 feed listings, refreshed hourly. Limited coverage; no salary filter. Title
        keywords match locally. All employment types included.
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error.message}
        </p>
      )}
      {result && (
        <div aria-live="polite" className="space-y-3">
          <p className="text-xs text-(--text-secondary)">
            {result.jobs.length} matches{searchedFor ? ` for “${searchedFor}”` : ''} from{' '}
            {result.total} listings. Feed updated {new Date(result.fetchedAt).toLocaleString()}.
          </p>
          {result.stale && (
            <p role="status" className="text-xs text-amber-300">
              Feed refresh failed. Showing cached listings; some may have closed.
            </p>
          )}
          {!result.jobs.length && (
            <p className="text-xs text-(--text-secondary)">
              No untracked matches in this feed. Try fewer keywords or another job title.
            </p>
          )}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {result.jobs.map((job) => (
              <article
                key={job.id}
                className="rounded-lg border border-(--border-default) p-3 space-y-1"
              >
                <label className="flex gap-2 items-start text-sm text-(--text-primary)">
                  <input
                    type="checkbox"
                    checked={selected.includes(job.id)}
                    disabled={busy}
                    className="mt-1"
                    onChange={(event) =>
                      update({
                        selected: event.target.checked
                          ? [...selected, job.id]
                          : selected.filter((id) => id !== job.id),
                      })
                    }
                  />
                  <span>
                    <span className="font-semibold">{job.title}</span>
                    <span className="block text-xs text-(--text-secondary)">
                      {job.company} · {job.location} · {job.jobType.join(', ')}
                    </span>
                  </span>
                </label>
                <p className="text-xs text-(--text-secondary)">
                  Title matches: {job.matchedKeywords?.join(', ')}. Posted{' '}
                  {job.publishedAt.slice(0, 10)}.
                </p>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-300 underline"
                >
                  Open listing <ExternalLink size={12} aria-hidden="true" />
                </a>
                <details className="text-xs text-(--text-secondary)">
                  <summary className="cursor-pointer">Listing details</summary>
                  <p className="mt-2 whitespace-pre-wrap">{job.description}</p>
                </details>
              </article>
            ))}
          </div>
          {result.jobs.length > 0 && (
            <button
              onClick={() => {
                search.reset();
                add.mutate();
              }}
              disabled={busy || !selected.length}
              className="w-full rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 disabled:opacity-50"
            >
              {add.isPending ? 'Adding…' : `Add selected to review (${selected.length})`}
            </button>
          )}
          <p className="text-xs text-(--text-secondary)">
            Open the listing, then follow its employer application link before using Fill
            Application. Nothing is submitted automatically.
          </p>
        </div>
      )}
    </section>
  );
}
