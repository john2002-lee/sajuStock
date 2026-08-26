# --- 빌드 스테이지: 의존성만 설치 ---
FROM python:3.12-slim AS builder

# `:latest` 대신 고정 버전을 쓴다 — uv 는 CLI 동작이 버전 사이에 바뀐 적이 있고,
# 태그가 떠 있으면 어느 날 빌드만 갑자기 실패하거나(혹은 더 나쁘게, 조용히 다르게
# 동작하거나) 재현이 안 되는 빌드가 된다.
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# 소스보다 락파일을 먼저 복사해 레이어 캐시를 살린다.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# --- 런타임 스테이지 ---
FROM python:3.12-slim

RUN useradd --create-home --uid 1000 app
WORKDIR /app

COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --chown=app:app app ./app

# **마이그레이션 도구를 이미지에 함께 넣는다.**
#
# 예전 이미지에는 `app/` 만 있었다. 그러면 컨테이너 안에서 `alembic upgrade`·`current`·
# `stamp` 를 할 수 없고, 스키마가 어긋났을 때 손쓸 방법이 "로컬에 저장소를 받아 같은
# .env 로 돌린다" 뿐이었다. 사고가 났을 때 필요한 도구가 사고 난 곳에 없는 셈이다.
#
# `alembic.ini` 는 `script_location` 을 상대 경로로 들고 있으므로 WORKDIR 기준으로
# 함께 들어가야 한다. `scripts/` 는 배치·검증 진입점(`verify_rag` 등)이다.
COPY --chown=app:app alembic.ini ./alembic.ini
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app scripts ./scripts

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# 이미지 안에서는 스키마를 모델에서 만들지 않는다. 코드 기본값도 False 지만, compose 가
# `.env` 를 그대로 읽는 구조라 누가 켜 두면 그것이 컨테이너까지 온다. 여기서 못박으면
# "마이그레이션이 유일한 출처" 라는 사실이 이미지에 남는다.
#
# (ENV 를 따로 두는 것은 Dockerfile 이 줄 이음 안의 주석을 허용하지 않기 때문이다.)
ENV DB_CREATE_ALL_ON_STARTUP=false

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"

# `--proxy-headers` 를 켠다 — 리버스 프록시 뒤에 두면 `request.client.host` 와
# 스킴이 프록시 자신의 것으로 찍힌다(로그·향후 IP 기반 제한에 영향). 신뢰 범위는
# 기본값(127.0.0.1)을 그대로 둔다 — 프록시가 다른 호스트/컨테이너에 있다면 배포
# 시 `--forwarded-allow-ips` 를 그 프록시 주소로 좁혀서 추가하고, 절대 "*" 로
# 인터넷에 열지 않는다(그러면 누구나 클라이언트 IP·스킴을 헤더로 위조할 수 있다).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
