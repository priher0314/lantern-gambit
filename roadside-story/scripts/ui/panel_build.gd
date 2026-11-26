class_name PanelBuild
extends GamePanel
## 건설 메뉴: 분야 탭 + 시설 카드. 지금 지을 수 있는 시설만 보여주고, 잠긴 시설은 '곧 해금' 탭에 모은다.

var cat := "basic"
var tabs: HBoxContainer
var grid: HFlowContainer
var cards: Array = []

func build() -> void:
	init_panel(game, "건설", "bottom", Vector2(620, 0))
	tabs = UIKit.hbox(3)
	body.add_child(tabs)
	var sc := UIKit.scroll(Vector2(620, 118))
	body.add_child(sc)
	grid = HFlowContainer.new()
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 4)
	grid.add_theme_constant_override("v_separation", 4)
	sc.add_child(grid)
	refresh()

func _unlocked_in(c: String) -> Array:
	var out: Array = []
	for fid in Data.facility_order:
		if Data.facilities[fid]["cat"] == c and sim.facility_unlocked(fid):
			out.append(fid)
	return out

func refresh() -> void:
	UIKit.clear(tabs)
	for c in Data.CATEGORIES:
		if _unlocked_in(c).is_empty():
			continue
		var b := UIKit.button(Data.CATEGORY_NAMES[c], func():
			cat = c
			refresh(), "cat_" + c)
		if c == cat:
			b.add_theme_stylebox_override("normal", UIKit.box(Color("ffd98a"), UIKit.C_BORDER, 1, 4))
		tabs.add_child(b)
	tabs.add_child(UIKit.spacer())
	var lb := UIKit.button("곧 해금", func():
		cat = "_locked"
		refresh(), "lock")
	if cat == "_locked":
		lb.add_theme_stylebox_override("normal", UIKit.box(Color("ffd98a"), UIKit.C_BORDER, 1, 4))
	tabs.add_child(lb)
	UIKit.clear(grid)
	cards.clear()
	if cat == "_locked":
		_fill_locked()
		return
	for fid in _unlocked_in(cat):
		grid.add_child(_card(fid))
	tick()

func _card(fid: String) -> Control:
	var d: Dictionary = Data.facilities[fid]
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(98, 110)
	b.tooltip_text = "%s\n%s" % [d["name"], d["desc"]]
	b.pressed.connect(func():
		Audio.play("click")
		game.begin_place(fid))
	var v := UIKit.vbox(1)
	v.set_anchors_preset(Control.PRESET_FULL_RECT)
	v.offset_left = 3
	v.offset_right = -3
	v.offset_top = 3
	v.offset_bottom = -4
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var img := UIKit.tex_rect(UIKit.building_tex(fid, 0), Vector2(90, 58))
	if d["kind"] == "path":
		img.texture = UIKit.tex("res://assets/sprites/tiles/path_0.png")
	v.add_child(img)
	var nm := UIKit.label(d["name"], 12, UIKit.C_TEXT, true)
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(nm)
	var cost := UIKit.label(Fmt.won(sim.build_cost(fid)), 12, UIKit.C_TEXT)
	cost.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(cost)
	var n := sim.count_fac(fid)
	var sub := UIKit.label(("%d칸×%d칸" % [d["size"][0], d["size"][1]]) + ("  보유 %d" % n if n > 0 else ""), 10, UIKit.C_DIM)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(sub)
	cards.append({"id": fid, "btn": b, "cost": cost})
	return b

func _fill_locked() -> void:
	var any := false
	for fid in Data.facility_order:
		if sim.facility_unlocked(fid):
			continue
		var d: Dictionary = Data.facilities[fid]
		any = true
		var p := UIKit.inset()
		p.custom_minimum_size = Vector2(98, 110)
		var v := UIKit.vbox(1)
		p.add_child(v)
		var img := UIKit.tex_rect(UIKit.building_tex(fid, 0), Vector2(90, 58))
		img.modulate = Color(0.25, 0.22, 0.3, 0.75)
		v.add_child(img)
		var nm := UIKit.label(d["name"], 12, UIKit.C_DIM, true)
		nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(nm)
		var need := ""
		if int(d.get("rank", 1)) > sim.prog.rank:
			need = "「%s」 달성 시" % Data.rank_def(int(d["rank"]))["name"]
		else:
			need = "경영자 명성으로 해금"
		var nl := UIKit.wrap_label(need, 90, 10, UIKit.C_DIM)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(nl)
		p.tooltip_text = d["desc"]
		grid.add_child(p)
	if not any:
		grid.add_child(UIKit.label("모든 시설을 해금했습니다.", 12, UIKit.C_DIM))

func tick() -> void:
	for c in cards:
		var ok: bool = sim.can_afford(sim.build_cost(c["id"]))
		(c["cost"] as Label).add_theme_color_override("font_color", UIKit.C_TEXT if ok else UIKit.C_RED)
		(c["btn"] as Button).modulate = Color.WHITE if ok else Color(1, 1, 1, 0.7)

func on_sim_event(kind: String, _d: Dictionary) -> void:
	if kind == "rank_up" or kind == "fac_added" or kind == "fac_removed":
		refresh()
