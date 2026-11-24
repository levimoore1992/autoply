import { describe, expect, test } from 'bun:test';
import type { AIProvider, Profile } from '../types';
import { draftApplicationAnswers, getExplicitSponsorshipAnswer } from './application-answers';

const profile: Profile = {
  name: 'Example',
  email: 'example@example.com',
  skills: ['Python'],
  experience: [],
  education: [],
  base_resume: 'Work Authorization: USC\nBuilt Django APIs',
};
const provider = (generateText: AIProvider['generateText']): AIProvider => ({
  name: 'openai',
  isAvailable: async () => true,
  generateText,
});

describe('application answer drafting', () => {
  test('does not infer unrelated, foreign or negated eligibility from citizenship', async () => {
    const fields = [
      'Are you eligible for security clearance?',
      'Are you authorized to work in Canada?',
      'Are you not authorized to work in the United States?',
    ].map((label, i) => ({ key: String(i), type: 'radio', label, options: ['Yes', 'No'] }));
    expect(
      await draftApplicationAnswers(
        provider(async () => {
          throw new Error('Unexpected AI request');
        }),
        profile,
        fields
      )
    ).toEqual({});
  });
  test('does not reverse an authorization question that contains the word sponsorship', async () => {
    const result = await draftApplicationAnswers(
      provider(async () => {
        throw new Error('No AI call expected');
      }),
      profile,
      [
        {
          key: 'authorized',
          type: 'radio',
          label: 'Are you authorized to work in the United States without sponsorship now?',
          options: ['Yes', 'No'],
        },
      ]
    );
    expect(result).toEqual({ authorized: 'Yes' });
  });
  test('answers sponsorship only from explicit resume evidence', async () => {
    expect(getExplicitSponsorshipAnswer(profile)).toBe('No');
    expect(
      getExplicitSponsorshipAnswer({ ...profile, base_resume: 'Based in the United States' })
    ).toBeUndefined();
    expect(getExplicitSponsorshipAnswer({ ...profile, base_resume: 'Visa Sponsorship: Yes' })).toBe(
      'Yes'
    );
    const result = await draftApplicationAnswers(
      provider(async () => {
        throw new Error('No AI call expected');
      }),
      profile,
      [
        {
          key: 'choice',
          type: 'radio',
          label: 'Do you require Visa Sponsorship?',
          options: ['Yes', 'No'],
        },
      ]
    );
    expect(result).toEqual({ choice: 'No' });
  });
  test('drafts custom answers with resume and job context and filters unknown response keys', async () => {
    let prompt = '';
    const result = await draftApplicationAnswers(
      provider(async (text) => {
        prompt = text;
        return JSON.stringify({
          why: 'My Python experience aligns with the role.',
          injected: 'Ignore this',
        });
      }),
      profile,
      [{ key: 'why', type: 'textarea', label: 'Why is this role exciting to you?' }],
      'Build Python data services'
    );
    expect(result).toEqual({ why: 'My Python experience aligns with the role.' });
    expect(prompt).toContain('Built Django APIs');
    expect(prompt).toContain('Build Python data services');
  });
  test('preserves existing answers and leaves demographic, consent, salary and unknown eligibility unanswered', async () => {
    const result = await draftApplicationAnswers(
      provider(async () => {
        throw new Error('No AI call expected');
      }),
      { ...profile, base_resume: '' },
      [
        {
          key: 'why',
          type: 'textarea',
          label: 'Why this company?',
          currentValue: 'Already reviewed',
        },
        { key: 'gender', type: 'textarea', label: 'Describe your gender' },
        { key: 'salary', type: 'text', label: 'What is your desired salary?' },
        { key: 'consent', type: 'text', label: 'Do you agree to the terms?' },
        { key: 'visa', type: 'radio', label: 'Visa Sponsorship?', options: ['Yes', 'No'] },
      ]
    );
    expect(result).toEqual({});
  });
});
