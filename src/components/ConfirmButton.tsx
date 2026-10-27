"use client";

/** Submit button that asks for confirmation first. */
export function ConfirmButton({
  children,
  message,
  className = "btn-danger",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn-outline" onClick={() => window.print()}>
      Print / Save PDF
    </button>
  );
}
