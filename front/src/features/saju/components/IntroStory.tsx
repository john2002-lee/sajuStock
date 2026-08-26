import Link from "next/link";
import { MeridianDiagram } from "./MeridianDiagram";
import { Panel, PanelLabel, ShamanBeat } from "./Panel";
import { Shaman } from "./Shaman";

/**
 * 서비스 소개 — 무당이 이 서비스가 무엇을 하는지 설명한다. 리포트와 같은 세로
 * 스크롤 웹툰 형식이라 첫 방문부터 마지막 패널까지 목소리가 끊기지 않는다.
 *
 * 여기 있는 주장은 전부 코드가 실제로 뒷받침하는 것이다 — 진태양시 보정, 절기
 * 경계, 무엇까지 계산하는지, 무엇을 저장하지 않는지. **후기·이용자 수·"가장
 * 정확한" 같은 최상급은 일부러 하나도 없다**: 어느 것도 사실이 아니고, 사주 소개
 * 화면은 지어낸 사회적 증거가 실제로 해를 끼치는 자리다.
 *
 * 정적 콘텐츠라 서버에서 렌더된다 — `"use client"` 가 없다.
 */

const FREE = [
  "사주 여덟 글자 (4기둥)",
  "오행이 몇 개씩인지",
  "일간이 무엇인지",
  "신강·신약 판정 결과",
];
const FULL = [
  "그 판정이 왜 그렇게 나왔는지",
  "십신으로 읽는 성격과 기질",
  "십 년 단위 대운의 흐름",
  "올해와 내년의 운",
  "연애·관계, 재물·직업, 조언",
];

export function IntroStory() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Panel className="text-center">
        <Shaman
          expression="welcome"
          eager
          className="mx-auto w-[210px] rounded-[16px] shadow-card"
        />
        <p className="mt-4 font-mono-kr text-[10px] tracking-[0.2em] text-gold-text">사주</p>
        {/* 320px 기기에서 `text-3xl`(30px)이면 둘째 줄이 다시 접혀 제목이 세 줄이
            된다. 작은 폰에서만 한 단계 줄여 의도한 두 줄을 지킨다. */}
        <h1 className="mt-1 font-display text-[26px] leading-snug text-ink sm:text-3xl">
          자네 사주,
          <br />
          시간부터 바로잡고 보세.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          태어난 시각을 진태양시로 고쳐 계산하네. 회원가입은 필요 없고, 여덟 글자까지는
          그냥 보여주네.
        </p>
      </Panel>

      <ShamanBeat expression="concern" label="첫째">
        <p>
          사주를 여기저기서 봤는데 앱마다 다른 소리를 하더라, 그런 말 많이 듣네. 이상한
          일이 아닐세. 같은 사람을 두고도 <strong>태어난 시각을 어떻게 잡느냐</strong>에
          따라 글자가 달라지거든.
        </p>
      </ShamanBeat>

      <Panel>
        <PanelLabel>왜 시각이 어긋나는가</PanelLabel>
        <MeridianDiagram className="mx-auto h-auto w-full max-w-md text-gold-text" />
        <p className="mt-4 text-[15px] leading-relaxed text-ink-body">
          우리가 보는 시계는 동경 135도를 기준으로 맞춰져 있네. 그런데 서울은 127도쯤에
          있지. 그래서 시계가 낮 열두 시를 가리켜도 해는 아직 그 자리에 오지 않았네. 그
          차이가 <strong>서울 기준 약 32분</strong>일세.
        </p>
      </Panel>

      <ShamanBeat expression="point" label="둘째">
        <p>
          사주에서 시(時)는 두 시간마다 바뀌네. 그러니 서른두 시간도 아니고 서른두{" "}
          <em>분</em>이 뭐 그리 대수냐 싶겠지만, 경계에 가까이 태어난 사람은 이 삼십 분에{" "}
          <strong>시주가 통째로 넘어가네</strong>.
        </p>
        <p>
          시주가 바뀌면 글자 두 개가 바뀌고, 그 두 글자에 딸린 십신과 지장간이 다 따라
          바뀌네. 앱마다 말이 달랐던 까닭이 대개 여기 있네.
        </p>
      </ShamanBeat>

      <Panel>
        <PanelLabel>이 집이 하는 보정</PanelLabel>
        <ul className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-body">
          <li>
            <strong className="text-gold-text-strong">경도 보정</strong> — 태어난 곳의
            경도로 해의 위치를 맞추네. 서울과 포항이 같을 리 없지.
          </li>
          <li>
            <strong className="text-gold-text-strong">균시차</strong> — 해는 날마다 조금씩
            빨라졌다 늦어졌다 하네. 그 날짜의 어긋남까지 셈에 넣네.
          </li>
          <li>
            <strong className="text-gold-text-strong">서머타임</strong> — 예전에 시계를 한
            시간 당겨 쓰던 시절이 있었네. 그때 태어났으면 그것도 되돌려야 하네.
          </li>
          <li>
            <strong className="text-gold-text-strong">절기 경계</strong> — 해가 바뀌는
            자리는 정월 초하루가 아니라 입춘일세. 그 시각을 분 단위로 따져 년주와 월주를
            가르네.
          </li>
        </ul>
      </Panel>

      <ShamanBeat expression="speak" label="셋째">
        <p>
          여덟 글자를 뽑는 데까지는 한달음일세. 자네 사주가 어떻게 생겼는지, 오행이 어디로
          치우쳤는지, 기운이 센지 여린지 — 거기까지는 바로 보고 가시게.
        </p>
      </ShamanBeat>

      <Panel>
        <PanelLabel>바로 보는 것 / 풀이까지</PanelLabel>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-3 font-mono-kr text-[11px] tracking-[0.14em] text-wuxing-wood">
              입력하면 바로
            </p>
            <ul className="flex flex-col gap-2">
              {FREE.map((t) => (
                <li key={t} className="flex gap-2 text-[15px] text-ink-body">
                  <span aria-hidden className="text-wuxing-wood">
                    ·
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 font-mono-kr text-[11px] tracking-[0.14em] text-gold-text-strong">
              풀이까지 들으려면
            </p>
            <ul className="flex flex-col gap-2">
              {FULL.map((t) => (
                <li key={t} className="flex gap-2 text-[15px] text-ink-body">
                  <span aria-hidden className="text-gold-text">
                    ·
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel className="text-center">
        <Shaman expression="joy" className="mx-auto w-[170px] rounded-[16px] shadow-card" />
        <p className="mt-4 font-mono-kr text-[11px] tracking-[0.2em] text-gold-text-strong">
          전체 풀이
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          여덟 글자를 본 다음, 풀이를 들을지는 그때 정하시게.
        </p>
        <Link
          href="/saju"
          className="mt-6 inline-block rounded-pill bg-button-gradient px-8 py-3 text-[16px] font-bold text-on-primary shadow-cta"
        >
          여덟 글자부터 보러 가기
        </Link>
      </Panel>

      <Panel>
        <PanelLabel>미리 일러둘 것</PanelLabel>
        <ul className="flex flex-col gap-2 text-[14px] leading-relaxed text-muted">
          <li>
            · 회원가입을 받지 않네. 여덟 글자만 볼 때는 생년월일시를 서버에 남기지 않고,
            풀이를 사시면 다시 보실 수 있게 30일 두었다 지우네.
          </li>
          <li>
            · 밤 11시부터는 다음 날로 세는 정자시설을 따르네. 강약은 이 집이 만든
            셈법일세. 다른 만세력과 다를 수 있네.
          </li>
          <li>
            · 사주는 사람을 이해하는 하나의 언어일 뿐, 의료·법률·투자를 대신하지 못하네.
            그런 결정은 그쪽 전문가에게 물으시게.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
