import { Semester } from "@prisma/client";
import { ValidationError } from "./errors";

export const SEMESTER_LABELS: Record<Semester, string> = {
  FIRST_SEMESTER: "First Semester",
  SECOND_SEMESTER: "Second Semester",
  MIDYEAR_SUMMER: "Midyear / Summer",
};

export function getSemesterLabel(semester: Semester): string {
  return SEMESTER_LABELS[semester] || semester;
}

const ACADEMIC_YEAR_REGEX = /^(\d{4})-(\d{4})$/;

export function validateAcademicYear(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "Academic year is required.";
  }

  const match = trimmed.match(ACADEMIC_YEAR_REGEX);
  if (!match) {
    return "Academic year must use the canonical YYYY-YYYY format (e.g., 2026-2027).";
  }

  const startYear = parseInt(match[1], 10);
  const endYear = parseInt(match[2], 10);

  if (endYear !== startYear + 1) {
    return "Academic year ending year must follow the starting year (e.g., 2026-2027).";
  }

  return null;
}

export function normalizeAcademicYear(value: string): string {
  const err = validateAcademicYear(value);
  if (err) {
    throw new ValidationError(err);
  }
  return value.trim();
}
