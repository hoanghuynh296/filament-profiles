// Client of the editor server (server.py): same origin, or proxied by the Vite dev server.
import type { CatalogueData, CatalogueGitStatus, FetchPriceResult } from "./types";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as Record<string, unknown>;
      if (typeof data?.detail === "string") detail = data.detail;
      else if (typeof data?.message === "string") detail = data.message;
    } catch {
      // not JSON
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

const postJson = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  async getCatalogue(): Promise<CatalogueData> {
    return handleResponse<CatalogueData>(await fetch("/api/catalogue"));
  },

  async saveCatalogue(data: CatalogueData): Promise<CatalogueData> {
    return handleResponse<CatalogueData>(await postJson("/api/catalogue", data));
  },

  async getCatalogueGitStatus(): Promise<CatalogueGitStatus> {
    return handleResponse<CatalogueGitStatus>(await fetch("/api/git-status"));
  },

  async commitPushCatalogue(message?: string): Promise<{ success: boolean; message?: string; commit_hash?: string }> {
    return handleResponse(await postJson("/api/commit-push", { message: message || "" }));
  },

  async pullCatalogue(): Promise<{ success: boolean; output?: string; catalogue?: CatalogueData }> {
    return handleResponse(await fetch("/api/pull", { method: "POST" }));
  },

  /** Raw image body; the server only keeps the extension of `file.name`. */
  async uploadCatalogueImage(file: File): Promise<{ image_url: string }> {
    const res = await fetch(`/api/upload-image?name=${encodeURIComponent(file.name || "image.png")}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    return handleResponse<{ image_url: string }>(res);
  },

  async fetchProductPrice(url: string): Promise<FetchPriceResult> {
    return handleResponse<FetchPriceResult>(await postJson("/api/fetch-price", { url }));
  },
};
