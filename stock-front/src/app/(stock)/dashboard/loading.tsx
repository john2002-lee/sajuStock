import { SkeletonScreen } from "@/shared/components/feedback";
import { DetailSkeleton } from "./_components/DetailSkeleton";

/**
 * **상세 칸만**의 골격이다.
 *
 * 이 파일은 `layout.tsx` 안쪽에 놓인다 — Next 는 `loading.tsx` 를 같은 세그먼트의
 * `page.tsx` 와 그 아래를 감싸는 Suspense 경계로 만들고, 레이아웃은 그 밖에 있다.
 * 여기서 화면 전체 골격을 그리면 **nav 옆이 아니라 nav 자리에** 겹쳐 그려진다.
 * 전체 골격은 레이아웃이 직접 쓰는 `BoardSkeleton` 의 몫이다.
 *
 * 종목을 바꿀 때 보이는 것이 이것이다: 왼쪽 nav 와 아래 시장 타일은 그대로 있고
 * 가운데만 이 골격으로 바뀌었다가 채워진다.
 */
export default function DashboardDetailLoading() {
  return (
    <SkeletonScreen label="종목 상세를 불러오는 중입니다">
      <DetailSkeleton />
    </SkeletonScreen>
  );
}
