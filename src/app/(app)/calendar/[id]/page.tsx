import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { deleteEvent } from "@/app/actions/calendar";
import { Flash, PageHeader } from "@/components/ui";
import { EventForm } from "@/components/EventForm";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [event, customers] = await Promise.all([
    db.calendarEvent.findUnique({ where: { id } }),
    db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!event) notFound();
  return (
    <div className="max-w-xl">
      <PageHeader title={event.title} back={{ href: "/calendar", label: "Calendar" }} />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      <div className="card p-6">
        <EventForm event={event} customers={customers} returnTo={`/calendar/${id}`} />
      </div>
      <form action={deleteEvent} className="mt-4 text-right">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="returnTo" value="/calendar" />
        <ConfirmButton message="Delete this event? It is also removed from Google Calendar.">Delete event</ConfirmButton>
      </form>
    </div>
  );
}
