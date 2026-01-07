import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node scripts/seed.js',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
  generate: {
    client: {
      provider: 'prisma-client-js',
      engineType: 'binary', 
    },
  },
})
