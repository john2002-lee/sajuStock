# 관리자 접속 통계 — 컨텍스트

Last Updated: 2026-09-07

## 핵심 파일

### 백엔드

| 파일 | 역할 |
|---|---|
| `back/app/models/visit_day.py` | **신규.** 하루·방문자당 한 행 |
| `back/app/models/admin_audit.py` | 본뜰 패턴 — append-only, `users` 에 FK 없음, 이유가 주석에 있다 |
| `back/app/repositories/visit.py` | **신규.** upsert + 집계 |
| `back/app/repositories/admin.py` | `_select_users:137` 의 `substr(owner_key, :prefix_len)` 조인을 재사용. `:101` 결정적 타이브레이크 함정 |
| `back/app/api/v1/endpoints/visits.py` | **신규.** `POST /touch` — `X-Owner-Key` |
| `back/app/api/v1/endpoints/admin.py` | `GET /admin/visits` 추가. 전체가 `X-Admin-Key` 로 잠김 |
| `back/app/schemas/admin.py` | 응답 스키마 (`OpsSnapshot` 옆) |
| `back/app/domain/saju/korean_time.py` | KST 환산 관례가 이미 여기 있다 |

### 프런트

| 파일 | 역할 |
|---|---|
| `front/src/shared/analytics/VisitBeacon.tsx` | **신규.** 루트 레이아웃 클라이언트 컴포넌트 |
| `front/src/app/layout.tsx:61` | `AmplitudeProvider` 옆에 마운트 |
| `front/src/app/api/visit/route.ts` | **신규.** httpOnly 쿠키에서 owner 읽어 백엔드로 |
| `front/src/app/api/watchlist/route.ts` | 본뜰 패턴 — "owner_key 를 본문으로 받지 않는다" |
| `front/src/lib/watchlist/anon-cookie.ts` | `OWNER_COOKIE.name` = `ledger.owner` |
| `front/src/app/admin/visits/page.tsx` | **신규.** `requireAdmin()` 을 페이지가 부른다 |
| `front/src/app/admin/_components/AdminShell.tsx:60` | 탭 추가 (`"ops" \| "users" \| "visits"`) |
| `front/src/features/common/admin/components/VisitPanel.tsx` | **신규.** `OpsPanel` 의 `SectionTitle`·`Stat`·`Coverage` 구성을 따른다 |
| `front/src/features/common/admin/services/adminApi.ts` | `fetchVisits(actor)` 추가. 첫 인자 `AdminActor` = 가드 강제 |

## 의사결정 기록

- **하루 1회 upsert** — 행 증가가 방문자×일이라 연 73만 행 수준으로 예측 가능.
  세션 단위·페이지뷰는 로직·용량 비용이 크고, Amplitude 가 이미 그 연안을 본다
- **비콘(클라이언트)** — 서버 렌더에서 백엔드를 부르면 모든 페이지 렌더에 왕복이
  하나 붙는다. 대가는 JS 꺼진 방문 누락이고, Amplitude 클라이언트 SDK 에 이미 같은 전제
- **`X-Owner-Key`(관리자 키 아님)** — 기록은 일반 사용자 경로. 관심종목과 같은 층
- **소유자 키를 본문으로 받지 않음** — httpOnly 쿠키에서만 읽는다. 클라이언트가
  남의 키로 숫자를 부풀리지 못한다
- **upsert 멱등** — 비콘이 중복돼도 무해하다. 그래서 비콘 중복 방지를
  `sessionStorage` 플래그로만 두고 서버에서 다시 막지 않는다

## 환경 함정 (이 세션 실측)

| 함정 | 대응 |
|---|---|
| **Bash 도구가 죽었다** (`bash: -c: line 86: unexpected EOF`, `echo` 조차 실패) | 브라우저 pane 프로세스 실행기(`.claude/launch.json`)로 명령 실행. ruff·pytest·tsc·lint·npm test 전부 이 방법으로 돌렸다 |
| `uv run fastapi dev` 가 죽는다 | rich 의 ⚡ 가 cp949 콘솔에서 `UnicodeEncodeError`. `uv run uvicorn main:app --port 8000` 사용 |
| pytest 로그가 트레이스백으로 넘쳐 집계 줄이 밀린다 | `--tb=no` 로 돌려야 `NNN passed` 가 보인다 |
| Python 이 콘솔 인코딩으로 죽는다 | `python -X utf8` 또는 `PYTHONUTF8=1` |
| **`TEST_DATABASE_URL` 이 죽은 프로젝트를 가리킨다** (`yagqtcbxrjxyymlbotav`) | DB 테스트 183건이 setup 에서 실패. **이 작업의 검증에 치명적** — 테스트 DB 를 먼저 살려야 한다 |

## 기준선 (이 작업 시작 전 실측)

```
back  ruff       통과
back  pytest     364 passed, 183 errors (전부 죽은 TEST_DATABASE_URL)
front tsc        통과
front lint       통과
front npm test   141개 중 134 통과 · 실패 0 · cancelled 7 (기존 flake)
alembic head     a1e6f38b72d4 (단일 head 확인)
```

## 주의 — 작업 트리에 남의 변경이 있다

커밋되지 않은 변경 17개(`llm.py` +233줄, `agents/*`, `endpoints/*`, `config.py`,
`main.py`, `layout.tsx`, `public.ts` 등) + 미추적 `amplitude.py`·`test_amplitude_verify.py`.
Amplitude 연동 작업으로 보이며 이 작업과 파일이 겹치지 않는다.

**커밋 시 내 파일만 명시적으로 스테이징한다.** 루트 `env.download` 에 실제 비밀 키가
있어 `git add -A` 는 금지다.

또한 `front/src/app/layout.tsx` 는 **남이 수정 중인 파일**이다 — 비콘을 마운트하려면
이 파일을 건드려야 하므로 충돌 가능성이 있다.
