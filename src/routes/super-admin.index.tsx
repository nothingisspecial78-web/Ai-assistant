import { createFileRoute } from "@tanstack/react-router";
import { SuperAdminDashboard } from "@/apps/super-admin/SuperAdminDashboard";

export const Route = createFileRoute("/super-admin/")({
  component: SuperAdminDashboard,
});
