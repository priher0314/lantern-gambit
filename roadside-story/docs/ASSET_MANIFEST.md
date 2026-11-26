# ASSET_MANIFEST

모든 에셋은 이 저장소의 스크립트로 만든 원본이거나, 라이선스를 확인한 글꼴이다. **외부에서 가져온 그림·소리는 없다.**
상태 표기: `1차` = 코드로 생성한 자체 제작본(동작·스타일 일관, 손그림 완성본은 아님) · `교체 권장` = 출시 전 손그림/전문 제작으로 바꾸면 좋은 것.

## 글꼴

| 파일 | 용도 | 라이선스 |
|---|---|---|
| assets/fonts/Galmuri11.ttf | 본문 | SIL OFL 1.1 (© Lee Minseo) — 상업적 이용·재배포 가능, 글꼴 단독 판매 불가 |
| assets/fonts/Galmuri11-Bold.ttf | 강조·제목 | 〃 |
| assets/fonts/Galmuri9.ttf | 작은 글씨 | 〃 |
| assets/fonts/Galmuri14.ttf | 큰 제목 | 〃 |
| assets/fonts/OFL-Galmuri.txt | 라이선스 전문 | — |

출처: npm 패키지 `galmuri` 2.40.3 (github.com/quiple/galmuri).

## 스프라이트 (tools/gen_art.py 로 생성, 총 302개)

| 폴더 | 개수 | 내용 | 상태 |
|---|---|---|---|
| assets/sprites/tiles | 20 | 잔디 3, 풀밭 3, 확장 부지, 보행로, 도로 3, 물 2, 모래, 논밭, 커서 5 | 1차 |
| assets/sprites/buildings | 73 | 시설 26종 × 최대 3단계, 풍경 나무 3종, meta.json(기준점) | 1차 · 주요 건물 교체 권장 |
| assets/sprites/characters | 66 | 손님 14유형 × 4변형, 아이 4, 직원 6 (각 64×40 시트) | 1차 · 교체 권장 |
| assets/sprites/vehicles | 84 | 7종 × 6색 × 앞/뒤 | 1차 |
| assets/sprites/effects | 10 | 그림자 2, 불빛, 말풍선 3, 반짝이, 연기, 경고, 화살표 | 1차 |
| assets/sprites/ui | 49 | 메뉴 아이콘 22, 분야 아이콘 8, 간판 아이콘 19 | 1차 |

### 시설별 파일 (assets/sprites/buildings/)

| 시설 | 발자국 | 파일 |
|---|---|---|
| 주차장 (`parking`) | 2×2 | parking_0.png, parking_1.png, parking_2.png |
| 간이 매점 (`kiosk`) | 1×1 | kiosk_0.png, kiosk_1.png, kiosk_2.png |
| 자판기 (`vending`) | 1×1 | vending_0.png, vending_1.png, vending_2.png |
| 화장실 (`restroom`) | 2×1 | restroom_0.png, restroom_1.png, restroom_2.png |
| 벤치 (`bench`) | 1×1 | bench_0.png, bench_1.png, bench_2.png |
| 분식점 (`snack`) | 2×2 | snack_0.png, snack_1.png, snack_2.png |
| 호두과자점 (`walnut`) | 2×1 | walnut_0.png, walnut_1.png, walnut_2.png |
| 우동집 (`udon`) | 2×2 | udon_0.png, udon_1.png, udon_2.png |
| 베이커리 (`bakery`) | 2×2 | bakery_0.png, bakery_1.png, bakery_2.png |
| 편의점 (`convenience`) | 2×2 | convenience_0.png, convenience_1.png, convenience_2.png |
| 기념품점 (`souvenir`) | 2×2 | souvenir_0.png, souvenir_1.png, souvenir_2.png |
| 특산물 가게 (`specialty`) | 2×2 | specialty_0.png, specialty_1.png, specialty_2.png |
| 정원 (`garden`) | 2×2 | garden_0.png, garden_1.png, garden_2.png |
| 전망대 (`observatory`) | 2×2 | observatory_0.png, observatory_1.png, observatory_2.png |
| 포토존 (`photozone`) | 1×1 | photozone_0.png, photozone_1.png, photozone_2.png |
| 주유소 (`gas`) | 3×2 | gas_0.png, gas_1.png, gas_2.png |
| 전기차 충전소 (`ev`) | 2×2 | ev_0.png, ev_1.png, ev_2.png |
| 카페 (`cafe`) | 2×2 | cafe_0.png, cafe_1.png, cafe_2.png |
| 사우나 (`sauna`) | 2×2 | sauna_0.png, sauna_1.png, sauna_2.png |
| 소형 호텔 (`hotel`) | 3×2 | hotel_0.png, hotel_1.png, hotel_2.png |
| 놀이터 (`playground`) | 2×2 | playground_0.png, playground_1.png, playground_2.png |
| 아이스크림점 (`icecream`) | 1×1 | icecream_0.png, icecream_1.png, icecream_2.png |
| 나무 (`tree`) | 1×1 | tree_0.png |
| 꽃밭 (`flowerbed`) | 1×1 | flowerbed_0.png |
| 가로등 (`lamp`) | 1×1 | lamp_0.png |
| 분수 (`fountain`) | 2×2 | fountain_0.png |

## 소리 (tools/gen_audio.py 로 합성, 외부 샘플 없음)

| 폴더 | 파일 | 상태 |
|---|---|---|
| assets/audio/sfx (wav 22.05kHz) | click, error, build, demolish, path, upgrade, sale, money, research_done, discovery, staff_up, rank_up, perk, codex, car, toast, goal, jingle | 1차 · **사람이 들어 보고 확인 필요** |
| assets/audio/bgm (ogg) | day(G장조 93bpm), evening(F장조 78bpm), night(C장조 3/4) — 각 약 1분 루프 | 1차 · 교체 권장 |
| assets/audio/amb (ogg) | birds, night, road | 1차 |

소리는 수치(클리핑 없음, 루프 이음매, 음량)로만 검증했다. 실제로 듣기 좋은지는 아직 아무도 확인하지 못했다.

## 아직 없는 에셋 (필요 목록)

| 에셋 | 규격 | 비고 |
|---|---|---|
| 상품·재료 아이콘 (53종) | 16×16 PNG, 투명 배경 | 지금은 이름 글자로만 표시 |
| 손님 추가 동작 (먹기, 기뻐하기, 생각하기) | 16×20 프레임 추가 | 시트 열을 늘리면 됨 |
| 직원 근무 모습 | 16×20 | 지금은 가게 안에 있는 것으로 처리 |
| 계절별 나무·바닥 | 타일·나무 변형 | 겨울 눈, 가을 단풍 |
| 건물 애니메이션 프레임 | 건물과 같은 캔버스 | 자동문, 간판 점등, 분수 |
| 스토어용 캡슐 이미지·로고 | Steam 규격 | 게임명 확정 후 |

## 외부 도구로 교체 제작할 때 (선택)

Claude Code는 Nano Banana, PixelSnapper, ElevenLabs 같은 외부 서비스에 접근할 수 없다. 사용자가 직접 쓸 경우 아래 명세를 그대로 쓰면 된다.

**건물 프롬프트 틀** (예: 분식점 2단계 → `assets/sprites/buildings/snack_1.png`, 128×~92, 투명 배경)

> isometric pixel art building, 2:1 dimetric projection, small Korean roadside snack bar with red gable roof and red-white striped awning, cream walls, wooden door on the front-left wall, potted plants by the entrance, warm cozy colors, light from top-left, dark purple-brown 1px outline, no text or letters on signs, limited palette, transparent background, footprint 2x2 tiles of 64x32 px

- 생성 후 PixelSnapper 등으로 픽셀 격자에 맞추고, 발자국 마름모의 맨 위 꼭짓점이 `meta.json`의 (ox, oy)에 오도록 배치한다.
- 좌우 반전해 쓰이므로 글자·비대칭 로고를 넣지 않는다.

**효과음 프롬프트 틀** (ElevenLabs 등): "soft cute chiptune UI sound, {용도}, under 0.5 seconds, no reverb tail, gentle" → wav 22.05kHz mono로 `assets/audio/sfx/{이름}.wav`.
