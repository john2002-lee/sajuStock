/**
 * 진열하는 부적 — 상품 정보(`shared/legal/talisman` 의 `TALISMAN_PRODUCTS`)에 견본
 * 이미지 경로를 붙인 것.
 *
 * `previewSrc` 는 **견본**(저해상도 + 워터마크)이다. 원본은 저장소에 없다 — 공개
 * 저장소라 원본이 `public/` 에 있으면 그 자체로 유출이다.
 */

import { TALISMAN_PRODUCTS, type TalismanProduct } from "@/shared/legal/talisman";

export interface TalismanItem extends TalismanProduct {
  readonly previewSrc: string;
}

export const TALISMAN_ITEMS: readonly TalismanItem[] = TALISMAN_PRODUCTS.map((product) => ({
  ...product,
  previewSrc: `/talismans/${product.id}-preview.webp`,
}));

export function findTalisman(id: string): TalismanItem | undefined {
  return TALISMAN_ITEMS.find((t) => t.id === id);
}
