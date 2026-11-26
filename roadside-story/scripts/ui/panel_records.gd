class_name PanelRecords
extends GamePanel
## 경영 기록: 어제 결산, 누적, 손님 구성, 전국 평가 기록.

func build() -> void:
	init_panel(game, "경영 기록", "center", Vector2(560, 0))
	var h := UIKit.hbox(8)
	body.add_child(h)
	var a := UIKit.inset(UIKit.C_PANEL2, 6)
	a.custom_minimum_size = Vector2(268, 0)
	var av := UIKit.vbox(2)
	a.add_child(av)
	av.add_child(UIKit.label("어제 결산", 12, UIKit.C_TEXT, true))
	var e := sim.econ
	if e.history.is_empty():
		av.add_child(UIKit.label("아직 하루가 지나지 않았습니다.", 12, UIKit.C_DIM))
	else:
		var d: Dictionary = e.history[-1]
		for row in [["매출", d["rev"], UIKit.C_TEXT], ["재료비", -float(d["cogs"]), UIKit.C_DIM], ["시설 운영비", -float(d["upkeep"]), UIKit.C_DIM], ["직원 급여", -float(d["wages"]), UIKit.C_DIM], ["순이익", d["net"], UIKit.C_GREEN if float(d["net"]) >= 0 else UIKit.C_RED]]:
			av.add_child(_kv(row[0], Fmt.won(float(row[1])), row[2]))
		av.add_child(_kv("손님", "%d명" % int(d["visitors"])))
		if int(d["missed"]) > 0:
			av.add_child(_kv("주차 못 해 지나간 차", "%d대" % int(d["missed"]), UIKit.C_RED))
	av.add_child(UIKit.spacer(false, 4))
	av.add_child(UIKit.label("누적", 12, UIKit.C_TEXT, true))
	av.add_child(_kv("총매출", Fmt.won(e.total_rev)))
	av.add_child(_kv("총 손님", "%s명" % Fmt.comma(sim.prog.visitors)))
	av.add_child(_kv("명성", Fmt.comma(int(sim.prog.reputation))))
	av.add_child(_kv("발견한 궁합", "%d개" % sim.synergy.discovered.size()))
	av.add_child(_kv("경영 스타일", sim.prog.style_name()))
	h.add_child(a)
	var b := UIKit.inset(UIKit.C_PANEL2, 6)
	b.custom_minimum_size = Vector2(268, 0)
	var bv := UIKit.vbox(2)
	b.add_child(bv)
	bv.add_child(UIKit.label("찾아온 손님", 12, UIKit.C_TEXT, true))
	var total := 0
	for k in e.type_counts:
		total += int(e.type_counts[k])
	var keys: Array = e.type_counts.keys()
	keys.sort_custom(func(x, y): return int(e.type_counts[x]) > int(e.type_counts[y]))
	for k in keys.slice(0, 7):
		var hh := UIKit.hbox()
		hh.add_child(UIKit.label(Data.customer_types[k]["name"], 12))
		hh.add_child(UIKit.spacer())
		hh.add_child(UIKit.progress(float(e.type_counts[k]) / maxf(1.0, total), UIKit.C_BLUE, 7, 80))
		hh.add_child(UIKit.label(Fmt.pct(float(e.type_counts[k]) / maxf(1.0, total)), 10, UIKit.C_DIM))
		bv.add_child(hh)
	bv.add_child(UIKit.spacer(false, 4))
	bv.add_child(UIKit.label("전국 휴게소 평가", 12, UIKit.C_TEXT, true))
	bv.add_child(UIKit.label("다음 평가까지 %d일 (해마다 한 번)" % (sim.prog.next_eval_day - sim.day()), 10, UIKit.C_DIM))
	if sim.prog.eval_history.is_empty():
		bv.add_child(UIKit.wrap_label("음식·관광·서비스·실속·종합 다섯 분야에서 가상의 경쟁 휴게소들과 겨룹니다.", 250, 12, UIKit.C_DIM))
	else:
		for ev in sim.prog.eval_history.slice(-4):
			var pos: Dictionary = ev["pos"]
			bv.add_child(UIKit.label("%d년차: 종합 %d위 · 음식 %d · 관광 %d · 서비스 %d · 실속 %d" % [ev["year"], pos["overall"], pos["food"], pos["tour"], pos["service"], pos["value"]], 10))
	if sim.prog.run_complete:
		bv.add_child(UIKit.label("회차 목표 달성: %s" % sim.prog.complete_reason, 12, UIKit.C_GOLD, true))
	h.add_child(b)

func _kv(k: String, v: String, col: Color = UIKit.C_TEXT) -> Control:
	var h := UIKit.hbox()
	h.add_child(UIKit.label(k, 12, UIKit.C_DIM))
	h.add_child(UIKit.spacer())
	h.add_child(UIKit.label(v, 12, col))
	return h
