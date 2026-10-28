"use client";

import { useEffect, useRef, useState } from "react";

// ---------- Signature ----------

/** Finger / mouse signature capture. Stores a PNG data URL in the named hidden field. */
export function SignaturePad({
  name,
  initial,
  label,
  placeholder = "Sign here with your finger",
  allowUpload = false,
}: {
  name: string;
  initial?: string | null;
  label: string;
  placeholder?: string;
  allowUpload?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState<string>(initial ?? "");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2530";
    if (initial) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = initial;
    }
  }, [initial]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  return (
    <div>
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="h-40 w-full touch-none rounded-md border border-charcoal-200 bg-white"
          onPointerDown={(e) => {
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d")!;
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }}
          onPointerUp={(e) => {
            drawing.current = false;
            setValue(e.currentTarget.toDataURL("image/png"));
          }}
        />
        <div className="pointer-events-none absolute right-3 bottom-7 left-3 border-t border-dashed border-charcoal-200" />
        {!value && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-charcoal-400">{placeholder}</div>
        )}
      </div>
      <button
        type="button"
        className="mt-1 text-xs text-charcoal-500 hover:text-kudu-600"
        onClick={() => {
          const c = canvasRef.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          setValue("");
        }}
      >
        Clear signature
      </button>
      {allowUpload && (
        <label className="ml-4 cursor-pointer text-xs text-charcoal-500 hover:text-kudu-600">
          or upload an image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              const c = canvasRef.current;
              if (!file || !c) return;
              const bmp = await createImageBitmap(file);
              const ctx = c.getContext("2d")!;
              ctx.clearRect(0, 0, c.width, c.height);
              const scale = Math.min(c.width / bmp.width, c.height / bmp.height);
              ctx.drawImage(bmp, (c.width - bmp.width * scale) / 2, (c.height - bmp.height * scale) / 2, bmp.width * scale, bmp.height * scale);
              setValue(c.toDataURL("image/png"));
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

// ---------- Photos ----------

export type PhotoRef = { id: string; kind: "BEFORE" | "AFTER" | "EXTRA" };

/** Downscale and JPEG-compress a camera photo so uploads stay small. */
async function compress(file: File, maxDim = 1600, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

async function upload(file: File, kind: PhotoRef["kind"]): Promise<PhotoRef> {
  const dataUrl = await compress(file);
  const res = await fetch("/api/photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, kind }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
  const { id } = await res.json();
  return { id, kind };
}

const CameraIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mx-auto mb-1 opacity-60" aria-hidden>
    <path d="M4 7h3l1.5-2h7L17 7h3v12H4z" />
    <circle cx="12" cy="13" r="3.3" />
  </svg>
);

/** Before / After slots plus up to `maxExtra` additional photos. Submits JSON in "photos". */
export function PhotoPicker({ initial, maxExtra }: { initial: PhotoRef[]; maxExtra: number }) {
  const [photos, setPhotos] = useState<PhotoRef[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const pick = async (kind: PhotoRef["kind"], file?: File) => {
    if (!file) return;
    setError("");
    setBusy(kind);
    try {
      const ref = await upload(file, kind);
      setPhotos((p) => (kind === "EXTRA" ? [...p, ref] : [...p.filter((x) => x.kind !== kind), ref]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try a smaller photo.");
    } finally {
      setBusy(null);
    }
  };

  const fileInput = (kind: PhotoRef["kind"]) => (
    <input
      ref={(el) => {
        inputs.current[kind] = el;
      }}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        pick(kind, e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  const slot = (kind: "BEFORE" | "AFTER", label: string) => {
    const photo = photos.find((p) => p.kind === kind);
    return (
      <div>
        <span className="label">{label}</span>
        <button
          type="button"
          onClick={() => inputs.current[kind]?.click()}
          className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-charcoal-200 bg-charcoal-50 text-xs text-charcoal-500"
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/photos/${photo.id}`} alt={label} className="h-full w-full object-cover" />
          ) : (
            <span>
              <CameraIcon />
              {busy === kind ? "Uploading…" : "Tap for camera or gallery"}
            </span>
          )}
        </button>
        {photo && (
          <button type="button" className="mt-1 text-xs text-charcoal-500 hover:text-kudu-600" onClick={() => setPhotos((p) => p.filter((x) => x.id !== photo.id))}>
            Remove
          </button>
        )}
        {fileInput(kind)}
      </div>
    );
  };

  const extras = photos.filter((p) => p.kind === "EXTRA");
  return (
    <div>
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />
      <div className="grid grid-cols-2 gap-3">
        {slot("BEFORE", "Before")}
        {slot("AFTER", "After")}
      </div>
      <div className="mt-4">
        <span className="label">
          Additional photos <span className="font-normal normal-case">(optional, max {maxExtra})</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {extras.map((p) => (
            <div key={p.id} className="relative h-20 w-20 overflow-hidden rounded-md border border-charcoal-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${p.id}`} alt="Additional" className="h-full w-full object-cover" />
              <button
                type="button"
                title="Remove"
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}
              >
                ×
              </button>
            </div>
          ))}
          {extras.length < maxExtra && (
            <button
              type="button"
              onClick={() => inputs.current.EXTRA?.click()}
              className="flex h-20 w-20 items-center justify-center rounded-md border-2 border-dashed border-charcoal-200 bg-charcoal-50 text-2xl text-charcoal-400"
            >
              {busy === "EXTRA" ? "…" : "+"}
            </button>
          )}
        </div>
        {fileInput("EXTRA")}
      </div>
      {error && <p className="mt-2 text-sm text-kudu-700">{error}</p>}
    </div>
  );
}

// ---------- Warranty dates ----------

function addMonths(dateStr: string, months: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Warranty start / end. End follows start + N months until the user edits it. */
export function WarrantyDates({ start, end, months }: { start: string; end: string; months: number }) {
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const [auto, setAuto] = useState(!end);
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="label">Warranty start date</span>
        <input
          name="warrantyStart"
          type="date"
          className="input"
          value={s}
          onChange={(ev) => {
            setS(ev.target.value);
            if (auto && ev.target.value) setE(addMonths(ev.target.value, months));
          }}
        />
      </label>
      <label className="block">
        <span className="label">Warranty end date</span>
        <input
          name="warrantyEnd"
          type="date"
          className="input"
          value={e}
          onChange={(ev) => {
            setE(ev.target.value);
            setAuto(false);
          }}
        />
        {auto && <span className="mt-1 block text-xs text-charcoal-500">Set automatically to {months} months after the start date</span>}
      </label>
    </div>
  );
}

// ---------- Save button with sign-off checks ----------

/**
 * Before a job card is saved as Completed, require what the PurePest card required
 * before generating its PDF: a work description, the client's signature and the confirmation tick.
 */
export function JobCardSubmit() {
  const [error, setError] = useState("");
  return (
    <div>
      <button
        className="btn-primary px-6 py-2.5"
        onClick={(e) => {
          const form = e.currentTarget.form!;
          const get = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value?.trim() ?? "";
          if (get("status") !== "COMPLETED") return setError("");
          const missing = [
            !get("workDescription") && "describe the work done",
            !get("customerSignature") && "get the client's signature",
            !(form.elements.namedItem("clientConfirmed") as HTMLInputElement | null)?.checked && "tick the client confirmation box",
          ].filter(Boolean);
          if (missing.length) {
            e.preventDefault();
            setError(`To mark this job completed, please ${missing.join(", ")}.`);
          }
        }}
      >
        Save job card
      </button>
      {error && <p className="mt-2 text-sm font-medium text-kudu-700">{error}</p>}
    </div>
  );
}
