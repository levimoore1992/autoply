import { describe, expect, test } from 'bun:test';
import type { AIProvider, Profile, JobData } from '../types';
import { generateQualifications, insertQualifications } from './qualifications';
import { tailorResume } from './resume';

const profile: Profile = {
  name: 'Example',
  email: 'example@example.com',
  skills: ['Python'],
  experience: [],
  education: [],
  base_resume: 'Built Django APIs at Acme. Operated services on AWS.',
};
const job: JobData = {
  url: 'https://example.com/job',
  platform: 'generic',
  title: 'Engineer',
  company: 'Example',
  description: 'Build Python backend services. Deploy to AWS. Production RAG experience required.',
  requirements: [],
  qualifications: [],
  form_fields: [],
  custom_questions: [],
};
const matches = [
  {
    keyword: 'Python',
    requirementId: 'r0',
    evidenceId: 'e0',
    match: 'Built Django APIs at Acme, applying Python backend experience to service development.',
  },
  {
    keyword: 'AWS',
    requirementId: 'r0',
    evidenceId: 'e0',
    match: 'Operated services on AWS, matching the cloud deployment requirement.',
  },
];
const provider = (generateText: AIProvider['generateText']): AIProvider => ({
  name: 'openai',
  isAvailable: async () => true,
  generateText,
});

describe('resume qualifications', () => {
  test('uses the full description when the scraper has no separate requirements array', async () => {
    let prompt = '';
    const section = await generateQualifications(
      provider(async (text) => {
        prompt = text;
        return JSON.stringify({ matches });
      }),
      profile,
      job
    );
    expect(prompt).toContain('Production RAG experience required');
    expect(section).toContain('**Qualifications**');
    expect(section).toContain('Python: Built Django APIs at Acme');
    expect(section).toContain('AWS: Operated services on AWS');
  });
  test('filters fabricated evidence, unlisted keywords, and duplicate matches', async () => {
    const section = await generateQualifications(
      provider(async () =>
        JSON.stringify({
          matches: [
            matches[0],
            matches[0],
            { ...matches[1], evidenceId: 'invented-evidence', match: 'Invented 90% improvement' },
            { ...matches[1], keyword: 'Kubernetes' },
          ],
        })
      ),
      profile,
      job
    );
    expect(section.match(/^- /gm)).toHaveLength(1);
    expect(section).not.toContain('90%');
    expect(section).not.toContain('Kubernetes');
  });
  test('does not invent matches when the listing or supporting evidence is absent', async () => {
    const noCall = provider(async () => {
      throw new Error('Unexpected AI request');
    });
    expect(await generateQualifications(noCall, profile, { ...job, description: '' })).toContain(
      'No profile-backed matches'
    );
    expect(
      await generateQualifications(
        provider(async () => '{"matches":[]}'),
        profile,
        job
      )
    ).toContain('No profile-backed matches');
  });
  test('emits one section in the final resume, before Experience, including alternate headings', async () => {
    for (const heading of ['**Experience**', '## Professional Experience']) {
      const result = insertQualifications(
        `**Name**\n\n**Qualifications**\n- Generic old text\n\n${heading}\nActual work`,
        '**Qualifications**\n- Python: API experience.'
      );
      expect(result.match(/Qualifications/g)).toHaveLength(1);
      expect(result.indexOf('Python:')).toBeLessThan(result.indexOf(heading));
      expect(result).toContain('Actual work');
      expect(result).not.toContain('Generic old text');
    }
    const responses = [
      JSON.stringify({ matches }),
      '**Example**\n\n**Skills**\nPython\n\n**Experience**\nWork\n\n**Education**\nDegree',
    ];
    const result = await tailorResume(
      provider(async () => {
        const response = responses.shift();
        if (!response) throw new Error('Unexpected AI call');
        return response;
      }),
      profile,
      job
    );
    expect(result).toContain('Python: Built Django APIs at Acme');
    expect(result.indexOf('Qualifications')).toBeLessThan(result.indexOf('**Experience**'));
  });
});
