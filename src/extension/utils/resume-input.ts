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

