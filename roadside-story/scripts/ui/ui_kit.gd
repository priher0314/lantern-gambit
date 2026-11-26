class_name UIKit
## UI 조립 도우미와 공용 테마. 모든 화면은 코드로 조립한다.

const C_PANEL := Color("f7ecd4")
const C_PANEL2 := Color("efdfbe")
const C_BORDER := Color("5a4636")
const C_TEXT := Color("3a3041")
const C_DIM := Color("8a7a66")
const C_ACCENT := Color("e9843a")
const C_GREEN := Color("4f9d55")
const C_RED := Color("c9483c")
const C_BLUE := Color("3f7fc0")
const C_GOLD := Color("d9a021")
const C_DARK := Color("3a3041")
const C_WHITE := Color("fffaf0")

static var font: FontFile
static var font_bold: FontFile
static var font_small: FontFile
static var font_big: FontFile
static var theme: Theme
static var _tex_cache: Dictionary = {}

static func _load_font(path: String) -> FontFile:
	var f: FontFile = load(path)
	f.antialiasing = TextServer.FONT_ANTIALIASING_NONE
	f.hinting = TextServer.HINTING_NONE
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
	f.force_autohinter = false
	return f

static func box(bg: Color, border: Color = C_BORDER, bw: int = 2, pad: int = 6, shadow: bool = false) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	s.set_corner_radius_all(0)
	s.anti_aliasing = false
	s.set_content_margin_all(pad)
	if shadow:
		s.shadow_color = Color(0.1, 0.08, 0.12, 0.35)
		s.shadow_size = 0
		s.shadow_offset = Vector2(2, 2)
	return s

static func build_theme() -> Theme:
	if theme != null:
		return theme
	font = _load_font("res://assets/fonts/Galmuri11.ttf")
	font_bold = _load_font("res://assets/fonts/Galmuri11-Bold.ttf")
	font_small = _load_font("res://assets/fonts/Galmuri9.ttf")
	font_big = _load_font("res://assets/fonts/Galmuri14.ttf")
	var t := Theme.new()
	t.default_font = font
	t.default_font_size = 12
	t.set_color("font_color", "Label", C_TEXT)
	t.set_constant("line_spacing", "Label", 2)
	# 버튼
	var bn := box(C_WHITE, C_BORDER, 1, 4)
	bn.border_width_bottom = 3
	var bh := box(Color("fff3c9"), C_BORDER, 1, 4)
	bh.border_width_bottom = 3
	var bp := box(Color("f2d9a0"), C_BORDER, 1, 4)
	bp.border_width_top = 3
	var bd := box(Color("ddd2bd"), Color("a89a86"), 1, 4)
	bd.border_width_bottom = 3
	t.set_stylebox("normal", "Button", bn)
	t.set_stylebox("hover", "Button", bh)
	t.set_stylebox("pressed", "Button", bp)
	t.set_stylebox("disabled", "Button", bd)
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		t.set_color(c, "Button", C_TEXT)
	t.set_color("font_disabled_color", "Button", Color("a89a86"))
	t.set_color("icon_disabled_color", "Button", Color(1, 1, 1, 0.45))
	t.set_constant("h_separation", "Button", 3)
	t.set_stylebox("panel", "PanelContainer", box(C_PANEL, C_BORDER, 2, 6, true))
	t.set_stylebox("panel", "Panel", box(C_PANEL, C_BORDER, 2, 6, true))
	t.set_stylebox("panel", "TooltipPanel", box(Color("fffbe8"), C_BORDER, 1, 4))
	t.set_color("font_color", "TooltipLabel", C_TEXT)
	t.set_font("font", "TooltipLabel", font)
	t.set_font_size("font_size", "TooltipLabel", 12)
	# 진행 막대
	t.set_stylebox("background", "ProgressBar", box(Color("d8c9a8"), C_BORDER, 1, 0))
	t.set_stylebox("fill", "ProgressBar", box(C_ACCENT, C_BORDER, 1, 0))
	# 스크롤
	var sb := box(Color("d8c9a8"), C_BORDER, 0, 0)
	sb.content_margin_left = 3
	sb.content_margin_right = 3
	t.set_stylebox("scroll", "VScrollBar", sb)
	t.set_stylebox("grabber", "VScrollBar", box(C_BORDER, C_BORDER, 0, 0))
	t.set_stylebox("grabber_highlight", "VScrollBar", box(C_ACCENT, C_BORDER, 0, 0))
	t.set_stylebox("grabber_pressed", "VScrollBar", box(C_ACCENT, C_BORDER, 0, 0))
	# 입력창
	t.set_stylebox("normal", "LineEdit", box(C_WHITE, C_BORDER, 1, 4))
	t.set_stylebox("focus", "LineEdit", box(C_WHITE, C_ACCENT, 1, 4))
	t.set_color("font_color", "LineEdit", C_TEXT)
	t.set_color("caret_color", "LineEdit", C_TEXT)
	# 슬라이더
	t.set_stylebox("slider", "HSlider", box(Color("d8c9a8"), C_BORDER, 1, 2))
	t.set_stylebox("grabber_area", "HSlider", box(C_ACCENT, C_BORDER, 1, 2))
	t.set_stylebox("grabber_area_highlight", "HSlider", box(C_ACCENT, C_BORDER, 1, 2))
	t.set_constant("separation", "HBoxContainer", 4)
	t.set_constant("separation", "VBoxContainer", 4)
	t.set_constant("h_separation", "GridContainer", 4)
	t.set_constant("v_separation", "GridContainer", 4)
	t.set_color("default_color", "RichTextLabel", C_TEXT)
	t.set_font("normal_font", "RichTextLabel", font)
	t.set_font("bold_font", "RichTextLabel", font_bold)
	t.set_font_size("normal_font_size", "RichTextLabel", 12)
	t.set_font_size("bold_font_size", "RichTextLabel", 12)
	theme = t
	return t

static func tex(path: String) -> Texture2D:
	if _tex_cache.has(path):
		return _tex_cache[path]
	var t: Texture2D = null
	if ResourceLoader.exists(path):
		t = load(path)
	_tex_cache[path] = t
	return t

static func icon(name: String) -> Texture2D:
	return tex("res://assets/sprites/ui/%s.png" % name)

static func building_tex(def_id: String, tier: int = 0) -> Texture2D:
	for t in range(tier, -1, -1):
		var tx := tex("res://assets/sprites/buildings/%s_%d.png" % [def_id, t])
		if tx != null:
			return tx
	return null

# ---------------------------------------------------------------- 위젯

static func label(text: String, size: int = 12, color: Color = C_TEXT, bold: bool = false) -> Label:
	var l := Label.new()
	l.text = text
	if size <= 10:
		l.add_theme_font_override("font", font_small)
		l.add_theme_font_size_override("font_size", 10)
	elif size >= 15 and not bold:
		l.add_theme_font_override("font", font_big)
		l.add_theme_font_size_override("font_size", 15)
	else:
		l.add_theme_font_override("font", font_bold if bold else font)
		l.add_theme_font_size_override("font_size", 24 if size >= 24 else 12)
	l.add_theme_color_override("font_color", color)
	return l

static func wrap_label(text: String, width: float, size: int = 12, color: Color = C_TEXT) -> Label:
	var l := label(text, size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = width
	return l

static func button(text: String, cb: Callable = Callable(), icon_name: String = "") -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	if icon_name != "":
		b.icon = icon(icon_name)
	if cb.is_valid():
		b.pressed.connect(func():
			Audio.play("click")
			cb.call())
	return b

static func colored_button(text: String, bg: Color, cb: Callable = Callable()) -> Button:
	var b := button(text, cb)
	var n := box(bg, C_BORDER, 1, 4)
	n.border_width_bottom = 3
	var h := box(bg.lightened(0.15), C_BORDER, 1, 4)
	h.border_width_bottom = 3
	var p := box(bg.darkened(0.1), C_BORDER, 1, 4)
	p.border_width_top = 3
	b.add_theme_stylebox_override("normal", n)
	b.add_theme_stylebox_override("hover", h)
	b.add_theme_stylebox_override("pressed", p)
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(c, C_WHITE)
	b.add_theme_font_override("font", font_bold)
	return b

static func hbox(sep: int = 4) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h

static func vbox(sep: int = 4) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v

static func spacer(expand: bool = true, min_w: float = 0.0) -> Control:
	var c := Control.new()
	if expand:
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		c.size_flags_vertical = Control.SIZE_EXPAND_FILL
	c.custom_minimum_size = Vector2(min_w, min_w)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c

static func tex_rect(t: Texture2D, min_size: Vector2 = Vector2.ZERO, scale: int = 1) -> TextureRect:
	var r := TextureRect.new()
	r.texture = t
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if min_size != Vector2.ZERO:
		r.custom_minimum_size = min_size
		r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	elif t != null:
		r.custom_minimum_size = t.get_size() * scale
		r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		r.stretch_mode = TextureRect.STRETCH_SCALE
	return r

static func panel(bg: Color = C_PANEL, pad: int = 6) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(bg, C_BORDER, 2, pad, true))
	return p

static func inset(bg: Color = C_PANEL2, pad: int = 4) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(bg, Color("c9b891"), 1, pad))
	return p

static func progress(value: float, color: Color = C_ACCENT, h: float = 8.0, w: float = 60.0) -> ProgressBar:
	var pb := ProgressBar.new()
	pb.min_value = 0.0
	pb.max_value = 1.0
	pb.value = clampf(value, 0.0, 1.0)
	pb.show_percentage = false
	pb.custom_minimum_size = Vector2(w, h)
	pb.add_theme_stylebox_override("fill", box(color, C_BORDER, 1, 0))
	pb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return pb

static func scroll(min_size: Vector2) -> ScrollContainer:
	var s := ScrollContainer.new()
	s.custom_minimum_size = min_size
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	return s

static func clear(node: Node) -> void:
	for c in node.get_children():
		node.remove_child(c)
		c.queue_free()

## 제목 줄 + 닫기 버튼이 있는 창. 돌려주는 값: {root, body}
static func window(title: String, on_close: Callable, min_size: Vector2 = Vector2(300, 100)) -> Dictionary:
	var p := panel()
	p.custom_minimum_size = min_size
	var v := vbox(6)
	p.add_child(v)
	var head := hbox()
	var tl := label(title, 12, C_TEXT, true)
	head.add_child(tl)
	head.add_child(spacer())
	var x := button("닫기", on_close)
	head.add_child(x)
	v.add_child(head)
	var body := vbox(6)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(body)
	return {"root": p, "body": body, "head": head, "title": tl}
