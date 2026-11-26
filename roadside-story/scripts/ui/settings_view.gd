class_name SettingsView
extends VBoxContainer
## 설정: 볼륨, 화면 배율, 전체 화면. 메인 메뉴와 게임 안에서 같이 쓴다.

func _init() -> void:
	add_theme_constant_override("separation", 6)
	var s: Dictionary = Save.profile["settings"]
	for it in [["music", "배경음악"], ["sfx", "효과음"], ["amb", "환경음"]]:
		var h := UIKit.hbox(8)
		var l := UIKit.label(it[1], 12)
		l.custom_minimum_size.x = 70
		h.add_child(l)
		var sl := HSlider.new()
		sl.min_value = 0.0
		sl.max_value = 1.0
		sl.step = 0.05
		sl.value = float(s[it[0]])
		sl.custom_minimum_size = Vector2(170, 14)
		sl.focus_mode = Control.FOCUS_NONE
		var key: String = it[0]
		sl.value_changed.connect(func(v: float):
			s[key] = v
			Audio.apply_volumes(s)
			if key == "sfx":
				Audio.play("sale"))
		sl.drag_ended.connect(func(_c): Save.save_profile())
		h.add_child(sl)
		add_child(h)
	var h2 := UIKit.hbox(4)
	var l2 := UIKit.label("화면 배율", 12)
	l2.custom_minimum_size.x = 70
	h2.add_child(l2)
	for v in [0, 1, 2, 3, 4]:
		var b := UIKit.button("자동" if v == 0 else "%d배" % v, func():
			s["ui_scale"] = v
			Save.save_profile()
			App.apply_scale())
		h2.add_child(b)
	add_child(h2)
	var fs := UIKit.button("전체 화면: %s" % ("켜짐" if s["fullscreen"] else "꺼짐"))
	fs.pressed.connect(func():
		Audio.play("click")
		s["fullscreen"] = not s["fullscreen"]
		fs.text = "전체 화면: %s" % ("켜짐" if s["fullscreen"] else "꺼짐")
		Save.save_profile()
		App.apply_settings())
	add_child(fs)
	add_child(UIKit.wrap_label("조작: 왼쪽 드래그·WASD 화면 이동 / 휠 확대·축소 / 스페이스 일시정지 / 1·2·3 배속 / B 건설 / R 회전 / ESC 취소·메뉴", 300, 10, UIKit.C_DIM))
