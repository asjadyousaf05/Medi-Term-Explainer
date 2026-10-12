import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Value } from "@/components/page";
import { api, ApiError, currentAdmin } from "@/lib/api";
import { contentTypes, type ContentRecord, type ContentRevision } from "@/lib/content";

export default async function ContentDetail({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!contentTypes.has(type)) notFound();
  const admin = await currentAdmin();
  const path = `/admin/content/${encodeURIComponent(id)}`;
  let record: ContentRecord;
  let revisions: ContentRevision[];
  try {
    [record, revisions] = await Promise.all([api<ContentRecord>(path), api<ContentRevision[]>(`${path}/revisions?limit=50`)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  if (record.content_type !== type) notFound();
  const permission = new Set(admin.permissions);
  const latest = revisions[0];
  const actions: { value: string; label: string }[] = [];
  if (record.lifecycle_state === "draft" && permission.has("content.edit")) actions.push({ value: "submit_review", label: "Submit for review" });
  if (record.lifecycle_state === "in_review" && permission.has("content.review")) {
    if (latest?.author_id !== admin.user_id) actions.push({ value: "approve", label: "Approve revision" });
    actions.push({ value: "reject", label: "Return to draft" });
  }
  if (permission.has("content.publish")) {
    if (record.lifecycle_state === "approved") actions.push({ value: "publish", label: "Publish revision" });
    if (record.lifecycle_state === "published") actions.push({ value: "deprecate", label: "Deprecate content" });
    if (record.lifecycle_state === "deprecated") actions.push({ value: "archive", label: "Archive content" });
  }
  return <>
    <PageHeader title={id} description={`Current revision ${record.current_revision} · ${record.lifecycle_state}. Published revision: ${record.published_revision ?? "None"}.`} actions={permission.has("content.edit") ? <Link className="button" href={`/content/${type}/new?id=${encodeURIComponent(id)}`}>Create revised draft</Link> : undefined} />
    {actions.length ? <section className="card"><h2>Review action</h2><ActionForm kind="content">
      <input type="hidden" name="stableId" value={id} />
      <label>Action<select name="action">{actions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
      <label>Reason<textarea name="reason" minLength={3} maxLength={1000} required /></label>
      <label>Repeat stable ID to confirm<input name="confirmation" required placeholder={id} /></label>
      <button>Apply action</button>
    </ActionForm></section> : <p className="muted">No workflow action is currently available for your role. Authors require an independent reviewer for approval.</p>}
    {revisions.map((revision) => <section className="card" key={revision.revision}>
      <h2>Revision {revision.revision} · {revision.review_state}</h2>
      <p>{revision.change_reason}</p>
      <p className="muted">Created <Value value={revision.created_at} /> · Author {revision.author_id}</p>
      {revision.reviewed_at ? <p className="muted">Reviewed <Value value={revision.reviewed_at} /> · Reviewer {revision.reviewer_id}</p> : null}
      {revision.published_at ? <p className="muted">Published <Value value={revision.published_at} /></p> : null}
      <h3>Source attribution</h3><pre className="code">{JSON.stringify(revision.source_metadata, null, 2)}</pre>
      <h3>Versioned content</h3><pre className="code">{JSON.stringify(revision.content, null, 2)}</pre>
    </section>)}
    <Link href={`/content/${type}`}>Back to {type} management</Link>
  </>;
}
