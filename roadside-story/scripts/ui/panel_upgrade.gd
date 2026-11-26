class_name PanelUpgrade
extends GamePanel
## 업그레이드 목록: 지금 올릴 수 있는 시설을 한눈에 보고 바로 올린다.

var list: VBoxContainer

func build() -> void:
	init_panel(game, "업그레이드", "center", Vector2(430, 0))
	body.add_child(UIKit.label("시설을 키우면 손님을 더 많이, 더 빨리 받고 품질과 인기가 오릅니다.", 12, UIKit.C_DIM))
	var sc := UIKit.scroll(Vector2(430, 300))
	body.add_child(sc)
	list = UIKit.vbox(3)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(list)
	refresh()

func refresh() -> void:
	UIKit.clear(list)
	var facs: Array = []
	for f in sim.facilities.values():
		if sim.build.can_upgrade(f):
			facs.append(f)
	facs.sort_custom(func(a, b): return sim.build.upgrade_cost(a) < sim.build.upgrade_cost(b))
	if facs.is_empty():
		list.add_child(UIKit.label("업그레이드할 시설이 없습니다.", 12, UIKit.C_DIM))
		return
	for f in facs:
		var row := UIKit.inset()
		var h := UIKit.hbox(6)
		row.add_child(h)
		h.add_child(UIKit.tex_rect(UIKit.building_tex(f.id, f.tier()), Vector2(44, 34)))
		var v := UIKit.vbox(1)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_child(UIKit.label("%s  Lv.%d → %d" % [f.def()["name"], f.level, f.level + 1], 12, UIKit.C_TEXT, true))
		var sub := "어제 매출 %s" % Fmt.won_short(f.rev_yesterday) if f.kind() != "parking" and f.kind() != "free" else ""
		if f.queue.size() >= 3:
			sub += ("  " if sub != "" else "") + "줄이 길어요!"
		var nt: int = sim.build.preview_stats(f, f.level + 1)["tier"]
		if nt != f.tier():
			sub += ("  " if sub != "" else "") + "새 모습!"
		v.add_child(UIKit.label(sub, 10, UIKit.C_DIM))
		h.add_child(v)
		var uid: int = f.uid
		h.add_child(UIKit.button("보기", func():
			game.focus_on(f.center())
			game.select(uid)))
		var cost := sim.build.upgrade_cost(f)
		var b := UIKit.colored_button(Fmt.won(cost), UIKit.C_GREEN if sim.can_afford(cost) else Color("a89a86"), func():
			if sim.build.upgrade(uid):
				refresh()
			else:
				Audio.play("error"))
		b.custom_minimum_size.x = 96
		h.add_child(b)
		list.add_child(row)

func on_sim_event(kind: String, _d: Dictionary) -> void:
	if kind in ["fac_added", "fac_removed", "new_day"]:
		refresh()
