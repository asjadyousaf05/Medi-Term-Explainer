import Link from "next/link";
import { api, currentAdmin } from "@/lib/api";
import { contentTypes } from "@/lib/content";
import { notFound } from "next/navigation";
import { DataTable, PageHeader } from "@/components/page";

export default async function ContentPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!contentTypes.has(type)) notFound();
  const admin = await currentAdmin();
  const records = await api<Record<string, unknown>[]>("/admin/content?limit=100");
  const filtered = records.filter((item) => item.content_type === type);
  return <><PageHeader title={`${type[0]?.toUpperCase()}${type.slice(1)} management`} description="Open a record to inspect content, source attribution, revision history, and available review actions." actions={admin.permissions.includes("content.edit") ? <Link className="button" href={`/content/${type}/new`}>Create draft</Link> : undefined} /><DataTable rows={filtered} /></>;
}
