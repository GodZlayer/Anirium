// src/app/calendar/page.tsx


import WeeklySchedule from "@/components/WeeklySchedule";

export const metadata = {
  title: "Calendário",
  description: "Calendário de lançamentos semanais de anime",
};

export default function CalendarPage() {
  return (
    <section className="min-h-screen py-8 bg-background">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl font-bold mb-6 text-center">Calendário de Lançamentos</h1>
        <WeeklySchedule />
      </div>
    </section>
  );
}
