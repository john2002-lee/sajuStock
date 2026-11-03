/**
 * 기사 썸네일. og:image 가 있으면 그리고, 없으면 사선 패턴 플레이스홀더다.
 *
 * 치수는 데스크탑 84×58 / 모바일 56×44 (핸드오프 '에셋' 절). 인라인 style 로
 * 박으면 브레이크포인트를 걸 수 없어 클래스로 둔다.
 *
 * next/image 를 쓰지 않는 이유: 뉴스 이미지는 야후·연합 등 임의의 외부
 * 호스트에서 온다. next/image 를 태우려면 images.remotePatterns 에
 * `hostname: "**"` 를 열어야 하는데, 그러면 우리 최적화 엔드포인트가 아무 URL
 * 이나 대신 가져오는 프록시가 된다. 84×58 썸네일에 치를 대가가 아니다.
 */
const BOX =
  "flex h-[44px] w-[56px] flex-none items-center justify-center overflow-hidden border border-line-20 md:h-[58px] md:w-[84px]";

const PATTERN = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--thumb-a) 0 6px, var(--thumb-b) 6px 12px)",
} as const;

export function NewsThumbnail({ src, alt = "" }: { src?: string; alt?: string }) {
  if (!src) {
    return (
      <span
        aria-hidden
        className={`${BOX} font-mono text-muted-40 text-10`}
        style={PATTERN}
      >
        이미지
      </span>
    );
  }

  return (
    <span className={BOX} style={PATTERN}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 위 주석 참고: 임의 외부 호스트라 next/image 를 쓰지 않는다 */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </span>
  );
}
