class_name PanelResearch
extends GamePanel
## 상품 연구: 재료 두 가지를 고르면 결과를 미리 알려 주고, 연구를 시작한다.

var picked: Array = []
var ing_box: GridContainer
var result_box: VBoxContainer
var prod_list: VBoxContainer
var pb: ProgressBar
var l_prog: Label

func build() -> void:
	init_panel(game, "상품 연구", "center", Vector2(600, 0))
	var h := UIKit.hbox(8)
	body.add_child(h)
	var left := UIKit.vbox(5)
	h.add_child(left)
	left.add_child(UIKit.label("재료 두 가지를 골라 보세요", 12, UIKit.C_DIM))
	ing_box = GridContainer.new()
	ing_box.columns = 4
	left.add_child(ing_box)
	var rb := UIKit.inset(Color("fffbe8"), 6)
	rb.custom_minimum_size = Vector2(300, 128)
	result_box = UIKit.vbox(4)
	rb.add_child(result_box)
	left.add_child(rb)
	var right := UIKit.vbox(4)
	h.add_child(right)
	right.add_child(UIKit.label("개발한 상품", 12, UIKit.C_TEXT, true))
	var sc := UIKit.scroll(Vector2(270, 270))
	right.add_child(sc)
	prod_list = UIKit.vbox(2)
	prod_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(prod_list)
	refresh()

func refresh() -> void:
	UIKit.clear(ing_box)
	for ing in Data.ingredient_order:
		var d: Dictionary = Data.ingredients[ing]
		var ok := sim.products.ingredient_unlocked(ing)
		var b := UIKit.button(d["name"] if ok else "???", func():
			if picked.has(ing):
				picked.erase(ing)
			else:
				if picked.size() >= 2:
					picked.pop_front()
				picked.append(ing)
			refresh())
		b.custom_minimum_size = Vector2(72, 26)
		b.disabled = not ok
		if not ok:
			b.tooltip_text = "「%s」이 되면 쓸 수 있습니다." % Data.rank_def(int(d["rank"]))["name"]
		if picked.has(ing):
			b.add_theme_stylebox_override("normal", UIKit.box(Color("ffd98a"), UIKit.C_ACCENT, 2, 4))
			b.add_theme_stylebox_override("hover", UIKit.box(Color("ffd98a"), UIKit.C_ACCENT, 2, 4))
		elif picked.size() == 1 and ok:
			# 하나 골랐을 때, 같이 쓰면 새 상품이 나오는 재료를 살짝 표시
			var info := sim.products.combo_info(picked[0], ing)
			if info["state"] == "new":
				b.add_theme_color_override("font_color", UIKit.C_GREEN)
				b.text = d["name"] + " ♪"
			elif info["state"] == "done":
				b.add_theme_color_override("font_color", UIKit.C_DIM)
		ing_box.add_child(b)
	_refresh_result()
	_refresh_products()

func _refresh_result() -> void:
	UIKit.clear(result_box)
	pb = null
	l_prog = null
	if not sim.products.current.is_empty():
		var pid: String = sim.products.current["pid"]
		result_box.add_child(UIKit.label("연구 중…", 12, UIKit.C_ACCENT, true))
		var r: Array = Data.products[pid]["recipe"]
		result_box.add_child(UIKit.label("%s + %s 로 신상품을 만들고 있어요." % [Data.ingredients[r[0]]["name"], Data.ingredients[r[1]]["name"]], 12))
		pb = UIKit.progress(sim.products.progress(), UIKit.C_GREEN, 10, 280)
		result_box.add_child(pb)
		l_prog = UIKit.label("", 10, UIKit.C_DIM)
		result_box.add_child(l_prog)
		tick()
		return
	if picked.size() < 2:
		result_box.add_child(UIKit.wrap_label("재료를 하나 고르면, 함께 쓸 때 새 상품이 나오는 재료에 ♪ 표시가 붙습니다.", 280, 12, UIKit.C_DIM))
		result_box.add_child(UIKit.label("만들 수 있는 새 상품: %d가지" % sim.products.open_recipes(), 12))
		return
	var info := sim.products.combo_info(picked[0], picked[1])
	var na: String = Data.ingredients[picked[0]]["name"]
	var nb: String = Data.ingredients[picked[1]]["name"]
	result_box.add_child(UIKit.label("%s + %s" % [na, nb], 12, UIKit.C_TEXT, true))
	match info["state"]:
		"none":
			result_box.add_child(UIKit.wrap_label("이 둘로는 마땅히 만들 게 없어 보여요.", 280, 12, UIKit.C_DIM))
		"done":
			result_box.add_child(UIKit.wrap_label("이미 개발했어요: %s" % Data.products[info["pid"]]["name"], 280, 12, UIKit.C_DIM))
		"new":
			var pd: Dictionary = Data.products[info["pid"]]
			var where: Array = []
			var have := false
			for fid in pd["at"]:
				where.append(Data.facilities[fid]["name"])
				if sim.has_fac(fid):
					have = true
			result_box.add_child(UIKit.wrap_label("새로운 맛이 나올 것 같아요!  (%s용)" % ", ".join(where), 280, 12, UIKit.C_GREEN))
			if not have:
				result_box.add_child(UIKit.wrap_label("아직 팔 수 있는 가게가 없어요. 가게를 지으면 자동으로 판매됩니다.", 280, 10, UIKit.C_RED))
			result_box.add_child(UIKit.label("연구비 %s · 약 %.1f일" % [Fmt.won(float(info["cost"])), float(info["days"])], 12))
			var b := UIKit.colored_button("연구 시작", UIKit.C_GREEN, func():
				var res := sim.products.start_research(picked[0], picked[1])
				if res["ok"]:
					picked.clear()
					Audio.play("build")
					refresh()
				else:
					Audio.play("error")
					hud.toast(res["reason"], "info"))
			result_box.add_child(b)

func _refresh_products() -> void:
	UIKit.clear(prod_list)
	var ids: Array = []
	for pid in sim.products.developed:
		if Data.products[pid].get("need", "") != "fuel":
			ids.append(pid)
	ids.sort_custom(func(a, b): return float(sim.products.st(a)["fame"]) > float(sim.products.st(b)["fame"]))
	for pid in ids:
		var pd: Dictionary = Data.products[pid]
		var st := sim.products.stage(pid)
		var row := UIKit.inset(UIKit.C_PANEL2, 3)
		var v := UIKit.vbox(1)
		row.add_child(v)
		var h := UIKit.hbox()
		h.add_child(UIKit.label(pd["name"], 12, UIKit.C_TEXT, pd.has("recipe")))
		h.add_child(UIKit.spacer())
		h.add_child(UIKit.label(Data.FAME_STAGE_NAMES[st], 10, UIKit.C_ACCENT if st > 0 else UIKit.C_DIM))
		v.add_child(h)
		var h2 := UIKit.hbox()
		var where: Array = []
		for fid in pd["at"]:
			if sim.has_fac(fid):
				where.append(Data.facilities[fid]["name"])
		h2.add_child(UIKit.label("%s · %s개 판매%s" % [Fmt.won(float(pd["price"])), Fmt.comma(int(sim.products.st(pid)["sold"])), "" if not where.is_empty() else " · 파는 곳 없음"], 10, UIKit.C_DIM))
		h2.add_child(UIKit.spacer())
		h2.add_child(UIKit.progress(sim.products.stage_progress(pid), UIKit.C_GOLD, 5, 50))
		v.add_child(h2)
		row.tooltip_text = "품질 %d · 추천 판매처: %s%s" % [int(pd["q"]), ", ".join(pd["at"].map(func(x): return Data.facilities[x]["name"])), ("\n제철: " + Data.SEASON_NAMES[pd["season"]]) if pd.has("season") else ""]
		prod_list.add_child(row)

func tick() -> void:
	if pb != null and is_instance_valid(pb) and not sim.products.current.is_empty():
		pb.value = sim.products.progress()
		l_prog.text = "남은 시간 약 %.1f일" % (float(sim.products.current["left"]) / sim.day_len())

func on_sim_event(kind: String, _d: Dictionary) -> void:
	if kind in ["research_done", "rank_up"]:
		refresh()
