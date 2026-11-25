/** Download and validate the generated PDF before sending any fill request to the page. */
async function preparePdfAttachment(
  filename: string | undefined,
  download: (filename: string) => Promise<Blob>,
  documentName: 'resume' | 'cover letter'
): Promise<{ dataUrl: string; filename: string }> {
  if (!filename)
    throw new Error(
      `No generated ${documentName} is available for this job. Generate it before filling.`
    );
  try {
    const bytes = new Uint8Array(await (await download(filename)).arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
      throw new Error('The downloaded file is not a PDF.');
    }
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return { dataUrl: `data:application/pdf;base64,${btoa(binary)}`, filename };
  } catch {
    throw new Error(
      `Could not download the generated ${documentName}. Generate it again, then retry Fill Application.`
    );
  }
}

/** Prepare a resume for its dedicated file field. */
export async function prepareResumeAttachment(
  filename: string | undefined,
  download: (filename: string) => Promise<Blob>
) {
  const file = await preparePdfAttachment(filename, download, 'resume');
  return { resume: file.dataUrl, resumeFilename: file.filename };
}

/** Prepare a cover letter independently so it cannot be mistaken for a resume. */
export async function prepareCoverLetterAttachment(
  filename: string | undefined,
  download: (filename: string) => Promise<Blob>
) {
  const file = await preparePdfAttachment(filename, download, 'cover letter');
  return { coverLetter: file.dataUrl, coverLetterFilename: file.filename };
}
