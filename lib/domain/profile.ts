import { z } from "zod";

export const PROFILE_FIELD_LIMITS = {
  fullName: 100,
  username: 50,
} as const;

export const profileUpdateSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(PROFILE_FIELD_LIMITS.fullName, "Full name must be under 100 characters."),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(PROFILE_FIELD_LIMITS.username, "Username must be under 50 characters."),
  currentPassword: z.string().min(1, "Current password is required."),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
