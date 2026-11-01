import { createFileRoute } from "@tanstack/react-router";
import { CloudAccount } from "@/components/cloud-account";

export const Route = createFileRoute("/")({ component: CloudAccount });
