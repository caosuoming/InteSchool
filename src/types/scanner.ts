export type CardRegionType = "name" | "studentNumber" | "barcode" | "qrCode" | "choice" | "fill" | "essay";

export interface CardRegion {
  id: string;
  type: CardRegionType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ThirdPartyCard {
  id: string;
  schoolId: string;
  teacherId: string;
  fileId: string;
  fileName: string;
  imageUrl: string;
  paperId?: string;
  regions: CardRegion[];
  createdAt: string;
  updatedAt: string;
}
