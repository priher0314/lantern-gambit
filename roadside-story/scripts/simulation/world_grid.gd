class_name WorldGrid
extends RefCounted
## 타일 맵: 땅 소유 여부, 시설 점유, 보행로, 경로 탐색.

const OUTSIDE := 0   # 풍경 (지을 수 없음)
const OWNED := 1     # 내 부지
const PLOT := 2      # 살 수 있는 땅
const ROAD := 3
const WATER := 4

var w: int = 0
var h: int = 0
var land: PackedByteArray = PackedByteArray()
var occ: PackedInt32Array = PackedInt32Array()
var path: PackedByteArray = PackedByteArray()
var plot_of: PackedInt32Array = PackedInt32Array()  # 타일이 속한 확장 부지 번호 (-1 없음)
var owned_plots: Array = []
var astar: AStarGrid2D = AStarGrid2D.new()
var walk_cb: Callable    # func(uid) -> bool : 그 시설 위를 걸을 수 있는가

func setup(region: Dictionary) -> void:
	w = int(region["size"][0])
	h = int(region["size"][1])
	land.resize(w * h)
	occ.resize(w * h)
	path.resize(w * h)
	plot_of.resize(w * h)
	land.fill(OUTSIDE)
	occ.fill(0)
	path.fill(0)
	plot_of.fill(-1)
	for yy in [h - 2, h - 1]:
		for xx in w:
			land[idx(xx, yy)] = ROAD
	if region.get("scenery", "") == "sea":
		for yy in 3:
			for xx in w:
				land[idx(xx, yy)] = WATER
	_fill(region["start"], OWNED, -1)
	var plots: Array = region["plots"]
	for i in plots.size():
		_fill(plots[i]["rect"], PLOT, i)
	astar.region = Rect2i(0, 0, w, h)
	astar.cell_size = Vector2(1, 1)
	astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_NEVER
	astar.default_compute_heuristic = AStarGrid2D.HEURISTIC_MANHATTAN
	astar.default_estimate_heuristic = AStarGrid2D.HEURISTIC_MANHATTAN
	astar.update()
	refresh_all()

func _fill(r: Array, v: int, plot: int) -> void:
	for yy in range(int(r[1]), int(r[1]) + int(r[3])):
		for xx in range(int(r[0]), int(r[0]) + int(r[2])):
			if inb(xx, yy):
				land[idx(xx, yy)] = v
				plot_of[idx(xx, yy)] = plot

func own_plot(i: int, region: Dictionary) -> void:
	if owned_plots.has(i):
		return
	owned_plots.append(i)
	var r: Array = region["plots"][i]["rect"]
	_fill(r, OWNED, i)
	refresh_rect(Rect2i(int(r[0]), int(r[1]), int(r[2]), int(r[3])))

func idx(x: int, y: int) -> int:
	return y * w + x

func inb(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < w and y < h

func land_at(x: int, y: int) -> int:
	if not inb(x, y):
		return OUTSIDE
	return land[idx(x, y)]

func occ_at(x: int, y: int) -> int:
	if not inb(x, y):
		return 0
	return occ[idx(x, y)]

func has_path(x: int, y: int) -> bool:
	return inb(x, y) and path[idx(x, y)] == 1

## 도로와 맞닿는 부지의 맨 아랫줄 y
func front_row() -> int:
	return h - 3

func lane_y() -> float:
	return float(h - 2) + 0.5

func is_walkable(x: int, y: int) -> bool:
	if not inb(x, y):
		return false
	var i := idx(x, y)
	if land[i] != OWNED:
		return false
	var u := occ[i]
	if u == 0:
		return true
	return walk_cb.is_valid() and walk_cb.call(u)

func refresh_all() -> void:
	refresh_rect(Rect2i(0, 0, w, h))

## 바뀐 범위의 경로 정보만 갱신한다.
func refresh_rect(r: Rect2i) -> void:
	for yy in range(maxi(r.position.y, 0), mini(r.end.y, h)):
		for xx in range(maxi(r.position.x, 0), mini(r.end.x, w)):
			var cell := Vector2i(xx, yy)
			var ok := is_walkable(xx, yy)
			astar.set_point_solid(cell, not ok)
			if ok:
				var wt := 2.2
				if path[idx(xx, yy)] == 1:
					wt = 1.0
				elif occ[idx(xx, yy)] != 0:
					wt = 2.8
				astar.set_point_weight_scale(cell, wt)

func set_occ(r: Rect2i, uid: int) -> void:
	for yy in range(r.position.y, r.end.y):
		for xx in range(r.position.x, r.end.x):
			if inb(xx, yy):
				occ[idx(xx, yy)] = uid
				if uid != 0:
					path[idx(xx, yy)] = 0
	refresh_rect(r)

func set_path(x: int, y: int, on: bool) -> void:
	path[idx(x, y)] = 1 if on else 0
	refresh_rect(Rect2i(x, y, 1, 1))

func find_path(from: Vector2i, to: Vector2i) -> Array:
	if not inb(from.x, from.y) or not inb(to.x, to.y):
		return []
	if astar.is_point_solid(from) or astar.is_point_solid(to):
		return []
	return astar.get_id_path(from, to)

## 걸을 수 없는 칸에 선 손님을 가장 가까운 걸을 수 있는 칸으로 옮길 때 쓴다.
func nearest_walkable(from: Vector2i, max_r: int = 6) -> Vector2i:
	if is_walkable(from.x, from.y):
		return from
	for r in range(1, max_r + 1):
		for dy in range(-r, r + 1):
			for dx in range(-r, r + 1):
				if absi(dx) != r and absi(dy) != r:
					continue
				if is_walkable(from.x + dx, from.y + dy):
					return Vector2i(from.x + dx, from.y + dy)
	return Vector2i(-1, -1)

func to_dict() -> Dictionary:
	var paths: Array = []
	for i in path.size():
		if path[i] == 1:
			paths.append(i)
	return {"owned_plots": owned_plots.duplicate(), "paths": paths}

func load_dict(d: Dictionary, region: Dictionary) -> void:
	for p in d.get("owned_plots", []):
		own_plot(int(p), region)
	for i in d.get("paths", []):
		path[int(i)] = 1
	refresh_all()
