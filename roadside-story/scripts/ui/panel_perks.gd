class_name PanelPerks
extends GamePanel
## 지금 가진 경영 특전과 조합 진행 상황.

func build() -> void:
	init_panel(game, "경영 특전", "center", Vector2(520, 0))
	if sim.perks.owned.is_empty():
		body.add_child(UIKit.wrap_label("아직 특전이 없습니다. 경영 등급이 오르면 세 가지 후보 중 하나를 고를 수 있습니다.", 500, 12, UIKit.C_DIM))
	for id in sim.perks.owned:
		var pk: Dictionary = Data.perks[id]
		var row := UIKit.inset(Color("fffbe8"), 5)
		var v := UIKit.vbox(1)
		row.add_child(v)
		v.add_child(UIKit.label(pk["name"], 12, UIKit.C_ACCENT, true))
		v.add_child(UIKit.wrap_label(pk["desc"], 490, 12))
		body.add_child(row)
	if sim.perks.has_pending():
		body.add_child(UIKit.colored_button("고르지 않은 특전이 있습니다 — 지금 고르기", UIKit.C_ACCENT, func():
			hud.close_panel(self)
			hud.queue_modal({"kind": "perk"})))
	body.add_child(UIKit.label("특전 조합", 12, UIKit.C_TEXT, true))
	var any := false
	for cid in Data.combo_order:
		var cb: Dictionary = Data.combos[cid]
		var have := 0
		for n in cb["need"]:
			if sim.perks.owned.has(n):
				have += 1
		if have == 0:
			continue
		any = true
		var done: bool = sim.perks.combos.has(cid)
		var names: Array = (cb["need"] as Array).map(func(x): return ("✔" if sim.perks.owned.has(x) else "□") + Data.perks[x]["name"])
		var row2 := UIKit.inset(Color("e3efff") if done else UIKit.C_PANEL2, 5)
		var v2 := UIKit.vbox(1)
		row2.add_child(v2)
		v2.add_child(UIKit.label(("완성! 「%s」" % cb["name"]) if done else ("「%s」 %d/%d" % [cb["name"] if Save.codex_has("combo", cid) else "???", have, cb["need"].size()]), 12, UIKit.C_BLUE if done else UIKit.C_TEXT, true))
		v2.add_child(UIKit.label("  ".join(names), 10, UIKit.C_DIM))
		if done:
			v2.add_child(UIKit.wrap_label(cb["desc"], 490, 12))
		body.add_child(row2)
	if not any:
		body.add_child(UIKit.wrap_label("서로 어울리는 특전을 모으면 조합이 완성되어 추가 효과가 생깁니다.", 500, 12, UIKit.C_DIM))
