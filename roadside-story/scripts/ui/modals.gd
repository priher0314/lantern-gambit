class_name Modals
## 게임을 잠시 멈추고 띄우는 창들. 꼭 필요한 순간에만 쓴다.

static func build(hud: Hud, m: Dictionary) -> Control:
	match m["kind"]:
		"perk": return _perk(hud)
		"rank_up": return _rank_up(hud, m["data"])
		"eval": return _eval(hud, m["data"])
		"complete": return _complete(hud, m["data"])
		"event_choice": return _event_choice(hud, m["id"])
		"welcome": return _welcome(hud)
		"plot": return _plot(hud, int(m["plot"]))
		"demolish": return _demolish(hud, int(m["uid"]))
	return null

static func _frame(title: String, w: float, color: Color = UIKit.C_BORDER) -> Array:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UIKit.box(UIKit.C_PANEL, color, 3, 10, true))
	p.custom_minimum_size = Vector2(w, 0)
	var v := UIKit.vbox(6)
	p.add_child(v)
	var t := UIKit.label(title, 15, UIKit.C_TEXT)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	return [p, v]

static func _center(c: Control) -> Control:
	var h := UIKit.hbox()
	h.alignment = BoxContainer.ALIGNMENT_CENTER
	h.add_child(c)
	return h

# ---------------------------------------------------------------- 특전 선택

static func _perk(hud: Hud) -> Control:
	var sim := hud.sim
	if not sim.perks.has_pending():
		return null
	var offer: Dictionary = sim.perks.offers[0]
	var fr := _frame("경영 특전을 하나 고르세요", 600, UIKit.C_ACCENT)
	var v: VBoxContainer = fr[1]
	var sub := UIKit.label("고른 특전은 이 휴게소에 계속 적용됩니다. 천천히 읽어 보세요.", 12, UIKit.C_DIM)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(sub)
	var h := UIKit.hbox(8)
	v.add_child(h)
	var groups := {"food": "음식", "value": "실속", "tour": "관광", "family": "가족", "premium": "프리미엄", "mixed": "복합 경영"}
	for id in offer["cands"]:
		var pk: Dictionary = Data.perks[id]
		var card := UIKit.inset(Color("fffbe8"), 8)
		card.custom_minimum_size = Vector2(188, 190)
		var cv := UIKit.vbox(5)
		card.add_child(cv)
		cv.add_child(UIKit.label(groups.get(pk["group"], ""), 10, UIKit.C_DIM))
		var nm := UIKit.label(pk["name"], 15, UIKit.C_ACCENT)
		cv.add_child(nm)
		cv.add_child(UIKit.wrap_label(pk["desc"], 170, 12))
		# 이 특전으로 가까워지는 조합
		for cid in Data.combo_order:
			var cb: Dictionary = Data.combos[cid]
			if not (cb["need"] as Array).has(id):
				continue
			var have := 0
			for n in cb["need"]:
				if sim.perks.owned.has(n):
					have += 1
			if have > 0:
				var cname: String = cb["name"] if Save.codex_has("combo", cid) else "???"
				cv.add_child(UIKit.wrap_label("조합 「%s」 %d/%d" % [cname, have + 1, cb["need"].size()], 170, 10, UIKit.C_BLUE))
		cv.add_child(UIKit.spacer())
		var pid: String = id
		cv.add_child(UIKit.colored_button("이걸로 할게요", UIKit.C_ACCENT, func():
			sim.perks.choose(pid)
			Audio.play("perk")
			hud.close_modal()
			hud.banner("특전 획득", Data.perks[pid]["name"], Data.perks[pid]["desc"], UIKit.C_ACCENT)))
		h.add_child(card)
	v.add_child(_center(UIKit.button("나중에 고르기", func(): hud.close_modal())))
	return fr[0]

# ---------------------------------------------------------------- 등급 상승

static func _rank_up(hud: Hud, d: Dictionary) -> Control:
	var rd := Data.rank_def(int(d["rank"]))
	var fr := _frame("경영 등급 상승!", 400, UIKit.C_GOLD)
	var v: VBoxContainer = fr[1]
	var nm := UIKit.label("「%s」" % rd["name"], 24, UIKit.C_ACCENT, true)
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(nm)
	if float(d["bonus"]) > 0.0:
		var b := UIKit.label("축하금 %s" % Fmt.won(float(d["bonus"])), 12, UIKit.C_GREEN, true)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(b)
	var facs: Array = d["facilities"]
	if not facs.is_empty():
		v.add_child(UIKit.label("새로 지을 수 있는 시설", 12, UIKit.C_DIM))
		var fl := HFlowContainer.new()
		fl.alignment = FlowContainer.ALIGNMENT_CENTER
		for fid in facs:
			var c := UIKit.vbox(1)
			c.add_child(UIKit.tex_rect(UIKit.building_tex(fid, 0), Vector2(72, 50)))
			var l := UIKit.label(Data.facilities[fid]["name"], 10)
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			c.add_child(l)
			fl.add_child(c)
		v.add_child(fl)
	var ings: Array = d["ingredients"]
	if not ings.is_empty():
		var il := UIKit.label("새 연구 재료: " + ", ".join(ings.map(func(x): return Data.ingredients[x]["name"])), 12)
		il.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(il)
	if (Data.balance["perk_ranks"] as Array).has(float(d["rank"])):
		var pl := UIKit.label("경영 특전을 하나 고를 수 있습니다!", 12, UIKit.C_ACCENT, true)
		pl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(pl)
	v.add_child(_center(UIKit.colored_button("좋아요!", UIKit.C_GREEN, func(): hud.close_modal())))
	return fr[0]

# ---------------------------------------------------------------- 전국 평가

static func _eval(hud: Hud, d: Dictionary) -> Control:
	var fr := _frame("%d년차 전국 휴게소 평가" % int(d["year"]), 520, UIKit.C_BLUE)
	var v: VBoxContainer = fr[1]
	var h := UIKit.hbox(6)
	v.add_child(h)
	var ov: Dictionary = d["cats"]["overall"]
	var left := UIKit.inset(Color("fffbe8"), 6)
	left.custom_minimum_size = Vector2(230, 0)
	var lv := UIKit.vbox(2)
	left.add_child(lv)
	lv.add_child(UIKit.label("종합 순위", 12, UIKit.C_TEXT, true))
	var i := 1
	for row in ov["table"]:
		var hh := UIKit.hbox()
		var col: Color = UIKit.C_ACCENT if row["me"] else UIKit.C_TEXT
		hh.add_child(UIKit.label("%d위  %s" % [i, row["name"]], 12, col, row["me"]))
		hh.add_child(UIKit.spacer())
		hh.add_child(UIKit.label("%d점" % int(row["score"]), 12, col))
		lv.add_child(hh)
		i += 1
	if int(ov["pos"]) > 5:
		lv.add_child(UIKit.label("…", 12, UIKit.C_DIM))
		lv.add_child(UIKit.label("%d위  %s  (%d점)" % [int(ov["pos"]), hud.sim.stop_name, int(ov["score"])], 12, UIKit.C_ACCENT, true))
	h.add_child(left)
	var right := UIKit.vbox(4)
	right.custom_minimum_size = Vector2(250, 0)
	right.add_child(UIKit.label("분야별 성적", 12, UIKit.C_TEXT, true))
	for cat in ["food", "tour", "service", "value"]:
		var c: Dictionary = d["cats"][cat]
		var hh2 := UIKit.hbox(6)
		var nl := UIKit.label(ProgressionSystem.EVAL_NAMES[cat], 12)
		nl.custom_minimum_size.x = 44
		hh2.add_child(nl)
		hh2.add_child(UIKit.progress(float(c["score"]) / 100.0, UIKit.C_GOLD if int(c["pos"]) == 1 else UIKit.C_BLUE, 8, 110))
		hh2.add_child(UIKit.label("%d위" % int(c["pos"]), 12, UIKit.C_ACCENT if int(c["pos"]) <= 3 else UIKit.C_TEXT, int(c["pos"]) <= 3))
		right.add_child(hh2)
	right.add_child(UIKit.label("상금 %s" % Fmt.won(float(d["prize"])), 12, UIKit.C_GREEN, true))
	right.add_child(UIKit.wrap_label("종합 1위가 아니어도 괜찮아요. 한 분야에서 1위를 해도 회차 목표를 이룬 것으로 칩니다.", 250, 10, UIKit.C_DIM))
	h.add_child(right)
	v.add_child(_center(UIKit.colored_button("확인", UIKit.C_BLUE, func(): hud.close_modal())))
	return fr[0]

# ---------------------------------------------------------------- 회차 목표 달성

static func _complete(hud: Hud, d: Dictionary) -> Control:
	var sim := hud.sim
	var fr := _frame("회차 목표 달성!", 440, UIKit.C_GOLD)
	var v: VBoxContainer = fr[1]
	var r := UIKit.label(d["reason"], 24, UIKit.C_ACCENT, true)
	r.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	r.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	r.custom_minimum_size.x = 420
	v.add_child(r)
	var lines := [
		"%s · %s · %d년차" % [sim.stop_name, sim.prog.style_name(), sim.year()],
		"누적 손님 %s명 · 총매출 %s" % [Fmt.comma(sim.prog.visitors), Fmt.won_short(sim.econ.total_rev)],
		"발견한 궁합 %d개 · 특전 %d개" % [sim.synergy.discovered.size(), sim.perks.owned.size()],
	]
	for ln in lines:
		var l := UIKit.label(ln, 12)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(l)
	var t := UIKit.wrap_label("이 휴게소는 사라지지 않습니다. 계속 키워도 되고, 메인 메뉴에서 다른 지역·다른 전략으로 새 휴게소를 열어도 됩니다. 얻은 경영자 명성으로 새 지역과 특전을 해금해 보세요.", 420, 12, UIKit.C_DIM)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	v.add_child(_center(UIKit.colored_button("계속 경영하기", UIKit.C_GREEN, func(): hud.close_modal())))
	return fr[0]

# ---------------------------------------------------------------- 선택형 이벤트

static func _event_choice(hud: Hud, id: String) -> Control:
	var e: Dictionary = Data.events[id]
	var fr := _frame(e["name"], 380)
	var v: VBoxContainer = fr[1]
	var cost := 0.0
	for o in e["options"]:
		cost = maxf(cost, float(o.get("cost", 0)))
	var t := UIKit.wrap_label(String(e["text"]).replace("{cost}", Fmt.won(cost)), 360, 12)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var h := UIKit.hbox(8)
	h.alignment = BoxContainer.ALIGNMENT_CENTER
	for i in (e["options"] as Array).size():
		var o: Dictionary = e["options"][i]
		var idx: int = i
		var b := UIKit.button(o["label"], func():
			hud.sim.events.choose(idx)
			hud.close_modal())
		if float(o.get("cost", 0)) > hud.sim.money:
			b.disabled = true
			b.tooltip_text = "자금이 부족합니다."
		h.add_child(b)
	v.add_child(h)
	return fr[0]

# ---------------------------------------------------------------- 복귀 요약

static func _welcome(hud: Hud) -> Control:
	var sim := hud.sim
	var fr := _frame("다시 오셨군요!", 380)
	var v: VBoxContainer = fr[1]
	var head := UIKit.label("%s · %s · %s" % [sim.stop_name, Data.rank_def(sim.prog.rank)["name"], sim.date_text()], 12, UIKit.C_ACCENT, true)
	head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(head)
	var lines: Array = []
	if sim.last_action != "":
		lines.append("지난번 마지막으로 한 일: %s" % sim.last_action)
	if not sim.products.current.is_empty():
		lines.append("연구 진행 중: %d%%" % int(sim.products.progress() * 100))
	elif sim.products.open_recipes() > 0:
		lines.append("연구할 수 있는 새 상품이 %d가지 있어요" % sim.products.open_recipes())
	var can_up := 0
	for f in sim.facilities.values():
		if sim.build.can_upgrade(f) and sim.can_afford(sim.build.upgrade_cost(f)):
			can_up += 1
	if can_up > 0:
		lines.append("지금 업그레이드할 수 있는 시설: %d곳" % can_up)
	if sim.perks.has_pending():
		lines.append("아직 고르지 않은 특전이 있어요")
	for g in sim.prog.goals().slice(0, 2):
		lines.append("목표: %s" % g["text"])
	for ln in lines:
		v.add_child(UIKit.wrap_label("· " + ln, 356, 12))
	v.add_child(UIKit.label("게임을 꺼 둔 동안에는 시간이 흐르지 않았습니다.", 10, UIKit.C_DIM))
	v.add_child(_center(UIKit.colored_button("이어서 하기", UIKit.C_GREEN, func(): hud.close_modal())))
	return fr[0]

# ---------------------------------------------------------------- 부지 / 철거 확인

static func _plot(hud: Hud, i: int) -> Control:
	var sim := hud.sim
	var cost := sim.build.plot_cost(i)
	var r: Array = sim.region["plots"][i]["rect"]
	var fr := _frame("부지 확장", 320)
	var v: VBoxContainer = fr[1]
	var t := UIKit.label("이 땅(%d칸×%d칸)을 %s에 살까요?" % [int(r[2]), int(r[3]), Fmt.won(cost)], 12)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var h := UIKit.hbox(8)
	h.alignment = BoxContainer.ALIGNMENT_CENTER
	var ok := UIKit.colored_button("구매", UIKit.C_GREEN, func():
		if not sim.build.buy_plot(i):
			Audio.play("error")
			hud.toast("자금이 부족해요", "info")
		hud.close_modal())
	ok.disabled = not sim.can_afford(cost)
	h.add_child(ok)
	h.add_child(UIKit.button("취소", func(): hud.close_modal()))
	v.add_child(h)
	if not sim.can_afford(cost):
		var n := UIKit.label("자금이 %s 모자랍니다." % Fmt.won(cost - sim.money), 12, UIKit.C_RED)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(n)
	return fr[0]

static func _demolish(hud: Hud, uid: int) -> Control:
	var sim := hud.sim
	var f := sim.fac(uid)
	if f == null:
		return null
	var fr := _frame("철거", 320)
	var v: VBoxContainer = fr[1]
	var full: bool = sim.time / sim.day_len() - f.built_day <= float(Data.balance["undo_window_days"])
	var t := UIKit.wrap_label("%s을(를) 철거할까요?\n%s을 돌려받습니다.%s" % [f.def()["name"], Fmt.won(sim.build.refund_value(f)), " (방금 지어서 전액 환급)" if full else ""], 300, 12)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var tip := UIKit.label("자리만 바꾸려면 [이동]이 무료입니다.", 10, UIKit.C_DIM)
	tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(tip)
	var h := UIKit.hbox(8)
	h.alignment = BoxContainer.ALIGNMENT_CENTER
	h.add_child(UIKit.colored_button("철거", UIKit.C_RED, func():
		hud.close_facility()
		sim.build.demolish(uid)
		hud.close_modal()))
	h.add_child(UIKit.button("취소", func(): hud.close_modal()))
	v.add_child(h)
	return fr[0]
