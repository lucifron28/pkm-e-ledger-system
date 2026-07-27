import { PrismaClient, Role, Semester, TransactionType } from "@prisma/client";
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

const expenseCategories = [
  "Supplies",
  "Equipment",
  "Transportation",
  "Meals",
  "Service",
  "Miscellaneous",
  "Donation",
  "Events",
  "Activities",
  "Others",
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

async function seedOrganizations() {
  for (const name of organizations) {
    await prisma.organization.upsert({
      where: { slug: slugify(name) },
      update: { name, active: true },
      create: {
        name,
        slug: slugify(name),
      },
    });
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
        reportBucket: name,
        active: true,
      },
      create: {
        name,
        type: TransactionType.INCOME,
        reportBucket: name,
      },
    });
  }

  for (const name of expenseCategories) {
    await prisma.transactionCategory.upsert({
      where: {
        name_type: {
          name,
          type: TransactionType.EXPENSE,
        },
      },
      update: {
        reportBucket: name,
        active: true,
      },
      create: {
        name,
        type: TransactionType.EXPENSE,
        reportBucket: name,
      },
    });
  }
}

async function seedAcademicTermsAndUsers() {
  const passwordHash = await bcrypt.hash("password", 12);
  const seededOrganizations = await prisma.organization.findMany({
    orderBy: { name: "asc" },
  });

  for (const organization of seededOrganizations) {
    await prisma.academicTerm.upsert({
      where: {
        organizationId_academicYear_semester: {
          organizationId: organization.id,
          academicYear: "A.Y. 2026-2027",
          semester: Semester.FIRST_SEMESTER,
        },
      },
      update: {
        active: true,
      },
      create: {
        organizationId: organization.id,
        academicYear: "A.Y. 2026-2027",
        semester: Semester.FIRST_SEMESTER,
        openingCashOnHandCents: 0,
        openingCashInBankCents: 0,
      },
    });

    for (const role of [
      Role.TREASURER,
      Role.ADVISER,
      Role.AUDIT,
      Role.OFFICER,
      Role.MEMBER,
    ]) {
      await prisma.user.upsert({
        where: { username: demoUserName(role, organization.slug) },
        update: {
          fullName: `Demo ${role} User`,
          role,
          organizationId: organization.id,
          passwordHash,
          active: true,
        },
        create: {
          fullName: `Demo ${role} User`,
          username: demoUserName(role, organization.slug),
          passwordHash,
          role,
          organizationId: organization.id,
        },
      });
    }
  }

  await prisma.user.upsert({
    where: { username: "demo_osa" },
    update: {
      fullName: "Demo OSA User",
      role: Role.OSA,
      organizationId: null,
      passwordHash,
      active: true,
    },
    create: {
      fullName: "Demo OSA User",
      username: "demo_osa",
      passwordHash,
      role: Role.OSA,
    },
  });
}

async function main() {
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
