# TrendBoard PRD

## 1. 배경 / 레퍼런스
과기정통부 신주환 사무관이 만든 "전략기술 대시보드" 사례(디지털데일리 보도)에서 착안.
arXiv·bioRxiv·MIT Tech Review 등에서 최신 연구/기술 정보를 모아 AI로 3줄 요약 + 키워드
추출, 여러 글을 묶어 "페이지 트렌드"를 뽑아주는 구조.

## 2. 목적
개발자/기획자가 매일 아침 여러 사이트를 돌아다니지 않고, 한 화면에서 AI/개발 관련
최신 글을 훑고 무엇이 지금 화두인지 파악할 수 있게 한다. [[project-xlmeta]], [[project-weave]]에
이은 세 번째 FDE 포트폴리오 작품.

## 3. 타겟 사용자
본인(기획자 출신, 코딩 학습 중) — 매일 사용하며 실사용 피드백으로 개선. 포트폴리오
관람자에게는 "직접 만든 정보 수집·요약 파이프라인"으로 어필.

## 4. 핵심 기능 (MVP, 우선순위순)
1. **소스 수집**: GeekNews(긱뉴스, 국내 개발/기술/스타트업 뉴스 커뮤니티, RSS
   `https://news.hada.io/rss/news` 확인 완료 — 유효한 Atom 피드), AI타임스(국내 AI 뉴스, RSS
   `https://www.aitimes.com/rss/allArticle.xml` 확인 완료 — 유효한 RSS 2.0, 전체 기사 피드).
   네이버 IT(`news.naver.com/section/105` 직접 스크레이핑, 2026-08-27 추가 — **네이버 뉴스는
   공개 RSS를 제공하지 않음. 예전 RSS 엔드포인트들이 전부 404로 리다이렉트되는 걸 직접
   확인함**. 대안으로 네이버 공식 검색 API도 있었지만 사용자가 스크레이핑 쪽을 선택함.
   `app/sources.py`의 `fetch_naver_it()`가 BeautifulSoup으로 `a.sa_text_title` /
   `strong.sa_text_strong` / `.sa_text_lede` 클래스를 파싱 — **네이버가 마크업을 바꾸면
   깨질 수 있는 구조**. 목록 페이지엔 절대 발행시각이 없어 "수집 시각"을 published로 대신
   씀(페이지 자체가 최신순 정렬이라 실사용엔 문제 없지만 정확한 발행시각은 아님). 자동
   수집이 네이버 약관과 완전히 합치하는지는 불확실 — 개인용 포트폴리오 프로젝트 범위로
   씀. GeekNews·AI타임스와 마찬가지로 X-Frame-Options: SAMEORIGIN이 걸려 있음 — 다만 이제
   iframe 미리보기 자체가 없음, 6번 참고).
   (arXiv는 소스 목록에서 제외 — 2026-08-27 결정. Hacker News는 이후 국내향으로 GeekNews로
   교체 — 2026-08-27 결정). 카드 목록으로 표시, 출처별 탭 필터. 카드에는 제목 아래 **원문
   발췌(약 100자, RSS/API가 주는 본문·초록에서 그대로 가져옴, AI 가공 없음)**를 항상 노출해
   클릭 없이도 대략적인 내용을 훑을 수 있게 한다 — AI 요약(2번)과는 별개.
2. **개별 요약**: 카드 클릭 시 OpenAI API로 3줄 요약 + 키워드 5개 생성 (온디맨드,
   전체 미리 돌리지 않음 — 비용 절감).
3. **페이지 트렌드 (인사이트 분석)**: 카드를 1개 이상 선택 후 "트렌드 분석" 누르면, 개인
   슬래시커맨드 `/analyze-insights`(Obsidian 클리핑 → Daily Insight 생성)의 분석 프레임을
   그대로 가져와 적용한다:
   - **슬롯 기반**: 자동화 대상 업무 / 자동화 방식과 수준 / 업무 프로세스 재설계 /
     인력·조직 영향 / 비판적 독해(항상 채움) — 선택된 글들에서 슬롯별로 인사이트를 뽑되,
     연결이 약한 슬롯은 "연결성 약함"으로 명시하고 건너뛰지 않는다
   - **인사이트 카드 구조**: 슬롯 태그 + 무엇이 보이는가(신호) / 왜 이게 중요한가(해석) /
     어디로 이어지는가(전망·열린 질문) / 비판적으로 볼 지점(항상 채움) 4단 구성
   - **신호/추론 구분**: 자료에서 직접 확인되는 사실과, 거기서 도출한 추론을 섞지 않고
     추론은 "~로 보인다" 식으로 표시
   - **1개만 선택한 경우**: 여러 글을 묶은 "흐름"으로 포장하지 않고, 이 글 하나에서 뽑을 수
     있는 신호(비판적 독해 1장)로만 다룬다 — 없는 비교 대상을 지어내지 않는다는 원칙 유지
   - **문체**: 불릿 나열·키워드 압축 대신 자연스러운 산문, 완결된 문단, 명사형 종결
     지양("~됨" 대신 "~이다/~보인다")
   - 개요("오늘의 흐름" 상당)를 먼저 짧게 제시한 뒤 인사이트 카드를 나열
   - Obsidian 파일 저장·이동 같은 부수효과는 없음 — TrendBoard 화면에만 표시
   - **별도 페이지(`trend.html`)**에 결과를 표시 (카드 목록 위 모달이 아님). 분석할 때마다
     결과가 **히스토리로 누적 저장**된다.
   - **레이아웃은 Obsidian 스타일 2단 구성**: 좌측 SNB(사이드 네비게이션 바)에 히스토리
     항목이 날짜만 간단히 나열되고(소스뱃지·스니펫은 뺌 — 목록이 번잡해 보여 제거), 클릭하면
     페이지 새로고침 없이 우측 본문이 즉시 그 분석 결과로 전환된다(활성 항목은 흰 배경+그림자로 강조).
   - **백엔드 연동 완료(2026-08-27)**: `localStorage` 대신 서버가 `data/history.json`
     파일에 저장한다(`app/history_store.py`, DB 없이 결정론적 파일 저장 — [[project-xlmeta]]와
     같은 철학). `POST /api/trend`가 저장까지 함께 처리하고, `GET /api/history`·
     `GET /api/history/{id}`·`DELETE /api/history`로 조회/삭제.
4. **새로고침**: 소스별 캐시(TTL 20분)를 무시하고 강제로 다시 가져오기.
5. **기간 필터 / 날짜 검색(2026-08-27 추가)**: 기본은 **최근 3일**만 카드로 보여준다.
   상단 "기간 검색"에 시작일·종료일을 입력하면 그 기간의 글로 다시 필터링(하나만 입력해도
   동작). **중요한 제약**: GeekNews·AI타임스 RSS는 최신 ~50개(대략 1~1.5일치)만 노출하고
   과거 페이지네이션이 없다 — 그래서 `app/items_store.py`가 매 fetch마다 결과를
   `data/items.json`에 누적 저장(같은 id는 최신 내용으로 갱신, 14일 지난 건 정리)하고,
   "최근 3일"·기간검색 둘 다 이 누적 아카이브를 기준으로 필터링한다. **배포 직후에는
   아카이브가 비어 있어서 실제로 3일치가 쌓이려면 서비스가 며칠 돌아가야 하고, 서비스
   시작 이전 날짜는 애초에 검색해도 안 나온다** — RSS 특성상 감수해야 하는 한계.
6. ~~오른쪽 미리보기 패널~~ — **2026-08-27에 추가했다가 같은 날 제거함**. 카드 제목 클릭 시
   화면 오른쪽 패널에 원문을 iframe/리더뷰로 보여주는 기능이었으나(AI타임스는 iframe,
   GeekNews·네이버 IT는 X-Frame-Options 때문에 리더뷰로 대체), 사용자가 다시 "제목 클릭 →
   새 탭 바로 열기"로 되돌려달라고 해서 걷어냄. 관련 코드(`openPreview`/`closePreview`,
   `GET /api/items/{id}`, `.preview-*`/`.reader-*` CSS)는 전부 삭제. 카드 제목은 다시
   `target="_blank"`로 단순 새 탭 링크.
7. **"분석됨" 표시(2026-08-27 추가)**: 예전에 트렌드 분석에 한 번이라도 포함됐던 글은
   카드 목록에서 옅게 흐려 보이고(`opacity: 0.6`, 마우스 올리면 다시 선명해짐) 배지에
   "✓ 분석됨"이 붙는다. `GET /api/history-used-ids`가 모든 히스토리 항목의 `selectedItems`를
   훑어 id 집합을 돌려줌(예전 히스토리처럼 id가 없으면 url로 다시 계산). 선택을 막는 건
   아니고 시각적 힌트만 — 같은 글을 다른 조합으로 다시 분석하고 싶을 수도 있어서.
8. **API 없이 ChatGPT/Claude로 넘기기(2026-08-28 추가)**: gpt-4o-mini도 공짜는 아니라서
   ("API 비용 아깝다"는 사용자 피드백), 트렌드바에 "ChatGPT로"·"Claude로"·"프롬프트 복사"
   3개 버튼을 추가했다. [[project-xlmeta]]의 프리필 링크 패턴(`https://claude.ai/new?q=`,
   `https://chatgpt.com/?q=`)을 그대로 재사용. `POST /api/trend-prefill`이 OpenAI를
   호출하지 않고 `summarize.build_trend_prompt_for_chat()`으로 같은 슬롯 프롬프트를
   텍스트로만 돌려줌(마크다운 응답 요청 — JSON 강제 아님, 사람이 읽을 거라서). 결과는
   외부 챗에서만 확인하고 우리 앱으로 회수하지 않음(히스토리에 안 쌓임) — 사용자가 그렇게
   결정함. **한글은 URL 퍼센트 인코딩되면 글자당 약 9배로 불어나서(UTF-8 3바이트×%XX)
   실측 결과 1개 글 선택도 URL이 9천자 넘게 나옴** — 발췌를 150자로 줄여도 5개 선택 시
   1.3만자. 그래서 링크가 안 열릴 가능성을 감안해 "프롬프트 복사" 버튼을 항상 같이 둠
   (xlmeta와 같은 안전망 패턴).
9. **카드 레이아웃 변경(2026-08-28)**: 그리드(여러 열)가 너무 빽빽해서 가독성이 떨어진다는
   피드백으로, 세로 리스트 1열(최대 680px, 가운데 정렬)로 바꿈. `.cards`를
   `display:grid`→`display:flex; flex-direction:column`.
10. **핸드오프를 "링크만 전달" 방식으로 재설계 + 원문 전체 스크레이핑(2026-08-28)**: 8번의
    프리필 링크가 한글 퍼센트 인코딩 때문에 URL이 감당 못 할 만큼 길어지는 문제(1개 글도
    9천자↑)를 근본적으로 해결하기 위해, ChatGPT/Claude에는 우리가 호스팅하는 `GET /prompt?
    ids=id1,id2,...` 페이지로 가는 **짧은 링크만** 전달하는 방식으로 바꿈(사용자가 "항상
    링크만 전달"로 확정 — 목적지 AI의 브라우징 기능이 실제로 그 링크를 열어준다는 보장은
    없다는 점을 알고도 선택). 실측 결과 인코딩된 URL 길이가 9천자대→500자대로 줄어듦.
    `POST /api/trend-prefill`은 더 이상 안 쓰여 삭제, `apiTrendPrefill()`도 같이 제거 —
    `app.js`의 `onHandoffOpen`/`onHandoffCopy`는 이제 네트워크 호출 없이 클라이언트에서
    바로 "짧은 안내 메시지 + `/prompt` 링크"를 만들어 열거나 복사한다.
    같은 타이밍에 "발췌 일부가 아니라 링크와 전체 내용을 다 주면 안 되나"는 질문에
    사용자가 **"원본 기사 본문 전체 스크래핑"**을 선택해서, `/prompt` 페이지는 단순 RSS
    발췌가 아니라 원문 기사 본문 전체를 보여준다:
    - `app/sources.py`의 `fetch_full_text(item)`: AI타임스(`#article-view-content-div`)·
      네이버 IT(`#dic_area`, 이미지 캡션 span `end_photo_org` 제거) 원문 페이지를 실시간
      스크레이핑. 실패하거나 selector가 안 맞으면 RSS 발췌(`raw_text`)로 조용히 폴백.
      길이 안전장치로 8000자 초과 시 자름(`FULL_TEXT_LIMIT`). GeekNews는 자체 원문이 없어
      (외부 링크 큐레이션) 스크레이핑 대상에서 제외 — `raw_text`가 이미 사실상 전문.
    - `GET /prompt`는 DB 저장 없이 매 요청마다 `ids`로부터 그대로 다시 만든다(요구사항
      그대로: "저장 안 함"). 선택 항목들의 `fetch_full_text`를 `asyncio.gather`로 병렬
      호출 후 `summarize.build_trend_prompt_for_chat()`으로 프롬프트 텍스트를 만들어 HTML로
      렌더링(원문 링크 목록 + 전체 복사 버튼 + 프롬프트 원문).
    - `SLOT_FRAME_BODY`의 "입력은 제목+짧은 발췌 수준으로 얇다"는 문구를 일반화함 — 이제
      `/api/trend`(실제 API, 여전히 300자로 자름) 경로와 `/prompt`(전체 원문) 경로가 같은
      프롬프트 본문을 공유하는데, 후자는 더 이상 "얇지" 않아서 그대로 두면 모델이 풍부한
      본문을 활용하지 않을 위험이 있었음.
    - **새로 생긴 리스크**: (1) 소스별 신규 스크레이퍼 2개 추가로 마크업 변경에 취약한
      지점이 늘어남(9번 항목의 네이버 IT 목록 페이지 취약성과 동일한 종류의 리스크가
      원문 페이지에도 하나씩 더 생김), (2) `/prompt` 페이지 요청마다 선택한 글 수만큼
      실시간으로 원문 페이지를 추가로 fetch하므로 지연시간이 늘어남, (3) 네이버 ToS 관련
      기존 불확실성(9번 항목 참고)이 목록 페이지뿐 아니라 개별 기사 페이지 스크레이핑에도
      그대로 적용됨.
11. **분석 방식 선택 흐름 재구성(2026-08-28)**: 기존엔 트렌드바에 "선택 항목 트렌드
    분석"(TrendBoard 자체 API)과 "ChatGPT로"·"Claude로"·"프롬프트 복사"(핸드오프)가 항상
    나란히 노출돼 헷갈린다는 지적으로, **"선택 항목 트렌드 분석" 버튼 하나만 남기고, 클릭하면
    TrendBoard/ChatGPT로/Claude로 3가지 옵션을 고르는 모달**이 뜨는 구조로 바꿈. "프롬프트
    복사"는 모달 하단에 작은 보조 링크로 남김(ChatGPT/Claude 링크가 안 열릴 때의 안전망,
    8번 항목 참고). `app.js`: `openMethodModal`/`closeMethodModal` 추가, 기존
    `onTrendClick`의 API 호출 로직은 `onMethodTrendboard`로 이동. 모달은 배경 클릭·Escape·
    닫기 버튼으로 닫힘.
12. **Claude 핸드오프는 결과를 마크다운 아티팩트로(2026-08-28)**: "Claude로" 넘길 때만
    `/prompt?ids=...&target=claude`처럼 `target=claude`를 붙이고,
    `summarize.build_trend_prompt_for_chat(items, want_artifact=True)`가 "채팅 답변 대신
    마크다운 아티팩트로 만들어서 보여줘" 지시문을 덧붙임 — 아티팩트는 Claude 전용 기능이라
    ChatGPT 경로(`target` 없음/`chatgpt`)엔 안 붙임. 짧은 핸드오프 메시지 자체에도 같은
    지시문을 넣어 이중으로 전달(링크를 안 열고 메시지만 봐도 의도가 전해지게). "프롬프트
    복사" 버튼은 어느 쪽에 붙여넣을지 알 수 없어 중립 메시지 그대로 둠.
13. **트렌드바 sticky 버그 수정(2026-08-28)**: "선택 항목 트렌드 분석" 버튼이 스크롤을
    내리면 화면 밖으로 같이 사라지는 문제 — `.trendbar { position: sticky; top: 0 }`는
    맞게 돼 있었는데, `html, body { height: 100% }`가 원인이었음. body 박스 자체가 뷰포트
    높이로 고정되면서(overflow는 visible이라 콘텐츠는 넘쳐 보이지만) sticky 오프셋 계산이
    실제 콘텐츠 높이를 못 따라가 전혀 안 붙는 상태였음. `height: 100%` → `min-height: 100%`로
    바꿔 해결(트렌드 히스토리 페이지의 `height: 100vh` 전체높이 레이아웃엔 영향 없음 —
    뷰포트 기준 절대값이라 무관).
14. **상단 컨트롤 라인 재배치(2026-08-28)**: 소스 탭(전체/AI타임스/네이버 IT/GeekNews)을
    "선택 항목 트렌드 분석" 버튼과 같은 줄(sticky `.trendbar`)로 옮기고, 새로고침 버튼은
    기간 검색(`.date-bar`)과 같은 줄로 옮김. 예전엔 `.topbar-controls`(탭+새로고침)와
    `.trendbar`(트렌드 버튼)가 따로 놀아서 탭 선택이 트렌드 분석과 한눈에 안 이어져 보였음.
    `.topbar-controls`/`.actions` CSS는 더 안 쓰여서 삭제. `.trendbar`는
    `justify-content: flex-end` → `space-between`로 바꿔 탭 왼쪽·버튼 오른쪽 배치, 탭
    배경이 트렌드바 배경(`--accent-soft`)과 같은 회색이라 안 보이던 문제는
    `.trendbar .tabs { background: var(--surface) }`로 흰색 대비를 줘서 해결.
15. **"장바구니 히스토리"로 전면 재편(2026-08-28)**: TrendBoard 자체 OpenAI API로 분석하는
    메뉴(모달의 "TrendBoard" 옵션, `POST /api/trend`, `summarize.summarize_trend`/
    `build_trend_prompt`/`SLOT_FRAME_JSON_SUFFIX`)를 전부 없애고, ChatGPT로/Claude로 2가지
    옵션만 남김. 히스토리 개념도 "OpenAI가 만든 인사이트 카드 저장소"에서 **"ChatGPT/Claude로
    보낸 글 조합의 기록(장바구니)"**으로 바뀜:
    - `POST /api/cart`(`ids`, `method`)가 새 엔드포인트. OpenAI 호출 없이 즉시
      `history_store.add_entry()`로 `{sources, selectedItems, method}`만 저장 —
      intro/insights 없음.
    - **저장 시점**: ChatGPT/Claude 버튼을 누르는 순간 자동 저장(사용자 확인, 별도
      "저장" 버튼 없음). 프런트에서 `window.open()`은 클릭 즉시 동기로 먼저 실행하고
      `apiCart()`는 그 뒤 백그라운드로 보냄 — await 먼저 하면 팝업 차단에 걸릴 수 있어서
      순서를 지켰음(8번 항목에서 프리필 링크를 동기 처리로 되돌렸던 것과 같은 이유).
    - `promptPageUrl`/`handoffMessage`/`openHandoff`를 `app.js`에서 `common.js`로 옮겨
      카드 화면과 히스토리 화면이 공유(히스토리의 "다시 열기"가 같은 함수를 씀).
    - **히스토리 항목 클릭 시**: 그때 선택했던 기사 목록(제목·소스·원문 링크) +
      "ChatGPT로 다시 열기"/"Claude로 다시 열기" 버튼(같은 조합으로 즉시 재핸드오프) +
      프리필 링크(`/prompt?ids=...`) 직접 열기 링크를 보여줌. 예전 인사이트 카드
      collapse-토글 UI는 삭제.
    - **하위 호환**: 예전(OpenAI 직접 호출 시절) 히스토리 항목엔 `intro`/`insights`가
      남아있을 수 있어, 있으면 그대로 아래에 이어서 보여줌(마이그레이션 없이 자연 공존).
    - 카드 화면 상단 네비/모달 안내 문구도 "장바구니 히스토리"로 통일. 개별 카드
      "AI 요약 보기"(OpenAI 3줄 요약)는 이번 범위 밖이라 그대로 유지.
    - **알려진 제약**: "다시 열기"는 `items_store`(14일 보존)에서 원문을 다시 찾아
      `/prompt`를 재생성하므로, 14일이 지나 원본 글이 보존 기간에서 빠지면 재생성이
      실패할 수 있음(제목/링크 자체는 history.json에 별도 저장돼 안 사라짐, 재생성만
      영향받음) — 아직 안 고침.
16. **히스토리 항목에서 프리필 내용을 바로 보게(2026-08-28)**: "다시 열기" 버튼만으로는
    실제 프리필에 뭐가 담기는지 보려면 새 페이지/탭으로 나가야 했음 — 사용자가 "프리필
    링크를 그냥 히스토리 안에서 볼 수 있게" 요청. `GET /api/prompt`(JSON) 신설 —
    `/prompt`(ChatGPT/Claude가 여는 HTML 페이지)와 같은 계산(`_build_prompt_data`로
    공통화)을 쓰지만 `{items, promptText}`만 돌려줌. 히스토리에서 항목을 고르면
    `apiPromptData()`로 그 조합의 프롬프트 전문을 그 자리에서 다시 만들어 리스트(기사
    목록) + `<pre>` 텍스트로 바로 보여주고, "프롬프트 복사" 버튼도 같이 둠 — 매번 ids로
    다시 만드므로 저장 없이도 항상 최신 원문 반영. 동시에 예전(OpenAI 직접 분석 시절)
    히스토리 항목의 intro/insights 하위호환 렌더링은 **삭제**(사용자가 "기존에 분석한
    내용은 다 없애도 된다"고 확인 — 로컬 `data/history.json`도 비웠음), 관련 죽은 CSS
    (`.trend-intro`/`.insight-*`/`.close-btn`/`#trendContent`)도 같이 정리. 메뉴명은
    "장바구니 히스토리"에서 **"히스토리"**로 되돌림(너무 길다는 피드백).
17. **히스토리 지우기 기능 삭제 + 기사 링크 목록을 맨 아래로(2026-08-28)**: 🗑 "히스토리
    전체 지우기" 버튼을 UI·JS·백엔드까지 전부 제거(`clearHistoryBtn`, `apiHistoryClear()`,
    `DELETE /api/history`, `history_store.clear_history()`, 관련 죽은 CSS
    `.snb-header-actions`/`.icon-btn`도 정리) — 히스토리는 이제 순수 기록용, 지우는
    기능은 필요 없다는 판단. 히스토리 상세 화면의 "분석에 사용한 글"(기사 링크 목록)은
    맨 위에서 **맨 아래로** 이동 — 프리필 링크에 담기는 실제 내용(프롬프트 전문)이
    먼저 보이고, 원문 링크 목록은 그 아래 부가 정보로.
18. **프리필 내용 복사 버튼 위치 조정 + 폰트 변경(2026-08-28)**: "프롬프트 복사" 버튼이
    "ChatGPT로/Claude로 다시 열기" 버튼과 한 줄에 섞여 있어 뭘 복사하는 버튼인지 헷갈릴
    수 있었음 — "프리필 링크에 담기는 내용" 라벨 옆(`복사하기`)으로 옮겨서 그 아래
    프롬프트 미리보기와 바로 붙게 배치(`.prompt-preview-label`을 flex로, `.copy-inline-btn`
    스타일 추가). 이제 안 쓰는 `.prompt-link` CSS도 정리. 프롬프트 미리보기(`.prompt-text`,
    히스토리·`/prompt` 페이지 둘 다)의 폰트를 본문 UI 폰트(Pretendard 계열)와 다르게
    `"Dotum", "돋움", "DotumChe", "돋움체", "Malgun Gothic", "맑은 고딕", sans-serif`로
    지정 — 프롬프트 원문임을 시각적으로 구분. **바로 다음에 "돋움 말고 코드용 폰트로"
    피드백을 받아** 고딕(UI용 산세리프) 대신 진짜 코딩 폰트 스택
    `"D2Coding", "Cascadia Mono", "Consolas", "Menlo", "Monaco", "Courier New", monospace`로
    교체(한국어 고정폭 지원이 좋은 D2Coding을 1순위로). **다시 피드백: 이름만 지정했지 실제
    설치된 폰트가 아니라 결국 시스템 기본 굴림으로 보인다는 문제**(D2Coding·Cascadia Mono가
    로컬에 설치돼 있지 않으면 폴백 체인 끝까지 가서 옛날 느낌의 시스템 고정폭 폰트로
    떨어짐) — 이번엔 시스템 폰트에 기대지 않고 **Google Fonts 웹폰트로 직접 로드**해서
    확실히 트렌디하게 렌더링되게 함: `trend.html`과 `/prompt` 페이지(main.py 인라인 HTML)
    양쪽에 `<link>`로 **JetBrains Mono + Noto Sans KR**을 불러오고,
    `font-family: "JetBrains Mono", "Noto Sans KR", "Pretendard", "Consolas", "Menlo",
    "Monaco", monospace`로 지정 — 영문·기호는 JetBrains Mono(요즘 개발자들이 많이 쓰는
    트렌디한 코딩 폰트), 한글은 Noto Sans KR(굴림 대신 모던한 느낌)이 글자 단위로 자동
    폴백. 브라우저에서 `document.fonts`로 실제 로드 확인함.
19. **프롬프트 텍스트 가독성 조정(2026-08-28)**: 글자는 작게, 줄간격은 넓게 — 히스토리
    `.prompt-text`는 12.5px/line-height 1.6 → **11px/line-height 2**로, `/prompt` 페이지
    `pre`도 같은 비율로(0.88rem→0.78rem, line-height 2 추가) 맞춤.
20. **Claude 핸드오프 "URL이 너무 길어서 못 불러옴" 버그 수정(2026-08-28)**: 실사용 중
    발견 — `handoffMessage()`의 짧은 안내 문장 자체가 원인이었다. 링크만 전달하도록
    설계(8번 항목)해서 URL 길이 문제를 해결했다고 생각했지만, **짧은 메시지 안의 한글
    문장도 퍼센트 인코딩되면 글자당 9배 가까이 불어난다**는 걸 간과함 — 기존 안내 문장
    (약 80자, 아티팩트 요청 문구 포함)만으로도 인코딩 후 700자를 넘어 Claude 쪽 프리필
    길이 제한에 걸림(글 개수는 영향 적음 — id는 영숫자라 거의 안 불어남, 실측
    1개=775자→20개=928자 수준). 실제 분석 지시문(아티팩트 요청 포함)은 이미 `/prompt`
    페이지 안에 다 있으므로, 짧은 메시지는 링크를 열어보라는 최소한의 한글만 남기고
    (`"아래 글 분석해줘(아티팩트로):\n{link}"`) 나머지를 링크에 위임 — 실측 1개 글
    223자, 20개 글 546자로 대폭 감소.

## 5. 비범위 (MVP 제외)
- 국가/기업별 기술 수준 실시간 점수화 (기사 속 사무관도 "난도가 너무 높다"고 판단해 보류)
- 로그인/멀티유저 (1인 사용 전제)
- 개별 요약 결과는 `data/items.json`에 함께 저장(캐시라기보다 영속) — 트렌드 히스토리와
  같은 파일 기반 방식으로 통일
- 메신저(슬랙 등) 알림 발송 — 추후 확장 후보
- bioRxiv, MIT Tech Review 등 추가 소스 — v2 후보 (RSS 있는 곳 위주로 확장 쉬움)
- AI타임스 섹션별 세분화(정책/산업/글로벌 등 탭 분리) — v2 후보, MVP는 전체 기사 피드 하나로

## 6. 기술 스택
- 백엔드: FastAPI (Python) — [[project-weave]], [[project-xlmeta]]와 동일 스택 유지
  - `app/sources.py`: GeekNews·AI타임스 RSS(Atom/RSS2.0) 수집. `feedparser.parse()`에는
    반드시 `resp.content`(bytes)를 넘길 것 — `resp.text`(str)를 넘기면 일부 환경에서 한글이
    깨질 수 있어 직접 겪음(2026-08-27). RSS description은 HTML을 포함하므로 `_strip_html()`로
    태그 제거 후 저장(보여주기용 + LLM 프롬프트용 + XSS 방지 겸용)
  - `app/summarize.py`: `summarize_item`(카드 3줄 요약), `summarize_trend`(슬롯 인사이트,
    `/analyze-insights` 프레임을 프롬프트로 이식 — SLOT_FRAME 상수)
  - `app/history_store.py`: 트렌드 분석 결과를 `data/history.json`에 저장(파일 기반, DB 없음)
  - `app/items_store.py`(2026-08-27 추가): 소스별 수집 글을 `data/items.json`에 누적
    저장(RSS가 과거 페이지네이션이 없어서 — 4번 기능 참고). 개별 AI 요약 결과도 여기 같이
    저장돼 재요청 시 재사용됨(`sources.save_item`)
  - `app/fileutil.py`(2026-08-27 추가): `write_text_resilient()` — **Windows Docker
    Desktop의 bind mount(grpcfuse)는 `mkdir(exist_ok=True)` 직후 바로 이어지는 `write`가
    그 디렉터리를 못 찾거나, 있는 디렉터리인데 `mkdir` 자체가 FileExistsError를 던지는 등
    간헐적으로 어긋나는 걸 실제로 겪음** — 500 에러로 이어졌었다(트렌드 분석이 "no valid
    items"로 실패한 원인이기도 했음: 테스트 후 `data/` 폴더를 지웠다가 다시 못 만든 것).
    이제 mkdir+write를 최대 5회 짧은 backoff로 재시도. **`data/`는 실제 운영 데이터이니
    "정리"한다고 지우면 안 됨 — 로컬 테스트에서도 실수로 지운 적 있어 주의.**
  - `app/main.py`: `/api/items`, `/api/summarize`, `/api/trend`, `/api/history*` +
    `StaticFiles(directory=STATIC_DIR, html=True)`를 **`/api/*` 라우트 등록 뒤 마지막에** `"/"`로
    마운트 — 프론트가 상대경로(`style.css`, `app.js`)를 쓰므로 `/static` 프리픽스로 마운트하면
    깨짐(2026-08-27 발견·수정)
- AI 요약/트렌드: OpenAI API (`OPENAI_API_KEY`, 기본 모델 `gpt-4o-mini`), 코드에 키 하드코딩
  안 함. 키 없으면 관련 엔드포인트가 503 반환, 프론트는 토스트로 에러 표시(정상 동작 확인함)
- 프론트: 바닐라 HTML/CSS/JS, 카드 그리드 UI. `common.js`에 `escapeHtml()` — 외부 RSS·LLM
  산출물을 `innerHTML`에 꽂기 전 반드시 이스케이프(실사용 데이터 붙이면서 XSS 표면이 생겨
  2026-08-27에 추가)
- 캐시: 소스별 실시간 RSS 재수집 여부만 TTL 20분으로 제어(`_cache`, 프로세스 메모리 —
  재시작하면 그냥 다시 20분 뒤 재수집), 실제 글 데이터·요약 결과는 위 `items_store.py`를
  통해 파일로 영속화되므로 재시작해도 안 날아감

## 7. 배포
- **라이브 배포 완료(2026-08-28)**: **https://trendboard.weaveapp.duckdns.org** (자동 HTTPS,
  `/api/health` 200 확인함). [[project-xlmeta]]와 같은 EC2(Ubuntu, Elastic IP
  `3.132.211.139`)에서, Weave의 기존 Caddy(`weave-caddy-1`, 네트워크 `weave_default`,
  Caddyfile `/home/ubuntu/weave/Caddyfile`) 뒤에 붙임. `trendboard`는 호스트 포트 노출 안
  하고 `docker-compose.caddy.yml`로 `weave_default`에만 참여(컨테이너명 `trendboard`),
  Caddyfile에 `trendboard.weaveapp.duckdns.org { reverse_proxy trendboard:8000 }` 블록
  추가 후 `docker exec weave-caddy-1 caddy reload`로 무중단 반영.
  GitHub: **https://github.com/leahseule/trendboard** (public, 2026-08-28 최초 push).
  EC2 SSH·Caddyfile 수정·컨테이너 기동은 공유 인프라라 사용자가 직접 진행함(로컬 네트워크에서
  22번 포트가 막혀 있어 이 세션에서는 SSH 직접 접속이 안 됨 — weave 배포 때와 같은 제약,
  당시엔 EC2 Instance Connect로 우회했었음).
- 업데이트: `cd ~/trendboard && git pull && docker compose -f docker-compose.caddy.yml up -d --build`
- **로컬 검증(2026-08-27) 완료**: `Dockerfile`(python:3.12-slim, uvicorn)·
  `docker-compose.yml`(로컬 테스트용, 8000 포트 노출)·`docker-compose.caddy.yml`(운영용,
  `weave_default` 네트워크만 참여, 포트 미노출) 작성.

## 8. 성공 기준
- 하루 1회 이상 실제로 열어서 "오늘 뭐가 화두인지" 확인하는 용도로 쓰게 됨
- 카드 클릭 → 요약 3초 내외로 나옴 (OpenAI 호출 지연 감안)
- 트렌드 분석 결과가 실제로 선택한 글들의 공통 흐름을 잘 짚어줌 (환각 없이 근거 있는 요약)

## 9. 리스크 / 열린 질문
- **소스 확장**: GeekNews/AI타임스 외 소스(bioRxiv, MIT Tech Review, GitHub Trending 등) 추가 여부·우선순위
- **네이밍**: 프로젝트명 `trendboard` 가칭 — 확정 필요
- **비용**: gpt-4o-mini 기준 개별 요약 저비용이나, 트렌드 분석은 여러 글을 한 번에 넣어
  토큰이 더 듦 — 실사용하며 비용 체감 확인 필요
- **입력 두께**: `/analyze-insights`는 클리핑된 전문(全文)을 읽지만, TrendBoard 카드는
  제목+초록/스니펫 수준으로 훨씬 얇음 — 슬롯 채우기가 근거 부족한 일반화로 흐르지 않게
  프롬프트에서 "얇으면 얇다고, 연결 약하면 약하다고 명시" 원칙을 강하게 못박아야 함
- **소스별 발췌 가용성**: AI타임스·GeekNews 모두 RSS description을 제공하지만, GeekNews는
  외부 링크형 게시물이 많아 description이 짧거나 없는 경우가 있을 수 있음 — 발췌가 없으면
  제목만 보여주거나 "본문 없음" 처리 필요
- **네이버 IT 스크레이핑 취약성**: RSS가 없어 HTML 직접 파싱이라 (1) 네이버가 마크업
  클래스명(`sa_text_title` 등)을 바꾸면 조용히 0건이 될 수 있음 — 모니터링 없음, (2) 발행
  절대시각이 없어 "수집 시각"으로 대체해 정확한 발행일 정렬은 아님, (3) 자동 수집이 네이버
  이용약관과 완전히 합치하는지 불확실함(개인용 프로젝트 범위로 진행하기로 함, 트래픽을
  늘리는 방향의 확장은 재검토 필요)
