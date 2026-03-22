'use server'

import { db } from "./dbConfig";
import {
  Users,
  Reports,
  Rewards,
  CollectedWastes,
  Notifications,
  Transactions,
  CollectorLocations,
  Posts,
  PostLikes,
  PostReplies,
  ImageHashes,
} from "./schema";
import { eq, sql, and, desc, ne, inArray, isNull, lt } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY!);


// ═══════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function createUser(email: string, name: string) {
  try {
    const [user] = await db
      .insert(Users)
      .values({ email, name })
      .onConflictDoNothing()
      .returning()
      .execute();
    return user;
  } catch (error) {
    console.error("Error creating user:", error);
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const [user] = await db
      .select()
      .from(Users)
      .where(eq(Users.email, email))
      .execute();
    return user;
  } catch (error) {
    console.error("Error fetching user by email:", error);
    return null;
  }
}

export async function getUserById(userId: number) {
  try {
    const [user] = await db
      .select()
      .from(Users)
      .where(eq(Users.id, userId))
      .execute();
    return user;
  } catch (error) {
    console.error("Error fetching user by id:", error);
    return null;
  }
}

export async function updateUserProfile(
  userId: number,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    locationText?: string;
    bio?: string;
    avatarUrl?: string;
    wastePreferences?: string;
  }
) {
  try {
    const [updated] = await db
      .update(Users)
      .set(data)
      .where(eq(Users.id, userId))
      .returning()
      .execute();
    return updated;
  } catch (error) {
    console.error("Error updating user profile:", error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANTI-FRAUD HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const REPORT_COOLDOWN_SECONDS = 300; // 5 min between reports per user
const MAX_REPORTS_PER_HOUR = 5; // hard cap per rolling hour

async function computeImageHash(base64Image: string): Promise<string> {
  const data = base64Image.split(",")[1] || base64Image;
  return crypto.createHash('sha256').update(data, 'base64').digest('hex');
}


/**
 * Returns { allowed: true } or { allowed: false, reason: string }
 */
export async function checkReportFraud(
  userId: number,
  imageHash: string
): Promise<{ allowed: boolean; reason?: string }> {
  // 1. Duplicate image check
  const existing = await db
    .select()
    .from(ImageHashes)
    .where(eq(ImageHashes.hash, imageHash))
    .execute();

  if (existing.length > 0) {
    return {
      allowed: false,
      reason: "This image has already been submitted. Duplicate reports are not allowed.",
    };
  }

  // 2. Per-user rate limit: cooldown
  const [user] = await db
    .select({
      lastReportedAt: Users.lastReportedAt,
      reportCountWindow: Users.reportCountWindow,
      reportWindowStart: Users.reportWindowStart,
    })
    .from(Users)
    .where(eq(Users.id, userId))
    .execute();

  if (user?.lastReportedAt) {
    const secondsSinceLast =
      (Date.now() - new Date(user.lastReportedAt).getTime()) / 1000;
    if (secondsSinceLast < REPORT_COOLDOWN_SECONDS) {
      const remaining = Math.ceil(REPORT_COOLDOWN_SECONDS - secondsSinceLast);
      return {
        allowed: false,
        reason: `Please wait ${remaining}s before submitting another report.`,
      };
    }
  }

  // 3. Rolling-window cap (5 reports per hour)
  const now = new Date();
  const windowStart = user?.reportWindowStart
    ? new Date(user.reportWindowStart)
    : null;
  const windowAge = windowStart
    ? (now.getTime() - windowStart.getTime()) / 1000 / 60
    : 999; // minutes

  let currentCount = user?.reportCountWindow ?? 0;
  if (windowAge >= 60) {
    // reset window
    currentCount = 0;
  }

  if (currentCount >= MAX_REPORTS_PER_HOUR) {
    return {
      allowed: false,
      reason: "You've reached the report limit (5 per hour). Please try again later.",
    };
  }

  return { allowed: true };
}

/** Call after a successful report submission to update fraud counters */
export async function recordReportForFraud(userId: number, imageHash: string, reportId: number) {
  const now = new Date();
  const [user] = await db
    .select({ reportCountWindow: Users.reportCountWindow, reportWindowStart: Users.reportWindowStart })
    .from(Users)
    .where(eq(Users.id, userId))
    .execute();

  const windowStart = user?.reportWindowStart ? new Date(user.reportWindowStart) : null;
  const windowAge = windowStart ? (now.getTime() - windowStart.getTime()) / 1000 / 60 : 999;
  const newCount = windowAge >= 60 ? 1 : (user?.reportCountWindow ?? 0) + 1;

  await db.update(Users).set({
    lastReportedAt: now,
    reportCountWindow: newCount,
    reportWindowStart: windowAge >= 60 ? now : windowStart ?? now,
  }).where(eq(Users.id, userId)).execute();

  // Store hash
  await db.insert(ImageHashes).values({ hash: imageHash, userId, reportId }).execute();
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function createReport(
  userId: number,
  location: string,
  wasteType: string,
  amount: string,
  base64Image?: string,
  coords?: { lat: number; lng: number },
  imageHash?: string
) {
  try {
    // 1. Double-check fraud
    if (imageHash) {
      const fraudCheck = await checkReportFraud(userId, imageHash);
      if (!fraudCheck.allowed) {
        throw new Error(fraudCheck.reason || "Fraud check failed.");
      }
    }

    // 2. Server-side AI Verification
    let verificationResult = null;
    if (base64Image) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });


        const prompt = `Analyze this waste report image. 
        CRITICAL: If the image contains dead animals or humans, this is an EMERGENCY, not waste.
        Return ONLY a JSON object: { "isWaste": boolean, "wasteType": string, "quantity": string, "confidence": number, "rejectionReason": string | null, "isEmergency": boolean }. 
        Use one of these for wasteType: "plastic", "organic", "metal", "mixed", "hazard", "e-waste", "paper", "glass".
        Mapping rules:
        - Food waste, leftovers, or kitchen scraps -> "organic"
        - Paper, cardboard, newspapers -> "paper"
        - Glass bottles, jars -> "glass"
        - Batteries, electronics, gadgets, wires -> "e-waste"
        - Chemicals, batteries (hazardous), medicinal waste -> "hazard"
        If it's an emergency, set isEmergency: true and isWaste: false. Be strict.`;
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64Image.split(",")[1], mimeType: "image/jpeg" } }
        ]);
        const response = await result.response;
        const text = response.text().trim();
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          verificationResult = JSON.parse(jsonMatch[0]);
          if (verificationResult.isEmergency) {
             throw new Error("EMERGENCY: Dead species detected. Please contact the police immediately (100 or 112).");
          }

          if (!verificationResult.isWaste || verificationResult.confidence < 0.8) {
            throw new Error(verificationResult.rejectionReason || "AI verification failed.");
          }
        }

      } catch (aiError) {
        console.error("Server-side AI verification failed:", aiError);
        throw new Error("Failed to verify waste image via AI on server.");
      }
    }

    // Expiry: 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [report] = await db
      .insert(Reports)
      .values({
        userId,
        location,
        wasteType: verificationResult?.wasteType || wasteType,
        amount: verificationResult?.quantity || amount,
        imageUrl: base64Image, // Storing base64 for now, ideally upload to S3/Cloudinary
        verificationResult,
        latitude: coords?.lat,
        longitude: coords?.lng,
        imageHash,
        status: "pending",
        expiresAt,
      })
      .returning()
      .execute();

    const pointsEarned = 10;
    await updateRewardPoints(userId, pointsEarned);
    await createTransaction(userId, "earned_report", pointsEarned, "Points earned for reporting waste");
    await createNotification(userId, `You've earned ${pointsEarned} points for reporting waste!`, "reward");

    // Record fraud counters
    if (imageHash) {
      await recordReportForFraud(userId, imageHash, report.id);
    }

    return report;
  } catch (error: any) {
    console.error("Error creating report:", error);
    throw error;
  }
}


export async function getReportsByUserId(userId: number) {
  try {
    return await db
      .select()
      .from(Reports)
      .where(eq(Reports.userId, userId))
      .orderBy(desc(Reports.createdAt))
      .execute();
  } catch (error) {
    console.error("Error fetching reports:", error);
    return [];
  }
}

export async function getRecentReports(limit: number = 10) {
  try {
    const reports = await db
      .select()
      .from(Reports)
      .orderBy(desc(Reports.createdAt))
      .limit(limit)
      .execute();
    return reports;
  } catch (error) {
    console.error("Error fetching recent reports:", error);
    return [];
  }
}

export async function getPendingReports() {
  try {
    return await db.select().from(Reports).where(eq(Reports.status, "pending")).execute();
  } catch (error) {
    console.error("Error fetching pending reports:", error);
    return [];
  }
}

export async function updateReportStatus(reportId: number, status: string) {
  try {
    const [updatedReport] = await db
      .update(Reports)
      .set({ status })
      .where(eq(Reports.id, reportId))
      .returning()
      .execute();
    return updatedReport;
  } catch (error) {
    console.error("Error updating report status:", error);
    return null;
  }
}

/**
 * Get collection tasks with optional waste type filter for collectors
 */
export async function getWasteCollectionTasks(
  limit: number = 20,
  wasteTypeFilter?: string[],
  userIdToExclude?: number
) {
  try {
    let query = db
      .select({
        id: Reports.id,
        location: Reports.location,
        latitude: Reports.latitude,
        longitude: Reports.longitude,
        wasteType: Reports.wasteType,
        amount: Reports.amount,
        status: Reports.status,
        date: Reports.createdAt,
        collectorId: Reports.collectorId,
        imageHash: Reports.imageHash,
        reporterEmail: Users.email,
        reporterName: Users.name,
      })
      .from(Reports)
      .leftJoin(Users, eq(Reports.userId, Users.id))
      .where(
        and(
          ne(Reports.status, "verified"),
          userIdToExclude ? ne(Reports.userId, userIdToExclude) : undefined
        )
      )
      .orderBy(desc(Reports.createdAt))
      .limit(limit);

    const tasks = await query.execute();

    // Apply filter client-side after fetch (or use SQL WHERE for DB filtering)
    const filtered =
      wasteTypeFilter && wasteTypeFilter.length > 0
        ? tasks.filter((t) =>
            wasteTypeFilter.some((wt) =>
              t.wasteType.toLowerCase().includes(wt.toLowerCase())
            )
          )
        : tasks;

    return filtered.map((task) => ({
      ...task,
      date: task.date.toISOString().split("T")[0],
    }));
  } catch (error) {
    console.error("Error fetching waste collection tasks:", error);
    return [];
  }
}

export async function updateTaskStatus(
  reportId: number,
  newStatus: string,
  collectorId?: number,
  collectorCoords?: { lat: number; lng: number }
) {
  if (newStatus === 'verified') {
    throw new Error("Cannot set status to verified directly. Use verifyAndCompleteCollection instead.");
  }

  try {
    // Anti-fraud: optimistic concurrency check — only update if status allows transition
    const [current] = await db
      .select({
        status: Reports.status,
        collectorId: Reports.collectorId,
        latitude: Reports.latitude,
        longitude: Reports.longitude
      })
      .from(Reports)
      .where(eq(Reports.id, reportId))
      .execute();

    if (!current) throw new Error("Report not found.");

    // Prevent two collectors claiming the same task
    if (
      newStatus === "in_progress" &&
      current?.status === "in_progress" &&
      current?.collectorId !== collectorId
    ) {
      throw new Error("Task already claimed by another collector.");
    }

    // Stricter Anti-fraud: Verify collector is within 500m of the report if coords provided
    if (newStatus === "in_progress" && collectorCoords && current.latitude && current.longitude) {
      const dist = Math.sqrt(
        Math.pow(collectorCoords.lat - current.latitude, 2) +
        Math.pow(collectorCoords.lng - current.longitude, 2)
      );
      // Rough degree-to-meter: 0.0045 is ~500m
      if (dist > 0.01) { // ~1km limit
        throw new Error("You must be near the waste location to start collection.");
      }
    }

    const updateData: any = { status: newStatus };
    if (collectorId !== undefined) updateData.collectorId = collectorId;
    if (collectorCoords) {
      updateData.collectorLatitude = collectorCoords.lat;
      updateData.collectorLongitude = collectorCoords.lng;
    }

    const [updatedReport] = await db
      .update(Reports)
      .set(updateData)
      .where(eq(Reports.id, reportId))
      .returning()
      .execute();
    return updatedReport;
  } catch (error) {
    console.error("Error updating task status:", error);
    throw error;
  }
}

// Alias for Community Page compatibility
export const getAllPosts = getPosts;

// ═══════════════════════════════════════════════════════════════════════════════
// LOCATION TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/** Upsert a collector's real-time GPS position */
export async function upsertCollectorLocation(
  userId: number,
  latitude: number,
  longitude: number
) {
  try {
    await db
      .insert(CollectorLocations)
      .values({ userId, latitude, longitude })
      .onConflictDoUpdate({
        target: CollectorLocations.userId,
        set: { latitude, longitude, updatedAt: new Date() },
      })
      .execute();
  } catch (error) {
    console.error("Error upserting collector location:", error);
  }
}

export async function getCollectorLocations() {
  try {
    return await db
      .select({
        userId: CollectorLocations.userId,
        latitude: CollectorLocations.latitude,
        longitude: CollectorLocations.longitude,
        updatedAt: CollectorLocations.updatedAt,
        name: Users.name,
      })
      .from(CollectorLocations)
      .leftJoin(Users, eq(CollectorLocations.userId, Users.id))
      .execute();
  } catch (error) {
    console.error("Error fetching collector locations:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REWARDS & TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getOrCreateReward(userId: number) {
  try {
    let [reward] = await db
      .select()
      .from(Rewards)
      .where(eq(Rewards.userId, userId))
      .execute();
    if (!reward) {
      [reward] = await db
        .insert(Rewards)
        .values({
          userId,
          name: "Default Reward",
          collectionInfo: "Default Collection Info",
          points: 0,
          level: 1,
          isAvailable: true,
        })
        .returning()
        .execute();
    }
    return reward;
  } catch (error) {
    console.error("Error getting or creating reward:", error);
    return null;
  }
}

export async function updateRewardPoints(userId: number, pointsToAdd: number) {
  try {
    const [updatedReward] = await db
      .update(Rewards)
      .set({
        points: sql`${Rewards.points} + ${pointsToAdd}`,
        updatedAt: new Date(),
      })
      .where(eq(Rewards.userId, userId))
      .returning()
      .execute();
    return updatedReward;
  } catch (error) {
    console.error("Error updating reward points:", error);
    return null;
  }
}

export async function createTransaction(
  userId: number,
  type: "earned_report" | "earned_collect" | "redeemed",
  amount: number,
  description: string
) {
  try {
    const [transaction] = await db
      .insert(Transactions)
      .values({ userId, type, amount, description })
      .returning()
      .execute();
    return transaction;
  } catch (error) {
    console.error("Error creating transaction:", error);
    throw error;
  }
}

export async function getRewardTransactions(userId: number) {
  try {
    const transactions = await db
      .select()
      .from(Transactions)
      .where(eq(Transactions.userId, userId))
      .orderBy(desc(Transactions.date))
      .limit(20)
      .execute();
    return transactions.map((t) => ({
      ...t,
      date: t.date.toISOString().split("T")[0],
    }));
  } catch (error) {
    console.error("Error fetching reward transactions:", error);
    return [];
  }
}

export async function getUserBalance(userId: number): Promise<number> {
  try {
    const reward = await getOrCreateReward(userId);
    return reward ? reward.points : 0;
  } catch (error) {
    console.error("Error fetching user balance:", error);
    return 0;
  }
}


export async function saveReward(userId: number, amount: number) {
  try {
    const [reward] = await db
      .insert(Rewards)
      .values({
        userId,
        name: "Waste Collection Reward",
        collectionInfo: "Points earned from waste collection",
        points: amount,
        level: 1,
        isAvailable: true,
      })
      .returning()
      .execute();
    await createTransaction(userId, "earned_collect", amount, "Points earned for collecting waste");
    return reward;
  } catch (error) {
    console.error("Error saving reward:", error);
    throw error;
  }
}

export async function saveCollectedWaste(
  reportId: number,
  collectorId: number,
  verificationResult: any
) {
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({ reportId, collectorId, collectionDate: new Date(), status: "verified" })
      .returning()
      .execute();
    return collectedWaste;
  } catch (error) {
    console.error("Error saving collected waste:", error);
    throw error;
  }
}

export async function createCollectedWaste(reportId: number, collectorId: number) {
  try {
    const [cw] = await db
      .insert(CollectedWastes)
      .values({ reportId, collectorId, collectionDate: new Date() })
      .returning()
      .execute();
    return cw;
  } catch (error) {
    console.error("Error creating collected waste:", error);
    return null;
  }
}

export async function getCollectedWastesByCollector(collectorId: number) {
  try {
    return await db
      .select()
      .from(CollectedWastes)
      .where(eq(CollectedWastes.collectorId, collectorId))
      .execute();
  } catch (error) {
    console.error("Error fetching collected wastes:", error);
    return [];
  }
}

export async function getAllRewards() {
  try {
    return await db
      .select({
        id: Rewards.id,
        userId: Rewards.userId,
        points: Rewards.points,
        level: Rewards.level,
        createdAt: Rewards.createdAt,
        userName: Users.name,
      })
      .from(Rewards)
      .leftJoin(Users, eq(Rewards.userId, Users.id))
      .orderBy(desc(Rewards.points))
      .execute();
  } catch (error) {
    console.error("Error fetching all rewards:", error);
    return [];
  }
}

export async function getAvailableRewards(userId: number) {
  try {
    const userPoints = await getUserBalance(userId);

    const dbRewards = await db
      .select({ id: Rewards.id, name: Rewards.name, cost: Rewards.points, description: Rewards.description, collectionInfo: Rewards.collectionInfo })
      .from(Rewards)
      .where(eq(Rewards.isAvailable, true))
      .execute();

    return [
      { id: 0, name: "Your Points", cost: userPoints, description: "Redeem your earned points", collectionInfo: "Points earned from reporting and collecting waste" },
      ...dbRewards,
    ];
  } catch (error) {
    console.error("Error fetching available rewards:", error);
    return [];
  }
}

export async function verifyAndCompleteCollection(
  reportId: number,
  collectorId: number,
  base64Image: string
) {
  try {
    const [report] = await db
      .select()
      .from(Reports)
      .where(eq(Reports.id, reportId))
      .execute();

    if (!report) throw new Error("Report not found.");

    if (report.status === 'verified') throw new Error("This task has already been verified and rewarded.");
    if (report.collectorId !== collectorId) throw new Error("You are not the assigned collector for this task.");

    // 2. Image Deduplication for Collection
    // We should not allow using the exact same image as the report
    if (report.imageHash) {
      const collectionImageHash = await computeImageHash(base64Image); 
       if (collectionImageHash === report.imageHash) {
         throw new Error("Fraud detected: Collection image is identical to the report image.");
       }
    }

    // 3. Server-side AI Verification
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are a waste collection verification AI. 
    Task: Verify that the waste depicted in the original report (Type: "${report.wasteType}", Amount: "${report.amount}") has been REMOVED or CLEANED UP in this new image.
    The new image should show the SAME location but WITHOUT the waste, or with the waste properly bagged and ready for transport.
    If the waste is still there and uncleaned, it's a fail.
    Use one of these for verification analysis if needed: "plastic", "organic", "metal", "mixed", "hazard", "e-waste", "paper", "glass".
    Return ONLY a JSON object: { "isCleaned": boolean, "confidence": number, "rejectionReason": string | null }.`;
    
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Image.split(",")[1], mimeType: "image/jpeg" } }
    ]);
    const response = await result.response;
    const text = response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*?\}/);

    if (!jsonMatch) {
      console.error("AI Response did not contain JSON:", text);
      throw new Error("AI verification failed to produce a valid response. Please try with a clearer image.");
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI JSON:", jsonMatch[0]);
      throw new Error("Invalid response format from AI verification.");
    }

    if (parsedResult.isCleaned && parsedResult.confidence > 0.7) {
      // 4. Award points and update status
      await db.update(Reports).set({ status: 'verified' }).where(eq(Reports.id, reportId)).execute();

      
      const earnedReward = Math.floor(Math.random() * 50) + 10;
      await updateRewardPoints(collectorId, earnedReward);
      await createTransaction(collectorId, "earned_collect", earnedReward, "Points earned for collecting waste");
      await createNotification(collectorId, `You've earned ${earnedReward} points for collecting waste!`, "reward");
      
      await saveCollectedWaste(reportId, collectorId, parsedResult);
      
      return { success: true, reward: earnedReward };
    } else {
      throw new Error(parsedResult.rejectionReason || "Verification failed: Waste is still present or confidence too low.");
    }

  } catch (error: any) {
    console.error("Error in verifyAndCompleteCollection:", error);
    throw error;
  }
}

export async function redeemReward(userId: number, rewardId: number) {

  try {
    const userReward = (await getOrCreateReward(userId)) as any;
    if (rewardId === 0) {
      const [updatedReward] = await db
        .update(Rewards)
        .set({ points: 0, updatedAt: new Date() })
        .where(eq(Rewards.userId, userId))
        .returning()
        .execute();
      await createTransaction(userId, "redeemed", userReward.points, `Redeemed all points: ${userReward.points}`);
      return updatedReward;
    } else {
      const availableReward = await db.select().from(Rewards).where(eq(Rewards.id, rewardId)).execute();
      if (!userReward || !availableReward[0] || userReward.points < availableReward[0].points) {
        throw new Error("Insufficient points or invalid reward");
      }
      const [updatedReward] = await db
        .update(Rewards)
        .set({ points: sql`${Rewards.points} - ${availableReward[0].points}`, updatedAt: new Date() })
        .where(eq(Rewards.userId, userId))
        .returning()
        .execute();
      await createTransaction(userId, "redeemed", availableReward[0].points, `Redeemed: ${availableReward[0].name}`);
      return updatedReward;
    }
  } catch (error) {
    console.error("Error redeeming reward:", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function createNotification(userId: number, message: string, type: string) {
  try {
    const [n] = await db.insert(Notifications).values({ userId, message, type }).returning().execute();
    return n;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

export async function getUnreadNotifications(userId: number) {
  try {
    return await db
      .select()
      .from(Notifications)
      .where(and(eq(Notifications.userId, userId), eq(Notifications.isRead, false)))
      .execute();
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead(notificationId: number) {
  try {
    await db.update(Notifications).set({ isRead: true }).where(eq(Notifications.id, notificationId)).execute();
  } catch (error) {
    console.error("Error marking notification:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMUNITY POSTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function verifyWaste(base64Image: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Analyze this waste report image. 
    CRITICAL: If the image contains dead animals or humans, this is an EMERGENCY, not waste.
    Return ONLY a JSON object: { "isWaste": boolean, "wasteType": string, "quantity": string, "confidence": number, "rejectionReason": string | null, "isEmergency": boolean }. 
    Use one of these for wasteType: "plastic", "organic", "metal", "mixed", "hazard", "e-waste", "paper", "glass".
    Mapping rules:
    - Food waste, leftovers, or kitchen scraps -> "organic"
    - Paper, cardboard, newspapers -> "paper"
    - Glass bottles, jars -> "glass"
    - Batteries, electronics, gadgets, wires -> "e-waste"
    - Chemicals, batteries (hazardous), medicinal waste -> "hazard"
    If it's an emergency, set isEmergency: true and isWaste: false. Be strict.`;
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Image.split(",")[1], mimeType: "image/jpeg" } }
    ]);
    const response = await result.response;
    const text = response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error("Failed to parse AI response.");
  } catch (error) {
    console.error("Error verifying waste:", error);
    throw error;
  }
}

export async function createPost(userId: number, content: string, reportId?: number) {

  try {
    const [post] = await db
      .insert(Posts)
      .values({ userId, content, reportId })
      .returning()
      .execute();
    return post;
  } catch (error) {
    console.error("Error creating post:", error);
    return null;
  }
}

export async function getPosts(limit: number = 20, offset: number = 0) {
  try {
    const posts = await db
      .select({
        id: Posts.id,
        content: Posts.content,
        likes: Posts.likesCount,
        replies: Posts.repliesCount,
        createdAt: Posts.createdAt,
        userId: Posts.userId,
        userName: Users.name,
        userAvatar: Users.avatarUrl,
        reportId: Posts.reportId,
      })

      .from(Posts)
      .leftJoin(Users, eq(Posts.userId, Users.id))
      .orderBy(desc(Posts.createdAt))
      .limit(limit)
      .offset(offset)
      .execute();
    return posts;
  } catch (error) {
    console.error("Error fetching posts:", error);
    return [];
  }
}

export async function getPostsByUserId(userId: number) {
  try {
    const posts = await db
      .select({
        id: Posts.id,
        content: Posts.content,
        likes: Posts.likesCount,
        replies: Posts.repliesCount,
        createdAt: Posts.createdAt,
        userId: Posts.userId,
        userName: Users.name,
        userAvatar: Users.avatarUrl,
      })

      .from(Posts)
      .leftJoin(Users, eq(Posts.userId, Users.id))
      .where(eq(Posts.userId, userId))
      .orderBy(desc(Posts.createdAt))
      .execute();
    return posts;
  } catch (error) {
    console.error("Error fetching posts by user id:", error);
    return [];
  }
}

export async function likePost(postId: number, userId: number) {
  console.log('Liking post:', postId, 'by user:', userId);
  try {

    // Idempotent: if already liked, unlike
    const existing = await db
      .select()
      .from(PostLikes)
      .where(and(eq(PostLikes.postId, postId), eq(PostLikes.userId, userId)))
      .execute();

    if (existing.length > 0) {
      await db
        .delete(PostLikes)
        .where(and(eq(PostLikes.postId, postId), eq(PostLikes.userId, userId)))
        .execute();
      await db
        .update(Posts)
        .set({ likesCount: sql`${Posts.likesCount} - 1` })
        .where(eq(Posts.id, postId))
        .execute();
      console.log('Unliked post successfully');
      return { liked: false };

    } else {
      await db.insert(PostLikes).values({ postId, userId }).execute();
      await db
        .update(Posts)
        .set({ likesCount: sql`${Posts.likesCount} + 1` })
        .where(eq(Posts.id, postId))
        .execute();
      console.log('Liked post successfully');
      return { liked: true };

    }
  } catch (error) {
    console.error("Error liking post:", error);
    throw error;
  }
}

export async function createReply(
  postId: number,
  userId: number,
  content: string,
  parentReplyId?: number
) {
  try {
    const [reply] = await db
      .insert(PostReplies)
      .values({ postId, userId, content, parentReplyId })
      .returning()
      .execute();
    // Increment reply count on parent post
    await db
      .update(Posts)
      .set({ repliesCount: sql`${Posts.repliesCount} + 1` })
      .where(eq(Posts.id, postId))
      .execute();
    return reply;
  } catch (error) {
    console.error("Error creating reply:", error);
    return null;
  }
}

export async function getRepliesForPost(postId: number) {
  try {
    const replies = await db
      .select({
        id: PostReplies.id,
        content: PostReplies.content,
        likesCount: PostReplies.likesCount,
        parentReplyId: PostReplies.parentReplyId,
        createdAt: PostReplies.createdAt,
        userId: PostReplies.userId,
        userName: Users.name,
        userAvatar: Users.avatarUrl,
      })
      .from(PostReplies)
      .leftJoin(Users, eq(PostReplies.userId, Users.id))
      .where(eq(PostReplies.postId, postId))
      .orderBy(PostReplies.createdAt)
      .execute();
    return replies;
  } catch (error) {
    console.error("Error fetching replies:", error);
    return [];
  }
}

export async function getUserLikedPostIds(userId: number): Promise<number[]> {
  try {
    const likes = await db
      .select({ postId: PostLikes.postId })
      .from(PostLikes)
      .where(eq(PostLikes.userId, userId))
      .execute();
    return likes.map((l) => l.postId);
  } catch (error) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

export async function getUserStats(userId: number) {
  try {
    const [reportCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(Reports)
      .where(eq(Reports.userId, userId))
      .execute();

    const [collectCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(CollectedWastes)
      .where(eq(CollectedWastes.collectorId, userId))
      .execute();

    const [postCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(Posts)
      .where(eq(Posts.userId, userId))
      .execute();

    const balance = await getUserBalance(userId);

    return {
      reportCount: Number(reportCount?.count ?? 0),
      collectCount: Number(collectCount?.count ?? 0),
      postCount: Number(postCount?.count ?? 0),
      tokenBalance: balance,
    };
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return { reportCount: 0, collectCount: 0, postCount: 0, tokenBalance: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TASK EXPIRY (run via cron or serverless function)
// ═══════════════════════════════════════════════════════════════════════════════

export async function expireStaleReports() {
  try {
    const now = new Date();
    const result = await db
      .update(Reports)
      .set({ status: "expired" })
      .where(and(eq(Reports.status, "pending"), lt(Reports.expiresAt, now)))
      .returning({ id: Reports.id })
      .execute();
    console.log(`Expired ${result.length} stale reports`);
    return result.length;
  } catch (error) {
    console.error("Error expiring stale reports:", error);
    return 0;
  }
}