class_name PanelStaff
extends GamePanel
## 직원: 채용(지원자 중 선택)과 배치. 급여와 근무는 자동이다.

var tab := "staff"
var content: VBoxContainer
var picking_for := 0     # 배치할 직원 ID

func build() -> void:
	init_panel(game, "직원", "center", Vector2(600, 0))
	content = UIKit.vbox(4)
	body.add_child(content)
	if sim.staff.staff.is_empty():
		tab = "hire"
	refresh()

static func portrait(look: int) -> TextureRect:
	var at := AtlasTexture.new()
	at.atlas = UIKit.tex("res://assets/sprites/characters/staff_%d.png" % (look % 6))
	at.region = Rect2(0, 0, 16, 20)
	var r := UIKit.tex_rect(at, Vector2.ZERO, 2)
	r.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return r

func _stat_bar(name: String, v: float) -> Control:
	var h := UIKit.hbox(2)
	h.add_child(UIKit.label(name, 10, UIKit.C_DIM))
	h.add_child(UIKit.progress(v / 100.0, UIKit.C_BLUE, 6, 38))
	h.add_child(UIKit.label(str(int(v)), 10, UIKit.C_TEXT))
	return h

func _traits(e: Dictionary) -> Control:
	var h := UIKit.hbox(3)
	for tr in e["traits"]:
		var l := UIKit.label("[%s]" % Data.traits[tr]["name"], 10, UIKit.C_ACCENT)
		l.tooltip_text = Data.traits[tr]["desc"]
		l.mouse_filter = Control.MOUSE_FILTER_PASS
		h.add_child(l)
	return h

func _card(e: Dictionary) -> Array:
	var row := UIKit.inset(UIKit.C_PANEL2, 4)
	var h := UIKit.hbox(6)
	row.add_child(h)
	h.add_child(portrait(int(e["look"])))
	var v := UIKit.vbox(1)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var jd: Dictionary = Data.jobs[e["job"]]
	var top := UIKit.hbox(6)
	top.add_child(UIKit.label(e["name"], 12, UIKit.C_TEXT, true))
	var jl := UIKit.label("%s Lv.%d" % [jd["name"], e["level"]], 12, UIKit.C_DIM)
	jl.tooltip_text = jd["desc"]
	jl.mouse_filter = Control.MOUSE_FILTER_PASS
	top.add_child(jl)
	top.add_child(_traits(e))
	v.add_child(top)
	var st := UIKit.hbox(8)
	st.add_child(_stat_bar("서비스", float(e["service"])))
	st.add_child(_stat_bar("기술", float(e["skill"])))
	st.add_child(_stat_bar("체력", float(e["stamina"])))
	var pot := UIKit.label("잠재력 " + "◆".repeat(int(e["potential"])), 10, UIKit.C_GOLD)
	pot.tooltip_text = "잠재력이 높을수록 레벨이 오를 때 크게 성장합니다."
	pot.mouse_filter = Control.MOUSE_FILTER_PASS
	st.add_child(pot)
	v.add_child(st)
	h.add_child(v)
	return [row, h]

func refresh() -> void:
	UIKit.clear(content)
	var tabs := UIKit.hbox()
	for t in [["staff", "우리 직원 (%d)" % sim.staff.staff.size()], ["hire", "지원자 (%d)" % sim.staff.candidates.size()]]:
		var b := UIKit.button(t[1], func():
			tab = t[0]
			picking_for = 0
			refresh()
			relayout())
		if tab == t[0]:
			b.add_theme_stylebox_override("normal", UIKit.box(Color("ffd98a"), UIKit.C_BORDER, 1, 4))
		tabs.add_child(b)
	tabs.add_child(UIKit.spacer())
	tabs.add_child(UIKit.label("하루 급여 합계 %s" % Fmt.won(sim.staff.total_wages()), 12, UIKit.C_DIM))
	content.add_child(tabs)
	if picking_for != 0:
		_fill_picker()
	elif tab == "staff":
		_fill_staff()
	else:
		_fill_hire()

func _fill_staff() -> void:
	if sim.staff.staff.is_empty():
		content.add_child(UIKit.wrap_label("아직 직원이 없습니다. [지원자] 탭에서 채용해 보세요. 직원이 없는 가게는 사장님이 직접 봐서 느립니다.", 560, 12, UIKit.C_DIM))
		return
	var bar := UIKit.hbox()
	bar.add_child(UIKit.label("직원은 알아서 일하고 성장합니다.", 12, UIKit.C_DIM))
	bar.add_child(UIKit.spacer())
	var ab := UIKit.button("자동 배치", func():
		sim.staff.auto_assign_all()
		refresh())
	ab.tooltip_text = "모든 직원을 가장 잘 맞는 시설에 다시 배치합니다."
	bar.add_child(ab)
	content.add_child(bar)
	var sc := UIKit.scroll(Vector2(588, 260))
	content.add_child(sc)
	var list := UIKit.vbox(3)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(list)
	for e in sim.staff.staff.values():
		var c := _card(e)
		var f := sim.fac(int(e["fac"]))
		var id: int = int(e["id"])
		var wb := UIKit.button(f.def()["name"] if f != null else "대기 중", func():
			picking_for = id
			refresh())
		wb.custom_minimum_size.x = 84
		wb.tooltip_text = "누르면 일할 곳을 바꿉니다."
		if f == null:
			wb.add_theme_color_override("font_color", UIKit.C_RED)
		(c[1] as HBoxContainer).add_child(wb)
		list.add_child(c[0])

func _fill_picker() -> void:
	var e: Dictionary = sim.staff.staff.get(picking_for, {})
	if e.is_empty():
		picking_for = 0
		refresh()
		return
	content.add_child(UIKit.label("%s 님이 일할 곳을 고르세요" % e["name"], 12, UIKit.C_TEXT, true))
	var sc := UIKit.scroll(Vector2(588, 240))
	content.add_child(sc)
	var list := UIKit.vbox(3)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(list)
	var facs: Array = []
	for f in sim.facilities.values():
		if int(f.def().get("staff", 0)) > 0:
			facs.append(f)
	facs.sort_custom(func(a, b): return sim.staff.job_match(e, a) > sim.staff.job_match(e, b))
	for f in facs:
		var slots: int = int(f.def()["staff"])
		var m := sim.staff.job_match(e, f)
		var fit := "잘 맞음" if m >= 1.0 else ("무난함" if m >= 0.7 else "서투름")
		var full: bool = f.staff_ids.size() >= slots and int(e["fac"]) != f.uid
		var uid: int = f.uid
		var b := UIKit.button("%s Lv.%d   직원 %d/%d   (%s)" % [f.def()["name"], f.level, f.staff_ids.size(), slots, fit], func():
			sim.staff.assign(picking_for, uid)
			picking_for = 0
			refresh())
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.disabled = full
		if m >= 1.0:
			b.add_theme_color_override("font_color", UIKit.C_GREEN)
		list.add_child(b)
	var bh := UIKit.hbox()
	bh.add_child(UIKit.button("취소", func():
		picking_for = 0
		refresh()))
	bh.add_child(UIKit.spacer())
	var fb := UIKit.button("내보내기", func():
		sim.staff.fire(picking_for)
		picking_for = 0
		refresh())
	fb.add_theme_color_override("font_color", UIKit.C_RED)
	bh.add_child(fb)
	content.add_child(bh)

func _fill_hire() -> void:
	var days := sim.staff.next_refresh_day - sim.day()
	content.add_child(UIKit.label("지원자는 %d일 뒤에 새로 찾아옵니다. 처음 능력이 낮아도 잠재력이 높으면 크게 자랍니다." % maxi(days, 0), 12, UIKit.C_DIM))
	if sim.staff.candidates.is_empty():
		content.add_child(UIKit.label("지금은 지원자가 없습니다.", 12, UIKit.C_DIM))
		return
	for i in sim.staff.candidates.size():
		var e: Dictionary = sim.staff.candidates[i]
		var c := _card(e)
		if e.get("special", false):
			(c[0] as PanelContainer).add_theme_stylebox_override("panel", UIKit.box(Color("fff3c9"), UIKit.C_GOLD, 2, 4))
		var v := UIKit.vbox(1)
		var cost := sim.staff.hire_cost(e)
		var idx := i
		var hb := UIKit.colored_button("채용 %s" % Fmt.won(cost), UIKit.C_GREEN if sim.can_afford(cost) else Color("a89a86"), func():
			if sim.staff.hire(idx) != 0:
				Audio.play("build")
				tab = "staff"
				refresh()
				relayout()
			else:
				Audio.play("error")
				hud.toast("자금이 부족해요", "info"))
		v.add_child(hb)
		v.add_child(UIKit.label("급여 %s/일" % Fmt.won(sim.staff.wage(e)), 10, UIKit.C_DIM))
		(c[1] as HBoxContainer).add_child(v)
		content.add_child(c[0])

func on_sim_event(kind: String, _d: Dictionary) -> void:
	if kind == "new_day" and picking_for == 0:
		refresh()
