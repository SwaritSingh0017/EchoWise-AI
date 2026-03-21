export default {
    dialect: "postgresql",
    schema: "./src/utils/db/schema.ts",
    out: "./drizzle",
    dbCredentials: {
      url: "postgresql://neondb_owner:npg_C46rWitKUNAp@ep-rough-tree-anddtbqo-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
      connectionString:
        "postgresql://neondb_owner:npg_C46rWitKUNAp@ep-rough-tree-anddtbqo-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    },
  };
  