import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { SUPABASE_ROOT_CA } from './supabaseCa';

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
    ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
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
