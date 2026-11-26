class_name GroundView
extends Node2D
## 바닥 타일. 바뀔 때만 다시 그린다.

var sim: Sim
var margin := 14
var _tex: Dictionary = {}
var water_frame := 0

func setup(s: Sim) -> void:
	sim = s
	for n in ["grass_0", "grass_1", "grass_2", "wild_0", "wild_1", "wild_2", "plot_0", "path_0", "road_0", "road_near", "road_far", "water_0", "water_1", "sand_0", "field_0"]:
		_tex[n] = load("res://assets/sprites/tiles/%s.png" % n)
	queue_redraw()

static func hash2(x: int, y: int) -> int:
	var h := (x * 73856093) ^ (y * 19349663)
	h = (h ^ (h >> 13)) * 1274126177
	return absi(h ^ (h >> 16))

func tile_name(x: int, y: int) -> String:
	var g := sim.grid
	var sea: bool = sim.region.get("scenery", "") == "sea"
	if y >= g.h - 2 and y <= g.h - 1:
		return "road_near" if y == g.h - 2 else "road_far"
	if y > g.h - 1:
		return "wild_%d" % (hash2(x, y) % 3)
	if sea and y < 3:
		return "water_%d" % ((hash2(x, y) + water_frame) % 2)
	if sea and y < 4 and not g.inb(x, y):
		return "sand_0"
	if not g.inb(x, y):
		if not sea and hash2(int(floor(x / 4.0)), int(floor(y / 3.0))) % 5 == 0:
			return "field_0"
		return "wild_%d" % (hash2(x, y) % 3)
	var l := g.land_at(x, y)
	match l:
		WorldGrid.OWNED:
			if g.has_path(x, y):
				return "path_0"
			return "grass_%d" % (hash2(x, y) % 3)
		WorldGrid.PLOT:
			return "plot_0"
		WorldGrid.WATER:
			return "water_%d" % ((hash2(x, y) + water_frame) % 2)
	if sea and y == 3:
		return "sand_0"
	if not sea and hash2(int(floor(x / 4.0)), int(floor(y / 3.0))) % 5 == 0:
		return "field_0"
	return "wild_%d" % (hash2(x, y) % 3)

func _draw() -> void:
	if sim == null:
		return
	var g := sim.grid
	for y in range(-margin, g.h + margin):
		for x in range(-margin, g.w + margin):
			var p := Iso.to_screen(Vector2(x, y))
			draw_texture(_tex[tile_name(x, y)], Vector2(p.x - 32, p.y))
	# 내 부지 테두리
	var col := Color("4d7f4a")
	for y in g.h:
		for x in g.w:
			if g.land_at(x, y) != WorldGrid.OWNED:
				continue
			if g.land_at(x, y - 1) != WorldGrid.OWNED:
				draw_line(Iso.to_screen(Vector2(x, y)), Iso.to_screen(Vector2(x + 1, y)), col, 1.0)
			if g.land_at(x - 1, y) != WorldGrid.OWNED:
				draw_line(Iso.to_screen(Vector2(x, y)), Iso.to_screen(Vector2(x, y + 1)), col, 1.0)
			if g.land_at(x + 1, y) != WorldGrid.OWNED:
				draw_line(Iso.to_screen(Vector2(x + 1, y)), Iso.to_screen(Vector2(x + 1, y + 1)), col, 1.0)
