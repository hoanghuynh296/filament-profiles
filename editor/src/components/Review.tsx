import React, { useMemo } from "react";
import { NumberInput } from "./NumberInput";
import type { CatalogueBrand, CatalogueFilament, CatalogueReviewFields } from "../lib/types";

/** Items below this confidence are listed in "Cần kiểm tra" (the user can change it). */
export const DEFAULT_REVIEW_THRESHOLD = 70;
const THRESHOLD_KEY = "bambu_catalogue_review_threshold";

export function loadReviewThreshold(): number {
  try {
    const v = Number(localStorage.getItem(THRESHOLD_KEY));
    return Number.isFinite(v) && v > 0 && v <= 100 ? v : DEFAULT_REVIEW_THRESHOLD;
  } catch {
    return DEFAULT_REVIEW_THRESHOLD;
  }
}

export function saveReviewThreshold(v: number) {
  try {
    localStorage.setItem(THRESHOLD_KEY, String(v));
  } catch {
    /* private mode */
  }
}

/** Short rubric shown as help text (mirrors docs/API.md, Filament catalogue). */
export const CONFIDENCE_HELP =
  "Độ tin cậy 0–100: 90+ hex & ảnh khớp nguồn chính thức · 80 ảnh xác nhận hex · 60–65 hex đo từ ảnh · 50 swatch web / thiếu ảnh · 35–45 lệch hoặc chưa xác minh · 25 không có trên web hãng.";

/** Missing confidence counts as unknown (0) so it shows up for review. */
export const confOf = (item: CatalogueReviewFields) =>
  typeof item.confidence === "number" ? item.confidence : 0;

function tone(v: number | undefined) {
  if (typeof v !== "number") return "bg-white/[0.06] text-gray-400 border-line";
  if (v >= 80) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  if (v >= 50) return "bg-amber-500/10 text-amber-300 border-amber-500/30";
  return "bg-rose-500/10 text-rose-300 border-rose-500/30";
}

export function ConfidenceBadge({ value, title }: { value?: number; title?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-mono shrink-0 ${tone(value)}`}
      title={title ?? CONFIDENCE_HELP}
    >
      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.75}>
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
      </svg>
      {typeof value === "number" ? value : "?"}
    </span>
  );
}

export function OriginLink({ url, label = "Nguồn" }: { url?: string; label?: string }) {
  if (!url) return null;
  let host = url;
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    /* keep raw */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 min-w-0 text-[11px] text-gray-400 hover:text-primary-300 transition"
      title={url}
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75}>
        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
      </svg>
      <span className="shrink-0">{label}:</span>
      <span className="truncate font-mono">{host}</span>
    </a>
  );
}

/** Editable review fields (confidence, origin_url, note); text fields save on blur. */
export function ReviewEditor({
  item,
  onChange,
  threshold,
}: {
  item: CatalogueReviewFields;
  onChange: (patch: Partial<CatalogueReviewFields>) => void;
  threshold: number;
}) {
  const low = confOf(item) < threshold;
  const field = "h-10 md:h-9 bg-field border rounded-lg px-2.5 outline-none focus:border-primary-500/60";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <NumberInput
          integer
          numpadLabel="Độ tin cậy (0–100)"
          min={0}
          max={100}
          key={`conf-${item.confidence ?? "x"}`}
          defaultValue={item.confidence ?? ""}
          placeholder="—"
          title={CONFIDENCE_HELP}
          aria-label="Độ tin cậy"
          onBlur={(e) => {
            const raw = e.currentTarget.value.trim();
            const v = raw === "" ? undefined : Math.max(0, Math.min(100, Math.round(Number(raw))));
            if (raw !== "" && !Number.isFinite(v)) return;
            if (v !== item.confidence) onChange({ confidence: v });
          }}
          className={`${field} w-16 text-center text-[13px] font-mono ${tone(item.confidence)}`}
        />
        <input
          type="url"
          key={`url-${item.origin_url ?? ""}`}
          defaultValue={item.origin_url ?? ""}
          placeholder="Link nguồn https://…"
          aria-label="Link nguồn"
          onBlur={(e) => {
            const v = e.currentTarget.value.trim() || undefined;
            if (v && !/^https?:\/\//i.test(v)) {
              e.currentTarget.value = item.origin_url ?? ""; // only http(s) links are kept
              return;
            }
            if (v !== item.origin_url) onChange({ origin_url: v });
          }}
          className={`${field} flex-1 min-w-0 border-line text-[12px] font-mono text-gray-300`}
        />
        {item.origin_url && (
          <a
            href={item.origin_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Mở link nguồn"
            className="inline-flex items-center justify-center w-10 h-10 md:w-9 md:h-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
            </svg>
          </a>
        )}
      </div>
      {(low || item.confidence_note) && (
        <textarea
          rows={2}
          key={`note-${item.confidence_note ?? ""}`}
          defaultValue={item.confidence_note ?? ""}
          placeholder="Ghi chú cần kiểm tra gì…"
          onBlur={(e) => {
            const v = e.currentTarget.value.trim() || undefined;
            if (v !== item.confidence_note) onChange({ confidence_note: v });
          }}
          className={`w-full bg-field border rounded-lg px-2.5 py-1.5 text-[12px] leading-snug resize-none outline-none focus:border-primary-500/60 ${
            low ? "border-amber-500/30 text-amber-200" : "border-line text-gray-400"
          }`}
        />
      )}
    </div>
  );
}

interface ReviewGroup {
  filament: CatalogueFilament;
  lineLow: boolean;
  colors: { idx: number; id: string; name: string; color: string; confidence?: number; note?: string; origin?: string }[];
  min: number;
}

export function useReviewGroups(brand: CatalogueBrand | null, threshold: number) {
  return useMemo(() => {
    const groups: ReviewGroup[] = [];
    for (const f of brand?.filaments || []) {
      const lineLow = confOf(f) < threshold;
      const colors = (f.colors || [])
        .map((c, idx) => ({ idx, id: c.id, name: c.name, color: c.color, confidence: c.confidence, note: c.confidence_note, origin: c.origin_url }))
        .filter((c) => confOf(c) < threshold)
        .sort((a, b) => confOf(a) - confOf(b));
      if (!lineLow && colors.length === 0) continue;
      const min = Math.min(lineLow ? confOf(f) : 101, ...colors.map((c) => confOf(c)));
      groups.push({ filament: f, lineLow, colors, min });
    }
    groups.sort((a, b) => a.min - b.min);
    const count = groups.reduce((n, g) => n + g.colors.length + (g.lineLow ? 1 : 0), 0);
    return { groups, count };
  }, [brand, threshold]);
}

export function ReviewList({
  groups,
  threshold,
  onThreshold,
  onOpen,
  lineLabel = (f) => f.name,
  selectedColorId,
  selectedLineId,
}: {
  groups: ReviewGroup[];
  threshold: number;
  onThreshold: (v: number) => void;
  onOpen: (filamentId: string, colorId?: string) => void;
  lineLabel?: (f: CatalogueFilament) => string;
  selectedColorId?: string | null;
  selectedLineId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1 text-[12px] text-gray-400" title={CONFIDENCE_HELP}>
        <span className="whitespace-nowrap">Điểm dưới</span>
        <NumberInput
          integer
          numpadLabel="Ngưỡng cần kiểm tra"
          min={1}
          max={100}
          key={`thr-${threshold}`}
          defaultValue={threshold}
          onBlur={(e) => {
            const v = Math.round(Number(e.currentTarget.value));
            if (v >= 1 && v <= 100 && v !== threshold) onThreshold(v);
          }}
          className="w-14 bg-field border border-line rounded-lg px-2 py-0.5 text-[12px] font-mono text-white outline-none focus:border-primary-500/60"
        />
      </div>

      {groups.length === 0 && (
        <div className="p-6 text-center text-[12px] text-gray-500">Không còn mục nào cần kiểm tra.</div>
      )}

      {groups.map((g) => (
        <div key={g.filament.id} className="rounded-xl border border-line overflow-hidden">
          <button
            type="button"
            onClick={() => onOpen(g.filament.id)}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 hover:bg-white/[0.04] text-left cursor-pointer"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-medium text-white truncate">{lineLabel(g.filament)}</span>
              {g.lineLow && g.filament.confidence_note && (
                <span className="text-[11px] text-amber-300/90 line-clamp-2">{g.filament.confidence_note}</span>
              )}
            </div>
            {g.lineLow ? (
              <ConfidenceBadge value={g.filament.confidence} />
            ) : (
              <span className="text-[11px] text-gray-500 font-mono shrink-0">{g.colors.length} màu</span>
            )}
          </button>
          {g.colors.map((c) => (
            <button
              type="button"
              key={c.id + c.idx}
              onClick={() => onOpen(g.filament.id, c.id)}
              className={`w-full flex items-start gap-2 px-2.5 py-1.5 border-t border-line/60 text-left cursor-pointer ${
                selectedLineId === g.filament.id && selectedColorId === c.id ? "bg-primary-500/10" : "hover:bg-white/[0.04]"
              }`}
            >
              <span className="w-4 h-4 mt-0.5 rounded border border-white/20 shrink-0" style={{ backgroundColor: c.color }} />
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[12px] text-gray-200 truncate">{c.name}</span>
                  <span className="text-[11px] font-mono text-gray-500 shrink-0">{c.color}</span>
                </div>
                {c.note && <span className="text-[11px] text-gray-400 line-clamp-2">{c.note}</span>}
              </div>
              <ConfidenceBadge value={c.confidence} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
