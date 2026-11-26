class_name WorldView
extends Node2D
## 시뮬레이션 상태를 화면에 그린다. 게임 규칙은 여기 없다.

const SMOKE := {"snack": Vector3(0.41, 0.46, 50), "udon": Vector3(0.41, 0.46, 52), "bakery": Vector3(0.41, 0.46, 50), "sauna": Vector3(0.41, 0.46, 54)}
const NIGHT_TINT := Color(0.52, 0.56, 0.84)
## 계절마다 바닥 색을 살짝 바꾼다 (봄 기본, 여름 짙은 초록, 가을 누런빛, 겨울 희끄무레)
const SEASON_TINT := {"spring": Color(1, 1, 1), "summer": Color(0.95, 1.02, 0.93), "fall": Color(1.08, 0.98, 0.84), "winter": Color(0.97, 1.0, 1.08)}

var sim: Sim
var ground: GroundView
var flats: Node2D
var objects: Node2D
var lights: Node2D
var overlay: Node2D
var fx: Node2D
var meta: Dictionary = {}
var fac_nodes: Dictionary = {}
var fac_extra: Dictionary = {}
var cust_nodes: Dictionary = {}
var veh_nodes: Dictionary = {}
var plot_signs: Dictionary = {}
var decor_cars: Array = []
var _decor_acc := [0.0, 0.0]
var _sale_acc: Dictionary = {}
var _sale_timer := 0.0
var _anim_t := 0.0
var _water_t := 0.0
var _add_mat: CanvasItemMaterial
var _tex: Dictionary = {}

# 배치 미리보기 / 선택 상태
var ghost: Sprite2D
var ghost_info: Dictionary = {}
var selected_uid := 0
var hover_plot := -1
var _season := Color(1, 1, 1)

func setup(s: Sim) -> void:
	sim = s
	y_sort_enabled = false
	var mf := FileAccess.get_file_as_string("res://assets/sprites/buildings/meta.json")
	meta = JSON.parse_string(mf)
	ground = GroundView.new()
	add_child(ground)
	ground.setup(sim)
	flats = Node2D.new()
	flats.y_sort_enabled = true
	add_child(flats)
	overlay = Node2D.new()
	overlay.draw.connect(_draw_overlay)
	add_child(overlay)
	objects = Node2D.new()
	objects.y_sort_enabled = true
	add_child(objects)
	lights = Node2D.new()
	add_child(lights)
	fx = Node2D.new()
	add_child(fx)
	_add_mat = CanvasItemMaterial.new()
	_add_mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	ghost = Sprite2D.new()
	ghost.centered = false
	ghost.visible = false
	fx.add_child(ghost)
	_make_scenery()
	for f in sim.facilities.values():
		_add_fac(f, false)
	for c in sim.cust.customers.values():
		_add_cust(c)
	for v in sim.cust.vehicles.values():
		_add_veh(v)
	_refresh_plot_signs()
	sim.event.connect(_on_event)

func t(path: String) -> Texture2D:
	if not _tex.has(path):
		_tex[path] = load(path) if ResourceLoader.exists(path) else null
	return _tex[path]

# ---------------------------------------------------------------- 풍경

func _make_scenery() -> void:
	var g := sim.grid
	var sea: bool = sim.region.get("scenery", "") == "sea"
	for y in range(-12, g.h + 12):
		for x in range(-12, g.w + 12):
			if y >= g.h - 2 and y <= g.h - 1:
				continue
			if g.inb(x, y) and g.land_at(x, y) != WorldGrid.OUTSIDE:
				continue
			if sea and y < 4:
				continue
			var h := GroundView.hash2(x * 3 + 1, y * 5 + 2)
			if h % 100 < (9 if sea else 15) and ground.tile_name(x, y) != "field_0":
				var sp := Sprite2D.new()
				var variant: int = [0, 1, 2, 3][(h / 100) % 4] if not sea else [0, 2, 2, 1][(h / 100) % 4]
				var nm := "tree_0" if variant == 0 else "tree_v%d" % variant
				sp.texture = t("res://assets/sprites/buildings/%s.png" % nm)
				sp.centered = false
				_place_sprite(sp, nm, x, y, 1, 1, false)
				objects.add_child(sp)

func _place_sprite(sp: Sprite2D, key: String, x: int, y: int, w: int, h: int, flip: bool) -> void:
	var m: Dictionary = meta.get(key, {"ox": 32, "oy": 0, "w": 64, "h": 32})
	var pos := Iso.to_screen(Vector2(x + w * 0.5, y + h * 0.5))
	var origin := Iso.to_screen(Vector2(x, y))
	sp.position = pos
	sp.flip_h = flip
	var ox: float = float(m["w"]) - float(m["ox"]) if flip else float(m["ox"])
	sp.offset = origin - Vector2(ox, float(m["oy"])) - pos

# ---------------------------------------------------------------- 시설

func _fac_key(f: Facility) -> String:
	for tier in range(f.tier(), -1, -1):
		var k := "%s_%d" % [f.id, tier]
		if meta.has(k):
			return k
	return f.id + "_0"

func _add_fac(f: Facility, animate: bool) -> void:
	var sp := Sprite2D.new()
	sp.centered = false
	var parent: Node2D = flats if f.is_walkable() else objects
	parent.add_child(sp)
	fac_nodes[f.uid] = sp
	fac_extra[f.uid] = []
	_update_fac(f)
	if animate:
		_bounce(sp)
		_sparkles(f.center(), 6)

func _update_fac(f: Facility) -> void:
	var sp: Sprite2D = fac_nodes.get(f.uid)
	if sp == null:
		return
	var key := _fac_key(f)
	sp.texture = t("res://assets/sprites/buildings/%s.png" % key)
	_place_sprite(sp, key, f.x, f.y, f.w(), f.h(), f.rot == 1)
	for n in fac_extra[f.uid]:
		n.queue_free()
	fac_extra[f.uid] = []
	var d: Dictionary = f.def()
	# 굴뚝 연기
	if SMOKE.has(f.id):
		var s3: Vector3 = SMOKE[f.id]
		var gx := s3.x
		var gy := s3.y
		if f.rot == 1:
			gx = s3.y
			gy = s3.x
		var p := CPUParticles2D.new()
		p.texture = t("res://assets/sprites/effects/puff.png")
		p.amount = 5
		p.lifetime = 2.4
		p.direction = Vector2(0.3, -1)
		p.spread = 12.0
		p.gravity = Vector2.ZERO
		p.initial_velocity_min = 7.0
		p.initial_velocity_max = 10.0
		p.scale_amount_min = 0.5
		p.scale_amount_max = 1.0
		var grad := Gradient.new()
		grad.set_color(0, Color(1, 1, 1, 0.8))
		grad.set_color(1, Color(1, 1, 1, 0.0))
		p.color_ramp = grad
		p.position = Iso.to_screen(Vector2(f.x + gx, f.y + gy)) - Vector2(0, s3.z + f.tier() * 5)
		p.z_index = 1
		fx.add_child(p)
		fac_extra[f.uid].append(p)
	# 밤 불빛
	var k: String = d["kind"]
	if f.id == "lamp" or k == "shop" or k == "fuel":
		var gl := Sprite2D.new()
		gl.texture = t("res://assets/sprites/effects/glow.png")
		gl.material = _add_mat
		var c := Iso.to_screen(f.center())
		if f.id == "lamp":
			gl.position = c - Vector2(0, 30)
			gl.scale = Vector2(1.2, 1.2)
		else:
			var e := Iso.to_screen(f.center() + f.front_dir() * (0.5 * (f.h() if f.rot == 0 else f.w())))
			gl.position = e - Vector2(0, 10)
			gl.scale = Vector2(1.0 + 0.25 * f.w(), 1.0 + 0.2 * f.h())
		lights.add_child(gl)
		fac_extra[f.uid].append(gl)

func _remove_fac(uid: int) -> void:
	if fac_nodes.has(uid):
		fac_nodes[uid].queue_free()
		fac_nodes.erase(uid)
	for n in fac_extra.get(uid, []):
		n.queue_free()
	fac_extra.erase(uid)
	if selected_uid == uid:
		selected_uid = 0

func _bounce(sp: Sprite2D) -> void:
	sp.scale = Vector2(1.0, 0.82)
	var tw := create_tween()
	tw.tween_property(sp, "scale", Vector2(1.0, 1.08), 0.12)
	tw.tween_property(sp, "scale", Vector2(1.0, 1.0), 0.1)

func _sparkles(gpos: Vector2, n: int) -> void:
	var c := Iso.to_screen(gpos)
	for i in n:
		var sp := Sprite2D.new()
		sp.texture = t("res://assets/sprites/effects/sparkle.png")
		sp.hframes = 4
		sp.frame = 0
		sp.position = c + Vector2(randf_range(-34, 34), randf_range(-46, 6))
		sp.z_index = 5
		fx.add_child(sp)
		var tw := create_tween()
		tw.tween_interval(randf_range(0.0, 0.3))
		for fr in [1, 2, 3, 0]:
			tw.tween_callback(sp.set.bind("frame", fr))
			tw.tween_interval(0.09)
		tw.tween_callback(sp.queue_free)

# ---------------------------------------------------------------- 손님 / 차량

func _add_cust(c: Customer) -> void:
	var sp := Sprite2D.new()
	var look: String = c.tdef().get("look", "casual")
	var path := "res://assets/sprites/characters/%s_%d.png" % [look, c.look % 4]
	if c.kid:
		path = "res://assets/sprites/characters/kid_%d.png" % (c.look % 4)
	sp.texture = t(path)
	sp.hframes = 4
	sp.vframes = 2
	sp.offset = Vector2(0, -8)
	sp.position = Iso.to_screen(c.pos)
	var sh := Sprite2D.new()
	sh.texture = t("res://assets/sprites/effects/shadow.png")
	sh.show_behind_parent = true
	sh.position = Vector2(0, 1)
	sp.add_child(sh)
	objects.add_child(sp)
	cust_nodes[c.uid] = sp

func _add_veh(v: Vehicle) -> void:
	var sp := Sprite2D.new()
	sp.centered = false
	sp.position = Iso.to_screen(v.pos)
	objects.add_child(sp)
	veh_nodes[v.uid] = sp
	_veh_tex(sp, v.kind, v.color, v.facing)

func _veh_tex(sp: Sprite2D, kind: String, color: int, facing: Vector2) -> void:
	var tag := "b"
	var flip := false
	if facing.x > 0.5:
		tag = "f"
	elif facing.y > 0.5:
		tag = "f"
		flip = true
	elif facing.y < -0.5:
		tag = "b"
		flip = true
	sp.texture = t("res://assets/sprites/vehicles/%s_%d_%s.png" % [kind, color, tag])
	sp.flip_h = flip
	sp.offset = Vector2(-36, -34)

func _cust_target(c: Customer) -> Array:
	# [화면 좌표용 격자 위치, 보임 여부, 프레임 종류(0 일반, 3 앉기)]
	var f: Facility = sim.fac(c.target) if c.target != 0 else null
	var jx := float(c.uid % 7) / 7.0 * 0.3 - 0.15
	var jy := float((c.uid * 3) % 7) / 7.0 * 0.3 - 0.15
	match c.state:
		Customer.QUEUE:
			if f != null:
				var idx: int = mini(f.queue.find(c.uid), 7)
				var e := f.entrance()
				return [Vector2(e.x + 0.5, e.y + 0.5) + f.front_dir() * (0.42 * maxi(idx, 0)) + Vector2(jx, jy) * 0.3, true, 0]
		Customer.USE:
			if f != null:
				if f.is_walkable():
					var wob := Vector2(sin(_anim_t * 0.9 + c.uid) * 0.25, cos(_anim_t * 0.7 + c.uid * 2) * 0.25)
					return [c.pos + wob, true, 0]
				if f.def().get("sit", false):
					return [f.center() + Vector2(jx * 0.8, 0.12), true, 3]
				if f.has_tag("photo"):
					return [c.pos + Vector2(jx, jy), true, 0]
				return [c.pos, false, 0]
	return [c.pos + Vector2(jx, jy), true, 0]

func _process(delta: float) -> void:
	if sim == null:
		return
	_anim_t += delta
	var k := minf(1.0, delta * 14.0)
	for uid in cust_nodes:
		var c: Customer = sim.cust.customers.get(uid)
		if c == null:
			continue
		var sp: Sprite2D = cust_nodes[uid]
		var tg := _cust_target(c)
		var target := Iso.to_screen(tg[0])
		var was_hidden := not sp.visible
		sp.visible = tg[1]
		if was_hidden or sp.position.distance_to(target) > 80.0:
			sp.position = target
		else:
			sp.position = sp.position.lerp(target, k)
		var moving := c.moving
		var fr: int = tg[2]
		if fr == 0 and moving:
			fr = 1 + (int(_anim_t * 7.0 + uid) % 2)
		var back := (c.facing.x + c.facing.y) < -0.01
		sp.frame = fr + (4 if back and fr != 3 else 0)
		sp.flip_h = (c.facing.x - c.facing.y) < 0.0
	for uid in veh_nodes:
		var v: Vehicle = sim.cust.vehicles.get(uid)
		if v == null:
			continue
		var vs: Sprite2D = veh_nodes[uid]
		var target2 := Iso.to_screen(v.pos)
		if vs.position.distance_to(target2) > 120.0:
			vs.position = target2
		else:
			vs.position = vs.position.lerp(target2, k)
		if vs.get_meta("facing", Vector2.ZERO) != v.facing:
			vs.set_meta("facing", v.facing)
			_veh_tex(vs, v.kind, v.color, v.facing)
	# 밤낮
	var nf := sim.night_factor()
	var tint := Color.WHITE.lerp(NIGHT_TINT, nf * 0.8)
	var st: Color = SEASON_TINT[sim.season()]
	_season = _season.lerp(st, minf(1.0, delta * 0.5))
	ground.modulate = tint * _season
	flats.modulate = tint * _season
	objects.modulate = tint
	lights.modulate = Color(1, 1, 1, nf * 0.85)
	lights.visible = nf > 0.02
	# 물결
	_water_t += delta
	if _water_t > 1.2 and sim.region.get("scenery", "") == "sea":
		_water_t = 0.0
		ground.water_frame = (ground.water_frame + 1) % 2
		ground.queue_redraw()
	# 판매 숫자 묶어서 띄우기
	_sale_timer += delta
	if _sale_timer > 0.45:
		_sale_timer = 0.0
		for uid in _sale_acc:
			var f: Facility = sim.fac(uid)
			if f != null:
				float_text(f.center(), "+" + Fmt.comma(int(_sale_acc[uid])), Color("fff1a8"), 26.0 + f.tier() * 6)
		_sale_acc.clear()

## 장식용 지나가는 차 (게임 규칙과 무관). speed: 게임 배속
func tick_decor(delta: float, speed: float) -> void:
	if speed <= 0.0:
		return
	var dt := delta * speed
	var g := sim.grid
	var rate: float = float(sim.region["traffic"]) * sim.cust.hour_factor()
	for lane in 2:
		_decor_acc[lane] += dt * rate * (0.55 if lane == 0 else 0.9)
		if _decor_acc[lane] >= 1.0:
			_decor_acc[lane] = randf_range(-0.6, 0.2)
			var sp := Sprite2D.new()
			sp.centered = false
			var kinds := ["car", "car", "car", "van", "truck", "sedan", "bike"]
			var kind: String = kinds[randi() % kinds.size()]
			var dir := Vector2(-1, 0) if lane == 0 else Vector2(1, 0)
			_veh_tex(sp, kind, randi() % 6, dir)
			var x := g.w + 6.0 if lane == 0 else -6.0
			var y := g.lane_y() + (0.0 if lane == 0 else 1.0)
			objects.add_child(sp)
			sp.position = Iso.to_screen(Vector2(x, y))
			decor_cars.append({"node": sp, "x": x, "y": y, "dir": dir.x})
			if lane == 0 and randf() < 0.3:
				Audio.play("car")
	var sp_car: float = float(Data.balance["car_speed"])
	for i in range(decor_cars.size() - 1, -1, -1):
		var dc: Dictionary = decor_cars[i]
		dc["x"] = float(dc["x"]) + float(dc["dir"]) * sp_car * dt
		(dc["node"] as Sprite2D).position = Iso.to_screen(Vector2(dc["x"], dc["y"]))
		if float(dc["x"]) < -7.0 or float(dc["x"]) > g.w + 7.0:
			(dc["node"] as Sprite2D).queue_free()
			decor_cars.remove_at(i)

# ---------------------------------------------------------------- 떠오르는 글자 / 말풍선

func float_text(gpos: Vector2, text: String, color: Color, rise: float = 26.0) -> void:
	var l := UIKit.label(text, 12, color, true)
	l.add_theme_color_override("font_outline_color", Color("3a3041"))
	l.add_theme_constant_override("outline_size", 4)
	l.z_index = 10
	fx.add_child(l)
	l.position = Iso.to_screen(gpos) - Vector2(l.get_minimum_size().x * 0.5, rise + 18.0)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(l, "position:y", l.position.y - 16.0, 0.9)
	tw.tween_property(l, "modulate:a", 0.0, 0.9).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_CUBIC)
	tw.chain().tween_callback(l.queue_free)

func _emote(pos: Vector2, kind: String) -> void:
	var sp := Sprite2D.new()
	sp.texture = t("res://assets/sprites/effects/emote_%s.png" % kind)
	sp.position = pos - Vector2(0, 26)
	sp.z_index = 8
	fx.add_child(sp)
	var tw := create_tween()
	tw.tween_property(sp, "position:y", sp.position.y - 5.0, 0.25)
	tw.tween_interval(0.9)
	tw.tween_property(sp, "modulate:a", 0.0, 0.3)
	tw.tween_callback(sp.queue_free)

# ---------------------------------------------------------------- 부지 표지

func _refresh_plot_signs() -> void:
	for k in plot_signs:
		plot_signs[k].queue_free()
	plot_signs.clear()
	if sim.challenge.get("mods", {}).get("no_expand", false):
		return
	var plots: Array = sim.region["plots"]
	for i in plots.size():
		if sim.grid.owned_plots.has(i):
			continue
		var r: Array = plots[i]["rect"]
		var l := UIKit.label("확장 %s" % Fmt.won_short(sim.build.plot_cost(i)), 10, Color("fffaf0"))
		l.add_theme_color_override("font_outline_color", Color("3a3041"))
		l.add_theme_constant_override("outline_size", 4)
		fx.add_child(l)
		l.position = Iso.to_screen(Vector2(r[0] + r[2] * 0.5, r[1] + r[3] * 0.5)) - Vector2(l.get_minimum_size().x * 0.5, 8)
		plot_signs[i] = l

# ---------------------------------------------------------------- 이벤트

func _on_event(kind: String, d: Dictionary) -> void:
	match kind:
		"fac_added":
			var f: Facility = sim.fac(d["uid"])
			if f != null:
				_add_fac(f, not d.get("free", false))
			overlay.queue_redraw()
		"fac_removed":
			_remove_fac(d["uid"])
			ground.queue_redraw()
			overlay.queue_redraw()
		"fac_moved":
			var f2: Facility = sim.fac(d["uid"])
			if f2 != null:
				_update_fac(f2)
				_bounce(fac_nodes[f2.uid])
			ground.queue_redraw()
			overlay.queue_redraw()
		"fac_upgraded":
			var f3: Facility = sim.fac(d["uid"])
			if f3 != null:
				_update_fac(f3)
				_bounce(fac_nodes[f3.uid])
				_sparkles(f3.center(), 12 if d.get("tier_up", false) else 5)
				if d.get("tier_up", false):
					float_text(f3.center(), "새 단장!", Color("ffe08a"), 44.0)
		"path_changed":
			ground.queue_redraw()
		"plot_bought":
			ground.queue_redraw()
			_refresh_plot_signs()
			var r: Array = sim.region["plots"][d["plot"]]["rect"]
			_sparkles(Vector2(r[0] + r[2] * 0.5, r[1] + r[3] * 0.5), 16)
		"cust_added":
			var c: Customer = sim.cust.customers.get(d["uid"])
			if c != null:
				_add_cust(c)
		"cust_removed":
			if cust_nodes.has(d["uid"]):
				cust_nodes[d["uid"]].queue_free()
				cust_nodes.erase(d["uid"])
		"veh_added":
			var v: Vehicle = sim.cust.vehicles.get(d["uid"])
			if v != null:
				_add_veh(v)
		"veh_removed":
			if veh_nodes.has(d["uid"]):
				veh_nodes[d["uid"]].queue_free()
				veh_nodes.erase(d["uid"])
		"sale":
			_sale_acc[d["uid"]] = float(_sale_acc.get(d["uid"], 0.0)) + float(d["amount"])
		"emote":
			if cust_nodes.has(d["uid"]):
				_emote(cust_nodes[d["uid"]].position, d["kind"])
		"synergy_found":
			for u in d["members"]:
				var f4: Facility = sim.fac(u)
				if f4 != null:
					_sparkles(f4.center(), 8)
		"staff_level":
			var f5: Facility = sim.fac(int(d.get("fac", 0)))
			if f5 != null:
				float_text(f5.center(), "%s Lv.%d" % [d["name"], d["level"]], Color("b8f0c0"), 40.0)

# ---------------------------------------------------------------- 배치 미리보기 / 선택 표시

func set_ghost(info: Dictionary) -> void:
	ghost_info = info
	if info.is_empty():
		ghost.visible = false
	else:
		var d: Dictionary = Data.facilities[info["id"]]
		if d["kind"] == "path":
			ghost.visible = false
		else:
			var key := "%s_%d" % [info["id"], int(info.get("tier", 0))]
			if not meta.has(key):
				key = info["id"] + "_0"
			ghost.texture = t("res://assets/sprites/buildings/%s.png" % key)
			var s: Array = d["size"]
			var rot: int = info["rot"]
			var fw := int(s[1]) if rot == 1 else int(s[0])
			var fh := int(s[0]) if rot == 1 else int(s[1])
			_place_sprite(ghost, key, info["x"], info["y"], fw, fh, rot == 1)
			ghost.modulate = Color(1, 1, 1, 0.8) if info["ok"] else Color(1.0, 0.55, 0.5, 0.75)
			ghost.visible = true
	overlay.queue_redraw()

func set_selected(uid: int) -> void:
	selected_uid = uid
	overlay.queue_redraw()

func _diamond(x: int, y: int, tex_name: String) -> void:
	var p := Iso.to_screen(Vector2(x, y))
	overlay.draw_texture(t("res://assets/sprites/tiles/%s.png" % tex_name), Vector2(p.x - 32, p.y))

func _draw_overlay() -> void:
	if hover_plot >= 0:
		var r: Array = sim.region["plots"][hover_plot]["rect"]
		for yy in range(int(r[1]), int(r[1]) + int(r[3])):
			for xx in range(int(r[0]), int(r[0]) + int(r[2])):
				_diamond(xx, yy, "cursor_range")
	if selected_uid != 0:
		var f: Facility = sim.fac(selected_uid)
		if f != null:
			for yy in range(f.y, f.y + f.h()):
				for xx in range(f.x, f.x + f.w()):
					_diamond(xx, yy, "cursor_sel")
			if f.needs_entrance():
				var e := f.entrance()
				_diamond(e.x, e.y, "cursor_entry")
	if not ghost_info.is_empty():
		var d: Dictionary = Data.facilities[ghost_info["id"]]
		var s: Array = d["size"]
		var rot: int = ghost_info["rot"]
		var fw := int(s[1]) if rot == 1 else int(s[0])
		var fh := int(s[0]) if rot == 1 else int(s[1])
		var gx: int = ghost_info["x"]
		var gy: int = ghost_info["y"]
		if d["kind"] != "path" and d["kind"] != "deco" or d.has("deco"):
			var rad: int = int(Data.balance["synergy_radius"]) if d["kind"] != "deco" else int(d.get("deco_radius", Data.balance["deco_radius"]))
			for yy in range(gy - rad, gy + fh + rad):
				for xx in range(gx - rad, gx + fw + rad):
					if sim.grid.land_at(xx, yy) == WorldGrid.OWNED and not (xx >= gx and xx < gx + fw and yy >= gy and yy < gy + fh):
						_diamond(xx, yy, "cursor_range")
		for yy in range(gy, gy + fh):
			for xx in range(gx, gx + fw):
				_diamond(xx, yy, "cursor_ok" if ghost_info["ok"] else "cursor_bad")
		var e2: Vector2i = ghost_info.get("entrance", Vector2i(-1, -1))
		if e2.x >= 0:
			_diamond(e2.x, e2.y, "cursor_entry")
