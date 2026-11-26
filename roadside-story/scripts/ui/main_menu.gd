class_name MainMenu
extends Control
## 메인 메뉴: 휴게소(저장 슬롯) 목록, 새 휴게소, 도감, 경영자 명성 해금, 설정.

const NAMES := ["행복 휴게소", "바다마루", "설산 쉼터", "솔바람 쉼터", "노을 휴게소", "별빛 쉼터", "다정 휴게소", "구름다리 휴게소", "햇살 쉼터", "달빛마루"]

var layer: CanvasLayer
var root: Control
var dialog_host: Control
var sel_region := "rural"
var sel_challenge := ""

func _ready() -> void:
	layer = CanvasLayer.new()
	add_child(layer)
	root = Control.new()
	root.theme = UIKit.build_theme()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(root)
	get_viewport().size_changed.connect(_rebuild)
	Audio.set_bgm("day")
	Audio.set_ambience(0.4, 0.0, 0.2)
	_rebuild()

func _rebuild() -> void:
	UIKit.clear(root)
	var vs := App.view_size()
	var bg := ColorRect.new()
	bg.color = Color("8cc474")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(bg)
	_backdrop(vs)
	var title := UIKit.label(App.GAME_TITLE, 24, UIKit.C_WHITE, true)
	title.add_theme_color_override("font_outline_color", UIKit.C_DARK)
	title.add_theme_constant_override("outline_size", 6)
	title.position = Vector2(28, 22)
	root.add_child(title)
	var sub := UIKit.label("작은 매점에서 시작하는 나만의 고속도로 휴게소", 12, UIKit.C_WHITE)
	sub.add_theme_color_override("font_outline_color", UIKit.C_DARK)
	sub.add_theme_constant_override("outline_size", 4)
	sub.position = Vector2(30, 54)
	root.add_child(sub)
	var p := UIKit.panel()
	p.custom_minimum_size = Vector2(400, 0)
	var v := UIKit.vbox(5)
	p.add_child(v)
	v.add_child(UIKit.label("내 휴게소", 12, UIKit.C_TEXT, true))
	var slots := Save.slots()
	if slots.is_empty():
		v.add_child(UIKit.wrap_label("아직 휴게소가 없습니다. 첫 휴게소를 열어 보세요!", 380, 12, UIKit.C_DIM))
	var idx := 1
	for s in slots:
		v.add_child(_slot_row(s, idx))
		idx += 1
	var nb := UIKit.colored_button("새 휴게소 열기", UIKit.C_GREEN, _new_dialog)
	nb.disabled = not Save.can_create_slot()
	if nb.disabled:
		nb.tooltip_text = "휴게소는 %d곳까지 운영할 수 있습니다." % Save.MAX_SLOTS
	v.add_child(nb)
	var h := UIKit.hbox(4)
	for it in [["도감", "codex", _codex_dialog], ["경영자 명성 %d" % Save.fame_available(), "trophy", _unlock_dialog], ["설정", "gear", _settings_dialog], ["끝내기", "", func(): get_tree().quit()]]:
		var b := UIKit.button(it[0], it[2], it[1])
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		h.add_child(b)
	v.add_child(h)
	root.add_child(p)
	p.reset_size()
	p.position = Vector2(28, 84)
	var ver := UIKit.label("v%s · 개발 중인 버전" % App.VERSION, 10, UIKit.C_WHITE)
	ver.add_theme_color_override("font_outline_color", UIKit.C_DARK)
	ver.add_theme_constant_override("outline_size", 4)
	ver.position = Vector2(vs.x - 150, vs.y - 16)
	root.add_child(ver)
	dialog_host = Control.new()
	dialog_host.set_anchors_preset(Control.PRESET_FULL_RECT)
	dialog_host.visible = false
	root.add_child(dialog_host)

func _backdrop(vs: Vector2) -> void:
	# 타이틀 뒤에 놓는 작은 휴게소 풍경
	var holder := Node2D.new()
	holder.position = Vector2(vs.x * 0.72, vs.y * 0.34)
	holder.scale = Vector2(2, 2) if vs.y >= 500 and vs.x >= 900 else Vector2(1, 1)
	root.add_child(holder)
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/sprites/buildings/meta.json"))
	for y in range(-3, 7):
		for x in range(-3, 7):
			var sp := Sprite2D.new()
			var nm := "grass_%d" % (GroundView.hash2(x, y) % 3)
			if y >= 5:
				nm = "road_near" if y == 5 else "road_far"
			elif (x == 2 and y >= 1) or (y == 2 and x >= 0 and x <= 4):
				nm = "path_0"
			sp.texture = UIKit.tex("res://assets/sprites/tiles/%s.png" % nm)
			sp.centered = false
			sp.position = Iso.to_screen(Vector2(x, y)) - Vector2(32, 0)
			holder.add_child(sp)
	var items := [["tree_0", -2, -2, 1, 1], ["observatory_1", -1, -2, 2, 2], ["garden_1", 3, -2, 2, 2], ["cafe_2", 0, 0, 2, 2], ["snack_1", 3, 0, 2, 2], ["tree_v3", 5, -3, 1, 1], ["kiosk_1", 1, 3, 1, 1], ["parking_1", 3, 3, 2, 2], ["walnut_1", -2, 3, 2, 1], ["lamp_0", 2, 4, 1, 1], ["tree_v1", -3, 1, 1, 1], ["car_1_b", 3, 3, 0, 0], ["van_3_b", 4, 4, 0, 0]]
	items.sort_custom(func(a, b): return (a[1] + a[2] + (a[3] + a[4]) * 0.5) < (b[1] + b[2] + (b[3] + b[4]) * 0.5))
	for it in items:
		var sp2 := Sprite2D.new()
		sp2.centered = false
		if it[3] == 0:
			sp2.texture = UIKit.tex("res://assets/sprites/vehicles/%s.png" % it[0])
			sp2.flip_h = true
			sp2.position = Iso.to_screen(Vector2(it[1] + 0.5, it[2] + 0.5)) - Vector2(36, 34)
		else:
			sp2.texture = UIKit.tex("res://assets/sprites/buildings/%s.png" % it[0])
			var m: Dictionary = meta[it[0]]
			sp2.position = Iso.to_screen(Vector2(it[1], it[2])) - Vector2(float(m["ox"]), float(m["oy"]))
		holder.add_child(sp2)

func _slot_row(s: Dictionary, idx: int) -> Control:
	var sm: Dictionary = s.get("summary", {})
	var row := UIKit.inset(Color("fffbe8"), 5)
	var h := UIKit.hbox(6)
	row.add_child(h)
	var v := UIKit.vbox(1)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var id: int = int(s["id"])
	if sm.is_empty():
		v.add_child(UIKit.label("%d호점" % idx, 12, UIKit.C_TEXT, true))
	else:
		var top := "%d호점: %s" % [idx, sm["name"]]
		if sm.get("complete", false):
			top += "  ★목표 달성"
		v.add_child(UIKit.label(top, 12, UIKit.C_TEXT, true))
		var region_name: String = Data.regions[sm["region"]]["name"] if Data.regions.has(sm["region"]) else "?"
		var line := "%s · %s · %d년차 · %s" % [region_name, Data.rank_def(int(sm["rank"]))["name"], int(sm["year"]), sm["style"]]
		if sm.get("challenge", "") != "" and Data.challenges.has(sm["challenge"]):
			line += " · 도전 「%s」" % Data.challenges[sm["challenge"]]["name"]
		v.add_child(UIKit.label(line, 10, UIKit.C_DIM))
	h.add_child(v)
	h.add_child(UIKit.colored_button("이어하기", UIKit.C_ACCENT, func():
		if not App.load_game(id):
			_message("저장 파일을 읽지 못했습니다.")))
	var del := UIKit.button("", func(): _confirm_delete(id, sm.get("name", "휴게소")), "trash")
	del.tooltip_text = "이 휴게소를 삭제합니다."
	h.add_child(del)
	return row

# ---------------------------------------------------------------- 대화 상자

func _open_dialog(content: Control) -> void:
	UIKit.clear(dialog_host)
	var dim := ColorRect.new()
	dim.color = Color(0.12, 0.1, 0.16, 0.5)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dialog_host.add_child(dim)
	dialog_host.add_child(content)
	dialog_host.visible = true
	content.reset_size()
	content.position = ((App.view_size() - content.size) * 0.5).round()
	(func():
		if is_instance_valid(content):
			content.reset_size()
			content.position = ((App.view_size() - content.size) * 0.5).round()).call_deferred()

func _close_dialog() -> void:
	UIKit.clear(dialog_host)
	dialog_host.visible = false

func _message(text: String) -> void:
	var w := UIKit.window("알림", _close_dialog, Vector2(300, 0))
	(w["body"] as VBoxContainer).add_child(UIKit.wrap_label(text, 280, 12))
	_open_dialog(w["root"])

func _confirm_delete(id: int, nm: String) -> void:
	var w := UIKit.window("휴게소 삭제", _close_dialog, Vector2(320, 0))
	var b: VBoxContainer = w["body"]
	b.add_child(UIKit.wrap_label("「%s」을(를) 정말 삭제할까요? 되돌릴 수 없습니다. (도감과 경영자 명성은 그대로 남습니다.)" % nm, 300, 12))
	b.add_child(UIKit.colored_button("삭제", UIKit.C_RED, func():
		Save.delete_slot(id)
		_rebuild()))
	_open_dialog(w["root"])

func _codex_dialog() -> void:
	var w := UIKit.window("통합 도감", _close_dialog, Vector2(620, 0))
	(w["body"] as VBoxContainer).add_child(CodexView.new(608, 280))
	_open_dialog(w["root"])

func _settings_dialog() -> void:
	var w := UIKit.window("설정", _close_dialog, Vector2(320, 0))
	(w["body"] as VBoxContainer).add_child(SettingsView.new())
	_open_dialog(w["root"])

func _unlock_dialog() -> void:
	var w := UIKit.window("경영자 명성", _close_dialog, Vector2(480, 0))
	var b: VBoxContainer = w["body"]
	b.add_child(UIKit.wrap_label("휴게소를 키우며 이룬 성과로 경영자 명성을 얻습니다. 명성은 게임을 쉽게 만드는 대신, 새로운 플레이 방법을 열어 줍니다.", 460, 12, UIKit.C_DIM))
	b.add_child(UIKit.label("쓸 수 있는 명성: %d" % Save.fame_available(), 12, UIKit.C_GOLD, true))
	for u in Data.progression["unlocks"]:
		var row := UIKit.inset(UIKit.C_PANEL2, 5)
		var h := UIKit.hbox(6)
		row.add_child(h)
		var v := UIKit.vbox(1)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_child(UIKit.label(u["name"], 12, UIKit.C_TEXT, true))
		v.add_child(UIKit.wrap_label(u["desc"], 340, 10, UIKit.C_DIM))
		h.add_child(v)
		if Save.is_unlocked(u["id"]):
			h.add_child(UIKit.label("해금 완료", 12, UIKit.C_GREEN, true))
		else:
			var uid: String = u["id"]
			var bb := UIKit.colored_button("명성 %d" % int(u["cost"]), UIKit.C_GOLD, func():
				if Save.buy_unlock(uid):
					Audio.play("discovery")
					_rebuild()
					_unlock_dialog())
			bb.disabled = Save.fame_available() < int(u["cost"])
			h.add_child(bb)
		b.add_child(row)
	var rec: Dictionary = Save.profile["records"]
	if not rec.is_empty():
		b.add_child(UIKit.label("개인 기록", 12, UIKit.C_TEXT, true))
		for rid in Data.region_order:
			if rec.has("days_" + rid):
				b.add_child(UIKit.label("%s 회차 목표 달성 최단 기록: %d일" % [Data.regions[rid]["name"], int(rec["days_" + rid])], 10))
		for cid in Data.challenges:
			if rec.has("challenge_" + cid):
				b.add_child(UIKit.label("도전 「%s」 최단 기록: %d일" % [Data.challenges[cid]["name"], int(rec["challenge_" + cid])], 10))
	_open_dialog(w["root"])

func _new_dialog() -> void:
	var w := UIKit.window("새 휴게소 열기", _close_dialog, Vector2(520, 0))
	var b: VBoxContainer = w["body"]
	var h := UIKit.hbox(6)
	h.add_child(UIKit.label("이름", 12))
	var le := LineEdit.new()
	le.text = NAMES[(Save.slots().size() + int(Save.profile["next_slot"])) % NAMES.size()]
	le.max_length = 12
	le.custom_minimum_size = Vector2(200, 0)
	h.add_child(le)
	b.add_child(h)
	b.add_child(UIKit.label("지역", 12, UIKit.C_TEXT, true))
	var rh := UIKit.hbox(6)
	b.add_child(rh)
	var cbox := UIKit.vbox(3)
	var fill_regions := func(): pass
	var fill_ch := func(): pass
	fill_regions = func():
		UIKit.clear(rh)
		for rid in Data.region_order:
			var r: Dictionary = Data.regions[rid]
			var open := Save.region_unlocked(rid)
			var card := Button.new()
			card.focus_mode = Control.FOCUS_NONE
			card.custom_minimum_size = Vector2(248, 96)
			card.disabled = not open
			if rid == sel_region:
				card.add_theme_stylebox_override("normal", UIKit.box(Color("ffe9a8"), UIKit.C_ACCENT, 2, 4))
				card.add_theme_stylebox_override("hover", UIKit.box(Color("ffe9a8"), UIKit.C_ACCENT, 2, 4))
			var cv := UIKit.vbox(2)
			cv.set_anchors_preset(Control.PRESET_FULL_RECT)
			cv.offset_left = 6
			cv.offset_top = 5
			cv.offset_right = -6
			cv.mouse_filter = Control.MOUSE_FILTER_IGNORE
			cv.add_child(UIKit.label(r["name"] if open else r["name"] + "  (잠김)", 12, UIKit.C_TEXT if open else UIKit.C_DIM, true))
			if open:
				for tip in r["tips"]:
					cv.add_child(UIKit.label("· " + tip, 10, UIKit.C_DIM))
			else:
				cv.add_child(UIKit.wrap_label("메인 메뉴의 [경영자 명성]에서 해금할 수 있습니다.", 230, 10, UIKit.C_DIM))
			card.add_child(cv)
			var rr: String = rid
			card.pressed.connect(func():
				Audio.play("click")
				sel_region = rr
				fill_regions.call())
			rh.add_child(card)
	fill_regions.call()
	b.add_child(cbox)
	fill_ch = func():
		UIKit.clear(cbox)
		var any := false
		for cid in Data.challenges:
			if Save.challenge_unlocked(cid):
				any = true
		if not any:
			return
		cbox.add_child(UIKit.label("도전 (선택)", 12, UIKit.C_TEXT, true))
		var ch := UIKit.hbox(4)
		var opts: Array = [""]
		for cid in Data.challenges:
			if Save.challenge_unlocked(cid):
				opts.append(cid)
		for cid in opts:
			var nm: String = "일반 경영" if cid == "" else Data.challenges[cid]["name"]
			var cb := UIKit.button(nm, func():
				sel_challenge = cid
				fill_ch.call())
			if cid == sel_challenge:
				cb.add_theme_stylebox_override("normal", UIKit.box(Color("ffd98a"), UIKit.C_BORDER, 1, 4))
			ch.add_child(cb)
		cbox.add_child(ch)
		if sel_challenge != "":
			var c: Dictionary = Data.challenges[sel_challenge]
			cbox.add_child(UIKit.wrap_label("%s  (%s)" % [c["desc"], " / ".join(c["rules"])], 500, 12, UIKit.C_RED))
			cbox.add_child(UIKit.label("실패해도 다른 휴게소에는 아무 영향이 없습니다.", 10, UIKit.C_DIM))
	fill_ch.call()
	b.add_child(UIKit.colored_button("이 지역에서 시작하기", UIKit.C_GREEN, func():
		var nm := le.text.strip_edges()
		if nm == "":
			nm = "새 휴게소"
		if not Save.region_unlocked(sel_region):
			sel_region = "rural"
		App.start_new(sel_region, nm, sel_challenge)))
	_open_dialog(w["root"])
