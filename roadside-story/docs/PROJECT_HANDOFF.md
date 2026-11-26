# PROJECT_HANDOFF

새 세션(사람이든 Claude Code든)이 이어서 작업하기 위한 요약. 2026-11-26 기준, 버전 0.1.0.

## 현재 상태

- 처음부터 끝까지 플레이 가능한 수직 슬라이스. 메인 메뉴 → 새 휴게소 → 건설·업그레이드·연구·채용 → 궁합·특전 → 등급 7 / 전국 평가 → 다른 지역으로 새 회차.
- 자동 테스트 전부 통과, 봇 6종 8년 시뮬레이션 완료 (`TEST_REPORT.md`, `BALANCE.md`).
- **사람 플레이 테스트는 아직 0회.** 다음 작업의 최우선은 사용자가 직접 해 보고 주는 피드백이다.

## 개발 환경

- Godot 4.4.1 stable (표준, GL Compatibility 렌더러). GDScript만 사용, 애드온 없음.
- 에셋 생성: Python 3 + Pillow(`tools/gen_art.py`), numpy + ffmpeg(`tools/gen_audio.py`).
- 이 저장소의 루트에는 다른 웹 게임이 들어 있다. **Roadside Story는 `roadside-story/` 폴더 안이 전부**이고, 루트의 다른 파일은 건드리지 않는다.
- 작업 브랜치: `claude/roadside-story-game-dev-e7xzp8`.

## 폴더 구조

```
roadside-story/
  project.godot, export_presets.cfg, CLAUDE.md, README.md
  data/            콘텐츠·밸런스 JSON (시설, 상품, 손님, 궁합, 특전, 지역, 직원, 이벤트, 진행, balance)
  scenes/main/     main.tscn (진입점 하나. 나머지 화면은 코드로 조립)
  scripts/
    core/          app(autoload: 화면 전환·설정), main(진입·개발 인자), game(플레이 화면 컨트롤러),
                   data_db(autoload Data), loc(autoload Loc), fmt, iso
    simulation/    sim(전체 묶음·틱·저장), world_grid(타일·A*), facility(시설 상태)
    construction/  배치 검사·건설·이동·철거·업그레이드·부지 + 시설 파생 수치 계산
    customers/     customer, vehicle, customer_system(도착·선택·이동·대기·구매)
    economy/ staff/ research/(product_system) synergy/ perks/ progression/ events/
    save/          save_system(autoload Save: 프로필 + 슬롯)
    audio/         audio_manager(autoload Audio)
    world/         world_view(그리기), ground_view(바닥 타일)
    ui/            ui_kit(테마·위젯), hud, game_panel(창 기반), panel_*.gd, modals, codex_view, settings_view, main_menu
    dev/           panel_dev(F1 개발자 도구)
  assets/          sprites(tiles, buildings, characters, vehicles, effects, ui), audio, fonts
  tests/           test_runner (자동 테스트)
  tools/           gen_art.py, gen_audio.py, ai_player.gd(봇), sim_runner(밸런스), demo_script.gd(화면 캡처), fix_infer.py
  docs/
```

## 핵심 구조

- `Sim`(RefCounted)이 휴게소 한 곳의 모든 상태를 가진다. `step(0.1)`로 진행하고, 바뀐 일은 `event(kind, data)` 시그널로 알린다. 화면(`WorldView`, `Hud`)과 프로필 연동(`App._hook_profile`)은 이 시그널만 듣는다.
- 파생 수치는 지연 재계산: 배치·레벨·직원·특전이 바뀌면 `sim.mark_dirty()` → 다음 틱에 `recalc()` (궁합 → 특전 → 시설별 수치 → 유입 보정 → 손님 유형 가중치).
- `sim.mods`: 궁합·특전·이벤트가 합쳐지는 전역 보정(`traffic`, `attract{유형}`, `visits`, `fuel`, `night`).
- 특전은 `data/perks.json`에 수치(`p`)만 두고, 무엇을 바꾸는지는 `perk_system.gd`의 훅(appeal_bonus, speed_bonus, on_use, rep_mult …)으로 구현한다.
- 저장: `Sim.to_dict()` → JSON. 손님·차량·난수 상태까지 저장한다. `Save`가 임시 파일에 쓰고 검증한 뒤 교체, 직전 파일은 `.bak`.

## 중요한 기술적 결정

| 결정 | 이유 |
|---|---|
| 화면 배율을 직접 정수로 계산 (`App.apply_scale`, stretch mode disabled) | 창 크기가 어중간해도 픽셀이 뭉개지지 않게. 1080p=2배, 720p=1배 |
| 주차장·주유소는 도로 옆 맨 앞줄에만 | 차량용 길 찾기 없이도 차가 자연스럽게 드나든다 |
| 손님은 어디든 걷고 보행로는 가속·우선 | 초보가 길을 안 깔아도 게임이 멈추지 않는다 |
| 평평한 시설은 별도 레이어(`flats`) | 손님이 그 위를 걸어도 깊이 정렬이 단순하다 |
| 건물 회전 = 좌우 반전 2방향 | 스프라이트 한 장으로 해결. 대신 건물에 글자를 못 넣는다 |
| 궁합·상품 명성의 유입 효과에 상한 | 무한 누적·수익 폭주 방지 |
| UI를 코드로 조립 | 에디터 없이 개발·검증 가능. 대신 씬 파일이 거의 없다 |

## 다음 작업

`ROADMAP.md`의 "다음에 할 일" 순서대로. 요약: ①사람 플레이 테스트 반영 ②후반 목표 보강 ③소리 확인 ④아트 2차.

## 작업할 때 자주 걸리는 것

- 타입 없는 값에 `:=` → 파싱 오류. `python3 tools/fix_infer.py`.
- 새 `class_name` 추가 후 headless에서 못 찾음 → `godot --headless --path . --import` 먼저.
- JSON을 거치면 정수가 실수가 된다 → `load_dict`에서 `int()`로 되돌린다(uid, 레벨 등).
- `sim.recalc()` 안에서 시설 수치를 읽는 특전은 순서에 주의(`perks.post_recalc`는 시설 별 수 계산 뒤에 돈다).
- 화면 캡처 검증: `xvfb-run godot --path . --rendering-driver opengl3 --audio-driver Dummy --resolution 1920x1080 -- --newgame --script=res://tools/demo_script.gd --days=40 --shot=out.png`
