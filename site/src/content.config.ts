import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { gosesLoader } from './loaders/goses';

export const collections = {
  docs: defineCollection({
    loader: gosesLoader(),
    schema: docsSchema(),
  }),
};
