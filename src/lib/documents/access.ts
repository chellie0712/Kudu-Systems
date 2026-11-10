import type { GeneratedDoc, PrismaClient } from "@prisma/client";
import type { AppUser } from "@/auth";
import { can, canAccessJobCard } from "@/lib/permissions";
import type { DocSubject } from "./defs";

/** May this person make a document for this record? Technicians only for their own jobs. */
export async function mayDocumentFor(db: PrismaClient, user: AppUser, subject: DocSubject, id: string): Promise<boolean> {
  if (!can(user, "documents.create")) return false;
  switch (subject) {
    case "job": {
      const j = await db.jobCard.findUnique({ where: { id }, select: { technicianId: true } });
      return !!j && canAccessJobCard(user, j);
    }
    case "quote":
      return can(user, "quotations.view");
    case "invoice":
      return can(user, "invoices.view");
    case "customer":
      return can(user, "customers.view");
  }
}

/** May this person open the document? Everyone with documents.view; others their own and their jobs'. */
export async function maySeeDoc(db: PrismaClient, user: AppUser, doc: Pick<GeneratedDoc, "createdById" | "jobCardId">): Promise<boolean> {
  if (can(user, "documents.view")) return true;
  if (doc.createdById === user.id) return true;
  if (doc.jobCardId && can(user, "documents.create")) {
    const j = await db.jobCard.findUnique({ where: { id: doc.jobCardId }, select: { technicianId: true } });
    return !!j && canAccessJobCard(user, j);
  }
  return false;
}
