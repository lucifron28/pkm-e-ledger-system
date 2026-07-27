import { Semester } from "@prisma/client";

export const SEMESTER_LABELS: Record<Semester, string> = {
  FIRST_SEMESTER: "First Semester",
  SECOND_SEMESTER: "Second Semester",
  MIDYEAR_SUMMER: "Midyear / Summer",
};

export function getSemesterLabel(semester: Semester): string {
  return SEMESTER_LABELS[semester];
}

const ACADEMIC_YEAR_REGEX = /^(\d{4})-(\d{4})$/;

export function validateAcademicYear(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "Academic year is required.";
  }

  const match = trimmed.match(ACADEMIC_YEAR_REGEX);
  if (!match) {
    return "Academic year must use the YYYY-YYYY format.";
  }

  const startYear = parseInt(match[1], 10);
  const endYear = parseInt(match[2], 10);

  if (endYear !== startYear + 1) {
    return "The ending year must follow the starting year.";
  }

  return null;
}
