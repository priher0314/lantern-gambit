class_name PanelSettings
extends GamePanel

func build() -> void:
	init_panel(game, "설정", "center", Vector2(320, 0))
	body.add_child(SettingsView.new())
