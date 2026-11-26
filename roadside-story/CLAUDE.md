# Roadside Story — 개발 원칙 (Claude Code용)

고속도로 휴게소 경영 타이쿤. Godot 4.4 / GDScript. 가칭이며 이름은 `scripts/core/app.gd`의 `GAME_TITLE`과 `project.godot`에서 바꾼다.
새 세션은 이 문서 → `docs/PROJECT_HANDOFF.md` → `docs/ROADMAP.md` 순으로 읽으면 이어서 작업할 수 있다.

## 게임의 정체성 (임의로 바꾸지 말 것)

- 카이로소프트식 경영·건설·육성이 중심이다(약 65%). 특전 조합·수집·지역 차이는 그 위에 얹는 차별화 요소다.
- 대상은 하루 10~30분 가볍게 즐기는 직장인. 쉽게 배우고, 언제든 저장하고 끌 수 있고, 며칠 안 해도 손해가 없다.
- 플레이어의 행동은 네 가지: **건설, 업그레이드, 상품 연구, 직원 채용·배치**. 특전 선택은 등급이 오를 때만. 나머지 운영은 자동이다.
- 매출은 반드시 손님이 실제로 걸어가 시설을 이용했을 때만 생긴다. 화면의 손님과 통계가 어긋나면 버그다.
- 실패의 스트레스보다 성공의 즐거움. 파산·시설 파괴·강제 초기화·현실 시간 타이머·출석 보상·뽑기는 만들지 않는다.
- 기획 명세의 "구현하지 말아야 할 요소"(세금, 대출, 근무표, 재고 발주, 전력망, PvP, 광고 등)를 추가하지 않는다.

## 코드 규칙

- 시뮬레이션(`scripts/simulation`, `economy`, `customers`, `staff`, `research`, `synergy`, `perks`, `progression`, `events`, `construction`)은 화면과 분리된 `RefCounted` 클래스다. Node·입력·그리기에 의존하지 않는다. 화면은 `Sim.event` 시그널과 공개 상태만 읽는다.
- 고정 틱(`balance.json`의 `tick` = 0.1 게임초)으로 진행한다. 프레임 속도에 따라 결과가 달라지면 안 된다.
- 난수는 `sim.rng` 하나만 쓴다(시드·상태 저장). 화면 연출용 난수(`randf`)는 게임 규칙에 영향을 주면 안 된다.
- 콘텐츠와 수치는 `data/*.json`에 둔다. 코드에 밸런스 수치를 새로 하드코딩하지 않는다. 콘텐츠에는 안정적인 영문 ID를 쓰고, 화면 이름을 식별자로 쓰지 않는다.
- 저장 형식을 바꾸면 `Sim.SAVE_VERSION`/`Save.PROFILE_VERSION`을 올리고 `save_system.gd`의 `_migrate_*`에 변환을 추가한다.
- UI는 코드로 조립한다(`scripts/ui/ui_kit.gd`). 새 창은 `GamePanel`을 상속하고 `Hud.open_panel`에 등록한다.
- 한국어 문구는 짧고 자연스럽게. 번역투·과장된 문장·영어 슬로건 금지. 수식이나 계수를 플레이어에게 보여주지 않는다.
- GDScript 주의: 타입 없는 값에서 `:=` 추론은 파싱 오류가 난다(`var x = ...` 또는 명시 타입 사용). `python3 tools/fix_infer.py`가 이런 오류를 찾아 고쳐 준다.
- 새 `class_name`을 추가한 뒤에는 `godot --headless --path . --import`로 클래스 캐시를 갱신해야 headless 실행에서 인식된다.

## 그래픽·사운드

- 스프라이트는 `tools/gen_art.py`, 소리는 `tools/gen_audio.py`가 만든 자체 제작 1차 에셋이다. 손으로 고치지 말고 생성기를 고친 뒤 다시 생성한다.
- 규격(타일 64×32, 광원 왼쪽 위, 기준점)은 `docs/ART_GUIDE.md`, 파일 목록은 `docs/ASSET_MANIFEST.md`.
- 이모지·단색 사각형·원으로 건물이나 사람을 대신하지 않는다. 임시 그림은 문서에 임시라고 적는다.

## 테스트 (변경 후 반드시)

```
godot --headless --path . --import                         # 에셋·클래스 캐시 갱신
godot --headless --path . res://tests/test_runner.tscn      # 자동 테스트 (실패 시 종료 코드 1)
godot --headless --path . res://tools/sim_runner.tscn -- --strategy=all --years=8   # 전략별 밸런스 비교
```

- 실행하지 않은 테스트를 통과했다고 쓰지 않는다. 결과는 `docs/TEST_REPORT.md`에 실제 출력으로 기록한다.
- 사람이 느끼는 재미는 자동으로 검증할 수 없다. 자동 검증 항목과 사람 플레이 테스트가 필요한 항목을 구분해 적는다.
- 밸런스를 바꾸면 `docs/BALANCE.md`의 수정 내역과 시뮬레이션 결과를 갱신한다.

## 하지 말 것

- 외부 유료 서비스 호출, 에셋 구매, 배포·공개를 사용자 승인 없이 하지 않는다.
- 사용자의 다른 프로젝트 파일(저장소 루트의 웹 게임 등)을 건드리지 않는다. 이 게임은 `roadside-story/` 안에만 있다.
- 작동하지 않는 버튼이나 미구현 기능을 완성된 것처럼 화면에 노출하지 않는다.
