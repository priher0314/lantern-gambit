class_name Game
extends Node
## 플레이 화면: 월드 + HUD + 입력 처리 + 배속 + 자동 저장.

enum Mode {NORMAL, PLACE, MOVE}

var sim: Sim
var world: WorldView
var cam: Camera2D
var hud: Hud
var speed: float = 1.0
var last_speed: float = 1.0
var hard_pause: int = 0           # 선택 창 등으로 강제 정지 중인 수
var mode: int = Mode.NORMAL
var place_id: String = ""
var place_rot: int = 0
var move_uid: int = 0
var zoom_level: int = 1
var _drag := false
var _drag_moved := 0.0
var _painting := false
var _erasing := false
var _autosave := 0.0
var _cam_target := Vector2.ZERO
var _last_tile := Vector2i(-99, -99)
var _bgm_check := 0.0

func _ready() -> void:
	sim = App.sim
	process_mode = Node.PROCESS_MODE_ALWAYS
	world = WorldView.new()
	add_child(world)
	world.setup(sim)
	cam = Camera2D.new()
	add_child(cam)
	cam.make_current()
	_cam_target = Iso.to_screen(Vector2(sim.region["start"][0] + sim.region["start"][2] * 0.5, sim.region["start"][1] + sim.region["start"][3] * 0.5 + 1.0))
	cam.position = _cam_target
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Hud.new()
	hud.game = self
	layer.add_child(hud)
	sim.event.connect(_on_event)
	get_tree().auto_accept_quit = false
	_update_bgm(true)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		App.save_current()
		get_tree().quit()
	elif what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		App.save_current()

func _exit_tree() -> void:
	get_tree().auto_accept_quit = true

func is_paused() -> bool:
	return speed <= 0.0 or hard_pause > 0

func set_speed(s: float) -> void:
	if s > 0.0:
		last_speed = s
	speed = s
	hud.refresh_speed()

func toggle_pause() -> void:
	set_speed(last_speed if speed <= 0.0 else 0.0)

func _process(delta: float) -> void:
	var sp := 0.0 if hard_pause > 0 else speed
	if sp > 0.0:
		sim.advance(delta, sp)
	world.tick_decor(delta, sp)
	_autosave += delta
	if _autosave > 60.0:
		_autosave = 0.0
		if App.save_current():
			hud.flash_saved()
	_camera(delta)
	_bgm_check += delta
	if _bgm_check > 2.0:
		_bgm_check = 0.0
		_update_bgm(false)
	if mode != Mode.NORMAL:
		_update_ghost(false)

func _update_bgm(_force: bool) -> void:
	var nf := sim.night_factor()
	var hr := sim.hour()
	var bgm := "day"
	if nf > 0.6:
		bgm = "night"
	elif hr >= 16.0 or nf > 0.05:
		bgm = "evening"
	Audio.set_bgm(bgm)
	Audio.set_ambience(0.5 * (1.0 - nf), 0.5 * nf, 0.25 + minf(0.35, sim.cust.count() / 120.0))

# ---------------------------------------------------------------- 카메라

func _camera(delta: float) -> void:
	var dir := Vector2.ZERO
	if not hud.typing():
		if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
			dir.x -= 1
		if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
			dir.x += 1
		if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
			dir.y -= 1
		if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
			dir.y += 1
	if dir != Vector2.ZERO:
		_cam_target += dir.normalized() * 420.0 * delta / zoom_level
	var g := sim.grid
	var c := Iso.to_screen(Vector2(g.w * 0.5, g.h * 0.5))
	var ext := Vector2((g.w + g.h) * 13.0, (g.w + g.h) * 6.0)
	_cam_target.x = clampf(_cam_target.x, c.x - ext.x, c.x + ext.x)
	_cam_target.y = clampf(_cam_target.y, c.y - ext.y, c.y + ext.y)
	cam.position = cam.position.lerp(_cam_target, minf(1.0, delta * 14.0)).round()
	cam.zoom = Vector2(zoom_level, zoom_level)

func set_zoom(z: int) -> void:
	zoom_level = clampi(z, 1, 3)

func focus_on(gpos: Vector2) -> void:
	_cam_target = Iso.to_screen(gpos)

func mouse_tile() -> Vector2i:
	return Iso.to_tile(world.get_global_mouse_position())

# ---------------------------------------------------------------- 입력

func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton:
		var mb := ev as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			set_zoom(zoom_level + 1)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			set_zoom(zoom_level - 1)
		elif mb.button_index == MOUSE_BUTTON_MIDDLE:
			_drag = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_RIGHT:
			if mb.pressed:
				if mode != Mode.NORMAL:
					if mode == Mode.PLACE and place_id == "path" and sim.grid.has_path(mouse_tile().x, mouse_tile().y):
						_erasing = true
						_erase_path()
					else:
						cancel_mode()
				else:
					_drag = true
					_drag_moved = 0.0
			else:
				_drag = false
				_erasing = false
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_drag_moved = 0.0
				if mode == Mode.NORMAL:
					_drag = true
				else:
					_click_place()
					if place_id == "path" and mode == Mode.PLACE:
						_painting = true
			else:
				_painting = false
				if mode == Mode.NORMAL:
					_drag = false
					if _drag_moved < 5.0:
						_click_select()
	elif ev is InputEventMouseMotion:
		var mm := ev as InputEventMouseMotion
		if _drag:
			_drag_moved += mm.relative.length()
			_cam_target -= mm.relative / zoom_level
			cam.position = _cam_target
		if _painting:
			_click_place()
		if _erasing:
			_erase_path()
		if mode == Mode.NORMAL:
			_hover_plot()
	elif ev is InputEventKey and ev.pressed and not ev.echo:
		var k := (ev as InputEventKey).keycode
		match k:
			KEY_SPACE:
				toggle_pause()
			KEY_1:
				set_speed(1.0)
			KEY_2:
				set_speed(2.0)
			KEY_3:
				set_speed(3.0)
			KEY_R:
				if mode != Mode.NORMAL:
					rotate_ghost()
			KEY_ESCAPE:
				if mode != Mode.NORMAL:
					cancel_mode()
				elif not hud.close_top():
					hud.open_panel("menu")
			KEY_B:
				hud.open_panel("build")
			KEY_F1:
				if App.dev_mode:
					hud.open_panel("dev")
			KEY_F5:
				if App.save_current():
					hud.flash_saved()

func _hover_plot() -> void:
	var tl := mouse_tile()
	var hp := -1
	if sim.grid.inb(tl.x, tl.y) and sim.grid.land_at(tl.x, tl.y) == WorldGrid.PLOT:
		hp = sim.grid.plot_of[sim.grid.idx(tl.x, tl.y)]
		if not sim.build.can_buy_plot(hp):
			hp = -1
	if hp != world.hover_plot:
		world.hover_plot = hp
		world.overlay.queue_redraw()

func _click_select() -> void:
	var tl := mouse_tile()
	var g := sim.grid
	if not g.inb(tl.x, tl.y):
		hud.close_facility()
		return
	if g.land_at(tl.x, tl.y) == WorldGrid.PLOT:
		var pi: int = g.plot_of[g.idx(tl.x, tl.y)]
		if sim.build.can_buy_plot(pi):
			hud.ask_plot(pi)
		return
	var uid := g.occ_at(tl.x, tl.y)
	# 키 큰 건물은 위쪽을 눌러도 선택되게, 아래쪽 타일들도 살펴본다
	if uid == 0:
		for k in [1, 2]:
			var u2 := g.occ_at(tl.x + k, tl.y + k)
			if u2 != 0 and not sim.fac(u2).is_walkable() and sim.fac(u2).kind() != "deco":
				uid = u2
				break
	if uid != 0:
		select(uid)
	else:
		hud.close_facility()

func select(uid: int) -> void:
	world.set_selected(uid)
	hud.open_facility(uid)
	Audio.play("click")

func deselect() -> void:
	world.set_selected(0)

# ---------------------------------------------------------------- 건설 / 이동

func begin_place(def_id: String) -> void:
	mode = Mode.PLACE
	place_id = def_id
	place_rot = 0
	move_uid = 0
	deselect()
	hud.on_mode_changed()
	_update_ghost(true)

func begin_move(uid: int) -> void:
	var f := sim.fac(uid)
	if f == null:
		return
	mode = Mode.MOVE
	move_uid = uid
	place_id = f.id
	place_rot = f.rot
	hud.on_mode_changed()
	_update_ghost(true)

func cancel_mode() -> void:
	mode = Mode.NORMAL
	_painting = false
	world.set_ghost({})
	hud.on_mode_changed()

func rotate_ghost() -> void:
	if Data.facilities[place_id].get("road", false) or Data.facilities[place_id]["kind"] == "path":
		return
	place_rot = 1 - place_rot
	_update_ghost(true)

func _ghost_origin() -> Vector2i:
	# 커서가 발자국 가운데쯤 오도록 왼쪽 위 칸을 정한다
	var d: Dictionary = Data.facilities[place_id]
	var s: Array = d["size"]
	var fw := int(s[1]) if place_rot == 1 else int(s[0])
	var fh := int(s[0]) if place_rot == 1 else int(s[1])
	var tl := mouse_tile()
	var o := Vector2i(tl.x - int(fw / 2), tl.y - int(fh / 2))
	if d.get("road", false):
		o.y = sim.grid.front_row() - fh + 1
	return o

func _update_ghost(force: bool) -> void:
	var o := _ghost_origin()
	if not force and o == _last_tile:
		return
	_last_tile = o
	var chk: Dictionary = sim.build.can_place(place_id, o.x, o.y, place_rot, move_uid if mode == Mode.MOVE else 0)
	var reason: String = chk["reason"]
	var ok: bool = chk["ok"]
	if ok and mode == Mode.PLACE and not sim.can_afford(sim.build_cost(place_id)):
		ok = false
		reason = "자금이 부족해요"
	var tier := 0
	if mode == Mode.MOVE and sim.fac(move_uid) != null:
		tier = sim.fac(move_uid).tier()
	world.set_ghost({"id": place_id, "x": o.x, "y": o.y, "rot": place_rot, "ok": ok, "entrance": chk["entrance"], "tier": tier})
	var syn: Array = []
	if ok and Data.facilities[place_id]["kind"] != "path":
		syn = sim.synergy.preview(place_id, o.x, o.y, place_rot, move_uid if mode == Mode.MOVE else 0)
	hud.set_place_hint(reason, syn)

func _click_place() -> void:
	var o := _ghost_origin()
	if mode == Mode.MOVE:
		if sim.build.move(move_uid, o.x, o.y, place_rot):
			Audio.play("build")
			var uid := move_uid
			cancel_mode()
			select(uid)
		else:
			Audio.play("error")
		return
	var d: Dictionary = Data.facilities[place_id]
	var chk: Dictionary = sim.build.can_place(place_id, o.x, o.y, place_rot)
	if not chk["ok"]:
		if not _painting:
			Audio.play("error")
		return
	if not sim.can_afford(sim.build_cost(place_id)):
		if not _painting:
			Audio.play("error")
			hud.toast("자금이 부족해요", "info")
		return
	if d["kind"] == "path":
		sim.build.place("path", o.x, o.y, 0)
		Audio.play("path")
		_update_ghost(true)
		return
	var f := sim.build.place(place_id, o.x, o.y, place_rot)
	if f != null:
		Audio.play("build")
		world.float_text(f.center(), "-" + Fmt.comma(int(sim.build_cost(place_id))), Color("ffb4a8"), 30.0)
		# 장식은 이어서 놓을 수 있게, 건물은 한 번 놓고 끝낸다
		if d["kind"] == "deco" and not Input.is_key_pressed(KEY_CTRL):
			_update_ghost(true)
		elif Input.is_key_pressed(KEY_SHIFT):
			_update_ghost(true)
		else:
			cancel_mode()

func _erase_path() -> void:
	var tl := mouse_tile()
	if sim.build.remove_path(tl.x, tl.y):
		Audio.play("path")

# ---------------------------------------------------------------- 시뮬레이션 이벤트 → 소리

func _on_event(kind: String, d: Dictionary) -> void:
	match kind:
		"sale":
			Audio.play("sale", randf_range(0.95, 1.08))
		"fac_upgraded":
			Audio.play("upgrade")
		"fac_removed":
			Audio.play("demolish")
		"research_done":
			Audio.play("research_done")
		"synergy_found":
			Audio.play("discovery")
		"rank_up":
			Audio.play("rank_up")
		"staff_level":
			Audio.play("staff_up")
		"goal_done":
			Audio.play("goal")
		"plot_bought":
			Audio.play("upgrade")
		"run_complete":
			Audio.play("jingle")
		"veh_added":
			Audio.play("car")
	hud.on_sim_event(kind, d)

func save_and_exit_to_menu() -> void:
	App.save_current()
	App.show_menu()
