import type { Application, Profile } from '../../types';
import type { DocPreview } from '../components/PreviewModal';

/** Build previews with a generation-time baseline, or a clearly labeled legacy fallback. */
export function getApplicationPreviewDocs(
  application: Application,
  profile: Profile | null
): DocPreview[] {
  const docs: DocPreview[] = [];
  if (application.generated_resume) {
    const hasSnapshot = application.source_resume !== undefined;
    docs.push({
      title: `Resume — ${application.company || 'Application'}`,
      type: 'resume',
      content: application.generated_resume,
      originalContent: hasSnapshot
        ? application.source_resume
        : profile?.id === application.profile_id
          ? profile.base_resume
          : undefined,
      comparisonLabel: hasSnapshot
        ? 'Original resume captured at generation'
        : 'Current base resume (original snapshot unavailable)',
    });
  }
  if (application.generated_cover_letter) {
    docs.push({
      title: `Cover Letter — ${application.company || 'Application'}`,
      type: 'cover-letter',
      content: application.generated_cover_letter,
    });
  }
  return docs;
}
