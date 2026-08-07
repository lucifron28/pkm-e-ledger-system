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

async function normalizeExistingTerms(organizationIds: string[]) {
  // Normalize old non-canonical academic year formats like "A.Y. 2026-2027" -> "2026-2027"
  const terms = await prisma.academicTerm.findMany({
    where: { organizationId: { in: organizationIds } },
  });
  for (const term of terms) {
    if (term.academicYear.startsWith("A.Y. ")) {
      const canonical = term.academicYear.replace(/^A\.Y\.\s*/, "").trim();
      const conflict = await prisma.academicTerm.findFirst({
        where: {
          organizationId: term.organizationId,
          academicYear: canonical,
          semester: term.semester,
          id: { not: term.id },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new Error(`Seed conflict: academic term ${term.id} cannot normalize because ${conflict.id} already owns ${canonical}.`);
      }
      await prisma.academicTerm.update({
        where: { id: term.id },
        data: { academicYear: canonical },
      });
    }
  }
}

async function seedOrganizations() {
  const seeded = [] as Array<{ id: string; name: string; slug: string; active: boolean }>;
  for (const name of organizations) {
    const slug = slugify(name);
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (!existing) {
      const created = await prisma.organization.create({
        data: { name, slug, active: true },
      });
      seeded.push(created);
    } else {
      if (existing.name !== name) {
        throw new Error(`Seed conflict: organization slug ${slug} is assigned to another name.`);
      }
      // Never reactivate or otherwise change existing organization state.
      seeded.push(existing);
    }
  }
  return seeded;
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
      },
      create: {
        name: cat.name,
        type: TransactionType.EXPENSE,
        reportBucket: cat.bucket,
      },
    });
  }
}

async function seedAcademicTermsAndUsers(seededOrganizations: Array<{ id: string; name: string; slug: string; active: boolean }>) {
  const resetPasswords = process.env.RESET_DEMO_PASSWORDS === "true";
  const defaultPasswordHash = await bcrypt.hash("password", 12);

  const CANONICAL_AY = "2026-2027";

  for (const organization of seededOrganizations) {
    if (!organization.active) continue;

    const [transactionCount, transferCount] = await Promise.all([
      prisma.transaction.count({ where: { organizationId: organization.id } }),
      prisma.cashTransfer.count({ where: { organizationId: organization.id } }),
    ]);
    const hasFinancialData = transactionCount + transferCount > 0;

    if (!hasFinancialData) {
      await prisma.$transaction(async (tx) => {
        const existingActive = await tx.academicTerm.findFirst({
          where: { organizationId: organization.id, active: true },
        });

        const existingCanonical = await tx.academicTerm.findUnique({
          where: {
            organizationId_academicYear_semester: {
              organizationId: organization.id,
              academicYear: CANONICAL_AY,
              semester: Semester.FIRST_SEMESTER,
            },
          },
          select: { id: true },
        });

        if (!existingActive && !existingCanonical) {
          await tx.academicTerm.create({
            data: {
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
      } else {
        if (existingUser.role !== role || existingUser.organizationId !== organization.id) {
          throw new Error(`Seed conflict: demo user ${username} has unexpected role or organization.`);
        }
        if (resetPasswords) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { passwordHash: defaultPasswordHash },
        });
        }
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
  } else {
    if (existingOsa.role !== Role.OSA || existingOsa.organizationId !== null) {
      throw new Error("Seed conflict: demo_osa has unexpected role or organization.");
    }
    if (resetPasswords) {
    await prisma.user.update({
      where: { id: existingOsa.id },
      data: { passwordHash: defaultPasswordHash },
    });
    }
  }
}

async function main() {
  const seededOrganizations = await seedOrganizations();
  await normalizeExistingTerms(seededOrganizations.map((organization) => organization.id));
  await seedCategories();
  await seedAcademicTermsAndUsers(seededOrganizations);
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
