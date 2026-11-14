import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/khazna/AppShell";

function StudentLayout() {
  return (
    <AppShell role="student">
      <Outlet />
    </AppShell>
  );
}

export const Route = createFileRoute("/app")({
  component: StudentLayout,
});
