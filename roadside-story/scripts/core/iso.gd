class_name Iso
## 아이소메트릭 좌표 변환. 타일 64x32.
## 격자 (x, y) 타일의 마름모 윗꼭짓점은 화면 ((x-y)*32, (x+y)*16), 중심은 거기서 +16 아래.

const TW := 64.0
const TH := 32.0

## 격자 좌표(실수, 타일 모서리 기준) -> 화면 좌표
static func to_screen(g: Vector2) -> Vector2:
	return Vector2((g.x - g.y) * 32.0, (g.x + g.y) * 16.0)

## 타일 중심의 화면 좌표
static func tile_center(x: float, y: float) -> Vector2:
	return to_screen(Vector2(x + 0.5, y + 0.5))

static func to_grid(s: Vector2) -> Vector2:
	var a := s.x / 32.0
	var b := s.y / 16.0
	return Vector2((a + b) * 0.5, (b - a) * 0.5)

static func to_tile(s: Vector2) -> Vector2i:
	var g := to_grid(s)
	return Vector2i(floori(g.x), floori(g.y))
