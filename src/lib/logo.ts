/** A logo from a form: a PNG/JPEG/WebP data URL under ~1.5 MB, or null for none. Throws on anything else. */
export function parseLogo(value: string): string | null {
  if (!value) return null;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error("The logo must be a PNG, JPEG or WebP image.");
  if (value.length > 2_000_000) throw new Error("The logo is too large; use an image under 1.5 MB.");
  return value;
}
