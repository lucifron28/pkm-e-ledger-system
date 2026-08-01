import { ExpenseReportBucket, PrismaClient, Role, Semester, TransactionType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const organizations = [
  "Agricultural Group of Students",
  "Ang Lipunan",
  "Ang Simbuhan",
  "Junior Philippine Institute of Accountants",
  "Kundayan Dance Krew",
  "Lex et Ordo",
  "Math Society",
  "Musical Instructions & Tutorial for Teachers & Students",
  "Samahan ng mga Mag-aaral sa Filipino",
  "Supreme Student Council",
  "Student Association on Food Education",
  "Society of Elementary Educator Students",
  "Students Response Units",
  "The Language Guild",
];

const incomeCategories = [
  "Membership Dues",
  "Monthly Contribution",
  "Donation",
  "Booth Subsidy",
  "Prize / Award",
  "Organization Shirt",
  "Sales",
  "Others",
];

const expenseCategories: Array<{ name: string; bucket: ExpenseReportBucket }> = [
  { name: "Supplies", bucket: ExpenseReportBucket.SUPPLIES },
  { name: "Equipment", bucket: ExpenseReportBucket.EQUIPMENT },
  { name: "Transportation", bucket: ExpenseReportBucket.TRANSPORTATION },
  { name: "Meals", bucket: ExpenseReportBucket.MEALS },
  { name: "Service", bucket: ExpenseReportBucket.SERVICE },
  { name: "Miscellaneous", bucket: ExpenseReportBucket.MISC },
  { name: "Donation", bucket: ExpenseReportBucket.DONATION },
  { name: "Events", bucket: ExpenseReportBucket.OTHERS },
  { name: "Activities", bucket: ExpenseReportBucket.OTHERS },
  { name: "Others", bucket: ExpenseReportBucket.OTHERS },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function demoUserName(role: Role, organizationSlug: string) {
  return `demo_${role.toLowerCase()}_${organizationSlug}`;
}

async function normalizeExistingTerms() {
  // Normalize old non-canonical academic year formats like "A.Y. 2026-2027" -> "2026-2027"
  const terms = await prisma.academicTerm.findMany();
  for (const term of terms) {
    if (term.academicYear.startsWith("A.Y. ")) {
      const canonical = term.academicYear.replace(/^A\.Y\.\s*/, "").trim();
      try {
        await prisma.academicTerm.update({
          where: { id: term.id },
          data: { academicYear: canonical },
        });
      } catch {
        // If unique constraint conflicts, keep as is
      }
    }
  }
}

async function seedOrganizations() {
  for (const name of organizations) {
    const slug = slugify(name);
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (!existing) {
      await prisma.organization.create({
        data: { name, slug, active: true },
      });
    } else {
      // Do not reactivate an intentionally inactive existing organization
      await prisma.organization.update({
        where: { id: existing.id },
        data: { name },
      });
    }
  }
}

async function seedCategories() {
  for (const name of incomeCategories) {
    await prisma.transactionCategory.upsert({
      where: {
        name_type: {
          name,
          type: TransactionType.INCOME,
        },
      },
      update: {
        reportBucket: ExpenseReportBucket.OTHERS,
        active: true,
      },
      create: {
        name,
        type: TransactionType.INCOME,
        reportBucket: ExpenseReportBucket.OTHERS,
      },
    });
  }

  for (const cat of expenseCategories) {
    await prisma.transactionCategory.upsert({
      where: {
        name_type: {
          name: cat.name,
          type: TransactionType.EXPENSE,
        },
      },
      update: {
        reportBucket: cat.bucket,
        active: true,
      },
      create: {
        name: cat.name,
        type: TransactionType.EXPENSE,
        reportBucket: cat.bucket,
      },
    });
  }
}

async function seedAcademicTermsAndUsers() {
  const resetPasswords = process.env.RESET_DEMO_PASSWORDS === "true";
  const defaultPasswordHash = await bcrypt.hash("password", 12);
  const seededOrganizations = await prisma.organization.findMany({
    orderBy: { name: "asc" },
  });

  const CANONICAL_AY = "2026-2027";

  for (const organization of seededOrganizations) {
    const hasFinancialData = (await prisma.transaction.count({
      where: { organizationId: organization.id },
    })) > 0;

    if (!hasFinancialData) {
      await prisma.$transaction(async (tx) => {
        const existingActive = await tx.academicTerm.findFirst({
          where: { organizationId: organization.id, active: true },
        });

        if (!existingActive) {
          await tx.academicTerm.upsert({
            where: {
              organizationId_academicYear_semester: {
                organizationId: organization.id,
                academicYear: CANONICAL_AY,
                semester: Semester.FIRST_SEMESTER,
              },
            },
            update: { active: true },
            create: {
              organizationId: organization.id,
              academicYear: CANONICAL_AY,
              semester: Semester.FIRST_SEMESTER,
              openingCashOnHandCents: 0,
              openingCashInBankCents: 0,
              active: true,
            },
          });
        }
      });
    }
    for (const role of [
      Role.TREASURER,
      Role.ADVISER,
      Role.AUDIT,
      Role.OFFICER,
      Role.MEMBER,
    ]) {
      const username = demoUserName(role, organization.slug);
      const existingUser = await prisma.user.findUnique({ where: { username } });

      if (!existingUser) {
        await prisma.user.create({
          data: {
            fullName: `Demo ${role} User`,
            username,
            passwordHash: defaultPasswordHash,
            role,
            organizationId: organization.id,
          },
        });
      } else if (resetPasswords) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { passwordHash: defaultPasswordHash },
        });
      }
    }
  }

  const existingOsa = await prisma.user.findUnique({ where: { username: "demo_osa" } });
  if (!existingOsa) {
    await prisma.user.create({
      data: {
        fullName: "Demo OSA User",
        username: "demo_osa",
        passwordHash: defaultPasswordHash,
        role: Role.OSA,
      },
    });
  } else if (resetPasswords) {
    await prisma.user.update({
      where: { id: existingOsa.id },
      data: { passwordHash: defaultPasswordHash },
    });
  }
}

async function main() {
  await normalizeExistingTerms();
  await seedOrganizations();
  await seedCategories();
  await seedAcademicTermsAndUsers();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
