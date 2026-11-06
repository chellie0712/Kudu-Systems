"use client";

import { useState } from "react";

/** Resize a logo to fit 800×400 and keep it as PNG, so transparency survives. */
async function toLogoDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 800 / bmp.width, 400 / bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Logo picker. Submits the logo as a data URL in a hidden field (empty = no logo). */
export function LogoInput({ name = "logo", initial }: { name?: string; initial?: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      <div className="flex h-28 w-64 items-center justify-center rounded-md border border-dashed border-charcoal-200 bg-charcoal-50 p-2">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Logo preview" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-charcoal-400">No logo</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <label className="btn-outline cursor-pointer py-1.5">
          {value ? "Change logo" : "Upload logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setError("");
                setValue(await toLogoDataUrl(file));
              } catch {
                setError("That file could not be read as an image.");
              }
            }}
          />
        </label>
        {value && (
          <button type="button" className="text-xs text-kudu-700 hover:underline" onClick={() => setValue("")}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs text-kudu-700">{error}</p>}
    </div>
  );
}
