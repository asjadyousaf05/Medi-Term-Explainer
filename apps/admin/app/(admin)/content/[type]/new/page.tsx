import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page";
import { api, currentAdmin } from "@/lib/api";
import { contentTypes, type ContentRecord, type ContentRevision } from "@/lib/content";
import { Editor } from "./editor";

export default async function NewContentPage({ params, searchParams }: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { type } = await params;
  const { id } = await searchParams;
  if (!contentTypes.has(type)) notFound();
  const admin = await currentAdmin();
  if (!admin.permissions.includes("content.edit")) redirect(`/content/${type}`);
  let revision: ContentRevision | undefined;
  if (id) {
    const path = `/admin/content/${encodeURIComponent(id)}`;
    const record = await api<ContentRecord>(path);
    if (record.content_type !== type) notFound();
    revision = (await api<ContentRevision[]>(`${path}/revisions?limit=1`))[0];
  }
  return <><PageHeader title={id ? `Revise ${id}` : `New ${type} draft`} description="Save a versioned draft with explicit source metadata, then submit it for independent review." /><section className="card"><Editor type={type} stableId={id} content={revision?.content} source={revision?.source_metadata} /></section></>;
}
