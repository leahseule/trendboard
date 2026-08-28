import json
import os

_client = None
_client_checked = False


def get_client():
    global _client, _client_checked
    if _client_checked:
        return _client
    _client_checked = True
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    from openai import OpenAI
    _client = OpenAI(api_key=api_key)
    return _client


def _model():
    return os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


def summarize_item(title: str, text: str):
    client = get_client()
    if not client:
        return None
    prompt = (
        "다음 글의 제목과 본문(초록/발췌)을 보고 한국어로 정확히 3줄 요약을 작성하고, "
        "핵심 키워드 5개를 뽑아줘. 반드시 아래 JSON 형식으로만 답해:\n"
        '{"summary_lines": ["줄1", "줄2", "줄3"], "keywords": ["k1","k2","k3","k4","k5"]}\n\n'
        f"제목: {title}\n본문: {text[:3000]}"
    )
    resp = client.chat.completions.create(
        model=_model(),
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    data = json.loads(resp.choices[0].message.content)
    return {
        "summary_lines": data.get("summary_lines", [])[:3],
        "keywords": data.get("keywords", [])[:5],
    }


SLOT_FRAME_BODY = """당신은 아래 글(제목+짧은 발췌)들을 분석해 "인사이트 카드"를 만드는 분석가다. 반드시 아래 슬롯
프레임을 따른다:
- 슬롯 1 · 자동화 대상 업무
- 슬롯 2 · 자동화 방식과 수준
- 슬롯 3 · 업무 프로세스 재설계
- 슬롯 4 · 인력·조직 영향
- 슬롯 5 · 비판적 독해 (항상 최소 1개 포함)

규칙:
- 자료와 연결이 약한 슬롯은 억지로 채우지 말고 건너뛴다. 슬롯 5는 항상 포함한다.
- 전체 2~4개의 인사이트 카드를 만든다. 선택된 글이 1개뿐이면 1~2개만 만들고, 비교할 다른
  자료가 없다는 점을 intro와 슬롯5에 명시한다 — 없는 비교 대상을 지어내지 않는다.
- 각 카드는 슬롯 이름(반드시 "슬롯 N · 이름" 형식으로), #키워드 태그 2~4개, 그리고 4개
  필드로 구성한다:
  - 무엇이 보이는가: 자료에서 직접 확인되는 사실만 쓴다. 신호.
  - 왜 이게 중요한가: 그로부터 도출한 해석·추론. "~로 보인다"처럼 추론임을 표시한다.
  - 어디로 이어지는가: 전망이나 열린 질문으로 마무리한다.
  - 비판적으로 볼 지점: 발표 주체의 이해관계, 근거의 한계, 일반화 위험 등을 쓴다. 비판
    지점이 약하면 왜 약한지 한 문장으로 밝힌다.
- 신호와 추론을 섞지 않는다.
- 불릿 나열이나 키워드 압축 대신 자연스러운 산문, 완결된 문장으로 쓴다. "~됨"류 명사형
  종결 대신 "~이다/~보인다/~할 수 있다"로 끝낸다.
- 주어진 자료 안에서 확인되는 내용만 근거로 삼는다. 자료가 제목+짧은 발췌 수준으로 얇으면
  얇다고, 연결이 약하면 약하다고 그대로 밝힌다. 원문 전체가 주어졌다면 그만큼 구체적으로
  인용·근거를 들어도 된다. 어느 쪽이든 자료에 없는 내용을 지어내지 않는다.
- 맨 앞에 전체를 관통하는 흐름을 2~4문장으로 쓴다. 뚜렷한 흐름이 없으면 없다고 쓴다."""

SLOT_FRAME_JSON_SUFFIX = """

반드시 아래 JSON 형식으로만 답한다(슬롯 이름에 "슬롯 N ·" 접두어를 반드시 포함할 것):
{"intro": "...", "insights": [
  {"slot": "슬롯 N · 이름", "tags": ["#키워드1", "#키워드2"], "whatIsSeen": "...",
   "whyItMatters": "...", "whereItLeads": "...", "criticalView": "..."}
]}"""

SLOT_FRAME = SLOT_FRAME_BODY + SLOT_FRAME_JSON_SUFFIX


def _items_block(items: list) -> str:
    lines = []
    for it in items:
        body = it.get("excerpt") or it.get("title", "")
        lines.append(f"- [{it.get('source')}] {it.get('title')} — {body}")
    text = "\n\n분석 대상 글:\n" + "\n".join(lines)
    if len(items) == 1:
        text += (
            "\n\n주의: 선택된 글이 1개뿐이다. 여러 글을 묶은 '흐름'으로 포장하지 말고, "
            "이 글 하나에서 뽑을 수 있는 신호로만 다뤄라(슬롯 5 비판적 독해 중심, 카드 1개)."
        )
    return text


def build_trend_prompt(items: list) -> str:
    """실제 OpenAI 호출용 — JSON 강제."""
    return SLOT_FRAME + _items_block(items)


def build_trend_prompt_for_chat(items: list, want_artifact: bool = False) -> str:
    """ChatGPT/Claude 프리필 링크용 — JSON 대신 사람이 읽기 좋은 마크다운으로 요청.
    API 비용 없이 사용자 본인 계정으로 같은 분석을 받아보고 싶을 때 씀.
    want_artifact=True면(Claude로 보낼 때만) 채팅 답변 대신 마크다운 아티팩트로
    만들어달라는 지시를 덧붙인다 — Claude만 아티팩트 기능이 있어서 ChatGPT엔 안 씀."""
    suffix = (
        "\n\n마크다운으로 보기 좋게 정리해서 답해줘. 슬롯 이름은 소제목(###)으로, "
        '"무엇이 보이는가"·"왜 이게 중요한가"·"어디로 이어지는가"·"비판적으로 볼 지점"은 '
        "각각 굵게 표시한 뒤 문단으로 풀어써줘."
    )
    if want_artifact:
        suffix += (
            "\n\n이 분석 결과 전체를 채팅 답변이 아니라 마크다운 아티팩트로 만들어서 보여줘."
        )
    return SLOT_FRAME_BODY + suffix + _items_block(items)


def summarize_trend(items: list):
    client = get_client()
    if not client:
        return None
    prompt = build_trend_prompt(items)
    resp = client.chat.completions.create(
        model=_model(),
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.4,
    )
    data = json.loads(resp.choices[0].message.content)
    return {
        "intro": data.get("intro", ""),
        "insights": data.get("insights", []),
    }
