import {
  integer,
  varchar,
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  boolean,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const wasteTypeEnum = pgEnum("waste_type_enum", [
  "plastic",
  "organic",
  "metal",
  "mixed",
  "hazard",
]);

export const taskStatusEnum = pgEnum("task_status_enum", [
  "pending",
  "in_progress",
  "completed",
  "verified",
  "expired",
]);

// ─── Users ────────────────────────────────────────────────────────────────────
export const Users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  locationText: varchar("location_text", { length: 255 }),
  // Waste preferences for collectors: comma-separated e.g. "plastic,organic"
  wastePreferences: text("waste_preferences"),
  // Anti-fraud: last report timestamp to enforce cooldown
  lastReportedAt: timestamp("last_reported_at"),
  // Anti-fraud: number of reports in the current rolling window
  reportCountWindow: integer("report_count_window").notNull().default(0),
  reportWindowStart: timestamp("report_window_start"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Reports ──────────────────────────────────────────────────────────────────
export const Reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull(),
  location: text("location").notNull(),
  // Real-time GPS coordinates of the reporter at submission time
  latitude: real("latitude"),
  longitude: real("longitude"),
  wasteType: varchar("waste_type", { length: 255 }).notNull(),
  amount: varchar("amount", { length: 255 }).notNull(),
  imageUrl: text("image_url"),
  // Anti-fraud: SHA-256 hash of the uploaded image to prevent duplicate submissions
  imageHash: varchar("image_hash", { length: 64 }).unique(),
  verificationResult: jsonb("verification_result"),
  status: varchar("status", { length: 255 }).notNull().default("pending"),
  collectorId: integer("collector_id").references(() => Users.id),
  // Collector GPS location when they accepted the task
  collectorLatitude: real("collector_latitude"),
  collectorLongitude: real("collector_longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Auto-expiry for stale tasks
  expiresAt: timestamp("expires_at"),
});

// ─── Rewards ─────────────────────────────────────────────────────────────────
export const Rewards = pgTable("rewards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull(),
  points: integer("points").notNull().default(0),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  description: text("description"),
  name: varchar("name", { length: 255 }).notNull(),
  collectionInfo: text("collection_info").notNull(),
});

// ─── CollectedWastes ──────────────────────────────────────────────────────────
export const CollectedWastes = pgTable("collected_wastes", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .references(() => Reports.id)
    .notNull(),
  collectorId: integer("collector_id")
    .references(() => Users.id)
    .notNull(),
  collectionDate: timestamp("collection_date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("collected"),
  // Collector rating from reporter (1–5 stars)
  rating: integer("rating"),
  ratingComment: text("rating_comment"),
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const Notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Transactions ─────────────────────────────────────────────────────────────
export const Transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'earned_report' | 'earned_collect' | 'redeemed'
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  date: timestamp("date").defaultNow().notNull(),
});

// ─── CollectorLocations (real-time) ───────────────────────────────────────────
// Upserted by the collector's browser to track live position
export const CollectorLocations = pgTable("collector_locations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull()
    .unique(), // one row per collector, upserted
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Community Posts ──────────────────────────────────────────────────────────
export const Posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull(),
  content: text("content").notNull(),
  // Optional: link to a report this post is about
  reportId: integer("report_id").references(() => Reports.id),
  likesCount: integer("likes_count").notNull().default(0),
  repliesCount: integer("replies_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Post Likes ───────────────────────────────────────────────────────────────
export const PostLikes = pgTable("post_likes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .references(() => Posts.id)
    .notNull(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Post Replies ─────────────────────────────────────────────────────────────
export const PostReplies = pgTable("post_replies", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .references(() => Posts.id)
    .notNull(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull(),
  // Nested replies: parentReplyId points to another PostReply row
  parentReplyId: integer("parent_reply_id"), // self-reference added via migration
  content: text("content").notNull(),
  likesCount: integer("likes_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Anti-fraud: Submitted image hashes ───────────────────────────────────────
// Separate table for fast deduplication queries across all users
export const ImageHashes = pgTable("image_hashes", {
  id: serial("id").primaryKey(),
  hash: varchar("hash", { length: 64 }).notNull().unique(),
  userId: integer("user_id")
    .references(() => Users.id)
    .notNull(),
  reportId: integer("report_id").references(() => Reports.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});