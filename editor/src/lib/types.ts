// Shapes of catalogue.json and of the editor server API (server.py).

export interface CataloguePurchaseLink {
  id: string;
  platform: string;
  url: string;
  price?: number | null;
  note?: string;
}

export interface FetchPriceResult {
  success: boolean;
  platform: string;
  price: number | null;
  title?: string | null;
  original_url: string;
  resolved_url: string;
  message: string;
}

/** Review fields shared by catalogue lines and colours (all optional). */
export interface CatalogueReviewFields {
  /** Page the data was taken from (product / variant page). */
  origin_url?: string;
  /** 0-100: how sure the data (hex, image, existence) is. Below the review threshold (default 70) it needs a manual check. */
  confidence?: number;
  /** Why the confidence is low. */
  confidence_note?: string;
}

export interface CatalogueColor extends CatalogueReviewFields {
  id: string;
  name: string;
  color: string;
  /** Maker's colour code (Bambu Lab). */
  color_code?: string;
  images: string[];
  purchase_links?: CataloguePurchaseLink[];
}

export interface CatalogueFilament extends CatalogueReviewFields {
  id: string;
  brand_id: string;
  name: string;
  type: string;
  description?: string;
  /** Other names of this product line in slicer presets ("PETG-ECO"); used by the inventory first-run import. */
  aliases?: string[];
  /** Reference price, VND per spool (fallback when a colour has no priced purchase link). */
  price?: number | null;
  spool_g?: number;
  colors: CatalogueColor[];
}

export interface CatalogueBrand {
  id: string;
  name: string;
  logo: string;
  description?: string;
  /** Other spellings of the brand in preset names ("Bambu", "BBL"). */
  aliases?: string[];
  filaments: CatalogueFilament[];
}

export interface CatalogueData {
  version: number;
  updated_at: number;
  repo_url: string;
  brands: CatalogueBrand[];
}

export interface CatalogueGitStatus {
  is_repo: boolean;
  branch: string;
  commit_hash: string;
  commit_message: string;
  has_uncommitted_changes: boolean;
  uncommitted_files: string[];
  remote_url: string;
}


