import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const yaml = (name: string) => file(`src/content/${name}.yaml`);
const json = (name: string) => file(`src/content/${name}.json`);

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
      date: z.coerce.date().optional(),
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
  // records.json, books.json and films.json are written by `npm run sync` (scripts/sync.mjs); do not edit by hand.
  records: defineCollection({
    loader: json('records'),
    schema: z.object({
      id: z.string(),
      artist: z.string(),
      title: z.string(),
      label: z.string().optional(),
      catno: z.string().optional(),
      year: z.number().optional(),
      format: z.string(),
      styles: z.array(z.string()),
      url: z.string().url(),
      added: z.string().nullable(),
      cover: z.string().nullable(),
      w: z.number().optional(),
      h: z.number().optional(),
    }),
  }),
  books: defineCollection({
    loader: json('books'),
    schema: z.object({
      id: z.string(),
      title: z.string(),
      author: z.string(),
      shelf: z.enum(['read', 'currently-reading', 'to-read']),
      shelves: z.array(z.string()),
      rating: z.number().min(0).max(5),
      readAt: z.string().optional(),
      added: z.string().nullable(),
      published: z.number().optional(),
      pages: z.number().optional(),
      url: z.string().url(),
      cover: z.string().nullable(),
      w: z.number().optional(),
      h: z.number().optional(),
    }),
  }),  films: defineCollection({
    loader: json('films'),
    schema: z.object({
      id: z.string(),
      title: z.string(),
      year: z.number().optional(),
      rating: z.number().min(0.5).max(5).optional(),
      watched: z.string(),
      rewatch: z.boolean(),
      url: z.string().url(),
      cover: z.string().nullable(),
      w: z.number().optional(),
      h: z.number().optional(),
    }),
  }),
};
