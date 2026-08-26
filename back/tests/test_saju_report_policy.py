"""리포트 정책 검증기 테스트.

이 검증기는 사용자에게 나가기 전 **마지막 방어선**이라(모듈 주석), 여기 있는 것은
회귀 테스트가 아니라 안전 요구사항이다. 특히 아래 두 묶음은 원본 프로젝트에서 실제로
새어 나갔던 표현들이다.
"""

import pytest

from app.domain.saju.report_policy import (
    REQUIRED_SECTIONS,
    PolicyError,
    ReportSection,
    parse_markdown_sections,
    validate_markdown,
    validate_report,
)


def _full_report(**overrides: str) -> str:
    """필수 섹션을 모두 갖춘 최소 리포트. 특정 섹션만 바꿔 위반을 주입한다."""
    bodies = {name: f"{name}에 대한 평범하고 안전한 설명일세." for name in REQUIRED_SECTIONS}
    bodies.update(overrides)
    return "\n\n".join(f"## {name}\n\n{bodies[name]}" for name in REQUIRED_SECTIONS)


class TestStructure:
    def test_accepts_a_well_formed_report(self):
        sections = validate_markdown(_full_report())
        assert [s.heading for s in sections] == list(REQUIRED_SECTIONS)

    def test_rejects_missing_section(self):
        partial = "\n\n".join(f"## {n}\n\n본문일세." for n in REQUIRED_SECTIONS[:-1])
        with pytest.raises(PolicyError, match="필수 섹션이 없습니다"):
            validate_markdown(partial)

    def test_rejects_duplicate_heading(self):
        with pytest.raises(PolicyError, match="중복된 섹션"):
            validate_report(
                [ReportSection("총평", "본문"), ReportSection("총평", "다른 본문")]
            )

    def test_rejects_empty_body(self):
        with pytest.raises(PolicyError, match="본문이 비어 있는"):
            validate_markdown(_full_report(총평="   "))

    def test_preamble_above_first_heading_is_checked(self):
        """첫 `##` 위의 산문도 검사한다.

        저장·렌더되는 것은 마크다운 **전체**다. 머리말을 검사하지 않으면 모든 금지
        범주가 한꺼번에, 다른 표현을 찾을 필요도 없이 통과한다.
        """
        with pytest.raises(PolicyError, match="제목/머리말"):
            validate_markdown("자네는 반드시 이혼하게 되네.\n\n" + _full_report())

    def test_plain_title_preamble_stays_legal(self):
        validate_markdown("# 사주 리포트\n\n" + _full_report())


class TestMedical:
    @pytest.mark.parametrize(
        "sentence",
        [
            "자네는 암에 걸리네.",
            # 아래 넷이 예전 `걸(리|림|려)` 패턴을 그대로 통과했다 — 걸 + **다른**
            # 완성형 음절이라 나열식 매칭이 잡지 못했다(`_any_batchim` 주석).
            "암에 걸릴 수 있습니다.",
            "당뇨에 걸립니다.",
            "고혈압에 걸린 사람이 되네.",
            "중병에 걸렸네.",
            # 걸리다를 건너뛰고 진단을 예언하는 형태.
            "위암 진단을 받게 될 가능성이 매우 큽니다.",
            "우울증 진단을 받으실 걸세.",
            "수술을 받아야 하네.",
            "치료를 받으세요.",
        ],
    )
    def test_rejects_medical_claims(self, sentence: str):
        with pytest.raises(PolicyError, match="의료"):
            validate_markdown(_full_report(조언=sentence))

    def test_allows_ordinary_health_advice(self):
        """맨 '받아야'는 통과시킨다 — 평범한 건강 조언이라는 원래 판단을 유지한다."""
        validate_markdown(
            _full_report(조언="정기적으로 치료를 받아야 건강을 유지할 수 있다고들 하네.")
        )


class TestRitualSelling:
    @pytest.mark.parametrize(
        "sentence",
        [
            "굿을 한번 하시게.",
            "부적을 지니면 좋네.",
            "천도재를 준비하시게.",
        ],
    )
    def test_rejects_ritual_recommendation(self, sentence: str):
        with pytest.raises(PolicyError, match="의식 권유"):
            validate_markdown(_full_report(조언=sentence))

    def test_allows_the_word_부적절(self):
        """'부적절'은 페르소나가 쓰는 평범한 낱말이다 — 부적 판정에 걸리면 안 된다."""
        validate_markdown(_full_report(조언="부적절한 관계는 피하시게."))

    def test_allows_naming_a_ritual_without_recommending_it(self):
        validate_markdown(_full_report(총평="예로부터 굿이라는 것이 있었네."))


class TestLegalAndInvestment:
    def test_rejects_lawsuit_directive(self):
        with pytest.raises(PolicyError, match="법적"):
            validate_markdown(_full_report(조언="소송을 제기하세요."))

    def test_rejects_certain_lawsuit_outcome(self):
        with pytest.raises(PolicyError, match="법적"):
            validate_markdown(_full_report(조언="이 소송은 반드시 승소하네."))

    def test_allows_mentioning_litigation_as_a_risk(self):
        validate_markdown(_full_report(조언="올해는 소송 같은 다툼을 조심하는 것이 좋겠네."))

    def test_rejects_all_in_profit_claim(self):
        with pytest.raises(PolicyError, match="투자"):
            validate_markdown(
                _full_report(재물·직업="가진 돈을 몽땅 투자에 넣으면 큰돈을 법니다.")
            )

    def test_allows_ordinary_wealth_talk(self):
        validate_markdown(_full_report(**{"재물·직업": "재물운이 좋아 투자에 성공할 수도 있네."}))


class TestFatalism:
    @pytest.mark.parametrize(
        "sentence",
        [
            "자네는 반드시 이혼하게 되네.",
            "틀림없이 파산하게 될 걸세.",
            # 라운드 3·4 에서 예외 조항을 우회했던 조건절 형태들. 예외를 없앴으므로
            # 이제 전부 걸린다 (`_FATALISTIC_CERTAINTY_RE` 주석의 이력).
            "조심하면 당신은 반드시 이혼하게 됩니다.",
            "사고를 조심하면 반드시 무탈하게 지나갑니다.",
        ],
    )
    def test_rejects_certainty_with_negative_event(self, sentence: str):
        with pytest.raises(PolicyError, match="운명론"):
            validate_markdown(_full_report(총평=sentence))

    def test_allows_certainty_with_positive_outcome(self):
        """'반드시 성장하게 됩니다'는 부정적 사건이 없으므로 통과한다."""
        validate_markdown(_full_report(총평="꾸준히 하면 반드시 성장하게 되네."))


class TestErrorHygiene:
    def test_message_never_quotes_the_report(self):
        """메시지는 밖으로 나간다 — 걸린 문장을 담으면 안 된다.

        저장되고 운영 알림으로 전송되므로, 문장이 실리면 특정인의 리포트 텍스트가
        로그와 알림 채널로 간다 (`PolicyError` 주석).
        """
        offending = "자네는 반드시 이혼하게 되네."
        with pytest.raises(PolicyError) as info:
            validate_markdown(_full_report(총평=offending))

        assert "이혼" not in info.value.message
        assert info.value.message.startswith('섹션 "총평"')
        # 재생성 프롬프트에는 있어야 한다 — 그래야 모델이 고칠 근거를 갖는다.
        assert info.value.offending_sentence == offending


class TestParsing:
    def test_splits_on_h2_headings(self):
        sections = parse_markdown_sections("## 가\n\n본문 가\n\n## 나\n\n본문 나")
        assert [(s.heading, s.body) for s in sections] == [("가", "본문 가"), ("나", "본문 나")]

    def test_sentence_scoped_matching(self):
        """금지 패턴은 **한 문장 안에서** 맞아야 한다.

        '반드시'가 든 정상 문장과 뒤의 무관한 문장이 합쳐져 거짓 양성이 되면 안 된다.
        """
        validate_markdown(
            _full_report(총평="이 길은 반드시 열리네. 지난 이별은 이미 지나간 일일세.")
        )
