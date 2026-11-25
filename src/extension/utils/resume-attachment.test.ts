import { describe, expect, test } from 'bun:test';
import { prepareResumeAttachment } from './resume-attachment';

describe('resume delivery to the form', () => {
  test('preserves the filename and exact PDF bytes, including files larger than the encoding chunk', async () => {
    const bytes = new Uint8Array(90_000).fill(137);
    bytes.set(new TextEncoder().encode('%PDF-1.7'));
    const result = await prepareResumeAttachment(
      'Levi_Attentive_resume.pdf',
      async () => new Blob([bytes])
    );
    expect(result.resumeFilename).toBe('Levi_Attentive_resume.pdf');
    expect(new Uint8Array(Buffer.from(result.resume.split(',')[1], 'base64'))).toEqual(bytes);
  });
  test('stops instead of silently filling with no resume when download fails or the PDF expired', async () => {
    await expect(
      prepareResumeAttachment('resume.pdf', async () => {
        throw new Error('404');
      })
    ).rejects.toThrow('Generate it again');
    await expect(
      prepareResumeAttachment('resume.pdf', async () => new Blob(['Not found']))
    ).rejects.toThrow('Could not download');
    await expect(prepareResumeAttachment(undefined, async () => new Blob())).rejects.toThrow(
      'No generated resume'
    );
  });
});
