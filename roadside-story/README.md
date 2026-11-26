# Roadside Story (가칭)

작은 도로변 매점과 주차장에서 시작해 나만의 고속도로 휴게소를 키우는 경영 게임입니다.
Godot 4.4 / GDScript · 싱글 플레이 · 오프라인 · 한국어.

현재 버전 0.1.0은 **수직 슬라이스(초기 플레이 검증판)** 입니다. 무엇이 되고 안 되는지는 `docs/ROADMAP.md`, `docs/KNOWN_ISSUES.md`를 보세요.

## 실행 방법

1. [Godot 4.4.1 stable](https://godotengine.org/download/archive/4.4.1-stable/) (표준 버전, .NET 아님)을 내려받습니다. 설치 없이 압축만 풀면 됩니다.
2. Godot를 실행해 **가져오기(Import)** → 이 폴더의 `project.godot`을 선택합니다.
3. 처음 열 때 에셋을 가져오느라 잠깐 기다린 뒤, **F5**(또는 오른쪽 위 ▶)를 누르면 게임이 시작됩니다.

명령줄: `godot --path .`

## 조작

| 동작 | 조작 |
|---|---|
| 화면 이동 | 마우스 왼쪽/오른쪽 드래그, WASD, 방향키 |
| 확대·축소 | 마우스 휠 (1~3배) |
| 시설 선택 | 왼쪽 클릭 |
| 건설 메뉴 | 하단 [건설] 또는 B |
| 시설 돌리기 | 배치 중 R |
| 배치 취소 | 오른쪽 클릭 또는 ESC |
| 보행로 | 드래그로 깔기, 보행로 위 오른쪽 클릭으로 지우기 |
| 일시정지 / 배속 | 스페이스 / 1·2·3 |
| 저장 | F5 (1분마다, 그리고 끌 때 자동 저장) |
| 메뉴 | ESC 또는 오른쪽 위 ≡ |

저장 파일 위치(Windows): `%APPDATA%\RoadsideStory\` — `profile.json`(도감·명성·설정), `slot_N.json`(휴게소별).

## 개발자 모드

에디터에서 실행하거나 디버그 빌드일 때만 켜집니다(출시 빌드에서는 꺼짐). 게임 중 **F1**: 자금 추가, 등급 올리기, 빨리감기, 이벤트 발생, 특전 지급 등.

개발용 실행 인자(`godot --path . -- <인자>`):

- `--newgame[=지역]` 메뉴를 건너뛰고 새 게임, `--load=슬롯번호`
- `--ff=게임초` 빨리감기, `--shot=파일.png` 화면 저장 후 종료, `--open=build|research|staff|codex|…`
- `--script=res://tools/demo_script.gd --days=40 --strategy=balanced` 봇으로 자동 경영

## 테스트

```
godot --headless --path . --import
godot --headless --path . res://tests/test_runner.tscn
godot --headless --path . res://tools/sim_runner.tscn -- --strategy=all --years=8 --verbose
```

- `tests/test_runner.gd`: 건설·경제·연구·직원·궁합·특전·저장 등 자동 테스트
- `tools/sim_runner.gd`: 화면 없이 봇 6종(음식/관광/실속/프리미엄/가족/균형)이 경영한 결과 비교

## 빌드 (Windows)

Godot 에디터에서 **프로젝트 → 내보내기 → Windows Desktop** (내보내기 템플릿 4.4.1 필요), 또는:

```
godot --headless --path . --export-release "Windows Desktop" build/windows/RoadsideStory.exe
```

## 에셋 다시 만들기

```
python3 tools/gen_art.py     # 스프라이트 (Pillow 필요)
python3 tools/gen_audio.py   # 효과음·배경음악·환경음 (numpy, ffmpeg 필요)
```

## 문서

`CLAUDE.md`(개발 원칙) · `docs/GAME_DESIGN.md` · `docs/ROADMAP.md` · `docs/BALANCE.md` · `docs/ART_GUIDE.md` · `docs/ASSET_MANIFEST.md` · `docs/TEST_REPORT.md` · `docs/KNOWN_ISSUES.md` · `docs/CHANGELOG.md` · `docs/PROJECT_HANDOFF.md`

## 라이선스 메모

- 글꼴: Galmuri (© Lee Minseo, SIL Open Font License 1.1) — `assets/fonts/OFL-Galmuri.txt`. 상업적 이용 가능.
- 스프라이트·소리: 이 저장소의 생성 스크립트로 직접 만든 원본. 외부 에셋 없음.
- 엔진: Godot Engine (MIT).
