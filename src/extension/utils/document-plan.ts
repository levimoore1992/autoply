export interface DocumentField {
  type: string;
  key: string;
  label: string;
  currentValue?: string;
}

/** Queue missing document uploads without replacing files the user already attached. */
export function planDocumentAttachments(
  fields: DocumentField[],
  generated?: { resume?: string; coverLetter?: string } | null
): { resume: boolean; coverLetter: boolean; generate?: 'resume' | 'cover-letter' | 'both' } {
  const uploads = fields.filter((field) => field.type === 'file');
  const resumeFields = uploads.filter(
    (field) =>
      /resume|curriculum|\bcv\b/i.test(`${field.key} ${field.label}`) &&
      !/autofill/i.test(`${field.key} ${field.label}`)
  );
  const coverFields = uploads.filter((field) =>
    /cover[\s_-]*letter/i.test(`${field.key} ${field.label}`)
  );
  const resume = !resumeFields.some((field) => field.currentValue?.trim());
  const coverLetter =
    coverFields.length > 0 && !coverFields.some((field) => field.currentValue?.trim());
  const generateResume = resume && !generated?.resume;
  const generateCover = coverLetter && !generated?.coverLetter;
  return {
    resume,
    coverLetter,
    generate:
      generateResume && generateCover
        ? 'both'
        : generateResume
          ? 'resume'
          : generateCover
            ? 'cover-letter'
            : undefined,
  };
}
