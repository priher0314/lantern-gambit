# SPIN TILL DAWN

슬롯 + 레인 전술 + 능동적 막기/회피/되치기 로그라이트. 브라우저용, 빌드 도구 없음.

**플레이: https://priher0314.github.io/lantern-gambit/** (휴대폰 브라우저에서 바로 실행)

## 실행
```
node tools/serve.mjs 5173
```
브라우저에서 http://localhost:5173 열기. (ES 모듈이라 파일을 더블클릭해 여는 방식은 동작하지 않음)

개발용: `http://localhost:5173/?stage=2` → 보스 전투부터 시작.

## 테스트
```
node --test tests/          # 규칙 테스트
node tools/balance.mjs      # 실력별 봇 승률(밸런스 지표)
```

## 문서
- `docs/DESIGN.md` — 핵심 재미, 아트 디렉션 3안, 기술 구조
- `docs/CHECKLIST.md` — 요구사항 구현/검증 상태

## 배포
GitHub Pages(main 브랜치 루트)로 배포 중. `git push`하면 1~2분 뒤 위 주소에 자동 반영된다.
