import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

// Vercel request bodies top out at 4.5 MB, so keep the total upload under this.
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export async function filesToBlocks(files: File[]): Promise<Anthropic.ContentBlockParam[]> {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error("Uploads are over 4 MB in total. Upload fewer or smaller files.");

  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
      const data = Buffer.from(await file.arrayBuffer()).toString("base64");
      blocks.push(
        { type: "text", text: `Document: ${file.name}` },
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
      );
    } else if (file.type.startsWith("text/") || /\.(txt|md|csv|json)$/.test(lower)) {
      blocks.push({ type: "text", text: `Document: ${file.name}\n\n${await file.text()}` });
    } else {
      throw new Error(`"${file.name}" isn't a supported file type. Upload PDF, TXT, or MD files.`);
    }
  }
  return blocks;
}
