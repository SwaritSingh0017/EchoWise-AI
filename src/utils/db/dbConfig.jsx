import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
const sql = neon(
  "postgresql://neondb_owner:npg_C46rWitKUNAp@ep-rough-tree-anddtbqo-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
);
export const db = drizzle(sql, { schema });
