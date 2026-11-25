import { z } from 'zod';

export const PageJobSourceSchema = z.object({
  url: z
    .string()
    .url()
    .refine((url) => /^https?:\/\//.test(url), 'Use a normal web page.'),
  title: z.string().max(500),
  text: z.string().trim().min(100, 'Open the full job description or paste it below.').max(40_000),
  structuredJob: z
    .object({
      title: z.string().min(1).max(500),
      company: z.string().min(1).max(500),
      description: z.string().min(100).max(40_000),
      location: z.string().max(500).optional(),
    })
    .optional(),
});
export type PageJobSource = z.infer<typeof PageJobSourceSchema>;
