class_name PanelFacility
extends GamePanel
## 시설 정보: 기본 정보, 업그레이드 비교, 직원, 판매 상품, 이동/철거.

var uid := 0
var l_rev: Label
var l_use: Label
var up_btn: Button
var show_detail := false

func build() -> void:
	var f := game.sim.fac(uid)
	init_panel(game, f.def()["name"] if f != null else "", "right", Vector2(226, 0))
	refresh()

func _row(k: String, v: String, col: Color = UIKit.C_TEXT) -> Label:
	var h := UIKit.hbox()
	h.add_child(UIKit.label(k, 12, UIKit.C_DIM))
	h.add_child(UIKit.spacer())
	var l := UIKit.label(v, 12, col)
	h.add_child(l)
	body.add_child(h)
	return l

func refresh() -> void:
	var f := sim.fac(uid)
	UIKit.clear(body)
	if f == null:
		return
	var d: Dictionary = f.def()
	var k: String = d["kind"]
	var usable := k == "shop" or k == "free" or k == "fuel" or k == "parking"
	title_label.text = "%s  Lv.%d" % [d["name"], f.level] if usable else d["name"]
	body.add_child(UIKit.wrap_label(d["desc"], 208, 12, UIKit.C_DIM))
	if k == "deco":
		_row("분위기 효과", "주변 %d칸 +%d%%" % [int(d.get("deco_radius", Data.balance["deco_radius"])), int(float(d.get("deco", 0)) * 100)])
	if usable:
		if k != "parking":
			_row("품질", Fmt.stars(f.stars), UIKit.C_GOLD)
			_row("인기", Fmt.pct(f.appeal))
		if k == "parking":
			l_use = _row("주차 중", "")
		else:
			l_use = _row("이용 / 대기", "")
		if k == "shop" or k == "fuel" or d.get("ev", false):
			l_rev = _row("오늘 / 어제 매출", "")
		else:
			l_rev = _row("오늘 이용", "")
		if f.upkeep > 0:
			_row("하루 운영비", Fmt.won(f.upkeep))
	# 궁합
	if not f.syn.is_empty():
		var sv := UIKit.vbox(1)
		for sid in f.syn:
			var sl := UIKit.label("궁합 「%s」" % Data.synergies[sid]["name"], 12, UIKit.C_ACCENT, true)
			sl.tooltip_text = Data.synergies[sid]["desc"]
			sl.mouse_filter = Control.MOUSE_FILTER_PASS
			sv.add_child(sl)
		body.add_child(sv)
	if f.deco_bonus > 0.005:
		_row("주변 분위기", "+" + Fmt.pct(f.deco_bonus), UIKit.C_GREEN)
	if not f.reachable:
		body.add_child(UIKit.wrap_label("손님이 올 수 있는 길이 막혀 있어요!", 208, 12, UIKit.C_RED))
	# 직원
	var slots: int = int(d.get("staff", 0))
	if slots > 0:
		var box := UIKit.inset()
		var bv := UIKit.vbox(2)
		box.add_child(bv)
		var hh := UIKit.hbox()
		hh.add_child(UIKit.label("직원 %d/%d" % [f.staff_ids.size(), slots], 12, UIKit.C_TEXT, true))
		hh.add_child(UIKit.spacer())
		hh.add_child(UIKit.button("배치", func(): hud.open_panel("staff")))
		bv.add_child(hh)
		if f.staff_ids.is_empty():
			bv.add_child(UIKit.wrap_label("직원이 없어 사장님이 직접 보고 있어요. (느리고 품질이 낮음)", 196, 10, UIKit.C_DIM))
		for id in f.staff_ids:
			var e: Dictionary = sim.staff.staff.get(int(id), {})
			if not e.is_empty():
				bv.add_child(UIKit.label("%s · %s Lv.%d" % [e["name"], Data.jobs[e["job"]]["name"], e["level"]], 12))
		body.add_child(box)
	# 상품
	if k == "shop" and sim.products.slots_of(f) > 1:
		var pbox := UIKit.inset()
		var pv := UIKit.vbox(2)
		pbox.add_child(pv)
		var cands := sim.products.candidates_for(f)
		pv.add_child(UIKit.label("판매 상품 %d/%d" % [f.products.size(), sim.products.slots_of(f)], 12, UIKit.C_TEXT, true))
		for pid in cands:
			var pd: Dictionary = Data.products[pid]
			var on: bool = f.products.has(pid)
			var st := sim.products.stage(pid)
			var txt := "%s %s  %s" % ["●" if on else "○", pd["name"], Fmt.comma(int(sim.products.price(pid, f)))]
			var pb := UIKit.button(txt, func():
				if sim.products.toggle_product(f, pid):
					sim.mark_dirty()
					refresh()
				else:
					Audio.play("error"))
			pb.alignment = HORIZONTAL_ALIGNMENT_LEFT
			pb.tooltip_text = "%s · 품질 %d · 지금까지 %s개 판매\n누르면 판매 여부를 바꿉니다." % [Data.FAME_STAGE_NAMES[st], int(pd["q"]), Fmt.comma(int(sim.products.st(pid)["sold"]))]
			if st >= 1:
				pb.add_theme_color_override("font_color", UIKit.C_ACCENT)
			if not on:
				pb.modulate = Color(1, 1, 1, 0.6)
			pv.add_child(pb)
		body.add_child(pbox)
	elif k == "shop" and not f.products.is_empty():
		var pid2: String = f.products[0]
		_row("판매", "%s %s" % [Data.products[pid2]["name"], Fmt.won(sim.products.price(pid2, f))])
	# 업그레이드
	if sim.build.can_upgrade(f):
		var cur := sim.build.preview_stats(f, f.level)
		var nxt := sim.build.preview_stats(f, f.level + 1)
		var ub := UIKit.inset(Color("eaf5dc"))
		var uv := UIKit.vbox(2)
		ub.add_child(uv)
		uv.add_child(UIKit.label("다음 레벨 (Lv.%d)" % (f.level + 1), 12, UIKit.C_GREEN, true))
		var lines: Array = []
		if int(nxt["cap"]) != int(cur["cap"]):
			lines.append("%s %d → %d" % ["주차 칸" if k == "parking" else ("주유기" if k == "fuel" else "동시 이용"), cur["cap"], nxt["cap"]])
		if k != "parking":
			lines.append("응대 시간 %.1f초 → %.1f초" % [cur["time"], nxt["time"]])
			if int(nxt["stars"]) != int(cur["stars"]):
				lines.append("품질 %s → %s" % [Fmt.stars(cur["stars"]), Fmt.stars(nxt["stars"])])
			else:
				lines.append("품질 %d → %d" % [int(cur["quality"]), int(nxt["quality"])])
			lines.append("인기 %s → %s" % [Fmt.pct(cur["appeal"]), Fmt.pct(nxt["appeal"])])
		if int(nxt["tier"]) != int(cur["tier"]):
			lines.append("건물이 새 모습으로 바뀝니다!")
		for ln in lines:
			uv.add_child(UIKit.label(ln, 12))
		up_btn = UIKit.colored_button("업그레이드  %s" % Fmt.won(sim.build.upgrade_cost(f)), UIKit.C_GREEN, func():
			if sim.build.upgrade(uid):
				refresh()
				relayout()
			else:
				Audio.play("error")
				hud.toast("자금이 부족해요", "info"))
		uv.add_child(up_btn)
		body.add_child(ub)
	elif usable:
		up_btn = null
		body.add_child(UIKit.label("최고 레벨입니다", 12, UIKit.C_GOLD, true))
	# 이동 / 철거
	var bh := UIKit.hbox()
	var mv := UIKit.button("이동", func(): game.begin_move(uid), "move")
	mv.tooltip_text = "무료로 옮길 수 있습니다."
	mv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bh.add_child(mv)
	var refund := sim.build.refund_value(f)
	var rm := UIKit.button("철거", func(): hud.queue_modal({"kind": "demolish", "uid": uid}), "trash")
	rm.tooltip_text = "철거하면 %s을 돌려받습니다." % Fmt.won(refund)
	rm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bh.add_child(rm)
	body.add_child(bh)
	tick()

func tick() -> void:
	var f := sim.fac(uid)
	if f == null:
		return
	var k := f.kind()
	if l_use != null and is_instance_valid(l_use):
		if k == "parking" or k == "fuel":
			l_use.text = "%d / %d" % [f.used_slots(), f.cap]
		else:
			l_use.text = "%d/%d명 · 줄 %d명" % [f.users.size(), f.cap, f.queue.size()]
	if l_rev != null and is_instance_valid(l_rev):
		if k == "shop" or k == "fuel" or f.def().get("ev", false):
			l_rev.text = "%s / %s" % [Fmt.won_short(f.rev_today), Fmt.won_short(f.rev_yesterday)]
		else:
			l_rev.text = "%d명" % f.served_today
	if up_btn != null and is_instance_valid(up_btn):
		up_btn.modulate = Color.WHITE if sim.can_afford(sim.build.upgrade_cost(f)) else Color(1, 1, 1, 0.55)

func on_sim_event(kind: String, d: Dictionary) -> void:
	if kind in ["staff_changed", "research_done", "perk_chosen"] or (kind in ["fac_upgraded", "fac_moved"] and int(d.get("uid", 0)) == uid):
		refresh()
		relayout()
