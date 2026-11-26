class_name PanelCodex
extends GamePanel

func build() -> void:
	init_panel(game, "도감", "center", Vector2(620, 0))
	body.add_child(CodexView.new(608, 270))
