class_name Hud
extends Control
## 게임 화면 UI: 상단 정보, 하단 메뉴, 목표, 알림, 창과 모달 관리.

var game: Game
var sim: Sim
var top: PanelContainer
var bottom: HBoxContainer
var l_money: Label
var l_net: Label
var l_date: Label
var l_rank: Label
var l_visitors: Label
var l_sat: Label
var pb_rank: ProgressBar
var speed_btns: Array = []
var goals_box: VBoxContainer
var goals_panel: PanelContainer
var goals_open := true
var toasts: VBoxContainer
var hint_panel: PanelContainer
var hint_label: Label
var hint_sub: Label
var saved_label: Label
var perk_btn: Button
var banner_host: Control
var panel: GamePanel            # 메인 창 (하나만)
var fac_panel: GamePanel        # 시설 정보 창
var modal_layer: Control
var modal_queue: Array = []
var modal_open := false
var _tick := 0.0
var _slow := 0.0
var _banner_busy := false
var _banner_queue: Array = []
var _money_shown := 0.0
var badges: Dictionary = {}
var menu_btns: Dictionary = {}

func _ready() -> void:
	sim = game.sim
	theme = UIKit.build_theme()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build_top()
	_build_bottom()
	_build_goals()
	_build_misc()
	_money_shown = sim.money
	get_viewport().size_changed.connect(_relayout)
	_refresh_goals()
	refresh_speed()
	_update_top()
	call_deferred("_after_ready")

func _after_ready() -> void:
	_relayout()
	if sim.perks.has_pending():
		perk_btn.visible = true
	if sim.time > 5.0:
		queue_modal({"kind": "welcome"})
	if not sim.events.pending_choice.is_empty():
		queue_modal({"kind": "event_choice", "id": sim.events.pending_choice["id"]})

func typing() -> bool:
	var f := get_viewport().gui_get_focus_owner()
	return f is LineEdit

# ---------------------------------------------------------------- 상단

func _stat(icon_name: String, tip: String) -> Array:
	var h := UIKit.hbox(3)
	h.tooltip_text = tip
	h.mouse_filter = Control.MOUSE_FILTER_PASS
	var ic := UIKit.tex_rect(UIKit.icon(icon_name))
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(ic)
	var l := UIKit.label("", 12, UIKit.C_TEXT, true)
	h.add_child(l)
	return [h, l]

func _build_top() -> void:
	top = PanelContainer.new()
	top.add_theme_stylebox_override("panel", UIKit.box(UIKit.C_PANEL, UIKit.C_BORDER, 2, 4, true))
	add_child(top)
	var h := UIKit.hbox(10)
	top.add_child(h)
	var r := _stat("rank", "경영 등급. 손님 수와 명성이 쌓이면 오릅니다.")
	l_rank = r[1]
	var rv := UIKit.vbox(1)
	rv.add_child(r[0])
	pb_rank = UIKit.progress(0.0, UIKit.C_GOLD, 5, 86)
	rv.add_child(pb_rank)
	h.add_child(rv)
	var m := _stat("coin", "운영 자금")
	l_money = m[1]
	l_net = UIKit.label("", 10, UIKit.C_DIM)
	l_net.tooltip_text = "최근 하루 순이익 (매출 - 재료비 - 운영비 - 급여)"
	l_net.mouse_filter = Control.MOUSE_FILTER_PASS
	m[0].add_child(l_net)
	h.add_child(m[0])
	var v := _stat("people", "지금 휴게소에 있는 손님 / 누적 손님")
	l_visitors = v[1]
	h.add_child(v[0])
	var s := _stat("smile", "손님 만족도. 높을수록 명성이 빨리 쌓입니다.")
	l_sat = s[1]
	h.add_child(s[0])
	h.add_child(UIKit.spacer())
	var c := _stat("clock", "게임 속 날짜와 시간")
	l_date = c[1]
	h.add_child(c[0])
	var sb := UIKit.hbox(2)
	var defs := [["pause", 0.0, "일시정지 (스페이스)"], ["play", 1.0, "1배속 (1)"], ["", 2.0, "2배속 (2)"], ["", 3.0, "3배속 (3)"]]
	for d in defs:
		var b := UIKit.button("" if d[0] != "" else ("x%d" % int(d[1])), game.set_speed.bind(d[1]), d[0])
		b.tooltip_text = d[2]
		b.custom_minimum_size = Vector2(24, 0)
		b.set_meta("speed", d[1])
		sb.add_child(b)
		speed_btns.append(b)
	h.add_child(sb)
	var mb := UIKit.button("", func(): open_panel("menu"), "menu")
	mb.tooltip_text = "메뉴: 특전, 경영 기록, 지역 정보, 설정, 저장"
	h.add_child(mb)

func refresh_speed() -> void:
	for b in speed_btns:
		var on: bool = is_equal_approx(float(b.get_meta("speed")), game.speed)
		var sbx := UIKit.box(Color("ffd98a") if on else UIKit.C_WHITE, UIKit.C_BORDER, 1, 4)
		if on:
			sbx.border_width_top = 3
		else:
			sbx.border_width_bottom = 3
		b.add_theme_stylebox_override("normal", sbx)

func _update_top() -> void:
	_money_shown = lerpf(_money_shown, sim.money, 0.35)
	if absf(_money_shown - sim.money) < 60.0:
		_money_shown = sim.money
	l_money.text = Fmt.won(_money_shown)
	var net := sim.econ.last_net()
	l_net.text = "(%s%s/일)" % ["+" if net >= 0 else "", Fmt.won_short(net)]
	l_net.add_theme_color_override("font_color", UIKit.C_GREEN if net >= 0 else UIKit.C_RED)
	l_rank.text = Data.rank_def(sim.prog.rank)["name"]
	pb_rank.value = sim.prog.rank_progress()
	l_visitors.text = "%d / %s" % [sim.cust.count(), Fmt.comma(sim.prog.visitors)]
	l_sat.text = "%d" % int(sim.prog.sat_avg)
	l_date.text = "%s %s %02d시" % [sim.date_text(), Data.SEASON_NAMES[sim.season()], int(sim.hour())]

# ---------------------------------------------------------------- 하단

func _build_bottom() -> void:
	bottom = UIKit.hbox(4)
	add_child(bottom)
	var items := [["build", "건설", "build", "시설을 짓습니다 (B)"], ["upgrade", "업그레이드", "upgrade", "시설을 성장시킵니다"], ["research", "연구", "research", "재료 두 가지로 신상품을 개발합니다"], ["staff", "직원", "staff", "직원을 채용하고 배치합니다"], ["codex", "도감", "codex", "지금까지 발견한 것들"]]
	for it in items:
		var b := UIKit.button(it[1], open_panel.bind(it[0]), it[2])
		b.tooltip_text = it[3]
		b.custom_minimum_size = Vector2(78, 28)
		b.add_theme_font_override("font", UIKit.font_bold)
		bottom.add_child(b)
		menu_btns[it[0]] = b
	perk_btn = UIKit.colored_button("특전 선택!", UIKit.C_ACCENT, func(): queue_modal({"kind": "perk"}))
	perk_btn.visible = false
	perk_btn.custom_minimum_size = Vector2(84, 28)
	bottom.add_child(perk_btn)

func set_badge(id: String, on: bool) -> void:
	badges[id] = on
	var names := {"build": "건설", "upgrade": "업그레이드", "research": "연구", "staff": "직원", "codex": "도감"}
	if menu_btns.has(id):
		(menu_btns[id] as Button).text = names[id] + (" !" if on else "")

# ---------------------------------------------------------------- 목표

func _build_goals() -> void:
	goals_panel = PanelContainer.new()
	goals_panel.add_theme_stylebox_override("panel", UIKit.box(Color(0.97, 0.93, 0.83, 0.92), UIKit.C_BORDER, 1, 5))
	add_child(goals_panel)
	goals_panel.position = Vector2(4, 44)
	goals_box = UIKit.vbox(3)
	goals_panel.add_child(goals_box)

func _refresh_goals() -> void:
	UIKit.clear(goals_box)
	var head := UIKit.hbox()
	head.add_child(UIKit.label("목표", 12, UIKit.C_TEXT, true))
	head.add_child(UIKit.spacer())
	var tb := UIKit.button("접기" if goals_open else "펴기", func():
		goals_open = not goals_open
		_refresh_goals())
	tb.add_theme_font_override("font", UIKit.font_small)
	tb.add_theme_font_size_override("font_size", 10)
	head.add_child(tb)
	goals_box.add_child(head)
	if not goals_open:
		goals_panel.reset_size()
		return
	for g in sim.prog.goals():
		var col: Color = {"guide": UIKit.C_ACCENT, "rank": UIKit.C_GOLD, "advice": UIKit.C_BLUE, "challenge": UIKit.C_RED}.get(g["kind"], UIKit.C_TEXT)
		var row := UIKit.hbox(4)
		var dot := ColorRect.new()
		dot.color = col
		dot.custom_minimum_size = Vector2(4, 12)
		row.add_child(dot)
		var v := UIKit.vbox(1)
		v.add_child(UIKit.wrap_label(g["text"], 178, 12, UIKit.C_TEXT))
		if g["hint"] != "":
			v.add_child(UIKit.wrap_label(g["hint"], 178, 10, UIKit.C_DIM))
		if float(g["progress"]) >= 0.0:
			v.add_child(UIKit.progress(float(g["progress"]), col, 5, 178))
		row.add_child(v)
		goals_box.add_child(row)
	goals_panel.reset_size()

# ---------------------------------------------------------------- 기타 고정 요소

func _build_misc() -> void:
	toasts = UIKit.vbox(3)
	toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toasts.alignment = BoxContainer.ALIGNMENT_BEGIN
	add_child(toasts)
	hint_panel = PanelContainer.new()
	hint_panel.add_theme_stylebox_override("panel", UIKit.box(Color(0.23, 0.19, 0.27, 0.9), UIKit.C_BORDER, 1, 5))
	hint_panel.visible = false
	hint_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(hint_panel)
	var hv := UIKit.vbox(2)
	hint_panel.add_child(hv)
	hint_label = UIKit.label("", 12, UIKit.C_WHITE)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hv.add_child(hint_label)
	hint_sub = UIKit.label("", 12, Color("ffe08a"), true)
	hint_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hv.add_child(hint_sub)
	saved_label = UIKit.label("저장됨", 10, Color("fffaf0"))
	saved_label.add_theme_color_override("font_outline_color", UIKit.C_DARK)
	saved_label.add_theme_constant_override("outline_size", 4)
	saved_label.modulate.a = 0.0
	add_child(saved_label)
	banner_host = Control.new()
	banner_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner_host.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(banner_host)
	modal_layer = Control.new()
	modal_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	modal_layer.visible = false
	add_child(modal_layer)

func _relayout() -> void:
	var vs := App.view_size()
	size = vs
	top.position = Vector2(4, 4)
	top.size = Vector2(vs.x - 8, 0)
	bottom.reset_size()
	bottom.position = Vector2((vs.x - bottom.size.x) * 0.5, vs.y - bottom.size.y - 5).round()
	toasts.position = Vector2(vs.x - 250, 46)
	toasts.custom_minimum_size.x = 244
	saved_label.position = Vector2(vs.x - 50, vs.y - 16)
	hint_panel.reset_size()
	hint_panel.position = Vector2((vs.x - hint_panel.size.x) * 0.5, vs.y - 44 - hint_panel.size.y).round()
	if panel != null:
		layout_panel(panel)
	if fac_panel != null:
		layout_panel(fac_panel)

func layout_panel(p: GamePanel) -> void:
	if not is_instance_valid(p):
		return
	p.reset_size()
	var vs := App.view_size()
	match p.dock:
		"bottom":
			p.position = Vector2((vs.x - p.size.x) * 0.5, vs.y - 40 - p.size.y).round()
		"right":
			p.position = Vector2(vs.x - p.size.x - 5, 46).round()
		_:
			p.position = Vector2((vs.x - p.size.x) * 0.5, maxf(40.0, (vs.y - p.size.y) * 0.5 - 4.0)).round()

func flash_saved() -> void:
	saved_label.modulate.a = 1.0
	create_tween().tween_property(saved_label, "modulate:a", 0.0, 1.6).set_delay(0.8)

# ---------------------------------------------------------------- 알림

func toast(text: String, kind: String = "info") -> void:
	var p := PanelContainer.new()
	var col: Color = {"money": Color("fff3c9"), "star": Color("ffe9a8"), "advice": Color("dcecff"), "staff": Color("e3f5df")}.get(kind, UIKit.C_PANEL)
	p.add_theme_stylebox_override("panel", UIKit.box(col, UIKit.C_BORDER, 1, 4, true))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var h := UIKit.hbox(4)
	var icon_name: String = {"money": "coin", "star": "star", "advice": "people", "staff": "staff"}.get(kind, "")
	if icon_name != "":
		var ic := UIKit.tex_rect(UIKit.icon(icon_name))
		ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(ic)
	h.add_child(UIKit.wrap_label(text, 210, 12))
	p.add_child(h)
	toasts.add_child(p)
	while toasts.get_child_count() > 4:
		var old := toasts.get_child(0)
		toasts.remove_child(old)
		old.queue_free()
	Audio.play("toast")
	var tw := p.create_tween()
	p.modulate.a = 0.0
	tw.tween_property(p, "modulate:a", 1.0, 0.15)
	tw.tween_interval(5.0)
	tw.tween_property(p, "modulate:a", 0.0, 0.6)
	tw.tween_callback(p.queue_free)

## 화면 위쪽에 잠깐 떴다 사라지는 발견 배너 (게임을 멈추지 않는다)
func banner(title: String, text: String, sub: String = "", color: Color = UIKit.C_GOLD) -> void:
	_banner_queue.append([title, text, sub, color])
	_next_banner()

func _next_banner() -> void:
	if _banner_busy or _banner_queue.is_empty():
		return
	_banner_busy = true
	var b: Array = _banner_queue.pop_front()
	var p := PanelContainer.new()
	var sb := UIKit.box(Color("fffbe8"), b[3], 3, 8, true)
	p.add_theme_stylebox_override("panel", sb)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := UIKit.vbox(2)
	p.add_child(v)
	var t1 := UIKit.label(b[0], 12, b[3].darkened(0.25), true)
	t1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t1)
	var t2 := UIKit.label(b[1], 15, UIKit.C_TEXT)
	t2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t2)
	if b[2] != "":
		var t3 := UIKit.wrap_label(b[2], 280, 12, UIKit.C_DIM)
		t3.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(t3)
	banner_host.add_child(p)
	p.reset_size()
	var vs := App.view_size()
	var x := (vs.x - p.size.x) * 0.5
	p.position = Vector2(x, -p.size.y - 10)
	var tw := p.create_tween()
	tw.tween_property(p, "position:y", 52.0, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(3.2)
	tw.tween_property(p, "modulate:a", 0.0, 0.5)
	tw.tween_callback(func():
		p.queue_free()
		_banner_busy = false
		_next_banner())

# ---------------------------------------------------------------- 창

func open_panel(id: String) -> void:
	if panel != null and panel.panel_id == id:
		close_panel(panel)
		return
	if panel != null:
		close_panel(panel)
	if game.mode != Game.Mode.NORMAL:
		game.cancel_mode()
	var p: GamePanel
	match id:
		"build": p = PanelBuild.new()
		"upgrade": p = PanelUpgrade.new()
		"research": p = PanelResearch.new()
		"staff": p = PanelStaff.new()
		"codex": p = PanelCodex.new()
		"menu": p = PanelMenu.new()
		"perks": p = PanelPerks.new()
		"records": p = PanelRecords.new()
		"region": p = PanelRegion.new()
		"settings": p = PanelSettings.new()
		"dev": p = PanelDev.new()
		_: return
	p.panel_id = id
	p.game = game
	add_child(p)
	move_child(modal_layer, get_child_count() - 1)
	p.build()
	panel = p
	set_badge(id, false)
	if id != "build":
		close_facility()
	layout_panel(p)
	call_deferred("layout_panel", p)

func close_panel(p: GamePanel) -> void:
	if p == fac_panel:
		close_facility()
		return
	if p == panel:
		panel = null
	p.queue_free()

func open_facility(uid: int) -> void:
	if fac_panel != null:
		fac_panel.queue_free()
	if panel != null and panel.dock != "bottom":
		close_panel(panel)
	var p := PanelFacility.new()
	p.uid = uid
	p.game = game
	p.panel_id = "facility"
	add_child(p)
	move_child(modal_layer, get_child_count() - 1)
	p.build()
	fac_panel = p
	layout_panel(p)
	call_deferred("layout_panel", p)

func close_facility() -> void:
	if fac_panel != null:
		fac_panel.queue_free()
		fac_panel = null
	game.deselect()

## ESC: 열려 있는 창을 하나 닫는다. 닫은 게 있으면 true
func close_top() -> bool:
	if modal_open:
		return true
	if panel != null:
		close_panel(panel)
		return true
	if fac_panel != null:
		close_facility()
		return true
	return false

func on_mode_changed() -> void:
	if game.mode == Game.Mode.NORMAL:
		hint_panel.visible = false
	else:
		if fac_panel != null:
			fac_panel.queue_free()
			fac_panel = null
		if panel != null and panel.dock != "bottom":
			close_panel(panel)

func set_place_hint(reason: String, syn: Array) -> void:
	hint_panel.visible = true
	var d: Dictionary = Data.facilities[game.place_id]
	var base := "%s · 좌클릭: 놓기 · 우클릭/ESC: 취소" % d["name"]
	if d["kind"] == "path":
		base = "보행로 · 드래그: 깔기 · 보행로 위 우클릭: 지우기 · ESC: 끝내기"
	elif not d.get("road", false):
		base += " · R: 돌리기"
	if game.mode == Game.Mode.MOVE:
		base = "%s 옮기는 중 (무료) · 좌클릭: 놓기 · R: 돌리기 · ESC: 취소" % d["name"]
	hint_label.text = base
	if reason != "":
		hint_sub.text = reason
		hint_sub.add_theme_color_override("font_color", Color("ff9d8f"))
		hint_sub.visible = true
	elif not syn.is_empty():
		var names: Array = []
		var unknown := false
		for sid in syn:
			if Save.codex_has("synergy", sid):
				names.append("「%s」" % Data.synergies[sid]["name"])
			else:
				unknown = true
		var txt := ""
		if not names.is_empty():
			txt = "궁합 " + ", ".join(names)
		if unknown:
			txt += (" · " if txt != "" else "") + "새로운 궁합이 생길 것 같아요!"
		hint_sub.text = txt
		hint_sub.add_theme_color_override("font_color", Color("ffe08a"))
		hint_sub.visible = true
	else:
		hint_sub.visible = false
	hint_panel.reset_size()
	var vs := App.view_size()
	var py := vs.y - 44 - hint_panel.size.y
	if panel != null and panel.dock == "bottom":
		py = panel.position.y - hint_panel.size.y - 4
	hint_panel.position = Vector2((vs.x - hint_panel.size.x) * 0.5, py).round()

func ask_plot(i: int) -> void:
	queue_modal({"kind": "plot", "plot": i})

# ---------------------------------------------------------------- 모달

func queue_modal(m: Dictionary) -> void:
	for q in modal_queue:
		if q["kind"] == m["kind"] and m["kind"] in ["perk", "welcome"]:
			return
	modal_queue.append(m)
	_next_modal()

func _next_modal() -> void:
	if modal_open or modal_queue.is_empty():
		return
	var m: Dictionary = modal_queue.pop_front()
	var content := Modals.build(self, m)
	if content == null:
		_next_modal()
		return
	modal_open = true
	game.hard_pause += 1
	UIKit.clear(modal_layer)
	var dim := ColorRect.new()
	dim.color = Color(0.12, 0.1, 0.16, 0.5)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	modal_layer.add_child(dim)
	modal_layer.add_child(content)
	modal_layer.visible = true
	content.reset_size()
	var vs := App.view_size()
	content.position = ((vs - content.size) * 0.5).round()
	content.modulate.a = 0.0
	content.scale = Vector2(0.96, 0.96)
	content.pivot_offset = content.size * 0.5
	var tw := content.create_tween().set_parallel(true)
	tw.tween_property(content, "modulate:a", 1.0, 0.12)
	tw.tween_property(content, "scale", Vector2.ONE, 0.12)

func close_modal() -> void:
	if not modal_open:
		return
	modal_open = false
	game.hard_pause = maxi(0, game.hard_pause - 1)
	UIKit.clear(modal_layer)
	modal_layer.visible = false
	perk_btn.visible = sim.perks.has_pending()
	_next_modal()

# ---------------------------------------------------------------- 갱신

func _process(delta: float) -> void:
	_tick += delta
	_slow += delta
	if _tick > 0.2:
		_tick = 0.0
		_update_top()
	if _slow > 0.6:
		_slow = 0.0
		_refresh_goals()
		if panel != null:
			panel.tick()
		if fac_panel != null:
			fac_panel.tick()

func on_sim_event(kind: String, d: Dictionary) -> void:
	match kind:
		"toast":
			toast(d["text"], d.get("kind", "info"))
		"goal_done":
			toast("목표 달성: %s  (+%s)" % [d["text"], Fmt.won(float(d["reward"]))], "star")
			_refresh_goals()
		"rank_up":
			queue_modal({"kind": "rank_up", "data": d})
		"perk_offer":
			perk_btn.visible = true
			queue_modal({"kind": "perk"})
		"synergy_found":
			var s: Dictionary = Data.synergies[d["id"]]
			banner("새로운 궁합 발견!", s["name"], s["desc"], UIKit.C_ACCENT)
			set_badge("codex", true)
		"combo":
			var c: Dictionary = Data.combos[d["id"]]
			banner("특전 조합 완성!", c["name"], c["desc"], UIKit.C_BLUE)
			Audio.play("discovery")
		"research_done":
			var pd: Dictionary = Data.products[d["pid"]]
			var where: Array = d["where"]
			banner("신상품 개발 완료!", pd["name"], ("%s에서 판매를 시작합니다." % ", ".join(where)) if not where.is_empty() else "팔 수 있는 가게를 지으면 판매를 시작합니다.", UIKit.C_GREEN)
			set_badge("research", true)
		"product_fame":
			if int(d["stage"]) >= 2:
				banner(Data.FAME_STAGE_NAMES[int(d["stage"])] + " 탄생!", Data.products[d["pid"]]["name"], "이 상품을 찾아오는 손님이 늘어납니다.", UIKit.C_GOLD)
				Audio.play("discovery")
		"trophy":
			toast("트로피 획득: %s" % d["name"], "star")
		"fame_award":
			if d.get("granted", false):
				toast("경영자 명성 +%d  (%s)" % [int(d["fame"]), d["text"]], "star")
		"eval":
			queue_modal({"kind": "eval", "data": d})
		"run_complete":
			queue_modal({"kind": "complete", "data": d})
		"event_fired":
			toast(d["text"], "star")
		"event_choice":
			queue_modal({"kind": "event_choice", "id": d["id"]})
		"staff_changed":
			pass
		"fac_blocked":
			var f: Facility = sim.fac(d["uid"])
			if f != null:
				toast("%s(으)로 가는 길이 막혔어요. 길을 터 주세요." % f.def()["name"], "advice")
		"discover":
			if d.get("new", false) and d["cat"] in ["customer", "synergy", "product", "trait", "perk", "combo"]:
				set_badge("codex", true)
		"fac_removed":
			if fac_panel != null and (fac_panel as PanelFacility).uid == int(d["uid"]):
				close_facility()
	if kind == "toast" and d.get("kind", "") == "staff":
		set_badge("staff", true)
	if panel != null:
		panel.on_sim_event(kind, d)
	if fac_panel != null:
		fac_panel.on_sim_event(kind, d)
