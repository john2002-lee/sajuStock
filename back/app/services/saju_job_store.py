"""사주 리포트 생성 작업을 요청 밖으로 내보내는 저장소.

## 왜 필요했나 — 36초짜리 HTTP 요청은 성립하지 않는다

리포트 생성은 LLM 1~2회라 실측 **36초**다. 그것을 요청 하나로 처리하면 그 시간
동안 연결이 살아 있어야 하고, 실제로 살아 있지 않았다: 브라우저 → BFF 구간의
기본 타임아웃이 20초라 매번 20초에 끊기고 실패 화면이 떴다. 서버 쪽 타임아웃만
올려도 같은 종류의 문제가 남는다 — 모바일 네트워크, 중간 프록시, 사용자가 화면을
끄는 것까지 전부 그 연결에 달려 있게 된다.

작업으로 바꾸면 **긴 요청 자체가 없어진다.** 시작은 즉시 답하고, 화면은 짧은 조회를
반복한다. 숫자를 올려 미루는 대신 구조로 없애는 쪽이다.

## 왜 DB 가 아니라 메모리인가

무료 경로는 **아무것도 저장하지 않는다** — 그것이 이 제품이 생년월일시를 다루는
방식이고, 화면이 그렇게 약속한다. 작업을 DB 에 넣으면 그 약속이 깨진다.

그래서 프로세스 메모리에 두고 TTL 로 지운다. 대가는 분명하다:

  · **재시작하면 사라진다.** 진행 중이던 작업은 없어지고 화면은 다시 시작한다.
  · **워커가 여럿이면 안 맞는다.** 작업을 만든 워커가 아닌 워커가 조회를 받으면
    "없는 작업" 이 된다. 지금은 단일 워커 전제이고, 여러 워커로 갈 때는 이 파일이
    바뀌어야 한다(그때는 Redis 나 DB 가 답이다).

유료 경로는 다르다 — 그쪽은 이미 `saju_reports` 에 저장하므로 작업 저장소가 필요
없고, 화면이 `GET /saju/reports/{token}` 을 그대로 폴링한다.

`core/background.py` 를 쓰지 않는 이유: 그쪽은 이름당 하나만 도는 **단일 비행**
배치용이고 결과를 돌려주지 않는다. 여기는 요청마다 별개 작업이고 결과가 곧 제품이다.
다만 예외를 삼키지 않는 규율은 그쪽에서 그대로 가져왔다.
"""

import asyncio
import logging
import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

logger = logging.getLogger(__name__)

JobStatus = Literal["running", "done", "failed"]

#: 끝난 작업을 얼마나 들고 있을지. 화면이 폴링으로 결과를 가져갈 시간 + 새로고침
#: 한 번 정도의 여유다. 길게 두면 생년월일시가 메모리에 오래 남는다.
_RESULT_TTL = timedelta(minutes=15)

#: 시작만 하고 끝나지 않은 작업의 상한. LLM 1~2회 실측이 36초이므로 넉넉하다.
#: 이 시간을 넘긴 작업은 무언가 잘못된 것이라 청소 대상이 된다.
_RUNNING_TTL = timedelta(minutes=10)

#: 동시에 들고 있을 작업 수 상한. 넘으면 **가장 오래된 끝난 작업**부터 버린다.
#: 상한이 없으면 요청이 몰릴 때 메모리가 무한히 자란다.
_MAX_JOBS = 200


@dataclass
class Job:
    id: str
    status: JobStatus = "running"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None
    #: 완료된 결과. `status == "done"` 일 때만 채워진다.
    result: Any = None
    #: 실패 사유. **사용자에게 보일 문장**이며 내부 예외 메시지를 담지 않는다 —
    #: 생년월일시가 예외에 인용돼 있을 수 있다.
    error: str | None = None


_jobs: dict[str, Job] = {}
#: 강한 참조를 유지해 GC 가 실행 중인 태스크를 수거하지 못하게 한다.
_tasks: dict[str, asyncio.Task[Any]] = {}


def _expired(job: Job, now: datetime) -> bool:
    if job.status == "running":
        return now - job.created_at > _RUNNING_TTL
    reference = job.finished_at or job.created_at
    return now - reference > _RESULT_TTL


def _sweep() -> None:
    """만료된 작업을 지운다. 작업을 만들 때마다 한 번 훑는다 — 스케줄러를 하나 더
    두지 않기 위해서고, 작업 수가 수백 단위라 훑는 비용이 무의미하다."""
    now = datetime.now(UTC)
    for job_id in [jid for jid, job in _jobs.items() if _expired(job, now)]:
        _jobs.pop(job_id, None)
        _tasks.pop(job_id, None)

    if len(_jobs) <= _MAX_JOBS:
        return

    # 상한을 넘었다. 끝난 것부터, 오래된 것부터 버린다 — 도는 작업을 버리면
    # 기다리는 사람의 결과가 사라진다.
    finished = sorted(
        (job for job in _jobs.values() if job.status != "running"),
        key=lambda job: job.finished_at or job.created_at,
    )
    for job in finished[: len(_jobs) - _MAX_JOBS]:
        _jobs.pop(job.id, None)
        _tasks.pop(job.id, None)


def get(job_id: str) -> Job | None:
    job = _jobs.get(job_id)
    if job is None:
        return None
    if _expired(job, datetime.now(UTC)):
        # 만료된 것을 돌려주지 않는다 — 화면이 오래된 결과를 새 것으로 보게 된다.
        _jobs.pop(job_id, None)
        _tasks.pop(job_id, None)
        return None
    return job


def start(run: Callable[[], Awaitable[Any]], *, failure_message: str) -> Job:
    """작업을 띄우고 **즉시** 돌려준다.

    `run` 은 코루틴을 만드는 함수다 — 코루틴 객체를 직접 받으면 아래에서 예외가 나도
    "await 되지 않은 코루틴" 경고만 남는다.

    `failure_message` 는 실패했을 때 화면에 보일 문장이다. 예외 메시지를 그대로 쓰지
    않는 이유: 생년월일시가 인용돼 있을 수 있고, 그 값이 화면과 로그로 나가서는 안 된다.
    """
    _sweep()

    job = Job(id=secrets.token_urlsafe(16))
    _jobs[job.id] = job

    async def wrapper() -> None:
        try:
            job.result = await run()
            job.status = "done"
        except asyncio.CancelledError:
            job.status = "failed"
            job.error = failure_message
            raise
        except Exception:
            # 무엇이 터졌는지는 로그로 남기고, 화면에는 준비된 문장만 준다.
            logger.exception("사주 리포트 작업 %s 가 예외로 끝났습니다", job.id)
            job.status = "failed"
            job.error = failure_message
        finally:
            job.finished_at = datetime.now(UTC)

    task = asyncio.create_task(wrapper(), name=f"saju-report:{job.id}")
    _tasks[job.id] = task
    return job


def reset_for_tests() -> None:
    """테스트가 작업 저장소를 비운다. 프로세스 전역이라 테스트 간에 새지 않게."""
    _jobs.clear()
    _tasks.clear()
