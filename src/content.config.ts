import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const yaml = (name: string) => file(`src/content/${name}.yaml`);

export const collections = {
  publications: defineCollection({
    loader: yaml('publications'),
    schema: z.object({
      id: z.string(),
      title: z.string(),
      authors: z.string(),
      venue: z.string(),
      year: z.number(),
      type: z.enum(['A1', 'B2', 'B3', 'P1']),
      status: z.enum(['published', 'review', 'writing']).default('published'),
      doi: z.string().optional(),
      url: z.string().url().optional(),
      summary: z.string().optional(),
    }),
  }),
  projects: defineCollection({
    loader: yaml('projects'),
    schema: z.object({
      id: z.string(),
      name: z.string(),
      blurb: z.string(),
      year: z.number(),
      repo: z.string().url().optional(),
      url: z.string().url().optional(),
      status: z.enum(['live', 'code', 'private', 'offline']),
      tags: z.array(z.string()).default([]),
    }),
  }),
  mountains: defineCollection({
    loader: yaml('mountains'),
    schema: z.object({
      id: z.string(),
      name: z.string(),
      elevation: z.number(),
      date: z.coerce.date(),
      country: z.string(),
      lat: z.number(),
      lon: z.number(),
      note: z.string().optional(),
    }),
  }),
  gallery: defineCollection({
    loader: yaml('gallery'),
    schema: ({ image }) =>
      z.object({
        id: z.string(),
        order: z.number(),
        title: z.string(),
        image: image(),
        caption: z.string().optional(),
      }),
  }),
};
