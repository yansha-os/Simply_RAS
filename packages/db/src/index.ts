import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

function createPrismaClient() {
  const pool = new Pool({
    connectionString,
    // CRM and HRM run as separate services. Five clients each bounds the total
    // application-side demand while Supavisor multiplexes transaction traffic.
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    maxLifetimeSeconds: 300,
    query_timeout: 30_000,
    // Supabase's shared pooler currently presents a self-signed chain. Requiring
    // TLS still prevents plaintext PHI transport; certificate verification can be
    // enabled after the project CA is installed in each Render service.
    ssl: { rejectUnauthorized: false },
  });

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type {
  CaseApplicationStatus,
  ClaimOutcome,
  Client,
  ClientMessage,
  DocumentType,
  DualRunMode,
  IntakePacket,
  PARequest,
  Prisma,
  Role,
  User,
} from '@prisma/client';
export * from './devStudioSeed';
