import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Application } from '../../types';
import { ApplicationCard } from './ApplicationCard';
import { getReviewJobUrls, openJobTabs } from '../utils/job-tabs';
import { useToast } from './Toast';

/** Jobs waiting for the user to review documents and fill their application forms. */
export function ReviewJobsSection({
  applications,
  onPreview,
}: {
  applications: Application[];
  onPreview: (application: Application) => void;
}) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const jobs = applications.filter((app) => ['pending', 'review_required'].includes(app.status));
  const urls = getReviewJobUrls(jobs);

  const handleOpenAll = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const { opened, failed } = await openJobTabs(urls);
      if (failed) {
        toast.warning(
          `Opened ${opened} job tabs. ${failed} could not be opened; use their individual links to retry.`
        );
      } else {
        toast.success(`Opened ${opened} job tabs. Review each form before submitting.`);
      }
    } finally {
      setOpening(false);
    }
  };
  if (jobs.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="review-jobs-title">
      <div>
        <h3 id="review-jobs-title" className="text-sm font-semibold text-(--text-primary)">
          Jobs to review ({jobs.length})
        </h3>
        <p className="text-xs text-(--text-secondary) mt-1">
          Open a job, go to its application form, then use Fill Application in this side panel.
        </p>
      </div>
      <button
        onClick={handleOpenAll}
        disabled={opening || urls.length === 0}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        {opening ? 'Opening jobs…' : `Open all review jobs (${urls.length})`}
      </button>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {jobs.map((application) => (
          <ApplicationCard
            key={application.id ?? application.url}
            application={application}
            onPreview={() => onPreview(application)}
          />
        ))}
      </div>
    </section>
  );
}
