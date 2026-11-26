class_name GamePanel
extends PanelContainer
## 게임 화면 안의 창 하나. dock: bottom(하단 메뉴 위) / right(오른쪽) / center(가운데)

var game: Game
var hud: Hud
var sim: Sim
var body: VBoxContainer
var head: HBoxContainer
var title_label: Label
var dock := "center"
var panel_id := ""

func init_panel(g: Game, title: String, p_dock: String, min_size: Vector2) -> void:
	game = g
	hud = g.hud
	sim = g.sim
	dock = p_dock
	add_theme_stylebox_override("panel", UIKit.box(UIKit.C_PANEL, UIKit.C_BORDER, 2, 6, true))
	custom_minimum_size = min_size
	var v := UIKit.vbox(5)
	add_child(v)
	head = UIKit.hbox()
	title_label = UIKit.label(title, 12, UIKit.C_TEXT, true)
	head.add_child(title_label)
	head.add_child(UIKit.spacer())
	head.add_child(UIKit.button("닫기", func(): hud.close_panel(self)))
	v.add_child(head)
	body = UIKit.vbox(5)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(body)

## 내용 전체를 다시 만든다
func refresh() -> void:
	pass

## 0.5초마다 불린다. 숫자만 바뀌는 부분을 갱신할 때 쓴다.
func tick() -> void:
	pass

func on_sim_event(_kind: String, _d: Dictionary) -> void:
	pass

func relayout() -> void:
	hud.layout_panel(self)
