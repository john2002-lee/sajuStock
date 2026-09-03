"""상장사 목록 강제 재수집.

    uv run python -m scripts.reseed_listed_companies            # 모의 실행 — 차이만 본다
    uv run python -m scripts.reseed_listed_companies --apply    # 실제로 반영한다

(`-m` 으로 실행해야 프로젝트 루트가 sys.path 에 올라 `app` 패키지를 찾는다.)

## 왜 이 스크립트가 필요한가

`ensure_seeded` 는 저장된 행이 `listed_company_min_count`(기본 100) 보다 **적을 때만**
수집한다. 자동완성이 첫 요청에서 느려지는 것을 한 번으로 끝내려는 설계이고 평소에는
맞다. 그런데 **이미 채워진 목록이 틀렸을 때 고칠 방법이 없다.**

실제로 그런 일이 있었다. KRX 가 로그인을 요구하도록 바뀐 뒤 1차 소스(CSV 다운로드)가
조용히 실패하고 KIND(상장법인 목록)로 폴백해 왔다. KIND 는 회사당 보통주 하나뿐이라
우선주 100종목 이상이 통째로 빠졌고, 삼성전자우(005935)를 검색하면 아무것도 나오지
않았다. 행이 2,747개 있었으므로 재수집은 영원히 트리거되지 않았다.

수집 경로를 고쳐도 **DB 는 스스로 갱신되지 않는다.** 그 간극을 사람이 메운다.

## 지우지 않는다

`upsert_many` 는 심볼 기준 upsert 다 — 기존 행은 갱신하고 새 행은 추가하며, 소스에서
사라진 행은 **남긴다.** 상장폐지 종목이 목록에 남는 것보다, 수집이 하루 실패했을 때
관심종목이 상호를 잃는 것이 나쁘다. 정리가 필요하면 그건 별도 판단이다.

시가총액은 건드리지 않는다 — `market_cap` 은 upsert 대상 컬럼이 아니라 배치가
따로 채운다. 새로 들어온 우선주는 다음 시총 배치에서 값을 받는다.
"""

import asyncio
import sys

from app.core.database import AsyncSessionLocal
from app.core.logging import configure_logging
from app.integrations.krx.client import collect_listed_companies
from app.repositories.listed_company import ListedCompanyRepository


async def main() -> int:
    # 윈도우 기본 콘솔(cp949)에서 못 찍는 기호로 죽지 않게 한다.
    sys.stdout.reconfigure(errors="replace")
    configure_logging()

    apply = "--apply" in sys.argv[1:]
    print("상장사 목록 재수집 —", "실제 반영" if apply else "모의 실행 (--apply 로 반영)")
    print()

    records, source = await collect_listed_companies()
    print(f"  소스           {source}")
    print(f"  수집           {len(records):>6,}건")

    if source != "KRX":
        # KIND·내부 기본값은 우선주가 없다. 그 상태로 반영하면 지금 있는 것보다
        # 나아지지 않으므로 사람이 알고 결정해야 한다.
        print()
        print(f"  [경고] 1차 소스(pykrx)가 아니라 {source} 입니다 — 우선주가 누락됩니다.")
        print("         KRX_ID / KRX_PW 가 .env 에 있는지 확인하십시오.")

    async with AsyncSessionLocal() as session:
        repo = ListedCompanyRepository(session)

        before = await repo.count()
        existing = {c.symbol for c in await repo.find_by_symbols([r.symbol for r in records])}
        added = [r for r in records if r.symbol not in existing]

        print(f"  현재 저장       {before:>6,}건")
        print(f"  신규            {len(added):>6,}건")
        print(f"  갱신            {len(records) - len(added):>6,}건")

        if added:
            print()
            print("  신규 예시 (앞 10건):")
            for record in added[:10]:
                print(f"    {record.symbol:12} {record.name}")

        if not apply:
            print()
            print("실제로 반영하려면 --apply 를 붙입니다.")
            return 0

        written = await repo.upsert_many(records)
        after = await repo.count()

    print()
    print(f"{written:,}건 반영. 저장 {before:,} → {after:,}건 ({after - before:+,})")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
