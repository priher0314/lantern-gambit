class_name PanelRegion
extends GamePanel

func build() -> void:
	var r: Dictionary = sim.region
	init_panel(game, "지역 정보: " + r["name"], "center", Vector2(420, 0))
	body.add_child(UIKit.wrap_label(r["desc"], 400, 12))
	for tip in r["tips"]:
		body.add_child(UIKit.label("· " + tip, 12, UIKit.C_ACCENT))
	var s: Dictionary = r["season"]
	var parts: Array = []
	for k in ["spring", "summer", "fall", "winter"]:
		parts.append("%s %s" % [Data.SEASON_NAMES[k], Fmt.pct(float(s[k]))])
	body.add_child(UIKit.label("계절별 통행량: " + "  ".join(parts), 12))
	body.add_child(UIKit.label("지금은 %s입니다." % Data.SEASON_NAMES[sim.season()], 12, UIKit.C_DIM))
	if not sim.challenge.is_empty():
		var c := UIKit.inset(Color("ffe3dc"), 5)
		var v := UIKit.vbox(2)
		c.add_child(v)
		v.add_child(UIKit.label("도전: " + sim.challenge["name"], 12, UIKit.C_RED, true))
		v.add_child(UIKit.wrap_label(sim.challenge["desc"], 390, 12))
		for rule in sim.challenge["rules"]:
			v.add_child(UIKit.label("· " + rule, 12))
		body.add_child(c)
	var plots: Array = r["plots"]
	var left := 0
	for i in plots.size():
		if not sim.grid.owned_plots.has(i):
			left += 1
	body.add_child(UIKit.label("넓힐 수 있는 부지: %d곳 (맵에서 '확장' 표시가 있는 땅을 누르세요)" % left, 12, UIKit.C_DIM))
