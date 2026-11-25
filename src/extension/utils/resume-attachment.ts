/** Download and validate the generated PDF before sending any fill request to the page. */
export async function prepareResumeAttachment(
  filename: string | undefined,
  download: (filename: string) => Promise<Blob>
): Promise<{ resume: string; resumeFilename: string }> {
  if (!filename)
    throw new Error('No generated resume is available for this job. Generate it before filling.');
  try {
    const bytes = new Uint8Array(await (await download(filename)).arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
      throw new Error('The downloaded file is not a PDF.');
    }
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return { resume: `data:application/pdf;base64,${btoa(binary)}`, resumeFilename: filename };
  } catch {
    throw new Error(
      'Could not download the generated resume. Generate it again, then retry Fill Application.'
    );
  }
}
