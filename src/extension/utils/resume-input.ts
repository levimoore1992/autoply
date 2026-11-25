/** Rank actual resume attachments above generic "autofill from resume" inputs. */
export function resumeInputPriority(field: {
  name: string;
  id: string;
  label: string;
  context: string;
  accept: string;
}): number {
  const identity = `${field.name} ${field.id}`.toLowerCase();
  const label = field.label.toLowerCase();
  if (/cover.?letter|portfolio|transcript/.test(`${identity} ${label}`)) return -1;
  if (/resume|curriculum|\bcv\b/.test(identity)) return 100;
  if (/^resume\W*$|^cv\W*$|^curriculum vitae\W*$/.test(label)) return 90;
  if (/autofill|auto.fill|parse/.test(`${identity} ${label} ${field.context}`)) return 5;
  if (/resume|curriculum|\bcv\b/.test(`${label} ${field.context}`)) return 60;
  return /pdf|doc/.test(field.accept) ? 10 : -1;
}

/** Match cover-letter inputs explicitly; never use a generic PDF input or a resume input. */
export function coverLetterInputPriority(field: {
  name: string;
  id: string;
  label: string;
  context: string;
  accept: string;
}): number {
  const identity = `${field.name} ${field.id}`;
  if (/resume|curriculum|\bcv\b|portfolio|transcript/i.test(`${identity} ${field.label}`))
    return -1;
  if (/cover[\s_-]*letter/i.test(identity)) return 100;
  if (/cover[\s_-]*letter/i.test(field.label)) return 90;
  return /cover[\s_-]*letter/i.test(field.context) ? 60 : -1;
}

/** Some ATS uploads clear input.files after showing an uploaded filename and Remove/Replace control. */
export function selectedUploadFilename(
  nativeName: string,
  canRemove: boolean,
  visibleLabels: string[]
): string {
  if (nativeName) return nativeName;
  if (!canRemove) return '';
  return (
    visibleLabels
      .map((label) => label.trim())
      .find((label) => label.length <= 255 && /[^\s.,]+\.(?:pdf|docx?|rtf|txt)$/i.test(label)) || ''
  );
}
