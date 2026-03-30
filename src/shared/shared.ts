export const ns = "com.photoshop.automation";
export const company = "Photoshop Automation";
export const displayName = "Batch Generator";
export const version = "1.0.0";

export interface Order {
  orderId: string;
  sku: string;
  model: string;
  variant: string;
  design: string;
  imagePath: string;
  width_mm: number;
  length_mm: number;
  mirror: boolean;
  borderColor: string;
}

export interface Mapping {
  prefix: string;
  shop: string;
  folder: string;
  color: string;
}

export interface Dimension {
  model: string;
  variant: string;
  width: number;
  length: number;
  mirror?: boolean;
}

export interface OrderStats {
  total: number;
  skips: {
    orderId: string;
    reason: string;
    details?: string;
  }[];
}
