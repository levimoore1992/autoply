import React from 'react';
import type { Application } from '../../types';
import { ApplicationCard } from './ApplicationCard';

/** Jobs waiting for the user to review documents and fill their application forms. */
export function ReviewJobsSection({
  applications,
  onPreview,
}: {
  applications: Application[];
  onPreview: (application: Application) => void;
}) {
  const jobs = applications.filter((app) => ['pending', 'review_required'].includes(app.status));
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
