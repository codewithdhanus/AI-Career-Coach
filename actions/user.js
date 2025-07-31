"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateAIInsights } from "./dashboard";

export async function updateUser(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (!user) throw new Error("User not found");

  try {
    // ✅ Step 1: Check if insight already exists
    const existingInsight = await db.industryInsight.findUnique({
      where: { industry: data.industry },
    });

    let insightsToInsert = null;

    // ✅ Step 2: If not found, generate insights BEFORE transaction
    if (!existingInsight) {
      insightsToInsert = await generateAIInsights(data.industry);
    }

    // ✅ Step 3: Run DB updates inside transaction (only DB calls here!)
    const result = await db.$transaction(async (tx) => {
      let industryInsight = existingInsight;

      // Create new insight if needed
      if (!existingInsight && insightsToInsert) {
        industryInsight = await tx.industryInsight.create({
          data: {
            industry: data.industry,
            ...insightsToInsert,
            nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          industry: data.industry,
          experience: data.experience,
          bio: data.bio,
          skills: data.skills,
        },
      });

      return { updatedUser };
    });

    revalidatePath("/");
    return result.updatedUser;
  } catch (error) {
    console.error("🔥 Error updating user and industry:", error);
    throw new Error("Failed to update profile");
  }
}

export async function getUserOnboardingStatus() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: { industry: true },
  });

  if (!user) return { isOnboarded: false };

  return {
    isOnboarded: !!user.industry,
  };
}
