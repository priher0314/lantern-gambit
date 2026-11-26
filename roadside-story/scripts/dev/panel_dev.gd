class_name PanelDev
extends GamePanel
## 개발자 도구. 디버그 빌드에서만 열린다 (출시 빌드에서는 App.dev_mode 가 false).

func build() -> void:
	init_panel(game, "개발자 도구", "center", Vector2(420, 0))
	var g := GridContainer.new()
	g.columns = 3
	body.add_child(g)
	var acts := [
		["자금 +100만", func(): sim.earn(1000000.0)],
		["등급 +1", func(): sim.prog.set_rank(sim.prog.rank + 1)],
		["명성 +1000", func(): sim.prog.add_reputation(1000.0)],
		["손님 차 5대", func():
			for i in 5:
				sim.cust._spawn_arrival()],
		["연구 즉시 완료", func(): sim.products.complete_research()],
		["하루 빨리감기", func():
			for i in int(sim.day_len() / 0.1):
				sim.step(0.1)],
		["한 달 빨리감기", func():
			for i in int(sim.day_len() * 5 / 0.1):
				sim.step(0.1)],
		["1년 빨리감기", func():
			for i in int(sim.day_len() * 60 / 0.1):
				sim.step(0.1)],
		["전국 평가 실행", func(): sim.prog.run_eval()],
		["관광버스", func(): sim.events.trigger("tour_bus")],
		["먹거리 대회", func(): sim.events.trigger("food_contest")],
		["특전 후보 받기", func():
			sim.perks.offered_ranks.erase(99)
			sim.perks.grant_offer(99)],
		["지원자 새로고침", func(): sim.staff.refresh_candidates()],
		["경영자 명성 +5", func():
			Save.profile["fame"] = int(Save.profile["fame"]) + 5
			Save.save_profile()],
		["궁합 범위 표시", func():
			game.world.show_ranges = not game.world.show_ranges],
	]
	for a in acts:
		g.add_child(UIKit.button(a[0], a[1]))
	body.add_child(UIKit.label("특전 바로 지급", 12, UIKit.C_DIM))
	var fl := HFlowContainer.new()
	fl.custom_minimum_size.x = 400
	for id in Data.perk_order:
		if not sim.perks.owned.has(id):
			var pid: String = id
			fl.add_child(UIKit.button(Data.perks[id]["name"], func(): sim.perks.grant(pid)))
	body.add_child(fl)
	body.add_child(UIKit.label("시드 %d · 유입 %.2f대/초 · 정차율 %.0f%% · 끌림 %.0f · 시설 %d · 손님 %d" % [sim.seed_value, sim.cust.arrival_rate(), sim.cust.stop_fraction() * 100.0, sim.draw_total, sim.facilities.size(), sim.cust.count()], 10, UIKit.C_DIM))
