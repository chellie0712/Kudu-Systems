"use client";

import { useState } from "react";

/** 1–5 star picker for the client's rating; tap the chosen star again to clear it. */
export function StarRating({ name }: { name: string }) {
  const [value, setValue] = useState(0);
  const words = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  return (
    <div>
      <input type="hidden" name={name} value={value || ""} />
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating out of 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setValue(value === n ? 0 : n)}
            className={`text-4xl leading-none transition-colors ${n <= value ? "text-amber-400" : "text-charcoal-200"}`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-charcoal-500">{words[value] || "Optional"}</span>
      </div>
    </div>
  );
}

/** Checks the sign-off form on the phone before sending it, so the client isn't asked twice. */
export function SignOffSubmit() {
  const [error, setError] = useState("");
  return (
    <div>
      {error && <p className="mb-2 text-sm font-medium text-kudu-700">{error}</p>}
      <button
        className="btn-primary w-full py-3 text-base"
        onClick={(e) => {
          const form = e.currentTarget.form!;
          const get = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value?.trim() ?? "";
          const missing = [
            !get("customerSignName") && "enter your name",
            !get("customerSignature") && "sign in the box",
            !(form.elements.namedItem("clientConfirmed") as HTMLInputElement | null)?.checked && "tick the confirmation box",
          ].filter(Boolean);
          if (missing.length) {
            e.preventDefault();
            setError(`Please ${missing.join(", ")}.`);
          }
        }}
      >
        Sign off and complete the job
      </button>
    </div>
  );
}

/** Stars for a rating already given. */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-charcoal-200">{"★".repeat(5 - rating)}</span>
    </span>
  );
}
