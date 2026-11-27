"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill } from "@/components/assets/StatusPill";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { HistoryList } from "@/components/history/HistoryList";
import { EMPTY_HISTORY_NAMES, type HistoryNames } from "@/lib/history/display";
import { fieldsFor } from "@/lib/assets/fields";
import { deliverNotification } from "@/app/notify/actions";
import type { AssetEvent } from "@/lib/assets/events";
import { changeableStatuses, isEndOfLife, showReturnToService, statusChangeBlocker, statusSaveLabel, type StatusChoice } from "@/lib/assets/status-change";
import { assetTypeLabel, type AssetRecord } from "@/lib/assets/types";
import { APP_UPDATED_MESSAGE } from "@/lib/app-update";
import { PHOTO_MAX_EDGE_PX } from "@/lib/config";
import {
  checkInAsset,
  checkoutAsset,
  deleteAsset,
  ensureMeEmployee,
  moveAsset,
  removeAssetPhoto,
  setAssetStatus,
  uploadAssetPhoto,
} from "@/lib/data";
import type { AttachmentRecord, EmployeeRecord, LocationRecord } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { formatDate, formatMoney } from "@/lib/format";
import { photoRejection } from "@/lib/photos";
import { PERMISSIONS, can } from "@/lib/permissions";
import { saveLabelJob } from "@/lib/labels/job";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function AssetScreen({
  asset,
  pieces,
  events,
  photos,
  locations,
  employees,
  locationName,
  assigneeName,
  parent,
  permissions,
  userId,
  displayName,
  timeZone,
  names = EMPTY_HISTORY_NAMES,
  statuses = [],
  fieldDefinitions = [],
}: {
  asset: AssetRecord;
  pieces: AssetRecord[];
  events: AssetEvent[];
  photos: AttachmentRecord[];
  locations: LocationRecord[];
  employees: EmployeeRecord[];
  locationName: string | null;
  assigneeName: string | null;
  parent: { id: string; name: string; tag_id: string } | null;
  permissions: string[];
  userId: string;
  displayName: string;
  timeZone: string;
  names?: HistoryNames;
  statuses?: { key: string; label: string; archived_at: string | null; position?: number; counts_as_available?: boolean; needs_attention?: boolean; notify?: boolean }[];
  fieldDefinitions?: { key: string; label: string; kind: string; type_key: string; archived_at: string | null }[];
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"checkout" | "move" | "status" | "damage" | "delete" | null>(null);
  const [targetKind, setTargetKind] = useState<"person" | "location">("person");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(asset.location_id);
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canCheckout = can(permissions, PERMISSIONS.assetsCheckout);
  const canWrite = can(permissions, PERMISSIONS.assetsWrite);
  const canMove = can(permissions, PERMISSIONS.assetsMove);
  const canMaintain = can(permissions, PERMISSIONS.assetsMaintain) || canWrite;
  const activePeople = employees.filter((person) => person.active && !person.archived_at);
  const openLocations = locations.filter((location) => !location.archived_at);
  const statusChoices = changeableStatuses(
    (statuses.length
      ? statuses
      : [
          { key: "available", label: "Available", position: 10, archived_at: null },
          { key: "in_repair", label: "In repair", position: 30, archived_at: null },
          { key: "broken", label: "Broken", position: 40, archived_at: null },
          { key: "missing", label: "Missing", position: 50, archived_at: null },
          { key: "disposed", label: "Disposed", position: 70, archived_at: null },
          { key: "destroyed", label: "Destroyed", position: 80, archived_at: null },
        ]
    ).map((status) => ({
      key: status.key,
      label: status.label,
      position: status.position,
      archivedAt: status.archived_at,
    })),
    asset.status,
  );
  const currentStatusLabel = statuses.find((status) => status.key === asset.status)?.label;
  const detailFields = fieldDefinitions.filter((field) => field.type_key === asset.type);

  async function notify(eventId: string) {
    await deliverNotification(eventId);
  }

  async function run(action: () => Promise<void>) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setPending(false);
    }
  }

  async function confirmCheckout() {
    await run(async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) return;
      const result = await checkoutAsset(supabase, asset, pieces.map((child) => child.id), {
        employeeId: targetKind === "person" ? employeeId : null,
        locationId: targetKind === "location" ? locationId : null,
        dueOn: dueOn || null,
      });
      await notify(result.eventId);
      setPanel(null);
      setMessage(asset.checkout_as_unit && pieces.length ? "Kit checked out." : "Checked out.");
    });
  }

  async function saveStatus(next: string, statusNote: string, confirmed: boolean) {
    const blocker = statusChangeBlocker({ next, note: statusNote, confirmed });
    if (blocker) {
      setMessage(null);
      setError(blocker);
      return;
    }
    await run(async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) return;
      const result = await setAssetStatus(supabase, asset.id, next, statusNote);
      await notify(result.eventId);
      setPanel(null);
      setNote("");
      setNextStatus("");
      setConfirmEnd(false);
      setMessage(next === "available" ? "Marked available." : "Status updated.");
    });
  }

  async function checkIn() {
    await run(async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) return;
      const result = await checkInAsset(supabase, asset, pieces);
      await notify(result.eventId);
      setPanel("damage");
      setMessage("Checked in.");
    });
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
      {photos[0]?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photos[0].url} alt="" className="max-h-72 w-full rounded-3xl object-cover" />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-muted">{asset.tag_id}</p>
          <h1 className="font-serif text-4xl tracking-tight">{asset.name}</h1>
          <p className="mt-2 text-sm text-muted">{assetTypeLabel(asset.type)}</p>
        </div>
        <StatusPill status={asset.status} label={currentStatusLabel} />
      </div>

      <dl className="grid gap-3 rounded-3xl bg-card p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Location</dt>
          <dd>{locationName ?? "Not set"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Who has it</dt>
          <dd>{assigneeName ?? (asset.status === "checked_out" ? "Checked out" : "Nobody")}</dd>
        </div>
        {asset.due_on ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Due</dt>
            <dd>{formatDate(asset.due_on, timeZone)}</dd>
          </div>
        ) : null}
        {asset.group_label ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Group</dt>
            <dd>{asset.group_label}</dd>
          </div>
        ) : null}
      </dl>

      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? (
        <div className="grid gap-2">
          <Banner tone="bad">{error}</Banner>
          {error === APP_UPDATED_MESSAGE ? (
            <Button type="button" variant="ink" onClick={() => window.location.reload()}>
              Reload
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {canCheckout && asset.status === "available" ? (
          <Button className="w-full text-lg" onClick={() => setPanel("checkout")}>
            Check out
          </Button>
        ) : null}
        {canCheckout && asset.status === "checked_out" ? (
          <Button className="w-full text-lg" disabled={pending} onClick={() => void checkIn()}>
            Check in
          </Button>
        ) : null}
        {canMove ? (
          <Button variant="ghost" className="w-full" onClick={() => setPanel("move")}>
            Move
          </Button>
        ) : null}
        {canMaintain && showReturnToService(asset.status) ? (
          <Button variant="ghost" className="w-full" disabled={pending} onClick={() => void saveStatus("available", "", true)}>
            Mark repaired / return to service
          </Button>
        ) : null}
        {canMaintain ? (
          <Button variant="ghost" className="w-full" onClick={() => setPanel("status")}>
            Change status
          </Button>
        ) : null}
      </div>

      {panel === "checkout" ? (
        <section className="grid gap-4 rounded-3xl border border-line bg-card p-4">
          <h2 className="font-serif text-2xl">Check out</h2>
          {asset.checkout_as_unit && pieces.length ? (
            <p className="text-sm text-muted">This also checks out {pieces.length} piece{pieces.length === 1 ? "" : "s"} in the kit.</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={targetKind === "person" ? "ink" : "ghost"} onClick={() => setTargetKind("person")}>
              Person
            </Button>
            <Button type="button" variant={targetKind === "location" ? "ink" : "ghost"} onClick={() => setTargetKind("location")}>
              Location
            </Button>
          </div>
          {targetKind === "person" ? (
            <div className="grid gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  void run(async () => {
                    const supabase = getBrowserSupabase();
                    if (!supabase) return;
                    const me = await ensureMeEmployee(supabase, asset.organization_id, userId, displayName);
                    setEmployeeId(me.id);
                  })
                }
              >
                Me
              </Button>
              {activePeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={`min-h-12 rounded-2xl border px-3 text-left ${employeeId === person.id ? "border-ink bg-paper-deep" : "border-line"}`}
                  onClick={() => setEmployeeId(person.id)}
                >
                  {person.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-2">
              {openLocations.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  className={`min-h-12 rounded-2xl border px-3 text-left ${locationId === location.id ? "border-ink bg-paper-deep" : "border-line"}`}
                  onClick={() => setLocationId(location.id)}
                >
                  {location.name}
                </button>
              ))}
            </div>
          )}
          <Field label="Due date, optional">
            <TextInput type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
          </Field>
          <Button disabled={pending} onClick={() => void confirmCheckout()}>
            Confirm check out
          </Button>
        </section>
      ) : null}

      {panel === "damage" ? (
        <section className="grid gap-3 rounded-3xl border border-line bg-card p-4">
          <h2 className="font-serif text-2xl">Anything damaged?</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setPanel(null)}>Skip</Button>
            <Button
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  const result = await setAssetStatus(supabase, asset.id, "broken", "Damaged at check-in");
                  await notify(result.eventId);
                  setPanel(null);
                  setMessage("Marked broken.");
                })
              }
            >
              Mark damaged
            </Button>
          </div>
        </section>
      ) : null}

      {panel === "move" ? (
        <section className="grid gap-3 rounded-3xl border border-line bg-card p-4">
          <h2 className="font-serif text-2xl">Move</h2>
          {openLocations.map((location) => (
            <button
              key={location.id}
              type="button"
              className={`min-h-12 rounded-2xl border px-3 text-left ${locationId === location.id ? "border-ink bg-paper-deep" : "border-line"}`}
              onClick={() => setLocationId(location.id)}
            >
              {location.name}
            </button>
          ))}
          <Button
            disabled={pending || !locationId}
            onClick={() =>
              void run(async () => {
                const supabase = getBrowserSupabase();
                if (!supabase || !locationId) return;
                await moveAsset(supabase, asset.id, locationId);
                setPanel(null);
                setMessage("Location updated.");
              })
            }
          >
            Save location
          </Button>
        </section>
      ) : null}

      {panel === "status" ? (
        <StatusChangePanel
          current={asset.status}
          currentLabel={currentStatusLabel}
          choices={statusChoices}
          nextStatus={nextStatus}
          note={note}
          confirmEnd={confirmEnd}
          pending={pending}
          onPick={(key) => {
            setNextStatus(key);
            setConfirmEnd(false);
          }}
          onNote={setNote}
          onConfirm={setConfirmEnd}
          onSave={() => void saveStatus(nextStatus, note, confirmEnd)}
        />
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Details</h2>
        <Detail label="Brand" value={asset.brand} />
        <Detail label="Model" value={asset.model} />
        <Detail label="Serial" value={asset.serial} />
        <Detail label="Vendor" value={asset.vendor} />
        <Detail label="Purchased" value={asset.purchase_date ? formatDate(asset.purchase_date, timeZone) : null} />
        <Detail label="Cost" value={formatMoney(asset.cost) || null} />
        {(detailFields.length ? detailFields : fieldsFor(asset.type)).map((field) => (
          <Detail
            key={field.key}
            label={field.label}
            value={
              field.kind === "date" && asset.custom_fields[field.key]
                ? formatDate(asset.custom_fields[field.key], timeZone)
                : asset.custom_fields[field.key] ?? null
            }
          />
        ))}
        {asset.notes ? <p className="rounded-2xl bg-card p-4 text-sm leading-6">{asset.notes}</p> : null}
        {parent ? (
          <p className="text-sm">
            Part of <Link className="underline" href={`/assets/${parent.id}`}>{parent.name}</Link> ({parent.tag_id})
          </p>
        ) : null}
        {pieces.length ? (
          <div>
            <h3 className="text-sm font-medium">Pieces</h3>
            <ul className="mt-2 grid gap-2">
              {pieces.map((child) => (
                <li key={child.id}>
                  <Link className="block rounded-2xl bg-card px-3 py-3" href={`/assets/${child.id}`}>
                    <span className="font-mono text-xs text-muted">{child.tag_id}</span>
                    <span className="mt-1 block">{child.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">Photos</h2>
        {photos.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <figure key={photo.id} className="overflow-hidden rounded-2xl bg-card">
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt={photo.file_name} className="aspect-square w-full object-cover" />
                ) : null}
                {canWrite ? (
                  <button
                    type="button"
                    className="w-full px-2 py-2 text-left text-sm underline"
                    onClick={() =>
                      void run(async () => {
                        const supabase = getBrowserSupabase();
                        if (!supabase) return;
                        await removeAssetPhoto(supabase, photo.id);
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </figure>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No photos yet.</p>
        )}
        {canWrite ? (
          <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-line bg-card px-4">
            Add photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  const prepared = await preparePhoto(file);
                  await uploadAssetPhoto(supabase, asset, prepared);
                  setMessage("Photo added.");
                });
              }}
            />
          </label>
        ) : null}
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">History</h2>
        <HistoryList events={events} timeZone={timeZone} names={names} />
      </section>

      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <Link href={`/assets/${asset.id}/edit`} className="inline-flex min-h-12 items-center rounded-full border border-line bg-card px-4">
            Edit
          </Link>
        ) : null}
        <button
          type="button"
          className="inline-flex min-h-12 items-center rounded-full border border-line bg-card px-4"
          onClick={() => {
            saveLabelJob({
              templateId: "avery-5163",
              showType: true,
              showLocation: true,
              customWidth: 2,
              customHeight: 1,
              labels: [
                {
                  tagId: asset.tag_id,
                  name: asset.name,
                  typeLabel: assetTypeLabel(asset.type),
                  location: locationName,
                },
              ],
            });
            router.push("/labels/print");
          }}
        >
          Print label
        </button>
        {canWrite ? (
          <Button variant="ghost" onClick={() => setPanel("delete")}>
            Archive
          </Button>
        ) : null}
      </div>
      {panel === "delete" ? (
        <section className="grid gap-3 rounded-3xl border border-danger bg-danger-soft p-4">
          <p>Archive {asset.name}? It leaves the lists and pickers, and the history stays.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  await deleteAsset(supabase, asset.id);
                  router.push("/assets");
                })
              }
            >
              Archive asset
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatusChangePanel({
  current,
  currentLabel,
  choices,
  nextStatus,
  note,
  confirmEnd,
  pending,
  onPick,
  onNote,
  onConfirm,
  onSave,
}: {
  current: string;
  currentLabel?: string;
  choices: StatusChoice[];
  nextStatus: string;
  note: string;
  confirmEnd: boolean;
  pending: boolean;
  onPick: (key: string) => void;
  onNote: (value: string) => void;
  onConfirm: (value: boolean) => void;
  onSave: () => void;
}) {
  const ending = isEndOfLife(nextStatus);
  const chosen = choices.find((status) => status.key === nextStatus);
  return (
    <section className="grid gap-3 rounded-3xl border border-line bg-card p-4">
      <h2 className="font-serif text-2xl">Change status</h2>
      <p className="text-sm text-muted">
        Now: <StatusPill status={current} label={currentLabel} />
      </p>
      <p className="text-sm text-muted">Check out stays on its own button. Pick any other active status, including Available.</p>
      {choices.length ? (
        <div className="flex flex-wrap gap-2">
          {choices.map((status) => (
            <Button key={status.key} type="button" variant={nextStatus === status.key ? "ink" : "ghost"} onClick={() => onPick(status.key)}>
              {status.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No other statuses are available.</p>
      )}
      <Field label={ending ? "Note" : "Note, optional"} hint={ending ? "Disposed and destroyed need a note." : undefined}>
        <TextInput value={note} onChange={(event) => onNote(event.target.value)} />
      </Field>
      {ending ? (
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-1 h-5 w-5" type="checkbox" checked={confirmEnd} onChange={(event) => onConfirm(event.target.checked)} />
          <span>Confirm {chosen?.label ?? "this"}. This takes the item out of service.</span>
        </label>
      ) : null}
      <Button disabled={pending || !nextStatus} onClick={onSave}>
        {statusSaveLabel(nextStatus || "status")}
      </Button>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

async function preparePhoto(file: File): Promise<{ name: string; type: string; size: number; body: Blob }> {
  const rejection = photoRejection(file);
  if (rejection) throw new Error(rejection);
  if (typeof createImageBitmap !== "function") {
    return { name: file.name, type: file.type, size: file.size, body: file };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return { name: file.name, type: file.type, size: file.size, body: file };
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  bitmap.close?.();
  if (!blob) return { name: file.name, type: file.type, size: file.size, body: file };
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { name, type: "image/jpeg", size: blob.size, body: blob };
}
