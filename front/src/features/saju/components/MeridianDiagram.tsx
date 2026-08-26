/**
 * 이 화면이 반드시 전달해야 하는 한 가지: 한국의 시계는 동경 135도에 맞춰져 있는데
 * 서울은 127도쯤에 있어서, 해가 시계보다 대략 반 시간 뒤에 온다. 그 간격이 시주를
 * 경계 너머로 옮긴다.
 *
 * 말로 적지 않고 그린 이유는, 숫자("−32분")만으로는 그것이 무엇 사이의 간격인지
 * 보이지 않기 때문이다. 색은 전부 테마 토큰을 쓴다.
 */
export function MeridianDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 190"
      role="img"
      aria-label="서울은 동경 127도, 한국 표준시의 기준은 동경 135도. 그 차이가 약 32분이다."
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 지평선 호 — 지구의 곡률을, 구로 읽힐 만큼만. */}
      <path d="M10 168 Q180 96 350 168" className="stroke-hairline" strokeWidth="1.5" />

      {/* 해. 시계의 자오선이 아니라 진짜 자오선 위에 있다. */}
      <circle cx="128" cy="44" r="17" className="fill-wuxing-earth" opacity="0.9" />
      <circle cx="128" cy="44" r="27" className="stroke-wuxing-earth" strokeWidth="1" opacity="0.35" />

      {/* 127°E — 서울, 해가 실제로 있는 자리. */}
      <line x1="128" y1="66" x2="128" y2="150" className="stroke-wuxing-earth" strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="128" cy="150" r="4.5" className="fill-wuxing-earth" />
      <text x="128" y="172" textAnchor="middle" className="fill-ink" style={{ fontSize: 11 }}>
        서울 127°E
      </text>

      {/* 135°E — 시계가 맞춰진 자오선. */}
      <line x1="248" y1="60" x2="248" y2="150" className="stroke-gold-text" strokeWidth="2" />
      <circle cx="248" cy="150" r="4.5" className="fill-gold-text" />
      <text x="248" y="172" textAnchor="middle" className="fill-ink" style={{ fontSize: 11 }}>
        표준시 135°E
      </text>

      {/* 그 간격을 짚어 준다. */}
      <line x1="132" y1="112" x2="244" y2="112" className="stroke-gold-text" strokeWidth="1" strokeDasharray="3 3" />
      <path d="M244 112 l-7 -4 v8 z" className="fill-gold-text" />
      <path d="M132 112 l7 -4 v8 z" className="fill-gold-text" />
      <rect x="152" y="94" width="72" height="22" rx="11" className="fill-surface-warm stroke-hairline" strokeWidth="1" />
      <text x="188" y="109" textAnchor="middle" className="fill-gold-text-strong" style={{ fontSize: 12, fontWeight: 700 }}>
        약 32분
      </text>
    </svg>
  );
}
