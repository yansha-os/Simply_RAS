import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = `${process.env.DATABASE_URL}`;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString })),
  });

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
