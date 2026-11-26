class_name PanelMenu
extends GamePanel
## 보조 메뉴: 특전, 경영 기록, 지역 정보, 설정, 저장.

func build() -> void:
	init_panel(game, sim.stop_name, "center", Vector2(240, 0))
	body.add_child(UIKit.label("%s · %s" % [sim.region["name"], sim.prog.style_name()], 12, UIKit.C_DIM))
	var items := [["경영 특전", "perk", func(): hud.open_panel("perks")], ["경영 기록 · 전국 평가", "chart", func(): hud.open_panel("records")], ["지역 정보", "expand", func(): hud.open_panel("region")], ["설정", "gear", func(): hud.open_panel("settings")]]
	for it in items:
		var b := UIKit.button(it[0], it[2], it[1])
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		body.add_child(b)
	body.add_child(UIKit.spacer(false, 4))
	var sv := UIKit.button("저장하기 (F5)", func():
		if App.save_current():
			hud.flash_saved()
			hud.toast("저장했습니다. 언제든 꺼도 됩니다.", "info"))
	sv.alignment = HORIZONTAL_ALIGNMENT_LEFT
	body.add_child(sv)
	var mm := UIKit.button("저장하고 메인 메뉴로", func(): game.save_and_exit_to_menu())
	mm.alignment = HORIZONTAL_ALIGNMENT_LEFT
	body.add_child(mm)
	var q := UIKit.button("저장하고 게임 끝내기", func():
		App.save_current()
		game.get_tree().quit())
	q.alignment = HORIZONTAL_ALIGNMENT_LEFT
	body.add_child(q)
	body.add_child(UIKit.label("게임은 1분마다, 그리고 끌 때 자동으로 저장됩니다.", 10, UIKit.C_DIM))
	if App.dev_mode:
		body.add_child(UIKit.button("개발자 도구 (F1)", func(): hud.open_panel("dev")))
