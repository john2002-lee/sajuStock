"""부적 시안 한 장을 세 장으로 자르고, 결제 전에 보여 줄 견본을 만든다.

    uv run python -m scripts.make_talisman_images <시안.webp> <원본_출력_폴더>

## 무엇이 어디로 가나

- **원본** → `<원본_출력_폴더>/{id}.png`. **저장소 밖의 폴더를 준다.** 이 저장소는
  공개라 원본이 커밋되는 순간 돈을 내지 않고 받을 수 있게 된다. 원본은
  `scripts.upload_talisman_assets` 로 DB 에 올리고, 결제 확인 뒤에만 내려간다.
- **견본** → `front/public/talismans/{id}-preview.webp`. 이것만 git 에 들어간다.
  폭을 줄이고 "견본" 글자를 대각선으로 반복해 박는다 — 화면에서 무엇을 사는지
  알아보기에는 충분하고, 내려받아 쓰기에는 모자라게.

시안은 카드 세 장이 가로로 붙어 있고 사이에 2px 남짓한 흰 틈이 있다. 그 틈의
열 위치를 아래 `CROPS` 에 적어 두었다(1536×1024 시안 기준, 열 밝기로 찾았다).
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

#: (id, 왼쪽 x, 오른쪽 x, 출처 글자 색) — 왼쪽부터 진흥부적 · 흑금수호인장 · 실버수호창.
#: 글자 색은 카드마다 **테두리 색**이다(적·금·은). 바탕 색을 쓰면 묻히고, 흰색이나
#: 검정으로 통일하면 한 장은 반드시 튄다.
CROPS: tuple[tuple[str, int, int, tuple[int, int, int]], ...] = (
    ("jinheung", 0, 511, (176, 38, 28)),
    ("heukgeum", 513, 1023, (201, 161, 74)),
    ("silver", 1025, 1536, (196, 200, 208)),
)

#: 오른쪽 아래에 작게 넣는 출처. 사용자가 정한 문구와 자리다.
CREDIT = "aiot21.com"
#: 장식 테두리의 오른쪽 끝(x)과 아래쪽 선(y). 세 카드가 같은 틀이라 값이 같다.
#: 글자는 **테두리 바깥 여백**(선 아래 ~20px)에 오른쪽 맞춤으로 둔다 — 안쪽에 두면
#: 모서리 장식과 겹친다.
CREDIT_RIGHT_X = 492
CREDIT_TOP_Y = 1005
CREDIT_FONT_SIZE = 13
SOURCE_SIZE = (1536, 1024)

PREVIEW_WIDTH = 320
PREVIEW_DIR = Path(__file__).resolve().parents[2] / "front" / "public" / "talismans"
WATERMARK = "견본"
FONT_CANDIDATES = (
    "C:/Windows/Fonts/malgunbd.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
)


def _font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("한글 글꼴을 찾지 못했습니다 — FONT_CANDIDATES 에 경로를 추가하세요.")


def credit(card: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """오른쪽 아래 테두리 바깥에 `CREDIT` 을 작게 넣는다. 새 이미지를 돌려준다.

    원본에 넣는다 — 견본은 원본을 줄여 만들므로 같은 자리에 함께 실린다.
    """
    out = card.convert("RGB").copy()
    draw = ImageDraw.Draw(out)
    font = _font(CREDIT_FONT_SIZE)
    width = draw.textlength(CREDIT, font=font)
    draw.text((CREDIT_RIGHT_X - width, CREDIT_TOP_Y), CREDIT, font=font, fill=color)
    return out


def watermark(card: Image.Image) -> Image.Image:
    """줄인 카드 위에 '견본' 을 대각선으로 반복해 얹는다. 새 이미지를 돌려준다."""
    height = round(card.height * PREVIEW_WIDTH / card.width)
    small = card.convert("RGB").resize((PREVIEW_WIDTH, height), Image.LANCZOS)

    # 돌리기 전 큰 판에 글자를 깔고 -30도 돌려 가운데를 잘라 낸다 — 가장자리까지
    # 빈틈없이 덮으려면 판이 대각선보다 커야 한다.
    side = int((small.width**2 + small.height**2) ** 0.5) + 40
    layer = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font = _font(34)
    step_x, step_y = 120, 78
    for row, y in enumerate(range(0, side, step_y)):
        offset = (step_x // 2) * (row % 2)
        for x in range(-step_x, side, step_x):
            draw.text(
                (x + offset, y),
                WATERMARK,
                font=font,
                fill=(255, 255, 255, 92),
                stroke_width=2,
                stroke_fill=(0, 0, 0, 70),
            )
    layer = layer.rotate(30, resample=Image.BICUBIC)
    left = (side - small.width) // 2
    top = (side - small.height) // 2
    layer = layer.crop((left, top, left + small.width, top + small.height))

    return Image.alpha_composite(small.convert("RGBA"), layer).convert("RGB")


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    source = Image.open(sys.argv[1])
    if source.size != SOURCE_SIZE:
        print(
            f"시안 크기가 {source.size} 입니다 — CROPS 는 {SOURCE_SIZE} 기준이라 다시 재야 합니다."
        )
        return 1

    out_dir = Path(sys.argv[2]).resolve()
    repo_root = Path(__file__).resolve().parents[2]
    if out_dir.is_relative_to(repo_root):
        print("원본 출력 폴더가 저장소 안입니다. 공개 저장소이므로 저장소 밖 폴더를 주세요.")
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    rgb = source.convert("RGB")
    for talisman_id, left, right, color in CROPS:
        card = credit(rgb.crop((left, 0, right, SOURCE_SIZE[1])), color)
        card.save(out_dir / f"{talisman_id}.png", optimize=True)
        watermark(card).save(PREVIEW_DIR / f"{talisman_id}-preview.webp", quality=72)
        print(f"{talisman_id}: 원본 {card.size} · 견본 {PREVIEW_WIDTH}px")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
