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
var body_scroll: ScrollContainer
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
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if p_dock == "right":
		# 오른쪽 창은 내용이 길어지면 화면 높이에 맞춰 스크롤한다
		body_scroll = ScrollContainer.new()
		body_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		body_scroll.add_child(body)
		v.add_child(body_scroll)
	else:
		v.add_child(body)

## 스크롤 영역 높이를 내용과 화면에 맞춘다
func fit_height(max_h: float) -> void:
	if body_scroll == null:
		return
	var want := body.get_combined_minimum_size().y
	body_scroll.custom_minimum_size = Vector2(body.get_combined_minimum_size().x + (8 if want > max_h else 0), minf(want, max_h))

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
