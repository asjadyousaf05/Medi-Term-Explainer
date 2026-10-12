"use client";
import { useActionState } from "react";
import { createContent, type EditorState } from "./actions";

export function Editor({ type, stableId, content, source }: {
  type: string;
  stableId?: string;
  content?: Record<string, unknown>;
  source?: Record<string, unknown>;
}) {
  const [state, action, pending] = useActionState(createContent, {} as EditorState);
  return <form action={action} className="form-grid" aria-busy={pending}>
    {state.error ? <div className="error" role="alert">{state.error}</div> : null}
    <input type="hidden" name="contentType" value={type} />
    <label>Stable ID<input name="stableId" pattern="[A-Za-z0-9._-]+" maxLength={120} defaultValue={stableId} readOnly={Boolean(stableId)} required /></label>
    {type === "dataset" ? <p className="muted">Paste a complete reference dataset using schema version 1, with a new dataset_version. Include terminology, morphology, abbreviations, lessons, flashcards, quizzes, and source attribution. The API validates every reference before saving. An independent reviewer must approve publication.</p> : null}
    <label>Versioned content JSON<textarea name="content" rows={16} defaultValue={JSON.stringify(content ?? { title: "" }, null, 2)} required /></label>
    <label>Source metadata JSON<textarea name="sourceMetadata" rows={7} defaultValue={JSON.stringify(source ?? { provider: "", identifier: "", version: "" }, null, 2)} required /></label>
    <label>Change reason<textarea name="reason" rows={3} minLength={3} maxLength={1000} required /></label>
    <button disabled={pending}>{pending ? "Saving…" : "Save draft revision"}</button>
  </form>;
}
