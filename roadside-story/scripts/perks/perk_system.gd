class_name PerkSystem
extends RefCounted
## 경영 특전. 등급이 오를 때 3개 후보 중 하나를 고르면 휴게소에 자동 적용된다.
## 수치는 data/perks.json 의 p 에서 읽고, 각 특전이 무엇을 바꾸는지는 여기서 구현한다.

var sim: Sim
var owned: Array = []
var combos: Array = []            # 완성된 조합 ID
var offers: Array = []            # 대기 중인 선택 [{rank, cands}]
var offered_ranks: Array = []

# 재계산 캐시
var _cat_count: Dictionary = {}
var _distinct: int = 0
var _dominant_cat: String = ""

func _init(s: Sim) -> void:
	sim = s

func has(id: String) -> bool:
	return owned.has(id)

func p(id: String) -> Dictionary:
	return Data.perks[id]["p"]

func has_combo(id: String) -> bool:
	return combos.has(id)

func cp(id: String) -> Dictionary:
	return Data.combos[id]["p"]

# ---------------------------------------------------------------- 후보 / 선택

func pool() -> Array:
	var locked: Array = Data.progression["locked_by_default"]["perks"]
	var unlocked: Array = sim.profile_unlocks.get("perks", [])
	var out: Array = []
	for id in Data.perk_order:
		if owned.has(id):
			continue
		if locked.has(id) and not unlocked.has(id):
			continue
		out.append(id)
	return out

func _group_presence() -> Dictionary:
	# 지금 휴게소가 어느 분야에 힘을 싣고 있는지 (특전 분야 기준)
	var g := {"food": 0.0, "value": 0.0, "tour": 0.0, "family": 0.0, "premium": 0.0, "mixed": 1.0}
	for f in sim.fac_list:
		var w: float = 1.0 + 0.2 * (f.level - 1)
		match f.cat():
			"food": g["food"] += w
			"tour": g["tour"] += w
			"family": g["family"] += w
			"relax": g["premium"] += w * 0.6
		if f.has_tag("cheap") or f.has_tag("small"):
			g["value"] += w * 0.6
		if f.has_tag("premium"):
			g["premium"] += w
		if f.has_tag("dessert"):
			g["family"] += w * 0.3
	return g

func _weighted_pick(ids: Array, weights: Array) -> String:
	var total := 0.0
	for w in weights:
		total += w
	if ids.is_empty() or total <= 0.0:
		return ""
	var r := sim.rng.randf() * total
	for i in ids.size():
		r -= weights[i]
		if r <= 0.0:
			return ids[i]
	return ids[-1]

func _combo_progress(id: String) -> float:
	# 이 특전을 얻으면 완성에 가까워지는 조합이 있으면 가중치를 올린다
	var best := 0.0
	for cid in Data.combo_order:
		var need: Array = Data.combos[cid]["need"]
		if not need.has(id) or combos.has(cid):
			continue
		var have := 0
		for n in need:
			if owned.has(n):
				have += 1
		best = maxf(best, float(have) / need.size())
	return best

## 후보 3개: 지금 전략에 맞는 것 / 새 방향으로 틀 수 있는 것 / 두루 쓰이는 것
func make_candidates() -> Array:
	var pl := pool()
	var picks: Array = []
	if pl.is_empty():
		return picks
	var presence := _group_presence()
	var ids: Array = []
	var ws: Array = []
	for id in pl:
		var g: String = Data.perks[id]["group"]
		if g == "mixed":
			continue
		ids.append(id)
		ws.append(0.2 + float(presence.get(g, 0.0)) + 6.0 * _combo_progress(id))
	var a := _weighted_pick(ids, ws)
	if a != "":
		picks.append(a)
	ids = []
	ws = []
	var a_group: String = Data.perks[a]["group"] if a != "" else ""
	for id in pl:
		var g2: String = Data.perks[id]["group"]
		if picks.has(id) or g2 == "mixed" or g2 == a_group:
			continue
		ids.append(id)
		ws.append(1.0 / (0.5 + float(presence.get(g2, 0.0))))
	var b := _weighted_pick(ids, ws)
	if b != "":
		picks.append(b)
	ids = []
	ws = []
	for id in pl:
		if picks.has(id) or Data.perks[id]["group"] != "mixed":
			continue
		ids.append(id)
		ws.append(1.0 + 4.0 * _combo_progress(id))
	var c := _weighted_pick(ids, ws)
	if c != "":
		picks.append(c)
	while picks.size() < 3:
		var rest: Array = []
		for id in pl:
			if not picks.has(id):
				rest.append(id)
		if rest.is_empty():
			break
		picks.append(rest[sim.rng.randi() % rest.size()])
	return picks

func grant_offer(rank: int) -> void:
	if offered_ranks.has(rank):
		return
	offered_ranks.append(rank)
	var cands := make_candidates()
	if cands.is_empty():
		return
	offers.append({"rank": rank, "cands": cands})
	sim.emit("perk_offer", {"rank": rank})

func has_pending() -> bool:
	return not offers.is_empty()

func choose(id: String) -> bool:
	if offers.is_empty() or not (offers[0]["cands"] as Array).has(id):
		return false
	offers.pop_front()
	owned.append(id)
	sim.prog.discover("perk", id)
	sim.last_action = "특전 「%s」 선택" % Data.perks[id]["name"]
	_check_combos()
	sim.products.reassign_all()
	sim.recalc()
	sim.emit("perk_chosen", {"id": id})
	return true

## 개발자 도구용
func grant(id: String) -> void:
	if owned.has(id) or not Data.perks.has(id):
		return
	owned.append(id)
	_check_combos()
	sim.recalc()

func _check_combos() -> void:
	for cid in Data.combo_order:
		if combos.has(cid):
			continue
		var ok := true
		for n in Data.combos[cid]["need"]:
			if not owned.has(n):
				ok = false
				break
		if ok:
			combos.append(cid)
			sim.prog.discover("combo", cid)
			sim.prog.on_combo(cid)
			sim.emit("combo", {"id": cid})

# ---------------------------------------------------------------- 재계산

func recalc() -> void:
	_cat_count = {}
	var ids: Dictionary = {}
	for f in sim.fac_list:
		var k = f.kind()
		if k == "deco" or k == "path":
			continue
		ids[f.id] = true
		_cat_count[f.cat()] = int(_cat_count.get(f.cat(), 0)) + 1
	_distinct = ids.size()
	_dominant_cat = ""
	var best := 0
	for c in _cat_count:
		if c == "basic" or c == "car":
			continue
		if int(_cat_count[c]) > best:
			best = int(_cat_count[c])
			_dominant_cat = c
	if has("slow_travel"):
		sim.mods["visits"] = int(sim.mods["visits"]) + int(p("slow_travel")["visits"])
	if has("family_weekend"):
		sim.add_attract("family", float(p("family_weekend")["attract"]))

## 시설 별 수가 계산된 뒤에 도는 부분 (별 수에 따라 달라지는 유입 효과)
func post_recalc() -> void:
	if has("gourmet_trip"):
		var n := 0
		for f in sim.fac_list:
			if f.cat() == "food" and f.stars >= 3:
				n += 1
		sim.add_attract("gourmet", minf(float(p("gourmet_trip")["cap"]), float(p("gourmet_trip")["per"]) * n))
	if has("destination"):
		var n2: int = int(_cat_count.get("tour", 0))
		sim.add_attract("tourist", minf(float(p("destination")["cap"]), float(p("destination")["per"]) * n2))
	if has("vip_choice"):
		var n3 := 0
		for f in sim.fac_list:
			if f.stars >= int(p("vip_choice")["star"]) and f.kind() == "shop":
				n3 += 1
		sim.add_attract("vip", minf(float(p("vip_choice")["cap"]), float(p("vip_choice")["per"]) * n3))
	if has_combo("national_eatery"):
		sim.add_attract("gourmet", float(cp("national_eatery")["attract"]))
	if has_combo("family_park"):
		sim.add_attract("family", float(cp("family_park")["attract"]))

# ---------------------------------------------------------------- 시설 보정

func appeal_bonus(f: Facility) -> float:
	var a := 0.0
	if has("famous_eatery") and f.cat() == "food":
		a += float(p("famous_eatery")["appeal"])
	if has("small_but_solid") and f.has_tag("small"):
		a += float(p("small_but_solid")["appeal"])
	if has("sweet_snack") and f.has_tag("dessert"):
		a += float(p("sweet_snack")["appeal"])
	if has("local_pride") and f.has_tag("local"):
		a += float(p("local_pride")["appeal"])
	if has("department"):
		a += minf(float(p("department")["cap"]), float(p("department")["per"]) * _distinct)
	if has("specialist") and f.cat() == _dominant_cat:
		a += minf(float(p("specialist")["cap"]), float(p("specialist")["per"]) * int(_cat_count.get(_dominant_cat, 0)))
	if has_combo("frugal_king") and f.has_tag("cheap"):
		a += float(cp("frugal_king")["appeal"])
	if has_combo("night_market") and f.cat() == "food" and sim.is_night():
		a += float(cp("night_market")["appeal"])
	if has_combo("master_plan"):
		a += minf(float(cp("master_plan")["cap"]), float(cp("master_plan")["per"]) * sim.synergy.active.size())
	return a

func speed_bonus(f: Facility) -> float:
	var s := 0.0
	if has("quick_turn"):
		s += float(p("quick_turn")["speed"])
	if has("small_but_solid") and f.has_tag("small"):
		s += float(p("small_but_solid")["speed"])
	return s

func quality_bonus(_f: Facility) -> float:
	return 0.0

func price_bonus(f: Facility) -> float:
	var b := 0.0
	if has("premium_brand") and f.stars >= int(p("premium_brand")["star"]):
		b += float(p("premium_brand")["price"])
	if has("local_pride") and f.has_tag("local"):
		b += float(p("local_pride")["price"])
	if has("night_city") and sim.is_night():
		b += float(p("night_city")["price"])
	return b

func cap_bonus(f: Facility) -> int:
	if has_combo("small_giant") and f.kind() == "shop":
		return int(cp("small_giant")["cap"])
	return 0

func green_mult() -> float:
	return float(p("green_stop")["mult"]) if has("green_stop") else 1.0

func green_radius() -> int:
	return int(p("green_stop")["radius"]) if has("green_stop") else 0

func green_cap() -> float:
	return float(p("green_stop")["cap"]) if has("green_stop") else 0.0

func architect_mult() -> float:
	return float(p("architect")["mult"]) if has("architect") else 1.0

func night_floor() -> float:
	return float(p("night_city")["floor"]) if has("night_city") else 0.0

## 음식점 앞 줄이 차를 끌어들이는 효과 (0~queue_cap)
func queue_draw() -> float:
	if not has("famous_eatery"):
		return 0.0
	var n := 0
	for f in sim.fac_list:
		if f.cat() == "food":
			n += f.queue.size() + f.users.size()
	return minf(float(p("famous_eatery")["queue_cap"]), float(p("famous_eatery")["queue_draw"]) * n)

func staff_mult(staff_count: int) -> float:
	if not has("elite_few"):
		return 0.0
	var e := p("elite_few")
	if staff_count <= int(e["n1"]):
		return float(e["v1"])
	if staff_count <= int(e["n2"]):
		return float(e["v2"])
	return 0.0

func artisan_mult(job: String) -> float:
	if has("artisan_touch") and (job == "cook" or job == "barista"):
		return float(p("artisan_touch")["mult"])
	return 1.0

func research_time_mult() -> float:
	return float(p("research_mania")["time"]) if has("research_mania") else 1.0

func research_cost_mult() -> float:
	return float(p("research_mania")["cost"]) if has("research_mania") else 1.0

func fame_start() -> float:
	return float(p("research_mania")["fame_start"]) if has("research_mania") else 0.0

func signature_price() -> float:
	return float(p("signature_menu")["price"]) if has("signature_menu") else 0.0

func fame_mult(_pid: String, f: Facility, is_top: bool) -> float:
	var m := 1.0
	if is_top and has("signature_menu"):
		m *= float(p("signature_menu")["fame"])
	if has_combo("national_eatery") and f.cat() == "food":
		m *= 1.0 + float(cp("national_eatery")["fame"])
	return m

func thin_margin_hit(price: float) -> bool:
	if not has("thin_margin"):
		return false
	return price <= float(p("thin_margin")["max_price"]) and sim.rng.randf() < float(p("thin_margin")["chance"])

func type_visits(type_id: String) -> int:
	var v := 0
	if type_id == "family" and has_combo("family_park"):
		v += int(cp("family_park")["visits"])
	if type_id == "vip" and has_combo("luxury_line"):
		v += int(cp("luxury_line")["visits"])
	return v

func budget_mult(type_id: String) -> float:
	if type_id == "family" and has("sweet_snack"):
		return 1.0 + float(p("sweet_snack")["budget"])
	return 1.0

## 손님이 시설을 이용한 직후
func on_use(c: Customer, f: Facility) -> void:
	if has("kids_heaven") and f.cat() == "family" and f.kind() == "free":
		c.sat = minf(100.0, c.sat + float(p("kids_heaven")["sat"]))
		c.needs["snack"] = maxf(float(c.needs.get("snack", 0.0)), float(p("kids_heaven")["need"]))
	if f.cat() == "tour":
		c.flags["tour"] = true
		if has_combo("scenic_route") and not c.flags.has("scenic"):
			c.flags["scenic"] = true
			c.budget *= 1.0 + float(cp("scenic_route")["budget"])

## 손님이 떠날 때 명성 배율
func rep_mult(c: Customer) -> float:
	var m := 1.0 + float(c.flags.get("rep_bonus", 0.0))
	if has("word_of_mouth") and c.sat >= float(p("word_of_mouth")["sat"]):
		m += float(p("word_of_mouth")["rep"])
	if has("photo_fame") and c.flags.has("tour"):
		m += float(p("photo_fame")["rep"])
	return m

func to_dict() -> Dictionary:
	return {"owned": owned, "combos": combos, "offers": offers, "offered_ranks": offered_ranks}

func load_dict(d: Dictionary) -> void:
	owned = d.get("owned", [])
	combos = d.get("combos", [])
	offers = d.get("offers", [])
	offered_ranks = []
	for r in d.get("offered_ranks", []):
		offered_ranks.append(int(r))
