/**
 * 디지털 부적 feature 의 공개 경계. 사주와 **로직이 섞이지 않는다** — 같은 사이트에
 * 진열될 뿐이고, 공유하는 것은 결제 설정(`lib/config/payment-mode`)과 법적 문구
 * (`shared/legal/talisman`)뿐이다.
 */
export { TalismanSection } from "./components/TalismanSection";
export { TalismanPaySuccess } from "./components/TalismanPaySuccess";
export { TalismanOrderView, type TalismanOrder } from "./components/TalismanOrderView";
export { TALISMAN_ITEMS, findTalisman, type TalismanItem } from "./model/catalog";
