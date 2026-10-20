import React, { useEffect, useMemo, useRef, useState } from "react";
import { NumberInput } from "./components/NumberInput";
import { api } from "./lib/api";
import { toast } from "./store/toastStore";
import { confirmDialog } from "./store/confirmStore";
import { FILAMENT_TYPES } from "./lib/filamentTypes";
import type { CatalogueData, CatalogueBrand, CatalogueFilament, CatalogueColor, CatalogueGitStatus } from "./lib/types";
import {
  ConfidenceBadge,
  CONFIDENCE_HELP,
  ReviewList,
  confOf,
  loadReviewThreshold,
  saveReviewThreshold,
  useReviewGroups,
} from "./components/Review";
import { ColorDetail, catImg, formatVND, lowestPrice } from "./components/ColorDetail";
import { Btn, Field, Icon, IconBtn, Modal, inputCls, shortLineName } from "./components/ui";

// Plastic types offered in the editor ("Khác" = anything else).
const MATERIAL_TYPES = [...FILAMENT_TYPES, "Khác"];

const splitAliases = (text: string) =>
  text
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

type SaveState = "idle" | "saving" | "saved" | "error";

export default function FilamentCataloguePage() {
  const [catalogue, setCatalogue] = useState<CatalogueData | null>(null);
  const [gitStatus, setGitStatus] = useState<CatalogueGitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [committing, setCommitting] = useState(false);
  const [pulling, setPulling] = useState(false);

  const [brandId, setBrandId] = useState("");
  const [lineId, setLineId] = useState("");
  const [colorId, setColorId] = useState<string | null>(null);

  const [lineTab, setLineTab] = useState<"all" | "review">("all");
  // Phones show one pane at a time: the line list, then the colours of the picked line.
  const [mobileView, setMobileView] = useState<"lines" | "colors">("lines");
  const [lineSearch, setLineSearch] = useState("");
  // The page renders a loading state until the catalogue arrives, so reading localStorage here is safe.
  const [threshold, setThreshold] = useState(loadReviewThreshold);

  const [brandModal, setBrandModal] = useState<{ brand: CatalogueBrand | null } | null>(null);
  const [lineModal, setLineModal] = useState<{ line: CatalogueFilament | null } | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  // ---------------------------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    Promise.all([api.getCatalogue(), api.getCatalogueGitStatus().catch(() => null)])
      .then(([data, status]) => {
        if (!active) return;
        setCatalogue(data);
        setGitStatus(status);
        const b = data.brands?.[0];
        if (b) {
          setBrandId(b.id);
          setLineId(b.filaments?.[0]?.id || "");
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        toast.error(`Lỗi tải Catalogue: ${errText(err)}`);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const brand = useMemo(() => catalogue?.brands?.find((b) => b.id === brandId) || null, [catalogue, brandId]);
  const line = useMemo(() => brand?.filaments?.find((f) => f.id === lineId) || null, [brand, lineId]);
  const colorIdx = line && colorId ? line.colors.findIndex((c) => c.id === colorId) : -1;
  const color = colorIdx >= 0 ? line!.colors[colorIdx] : null;
  const review = useReviewGroups(brand, threshold);
  const lineLabel = (f: CatalogueFilament) => shortLineName(f.name, brand?.name);

  const lines = useMemo(() => {
    const all = brand?.filaments || [];
    const q = lineSearch.trim().toLowerCase();
    return q ? all.filter((f) => f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q)) : all;
  }, [brand, lineSearch]);

  // ---------------------------------------------------------------------------------------------
  // Save: every edit is written to catalogue.json at once (quietly; errors toast)
  // ---------------------------------------------------------------------------------------------
  const saveSeq = useRef(0);
  const persist = async (updated: CatalogueData) => {
    setCatalogue(updated);
    const seq = ++saveSeq.current;
    setSaveState("saving");
    try {
      const saved = await api.saveCatalogue(updated);
      if (seq !== saveSeq.current) return; // a newer edit is on its way
      setCatalogue(saved);
      setSaveState("saved");
      setGitStatus(await api.getCatalogueGitStatus().catch(() => null));
    } catch (err: unknown) {
      if (seq === saveSeq.current) setSaveState("error");
      toast.error(`Lưu thất bại: ${errText(err)}`);
    }
  };

  const updateBrands = (fn: (brands: CatalogueBrand[]) => CatalogueBrand[]) => {
    if (catalogue) persist({ ...catalogue, brands: fn(catalogue.brands) });
  };
  const updateLines = (fn: (lines: CatalogueFilament[]) => CatalogueFilament[]) =>
    updateBrands((bs) => bs.map((b) => (b.id === brandId ? { ...b, filaments: fn(b.filaments || []) } : b)));
  const updateLine = (id: string, patch: Partial<CatalogueFilament>) =>
    updateLines((ls) => ls.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const updateColors = (fn: (colors: CatalogueColor[]) => CatalogueColor[]) =>
    updateLines((ls) => ls.map((f) => (f.id === lineId ? { ...f, colors: fn(f.colors || []) } : f)));
  const updateColor = (id: string, patch: Partial<CatalogueColor>) =>
    updateColors((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  // ---------------------------------------------------------------------------------------------
  // Git
  // ---------------------------------------------------------------------------------------------
  const handlePull = async () => {
    setPulling(true);
    try {
      const res = await api.pullCatalogue();
      if (res.catalogue) setCatalogue(res.catalogue);
      toast.success("Đã tải bản mới nhất từ GitHub");
      setGitStatus(await api.getCatalogueGitStatus().catch(() => null));
    } catch (err: unknown) {
      toast.error(`Lỗi tải từ GitHub: ${errText(err)}`);
    } finally {
      setPulling(false);
    }
  };

  const handleCommit = async () => {
    setCommitting(true);
    try {
      const res = await api.commitPushCatalogue(commitMessage.trim());
      setCommitOpen(false);
      toast.success(res.message || "Đã đẩy lên GitHub");
      setGitStatus(await api.getCatalogueGitStatus().catch(() => null));
    } catch (err: unknown) {
      toast.error(`Lỗi đẩy lên GitHub: ${errText(err)}`);
    } finally {
      setCommitting(false);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Brands / lines / colours
  // ---------------------------------------------------------------------------------------------
  const selectBrand = (b: CatalogueBrand) => {
    setBrandId(b.id);
    setLineId(b.filaments?.[0]?.id || "");
    setColorId(null);
    setMobileView("lines");
  };

  const openLine = (id: string, color: string | null = null) => {
    setLineId(id);
    setColorId(color);
    setMobileView("colors");
  };

  const saveBrand = (data: Partial<CatalogueBrand>) => {
    const editing = brandModal?.brand;
    if (editing) {
      updateBrands((bs) => bs.map((b) => (b.id === editing.id ? { ...b, ...data } : b)));
    } else {
      const id = slug(data.name || "brand");
      updateBrands((bs) => [...bs, { id, name: data.name || "Hãng mới", logo: data.logo || "", aliases: data.aliases, filaments: [] }]);
      setBrandId(id);
      setLineId("");
    }
    setBrandModal(null);
  };

  const deleteBrand = async (b: CatalogueBrand) => {
    const ok = await confirmDialog({
      title: "Xóa hãng?",
      message: `Xóa "${b.name}" cùng ${b.filaments?.length || 0} loại nhựa?`,
      confirmLabel: "Xóa",
      tone: "danger",
    });
    if (!ok || !catalogue) return;
    const rest = catalogue.brands.filter((x) => x.id !== b.id);
    persist({ ...catalogue, brands: rest });
    setBrandModal(null);
    if (rest[0]) selectBrand(rest[0]);
  };

  const saveLine = (data: Partial<CatalogueFilament>) => {
    const editing = lineModal?.line;
    if (editing) {
      updateLine(editing.id, data);
    } else if (brand) {
      const id = `${brand.id}-${slug(data.name || "filament")}`;
      updateLines((ls) => [
        ...ls,
        { id, brand_id: brand.id, name: data.name || "Loại nhựa mới", type: data.type || "PLA", description: "", confidence: 100, colors: [], ...data },
      ]);
      openLine(id);
    }
    setLineModal(null);
  };

  const deleteLine = async (f: CatalogueFilament) => {
    const ok = await confirmDialog({ title: "Xóa loại nhựa?", message: `Xóa "${f.name}"?`, confirmLabel: "Xóa", tone: "danger" });
    if (!ok) return;
    updateLines((ls) => ls.filter((x) => x.id !== f.id));
    setLineModal(null);
    setLineId(brand?.filaments?.find((x) => x.id !== f.id)?.id || "");
    setColorId(null);
  };

  const addColor = () => {
    if (!line) return;
    const id = `c-${Date.now()}`;
    updateColors((cs) => [...cs, { id, name: `Màu mới ${cs.length + 1}`, color: "#EC1C24", images: [], confidence: 100 }]);
    setColorId(id);
  };

  const deleteColor = async (c: CatalogueColor) => {
    const ok = await confirmDialog({ title: "Xóa màu?", message: `Xóa màu "${c.name}"?`, confirmLabel: "Xóa", tone: "danger" });
    if (!ok) return;
    updateColors((cs) => cs.filter((x) => x.id !== c.id));
    setColorId(null);
  };

  const uploadImages = async (c: CatalogueColor, files: FileList | null) => {
    if (!files?.length) return;
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const res = await api.uploadCatalogueImage(f);
        if (res.image_url) urls.push(res.image_url);
      }
      updateColor(c.id, { images: [...(c.images || []), ...urls] });
    } catch (err: unknown) {
      toast.error(`Lỗi tải ảnh: ${errText(err)}`);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-background text-gray-400 text-[13px] gap-3">
        <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        Đang tải Catalogue…
      </div>
    );
  }

  const dirty = gitStatus?.has_uncommitted_changes;
  const lowCount = (f: CatalogueFilament) =>
    (f.colors || []).filter((c) => confOf(c) < threshold).length + (confOf(f) < threshold ? 1 : 0);

  const detail = color && (
    <ColorDetail
      key={color.id}
      color={color}
      threshold={threshold}
      onChange={(patch) => updateColor(color.id, patch)}
      onDelete={() => deleteColor(color)}
      onClose={() => setColorId(null)}
      onUpload={(files) => uploadImages(color, files)}
      onLightbox={setLightbox}
    />
  );

  return (
    <div className="h-dvh w-full flex flex-col bg-background text-white overflow-hidden">
      {/* Header (safe areas: the app runs as a home-screen web app with a translucent status bar) */}
      <header className="pt-[env(safe-area-inset-top)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] border-b border-line bg-panel shrink-0">
        <div className="h-12 flex items-center gap-2">
        <h1 className="text-[15px] font-semibold tracking-tight">Filament catalogue</h1>
        {gitStatus && (
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-2 h-6 rounded-full bg-white/[0.05] text-[11px] font-mono text-gray-400"
            title={dirty ? `${gitStatus.uncommitted_files.length} file chưa đẩy lên` : `commit ${gitStatus.commit_hash}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dirty ? "bg-amber-400" : "bg-emerald-400"}`} />
            {gitStatus.branch}
          </span>
        )}
        <span className="text-[12px] text-gray-500 ml-1 flex items-center gap-1">
          {saveState === "saving" && (
            <>
              <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">Đang lưu…</span>
            </>
          )}
          {saveState === "saved" && (
            <>
              <Icon name="check" className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Đã lưu</span>
            </>
          )}
          {saveState === "error" && <span className="text-rose-300">Lưu lỗi</span>}
        </span>
        <span className="flex-1" />
        <Btn onClick={handlePull} disabled={pulling} title="Tải bản mới nhất từ GitHub">
          <Icon name="pull" />
          <span className="hidden sm:inline">Tải về</span>
        </Btn>
        <Btn
          tone="primary"
          onClick={() => {
            setCommitMessage(`feat(catalogue): update ${brand?.name || "filament"} data`);
            setCommitOpen(true);
          }}
          title="Commit & đẩy lên GitHub"
        >
          <Icon name="push" />
          <span className="hidden sm:inline">Đẩy lên</span>
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />}
        </Btn>
        </div>
      </header>

      {/* Brands */}
      <nav className="h-12 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] flex items-center gap-1.5 border-b border-line bg-panel/60 shrink-0 overflow-x-auto no-scrollbar">
        {catalogue?.brands.map((b) => {
          const active = b.id === brandId;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => selectBrand(b)}
              className={`inline-flex items-center gap-2 h-9 md:h-8 pl-1.5 pr-3 rounded-lg text-[13px] font-medium shrink-0 transition cursor-pointer ${
                active ? "bg-white/[0.1] text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
              }`}
            >
              {b.logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={catImg(b.logo)} alt="" className="w-5 h-5 rounded object-contain bg-black/40" />
              ) : (
                <span className="w-5 h-5 rounded bg-white/[0.08] text-[11px] flex items-center justify-center">{b.name.charAt(0)}</span>
              )}
              {b.name}
              <span className="text-[11px] font-mono text-gray-500">{b.filaments?.length || 0}</span>
            </button>
          );
        })}
        {brand && <IconBtn icon="pencil" label={`Sửa hãng ${brand.name}`} onClick={() => setBrandModal({ brand })} />}
        <IconBtn icon="plus" label="Thêm hãng" onClick={() => setBrandModal({ brand: null })} />
      </nav>

      <div className="flex-1 flex overflow-hidden">
        {/* Lines */}
        <aside
          className={`${mobileView === "lines" ? "flex" : "hidden"} md:flex w-full md:w-60 lg:w-64 md:border-r border-line flex-col shrink-0 overflow-hidden`}
        >
          <div className="p-2 flex gap-1 border-b border-line">
            {(
              [
                ["all", "Tất cả", brand?.filaments?.length || 0],
                ["review", "Cần kiểm tra", review.count],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLineTab(key)}
                title={key === "review" ? CONFIDENCE_HELP : undefined}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 md:h-8 rounded-lg text-[12px] font-medium whitespace-nowrap transition cursor-pointer ${
                  lineTab === key ? "bg-white/[0.08] text-white" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {label}
                <span
                  className={`px-1.5 rounded-full text-[11px] font-mono ${
                    key === "review" && n > 0 ? "bg-amber-500/15 text-amber-300" : "bg-white/[0.06] text-gray-400"
                  }`}
                >
                  {n}
                </span>
              </button>
            ))}
          </div>

          {lineTab === "review" ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <ReviewList
                groups={review.groups}
                threshold={threshold}
                lineLabel={lineLabel}
                selectedColorId={colorId}
                selectedLineId={lineId}
                onThreshold={(v) => {
                  setThreshold(v);
                  saveReviewThreshold(v);
                }}
                onOpen={(fid, cid) => openLine(fid, cid ?? null)}
              />
            </div>
          ) : (
            <>
              <div className="p-2 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500">
                    <Icon name="search" className="w-3.5 h-3.5" />
                  </span>
                  <input
                    value={lineSearch}
                    onChange={(e) => setLineSearch(e.target.value)}
                    placeholder="Tìm loại nhựa"
                    className={`${inputCls} h-9 md:h-8 pl-8 text-[12px]`}
                  />
                </div>
                <IconBtn icon="plus" label="Thêm loại nhựa" tone="default" disabled={!brand} onClick={() => setLineModal({ line: null })} />
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col gap-0.5">
                {lines.map((f) => {
                  const active = f.id === lineId;
                  const low = lowCount(f);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => openLine(f.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2.5 md:py-2 rounded-lg text-left transition cursor-pointer ${
                        active ? "bg-primary-500/10 text-white" : "text-gray-300 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[13px] font-medium truncate">{lineLabel(f)}</span>
                        <span className="text-[11px] text-gray-500">
                          <span className="font-mono">{f.type}</span> · {f.colors?.length || 0} màu
                        </span>
                      </div>
                      {low > 0 && (
                        <span className="px-1.5 rounded-full bg-amber-500/15 text-amber-300 text-[11px] font-mono" title="Mục cần kiểm tra">
                          {low}
                        </span>
                      )}
                    </button>
                  );
                })}
                {lines.length === 0 && <div className="p-6 text-center text-[12px] text-gray-500">Chưa có loại nhựa.</div>}
              </div>
            </>
          )}
        </aside>

        {/* Colours */}
        <main className={`${mobileView === "colors" ? "flex" : "hidden"} md:flex flex-1 min-w-0 flex-col overflow-hidden`}>
          {line ? (
            <>
              <div className="px-3 md:px-4 py-3 border-b border-line flex items-start gap-2 md:gap-3 shrink-0">
                <IconBtn icon="back" label="Danh sách loại nhựa" className="md:hidden -ml-1" onClick={() => setMobileView("lines")} />
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-[15px] font-semibold tracking-tight truncate">{lineLabel(line)}</h2>
                    <span className="px-1.5 h-5 inline-flex items-center rounded bg-white/[0.06] text-[11px] font-mono text-gray-300">{line.type}</span>
                    <span className="text-[12px] text-gray-500 shrink-0">{line.colors?.length || 0} màu</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 text-[12px]">
                    <ConfidenceBadge value={line.confidence} />
                    {line.origin_url && (
                      <a
                        href={line.origin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={line.origin_url}
                        className="inline-flex items-center gap-1 min-w-0 text-gray-400 hover:text-primary-300"
                      >
                        <Icon name="external" className="w-3.5 h-3.5" />
                        <span className="truncate font-mono text-[11px]">{line.origin_url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                      </a>
                    )}
                    {confOf(line) < threshold && line.confidence_note && (
                      <span className="text-amber-300/90 truncate">{line.confidence_note}</span>
                    )}
                  </div>
                </div>
                <IconBtn icon="pencil" label="Sửa loại nhựa" onClick={() => setLineModal({ line })} />
                <Btn tone="primary" onClick={addColor}>
                  <Icon name="plus" />
                  Màu
                </Btn>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 md:gap-3">
                  {line.colors?.map((c) => {
                    const active = c.id === colorId;
                    const conf = confOf(c);
                    const price = lowestPrice(c);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setColorId(active ? null : c.id)}
                        className={`group text-left rounded-xl overflow-hidden border transition cursor-pointer bg-panel ${
                          active ? "border-primary-500 ring-2 ring-primary-500/30" : "border-line hover:border-line-hover"
                        }`}
                      >
                        <div className="aspect-square relative" style={{ backgroundColor: c.color }}>
                          {c.images?.[0] && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={catImg(c.images[0])} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                          )}
                          {conf < threshold && (
                            <span className="absolute top-1.5 left-1.5 rounded-md bg-black/70" title={c.confidence_note || CONFIDENCE_HELP}>
                              <ConfidenceBadge value={c.confidence} title={c.confidence_note} />
                            </span>
                          )}
                        </div>
                        <div className="px-2.5 py-2 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-3 h-3 rounded-sm border border-white/20 shrink-0" style={{ backgroundColor: c.color }} />
                            <span className="text-[12px] font-medium text-gray-200 truncate">{c.name}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-gray-500">{c.color.toUpperCase()}</span>
                            {price !== null && <span className="text-primary-300">{formatVND(price)}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!line.colors?.length && <div className="p-10 text-center text-[13px] text-gray-500">Chưa có màu nào.</div>}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[13px] text-gray-500">Chọn một loại nhựa.</div>
          )}
        </main>

        {/* Colour detail: side panel on wide screens, sheet over the grid below lg */}
        {detail && (
          <>
            <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setColorId(null)} />
            <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-[24rem] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-panel shadow-2xl lg:static lg:z-auto lg:w-[22rem] lg:p-0 lg:shadow-none sm:border-l border-line shrink-0 overflow-hidden">
              {detail}
            </aside>
          </>
        )}
      </div>

      {/* Brand dialog */}
      {brandModal && (
        <Modal
          title={brandModal.brand ? "Sửa hãng" : "Thêm hãng"}
          onClose={() => setBrandModal(null)}
          footerLeft={
            brandModal.brand && (
              <Btn tone="danger" onClick={() => deleteBrand(brandModal.brand!)}>
                <Icon name="trash" />
                Xóa hãng
              </Btn>
            )
          }
          footer={
            <>
              <Btn onClick={() => setBrandModal(null)}>Hủy</Btn>
              <Btn
                tone="primary"
                onClick={() => {
                  const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
                  if (!v("brand_name")) return toast.error("Nhập tên hãng");
                  saveBrand({ name: v("brand_name"), logo: v("brand_logo"), aliases: splitAliases(v("brand_aliases")) });
                }}
              >
                Lưu
              </Btn>
            </>
          }
        >
          <Field label="Tên hãng">
            <input id="brand_name" defaultValue={brandModal.brand?.name || ""} placeholder="eSUN, Bambu Lab…" className={inputCls} />
          </Field>
          <Field label="Logo">
            <div className="flex items-center gap-2">
              <input id="brand_logo" defaultValue={brandModal.brand?.logo || ""} placeholder="https://… hoặc images/…" className={inputCls} />
              <label className="shrink-0">
                <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-line text-[12px] text-gray-300 cursor-pointer">
                  <Icon name="image" />
                  Tải lên
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const res = await api.uploadCatalogueImage(file);
                      const input = document.getElementById("brand_logo") as HTMLInputElement;
                      if (input && res.image_url) input.value = res.image_url;
                    } catch (err: unknown) {
                      toast.error(`Lỗi tải logo: ${errText(err)}`);
                    }
                  }}
                />
              </label>
            </div>
          </Field>
          <Field label="Tên gọi khác" hint="Cách nhau bằng dấu phẩy; dùng để nhận ra hãng trong tên profile slicer.">
            <input id="brand_aliases" defaultValue={(brandModal.brand?.aliases || []).join(", ")} placeholder="Bambu, BBL" className={inputCls} />
          </Field>
        </Modal>
      )}

      {/* Line dialog */}
      {lineModal && (
        <Modal
          title={lineModal.line ? "Sửa loại nhựa" : "Thêm loại nhựa"}
          onClose={() => setLineModal(null)}
          footerLeft={
            lineModal.line && (
              <Btn tone="danger" onClick={() => deleteLine(lineModal.line!)}>
                <Icon name="trash" />
                Xóa
              </Btn>
            )
          }
          footer={
            <>
              <Btn onClick={() => setLineModal(null)}>Hủy</Btn>
              <Btn
                tone="primary"
                onClick={() => {
                  const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
                  if (!v("line_name")) return toast.error("Nhập tên loại nhựa");
                  const price = Number(v("line_price"));
                  const spool = Number(v("line_spool"));
                  const conf = v("line_conf");
                  const origin = v("line_origin");
                  saveLine({
                    name: v("line_name"),
                    type: v("line_type"),
                    description: v("line_desc"),
                    price: v("line_price") && price > 0 ? Math.round(price) : null,
                    spool_g: spool > 0 ? Math.round(spool) : 1000,
                    aliases: splitAliases(v("line_aliases")),
                    origin_url: /^https?:\/\//i.test(origin) ? origin : undefined,
                    confidence: conf === "" ? undefined : Math.max(0, Math.min(100, Math.round(Number(conf)))),
                    confidence_note: v("line_note") || undefined,
                  });
                }}
              >
                Lưu
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Tên">
              <input id="line_name" defaultValue={lineModal.line?.name || ""} placeholder="PLA Matte, PETG HF…" className={inputCls} />
            </Field>
            <Field label="Loại">
              <select id="line_type" defaultValue={lineModal.line?.type || "PLA"} className={`${inputCls} cursor-pointer`}>
                {(lineModal.line?.type && !MATERIAL_TYPES.includes(lineModal.line.type) ? [lineModal.line.type, ...MATERIAL_TYPES] : MATERIAL_TYPES).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giá tham khảo (₫/cuộn)">
              <NumberInput integer numpadLabel="Giá tham khảo" unit="₫" min={0} id="line_price" defaultValue={lineModal.line?.price ?? ""} placeholder="260000" className={inputCls} />
            </Field>
            <Field label="Khối lượng cuộn (g)">
              <NumberInput integer numpadLabel="Khối lượng cuộn" unit="g" min={1} id="line_spool" defaultValue={lineModal.line?.spool_g ?? 1000} className={inputCls} />
            </Field>
          </div>
          <Field label="Tên gọi khác" hint="Cách nhau bằng dấu phẩy; tên dòng nhựa trong profile slicer.">
            <input id="line_aliases" defaultValue={(lineModal.line?.aliases || []).join(", ")} placeholder="PETG-ECO, ECO PETG" className={inputCls} />
          </Field>
          <Field label="Mô tả">
            <input id="line_desc" defaultValue={lineModal.line?.description || ""} className={inputCls} />
          </Field>
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Field label="Độ tin cậy">
              <NumberInput integer numpadLabel="Độ tin cậy (0–100)" min={0} max={100} id="line_conf" defaultValue={lineModal.line?.confidence ?? (lineModal.line ? "" : 100)} className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Link nguồn">
              <input id="line_origin" type="url" defaultValue={lineModal.line?.origin_url || ""} placeholder="https://…" className={`${inputCls} font-mono text-[12px]`} />
            </Field>
          </div>
          <Field label="Ghi chú cần kiểm tra">
            <input id="line_note" defaultValue={lineModal.line?.confidence_note || ""} className={inputCls} />
          </Field>
        </Modal>
      )}

      {/* Commit dialog */}
      {commitOpen && (
        <Modal
          title="Đẩy lên GitHub"
          width="max-w-lg"
          onClose={() => setCommitOpen(false)}
          footer={
            <>
              <Btn onClick={() => setCommitOpen(false)}>Hủy</Btn>
              <Btn tone="primary" onClick={handleCommit} disabled={committing}>
                {committing && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Commit & đẩy
              </Btn>
            </>
          }
        >
          <p className="text-[12px] text-gray-400">
            {gitStatus?.uncommitted_files.length
              ? `${gitStatus.uncommitted_files.length} file thay đổi trong catalogue.json và images/ sẽ được đẩy lên hoanghuynh296/filament-profiles.`
              : "Không có thay đổi mới."}
          </p>
          <Field label="Nội dung commit">
            <textarea
              rows={3}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className={`${inputCls} h-auto py-2 font-mono text-[12px] resize-none`}
            />
          </Field>
        </Modal>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-[90vh] object-contain rounded-xl" />
        </div>
      )}
    </div>
  );
}
