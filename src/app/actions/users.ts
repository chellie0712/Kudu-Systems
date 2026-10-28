"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/form";

const MIN_PASSWORD = 10;

export async function addUser(fd: FormData) {
  await requireUser();
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = str(fd, "password");
  if (!email || password.length < MIN_PASSWORD) redirect(`/settings?err=Enter+an+email+and+a+password+of+at+least+${MIN_PASSWORD}+characters#users`);
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    update: { name: name || undefined, passwordHash, disabled: false },
    create: { email, name: name || email, passwordHash },
  });
  redirect("/settings?msg=User+saved#users");
}

export async function resetPassword(fd: FormData) {
  await requireUser();
  const password = str(fd, "password");
  if (password.length < MIN_PASSWORD) redirect(`/settings?err=Password+must+be+at+least+${MIN_PASSWORD}+characters#users`);
  await db.user.update({ where: { id: str(fd, "id") }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  redirect("/settings?msg=Password+changed#users");
}

export async function setUserDisabled(fd: FormData) {
  const me = await requireUser();
  const id = str(fd, "id");
  if (id === me.id) redirect("/settings?err=You+cannot+disable+your+own+account#users");
  await db.user.update({ where: { id }, data: { disabled: str(fd, "disabled") === "true" } });
  redirect("/settings?msg=User+updated#users");
}
