import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { toast } from "../store/toastStore";
import { NumberInput } from "./NumberInput";
import type { CatalogueColor, CataloguePurchaseLink } from "../lib/types";
import { Btn, Icon, IconBtn, inputBase, inputCls } from "./ui";
import { ReviewEditor } from "./Review";

/** Catalogue image paths are repo-relative ("images/x.webp"); the editor server serves them at /images/. */
export function catImg(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("images/")) return `/${path}`;
  if (path.startsWith("/api/catalogue/images/")) return path.replace("/api/catalogue/", "/");
  return path;
}

const PLATFORMS = ["Shopee", "Lazada", "Tiki", "TikTok", "Khác"];
const PLATFORM_TONE: Record<string, string> = {
  shopee: "text-orange-300 bg-orange-500/10",
  lazada: "text-blue-300 bg-blue-500/10",
  tiki: "text-cyan-300 bg-cyan-500/10",
  tiktok: "text-pink-300 bg-pink-500/10",
};
const platformTone = (p: string) => PLATFORM_TONE[(p || "").toLowerCase()] || "text-gray-300 bg-white/[0.06]";

function detectPlatform(url: string): string | null {
  const u = url.toLowerCase();
  if (u.includes("shopee") || u.includes("shope.ee")) return "Shopee";
  if (u.includes("lazada")) return "Lazada";
  if (u.includes("tiki")) return "Tiki";
  if (u.includes("tiktok")) return "TikTok";
  return null;
}

/** "link 240k" / "link 240.000" pasted together: split out the price. */
function priceFromText(text: string): string | null {
  const k = text.match(/(\d+)\s*k\b/i);
  if (k) return String(parseInt(k[1], 10) * 1000);
  const vnd = text.match(/(\d{1,3}(?:\.\d{3})+)/);
  if (vnd) return vnd[1].replace(/\./g, "");
  const n = text.match(/\b(\d{5,7})\b/);
  return n ? n[1] : null;
}

export const formatVND = (price?: number | null) =>
  typeof price === "number" && !isNaN(price) ? `${price.toLocaleString("vi-VN")} ₫` : "—";

export function lowestPrice(c: CatalogueColor): number | null {
  const prices = (c.purchase_links || []).map((l) => l.price).filter((p): p is number => typeof p === "number" && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

const Section = ({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-[12px] font-medium text-gray-400">{title}</span>
      {right}
    </div>
    {children}
  </section>
);

export function ColorDetail({
  color,
  threshold,
  onChange,
  onDelete,
  onClose,
  onUpload,
  onLightbox,
}: {
  color: CatalogueColor;
  threshold: number;
  onChange: (patch: Partial<CatalogueColor>) => void;
  onDelete: () => void;
  onClose: () => void;
  onUpload: (files: FileList | null) => void;
  onLightbox: (url: string) => void;
}) {
  // The native picker fires "change" once when it closes (React's onChange fires on every drag step).
  const latest = useRef({ color: color.color, onChange });
  useEffect(() => {
    latest.current = { color: color.color, onChange };
  });
  const pickerRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = pickerRef.current;
    if (!el) return;
    const commit = () => {
      const v = el.value.toUpperCase();
      if (v !== latest.current.color.toUpperCase()) latest.current.onChange({ color: v });
    };
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, []);
  useEffect(() => {
    if (pickerRef.current && /^#[0-9a-f]{6}/i.test(color.color)) pickerRef.current.value = color.color.slice(0, 7).toLowerCase();
  }, [color.color]);

  const images = color.images || [];
  const [imgIdx, setImgIdx] = useState(0);
  const current = images[Math.min(imgIdx, Math.max(0, images.length - 1))];
  const links = color.purchase_links || [];

  // New purchase link form
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState("Shopee");
  const [price, setPrice] = useState("");
  const [fetching, setFetching] = useState(false);

  const setLinks = (next: CataloguePurchaseLink[]) => onChange({ purchase_links: next });

  const fetchPrice = async () => {
    if (!url.trim()) return;
    setFetching(true);
    try {
      const res = await api.fetchProductPrice(url.trim());
      if (res.platform) setPlatform(res.platform);
      if (res.price) setPrice(String(res.price));
      else toast.info("Sàn chặn quét giá tự động, hãy nhập giá");
    } catch {
      toast.error("Không quét được link");
    } finally {
      setFetching(false);
    }
  };

  const addLink = () => {
    const u = url.trim();
    if (!u) return;
    const p = price.trim() ? parseInt(price.replace(/[^\d]/g, ""), 10) : null;
    setLinks([...links, { id: `link-${Date.now()}`, platform, url: u, price: p !== null && !isNaN(p) ? p : null }]);
    setUrl("");
    setPrice("");
  };

  return (
    <div className="h-full flex flex-col bg-panel">
      {/* Title row */}
      <div className="flex items-center gap-1 pl-4 pr-2 h-14 md:h-12 border-b border-line shrink-0">
        <span className="w-4 h-4 rounded border border-white/20 shrink-0" style={{ backgroundColor: color.color }} />
        <span className="text-[13px] font-medium text-white truncate flex-1">{color.name}</span>
        <IconBtn icon="trash" label="Xóa màu" tone="danger" onClick={onDelete} />
        <IconBtn icon="x" label="Đóng" onClick={onClose} />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-5">
        {/* Photos */}
        <div className="flex flex-col gap-2">
          <div className="h-56 w-full rounded-xl overflow-hidden border border-line bg-black/30 relative">
            {current ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={catImg(current)}
                alt={color.name}
                onClick={() => onLightbox(catImg(current))}
                className="w-full h-full object-cover cursor-zoom-in"
              />
            ) : (
              <label
                className="w-full h-full flex flex-col items-center justify-center gap-2 cursor-pointer text-white/90"
                style={{ backgroundColor: color.color }}
              >
                <span className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-black/60 text-[12px] font-medium">
                  <Icon name="image" />
                  Thêm ảnh
                </span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
          {images.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
              {images.map((src, i) => (
                <div key={src + i} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setImgIdx(i)}
                    className={`block w-11 h-11 rounded-lg overflow-hidden border cursor-pointer ${
                      src === current ? "border-primary-500" : "border-line opacity-70 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={catImg(src)} alt="" className="w-full h-full object-cover" />
                  </button>
                  {src === current && (
                    <button
                      type="button"
                      title="Xóa ảnh"
                      onClick={() => {
                        onChange({ images: images.filter((_, j) => j !== i) });
                        setImgIdx(0);
                      }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black border border-line text-gray-300 hover:text-rose-300 flex items-center justify-center cursor-pointer"
                    >
                      <Icon name="x" className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <label
                title="Thêm ảnh"
                className="w-11 h-11 rounded-lg border border-dashed border-line hover:border-primary-500/60 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer shrink-0"
              >
                <Icon name="plus" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          )}
        </div>

        {/* Name + colour */}
        <Section title="Tên & mã màu">
          <input
            key={`name-${color.name}`}
            defaultValue={color.name}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== color.name) onChange({ name: v });
              else e.currentTarget.value = color.name;
            }}
            className={inputCls}
            aria-label="Tên màu"
          />
          <div className="flex items-center gap-2">
            <label
              className="w-10 h-10 md:w-9 md:h-9 rounded-lg border border-white/20 shrink-0 relative overflow-hidden cursor-pointer"
              style={{ backgroundColor: color.color }}
              title="Chọn màu"
            >
              <input
                ref={pickerRef}
                type="color"
                defaultValue={/^#[0-9a-f]{6}/i.test(color.color) ? color.color.slice(0, 7) : "#ffffff"}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
              />
            </label>
            <input
              key={`hex-${color.color}`}
              defaultValue={color.color.toUpperCase()}
              onBlur={(e) => {
                let v = e.currentTarget.value.trim().toUpperCase();
                if (!v.startsWith("#")) v = "#" + v;
                if (/^#[0-9A-F]{6}$/.test(v)) {
                  if (v !== color.color.toUpperCase()) onChange({ color: v });
                } else e.currentTarget.value = color.color.toUpperCase();
              }}
              className={`${inputBase} flex-1 min-w-0 font-mono`}
              aria-label="Mã hex"
            />
            {color.color_code && (
              <span className="text-[11px] font-mono text-gray-500 shrink-0" title="Mã màu của hãng">
                #{color.color_code}
              </span>
            )}
          </div>
        </Section>

        {/* Review */}
        <Section title="Độ tin cậy & nguồn">
          <ReviewEditor item={color} threshold={threshold} onChange={onChange} />
        </Section>

        {/* Purchase links */}
        <Section title={`Link mua${links.length ? ` · ${links.length}` : ""}`}>
          {links.length > 0 && (
            <div className="flex flex-col rounded-lg border border-line divide-y divide-line overflow-hidden">
              {links.map((l) => (
                <div key={l.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 ${platformTone(l.platform)}`}>{l.platform}</span>
                  <NumberInput
                    integer
                    numpadLabel="Giá"
                    unit="₫"
                    key={`p-${l.id}-${l.price ?? ""}`}
                    defaultValue={l.price ?? ""}
                    placeholder="Giá"
                    onBlur={(e) => {
                      const v = e.currentTarget.value ? parseInt(e.currentTarget.value, 10) : null;
                      if (v !== (l.price ?? null)) setLinks(links.map((x) => (x.id === l.id ? { ...x, price: v } : x)));
                    }}
                    className="w-24 bg-transparent text-[12px] font-mono text-primary-300 outline-none border-b border-transparent focus:border-line"
                  />
                  <span className="flex-1" />
                  <IconBtn
                    icon="refresh"
                    label="Quét lại giá"
                    onClick={async () => {
                      try {
                        const res = await api.fetchProductPrice(l.url);
                        if (res.price) setLinks(links.map((x) => (x.id === l.id ? { ...x, price: res.price } : x)));
                        else toast.warning("Không tìm thấy giá");
                      } catch {
                        toast.error("Lỗi quét giá");
                      }
                    }}
                  />
                  <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url} className="inline-flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06]">
                    <Icon name="external" />
                  </a>
                  <IconBtn icon="trash" label="Xóa link" tone="danger" onClick={() => setLinks(links.filter((x) => x.id !== l.id))} />
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-2.5">
            <input
              type="url"
              value={url}
              onChange={(e) => {
                const val = e.target.value;
                const m = val.match(/(https?:\/\/[^\s]+)/i);
                const u = m ? m[1] : val;
                setUrl(u);
                if (m) {
                  const p = priceFromText(val.replace(u, ""));
                  if (p) setPrice(p);
                  const pf = detectPlatform(u);
                  if (pf) setPlatform(pf);
                }
              }}
              placeholder="Dán link sản phẩm (có thể kèm giá, VD: 240k)"
              className={`${inputCls} text-[12px] font-mono`}
            />
            <div className="flex items-center gap-2">
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={`${inputBase} w-24 shrink-0 px-2 text-[12px] cursor-pointer`}>
                {PLATFORMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <NumberInput
                integer
                numpadLabel="Giá"
                unit="₫"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Giá ₫"
                className={`${inputBase} flex-1 min-w-0 text-[12px] font-mono`}
              />
              <IconBtn icon="refresh" label="Quét giá từ link" tone="default" disabled={!url.trim() || fetching} onClick={fetchPrice} className={fetching ? "animate-pulse" : ""} />
              <Btn tone="primary" disabled={!url.trim()} onClick={addLink}>
                <Icon name="plus" />
                Thêm
              </Btn>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
