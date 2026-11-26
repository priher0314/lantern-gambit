class_name CodexView
extends VBoxContainer
## 통합 도감. 프로필에 쌓이므로 어느 휴게소에서 발견해도 함께 채워진다. 메인 메뉴와 게임 안에서 같이 쓴다.

const TABS := [["facility", "시설"], ["product", "상품"], ["synergy", "궁합"], ["customer", "손님"], ["perk", "특전"], ["trait", "직원 특성"], ["region", "지역"], ["trophy", "트로피"]]

var tab := "synergy"
var tabs: HFlowContainer
var grid: HFlowContainer
var summary: Label
var width := 600.0

func _init(w: float = 600.0, h: float = 280.0) -> void:
	width = w
	add_theme_constant_override("separation", 5)
	tabs = HFlowContainer.new()
	tabs.add_theme_constant_override("h_separation", 3)
	add_child(tabs)
	summary = UIKit.label("", 12, UIKit.C_DIM)
	add_child(summary)
	var sc := UIKit.scroll(Vector2(w, h))
	add_child(sc)
	grid = HFlowContainer.new()
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 4)
	grid.add_theme_constant_override("v_separation", 4)
	sc.add_child(grid)
	refresh()

func _ids(cat: String) -> Array:
	match cat:
		"facility": return Data.facility_order
		"product": return Data.product_order.filter(func(p): return Data.products[p].get("need", "") != "fuel")
		"synergy": return Data.synergy_order
		"customer": return Data.customer_order
		"perk": return Data.perk_order + Data.combo_order
		"trait": return Data.trait_order
		"region": return Data.region_order
		"trophy": return (Data.progression["trophies"] as Array).map(func(t): return t["id"])
	return []

func _has(cat: String, id: String) -> bool:
	if cat == "trophy":
		return (Save.profile["trophies"] as Array).has(id)
	if cat == "perk" and Data.combos.has(id):
		return Save.codex_has("combo", id)
	return Save.codex_has(cat, id)

func count(cat: String) -> Array:
	var ids := _ids(cat)
	var n := 0
	for id in ids:
		if _has(cat, id):
			n += 1
	return [n, ids.size()]

func refresh() -> void:
	UIKit.clear(tabs)
	for t in TABS:
		var c := count(t[0])
		var b := UIKit.button("%s %d/%d" % [t[1], c[0], c[1]], func():
			tab = t[0]
			refresh())
		if tab == t[0]:
			b.add_theme_stylebox_override("normal", UIKit.box(Color("ffd98a"), UIKit.C_BORDER, 1, 4))
		tabs.add_child(b)
	UIKit.clear(grid)
	var total := count(tab)
	summary.text = "발견 %d / %d" % [total[0], total[1]]
	if tab == "synergy":
		summary.text += "   · 필요한 시설들을 서로 3칸 안에 지으면 궁합이 생깁니다."
	for id in _ids(tab):
		grid.add_child(_entry(tab, id, _has(tab, id)))

func _entry(cat: String, id: String, found: bool) -> Control:
	var wide := cat in ["synergy", "perk", "trait", "trophy", "region", "customer"]
	var w := (width - 24.0) / 2.0 - 4.0 if wide else 112.0
	var p := UIKit.inset(Color("fffbe8") if found else Color("e6dcc6"), 4)
	p.custom_minimum_size = Vector2(w, 0)
	var v := UIKit.vbox(2)
	p.add_child(v)
	var title := "???"
	var desc := ""
	var img: Texture2D = null
	var col := UIKit.C_TEXT
	match cat:
		"facility":
			var d: Dictionary = Data.facilities[id]
			img = UIKit.building_tex(id, 2) if found else UIKit.building_tex(id, 0)
			if d["kind"] == "path":
				img = UIKit.tex("res://assets/sprites/tiles/path_0.png")
			title = d["name"] if found else "???"
			p.tooltip_text = d["desc"] if found else "아직 지어 보지 않은 시설입니다."
		"product":
			var pd: Dictionary = Data.products[id]
			title = pd["name"] if found else "???"
			if found:
				desc = "%s · 품질 %d" % [Fmt.won(float(pd["price"])), int(pd["q"])]
				if pd.has("recipe"):
					desc += "\n%s + %s" % [Data.ingredients[pd["recipe"][0]]["name"], Data.ingredients[pd["recipe"][1]]["name"]]
			else:
				desc = "재료 두 가지로 연구" if pd.has("recipe") else "%s의 기본 상품" % Data.facilities[pd["at"][0]]["name"]
		"synergy":
			var s: Dictionary = Data.synergies[id]
			title = s["name"] if found else "???"
			col = UIKit.C_ACCENT if found else UIKit.C_DIM
			if found:
				var parts: Array = []
				for group in s["req"]:
					parts.append(" 또는 ".join((group as Array).map(func(x): return Data.facilities[x]["name"])))
				desc = " + ".join(parts) + "\n" + s["desc"]
			else:
				desc = "힌트: " + s["hint"]
		"customer":
			var c: Dictionary = Data.customer_types[id]
			title = (c["name"] + ("  ★희귀" if c.get("rare", false) else "")) if found else "???"
			if found:
				desc = c["desc"]
				var at := AtlasTexture.new()
				at.atlas = UIKit.tex("res://assets/sprites/characters/%s_0.png" % c["look"])
				at.region = Rect2(0, 0, 16, 20)
				img = at
			else:
				var req: Dictionary = c.get("req", {})
				if req.has("cat"):
					desc = "힌트: %s 시설이 있으면 찾아옵니다." % Data.CATEGORY_NAMES[req["cat"]]
				elif req.has("food_star"):
					desc = "힌트: 품질 좋은 음식점이 있으면 찾아옵니다."
				elif req.has("fac"):
					desc = "힌트: %s이(가) 있으면 찾아옵니다." % Data.facilities[req["fac"]]["name"]
				elif req.has("tag"):
					desc = "힌트: 고급스러운 시설이 있으면 찾아옵니다."
				elif c.get("rare", false):
					desc = "힌트: 휴게소가 유명해지면 아주 가끔 들릅니다."
				else:
					desc = "힌트: 아직 만나지 못한 손님입니다."
		"perk":
			if Data.combos.has(id):
				var cb: Dictionary = Data.combos[id]
				title = ("조합 「%s」" % cb["name"]) if found else "조합 ???"
				col = UIKit.C_BLUE if found else UIKit.C_DIM
				var names: Array = (cb["need"] as Array).map(func(x): return Data.perks[x]["name"] if Save.codex_has("perk", x) else "???")
				desc = " + ".join(names) + ("\n" + cb["desc"] if found else "")
			else:
				var pk: Dictionary = Data.perks[id]
				title = pk["name"] if found else "???"
				desc = pk["desc"] if found else "특전 선택에서 만날 수 있습니다."
		"trait":
			var tr: Dictionary = Data.traits[id]
			title = tr["name"] if found else "???"
			desc = tr["desc"] if found else "이 특성을 가진 직원을 채용하면 기록됩니다."
		"region":
			var r: Dictionary = Data.regions[id]
			title = r["name"] if found else "???"
			desc = r["desc"] if found else "경영자 명성으로 해금할 수 있습니다."
		"trophy":
			for t in Data.progression["trophies"]:
				if t["id"] == id:
					title = t["name"] if found else "???"
					desc = t["desc"] if found else "아직 얻지 못한 트로피입니다."
					col = UIKit.C_GOLD if found else UIKit.C_DIM
	if img != null:
		var tr2 := UIKit.tex_rect(img, Vector2(w - 10, 52) if cat == "facility" else Vector2(32, 40))
		if not found:
			tr2.modulate = Color(0.2, 0.18, 0.25, 0.7)
		if cat == "facility":
			v.add_child(tr2)
		else:
			var h := UIKit.hbox(6)
			h.add_child(tr2)
			var v2 := UIKit.vbox(2)
			v2.add_child(UIKit.label(title, 12, col, true))
			v2.add_child(UIKit.wrap_label(desc, w - 56, 10, UIKit.C_DIM))
			h.add_child(v2)
			v.add_child(h)
			return p
	var tl := UIKit.label(title, 12, col if found else UIKit.C_DIM, true)
	if not wide:
		tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		tl.custom_minimum_size.x = w - 10
	v.add_child(tl)
	if desc != "":
		var dl := UIKit.wrap_label(desc, w - 12, 10, UIKit.C_DIM)
		if not wide:
			dl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(dl)
	return p
