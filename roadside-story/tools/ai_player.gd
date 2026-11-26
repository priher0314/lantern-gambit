class_name AIPlayer
extends RefCounted
## 자동 플레이 봇. 밸런스 시뮬레이션과 자동 테스트에서 사람 대신 경영한다.
## 전략마다 짓고 싶은 시설 목록과 선호 특전이 다르다. 게임 규칙을 우회하지 않고 공개 API만 쓴다.

const STRATEGIES := {
	"food": {"name": "음식 특화", "wish": ["snack", "restroom", "walnut", "bench", "snack", "udon", "vending", "bakery", "udon", "cafe", "walnut", "bakery", "icecream", "snack", "udon", "convenience", "bakery", "garden"], "perks": ["food", "mixed"], "staff": 12},
	"tour": {"name": "관광 특화", "wish": ["snack", "restroom", "bench", "garden", "cafe", "observatory", "photozone", "souvenir", "garden", "flowerbed", "specialty", "observatory", "cafe", "photozone", "walnut", "garden", "souvenir", "lamp", "bench", "observatory"], "perks": ["tour", "mixed"], "staff": 9},
	"value": {"name": "실속 경영", "wish": ["snack", "restroom", "vending", "walnut", "convenience", "kiosk", "bench", "gas", "vending", "icecream", "snack", "convenience", "kiosk", "walnut", "vending", "udon", "icecream", "gas"], "perks": ["value", "mixed"], "staff": 6},
	"premium": {"name": "프리미엄", "wish": ["snack", "restroom", "bench", "cafe", "garden", "observatory", "specialty", "bakery", "sauna", "cafe", "hotel", "souvenir", "sauna", "garden", "ev", "hotel", "udon"], "perks": ["premium", "tour", "food"], "staff": 12},
	"family": {"name": "가족 특화", "wish": ["snack", "restroom", "bench", "playground", "walnut", "icecream", "garden", "cafe", "playground", "photozone", "convenience", "bakery", "icecream", "playground", "souvenir", "garden", "udon", "observatory"], "perks": ["family", "mixed"], "staff": 9},
	"balanced": {"name": "균형 경영", "wish": ["snack", "restroom", "walnut", "bench", "cafe", "convenience", "garden", "playground", "udon", "souvenir", "observatory", "gas", "icecream", "bakery", "specialty", "photozone", "sauna", "ev", "cafe", "snack", "hotel"], "perks": ["mixed", "food", "tour", "family", "value"], "staff": 12},
}

var sim: Sim
var strat: Dictionary
var strat_id: String
var wish_i := 0
var log: Array = []
var max_parking := 12
var research_on := true
var use_perks := true
var forced_perks: Array = []

func _init(s: Sim, strategy: String) -> void:
	sim = s
	strat_id = strategy
	strat = STRATEGIES[strategy]

## 게임 시간 몇 초마다 한 번 부른다.
func act() -> void:
	_perk()
	_event()
	var budget_guard := 8
	while budget_guard > 0:
		budget_guard -= 1
		if not _one_action():
			break

func _perk() -> void:
	while sim.perks.has_pending():
		var cands: Array = sim.perks.offers[0]["cands"]
		if not use_perks:
			sim.perks.offers.pop_front()
			continue
		var best: String = cands[0]
		var best_s := -1.0
		for id in cands:
			var g: String = Data.perks[id]["group"]
			var s := 0.0
			var pi: int = (strat["perks"] as Array).find(g)
			if pi >= 0:
				s = 10.0 - pi * 2.0
			if forced_perks.has(id):
				s += 100.0
			s += sim.perks._combo_progress(id) * 6.0
			if s > best_s:
				best_s = s
				best = id
		sim.perks.choose(best)
		log.append("d%d perk %s" % [sim.day(), best])

func _event() -> void:
	if not sim.events.pending_choice.is_empty():
		var e: Dictionary = Data.events[sim.events.pending_choice["id"]]
		var cost: float = float(e["options"][0].get("cost", 0))
		sim.events.choose(0 if sim.money > cost * 3.0 else 1)

func _one_action() -> bool:
	var m := sim.money
	# 1) 주차: 어제 자리가 모자랐거나 거의 꽉 찼으면 늘린다
	var cap := sim.cust.parking_capacity()
	var need_parking: bool = sim.econ.missed_last >= 2 or float(sim.cust.parked_count()) / maxf(1.0, cap) > 0.85
	if need_parking:
		for f in sim.facilities.values():
			if f.id == "parking" and sim.build.can_upgrade(f) and m >= sim.build.upgrade_cost(f) * 1.1:
				sim.build.upgrade(f.uid)
				return true
		if m >= sim.build_cost("parking") * 1.1 and _place("parking"):
			sim.econ.missed_last = 0
			return true
	# 2) 직원
	var slots := 0
	for f in sim.facilities.values():
		slots += int(f.def().get("staff", 0))
	if sim.staff.staff.size() < mini(slots, int(strat["staff"])) and not sim.staff.candidates.is_empty():
		var bi := 0
		var bs := -1.0
		for i in sim.staff.candidates.size():
			var e: Dictionary = sim.staff.candidates[i]
			var sc: float = float(e["skill"]) + float(e["service"]) + float(e["stamina"]) + int(e["potential"]) * 12.0
			if sc > bs:
				bs = sc
				bi = i
		if m >= sim.staff.hire_cost(sim.staff.candidates[bi]) * 4.0:
			if sim.staff.hire(bi) != 0:
				return true
	# 3) 연구
	if research_on and sim.products.current.is_empty() and sim.prog.tut_index >= 0:
		var best_pid := ""
		var best_cost := 1.0e12
		for key in Data.recipes:
			var pid: String = Data.recipes[key]
			if sim.products.developed.has(pid):
				continue
			var pd: Dictionary = Data.products[pid]
			if not sim.products.ingredient_unlocked(pd["recipe"][0]) or not sim.products.ingredient_unlocked(pd["recipe"][1]):
				continue
			var sellable := false
			for fid in pd["at"]:
				if sim.has_fac(fid):
					sellable = true
			if sellable and sim.products.research_cost(pid) < best_cost:
				best_cost = sim.products.research_cost(pid)
				best_pid = pid
		if best_pid != "" and m >= best_cost * 2.5:
			var r: Array = Data.products[best_pid]["recipe"]
			if sim.products.start_research(r[0], r[1])["ok"]:
				return true
	# 4) 다음으로 짓고 싶은 시설
	var wish: Array = strat["wish"]
	var guard := 0
	while wish_i < wish.size() and guard < 3:
		guard += 1
		var fid: String = wish[wish_i]
		if not sim.facility_unlocked(fid):
			break
		if m >= sim.build_cost(fid) * 1.15:
			if _place(fid):
				wish_i += 1
				return true
			# 자리가 없으면 부지를 넓힌다
			if _buy_plot():
				return true
			break
		break
	# 5) 업그레이드: 줄이 긴 곳 우선, 아니면 가장 싼 곳
	var best: Facility = null
	var best_v := 0.0
	for f in sim.facilities.values():
		if not sim.build.can_upgrade(f) or f.id == "parking":
			continue
		var c := sim.build.upgrade_cost(f)
		if c > m * 0.55:
			continue
		var v: float = (2.0 + f.queue.size() + f.rev_yesterday / 20000.0 + float(f.def().get("draw", 3)) * 0.2) / c
		if v > best_v:
			best_v = v
			best = f
	var next_cost := 1.0e12
	if wish_i < wish.size() and sim.facility_unlocked(wish[wish_i]):
		next_cost = sim.build_cost(wish[wish_i])
	if best != null and (m - sim.build.upgrade_cost(best) > next_cost * 0.3 or wish_i >= wish.size() or not sim.facility_unlocked(wish[mini(wish_i, wish.size() - 1)])):
		sim.build.upgrade(best.uid)
		return true
	# 6) 여윳돈이 많으면 장식
	if m > 600000.0 and sim.count_fac("tree") + sim.count_fac("flowerbed") < sim.facilities.size() / 2:
		if _place("tree" if sim.rng.randf() < 0.5 else "flowerbed"):
			return true
	return false

func _buy_plot() -> bool:
	var plots: Array = sim.region["plots"]
	for i in plots.size():
		if sim.build.can_buy_plot(i) and sim.money >= sim.build.plot_cost(i) * 1.05:
			if sim.build.buy_plot(i):
				log.append("d%d plot %d" % [sim.day(), i])
				return true
	return false

func _centroid() -> Vector2:
	var c := Vector2.ZERO
	var n := 0
	for f in sim.facilities.values():
		if f.kind() != "deco":
			c += f.center()
			n += 1
	return c / maxf(1.0, n)

## 빈자리를 찾아 짓는다. 다른 건물과 한 칸은 띄워서 길이 막히지 않게 한다.
func _place(fid: String) -> bool:
	var d: Dictionary = Data.facilities[fid]
	var g := sim.grid
	var cen := _centroid()
	var cands: Array = []
	var rots := [0] if d.get("road", false) else [0, 1]
	for rot in rots:
		var s: Array = d["size"]
		var fw := int(s[1]) if rot == 1 else int(s[0])
		var fh := int(s[0]) if rot == 1 else int(s[1])
		for y in g.h:
			for x in g.w:
				if g.land_at(x, y) != WorldGrid.OWNED:
					continue
				if not sim.build.can_place(fid, x, y, rot)["ok"]:
					continue
				if not d.get("road", false) and d["kind"] != "deco":
					if y + fh - 1 >= g.front_row() - 1:
						continue   # 도로 앞 두 줄은 주차장·주유소 자리로 남긴다
				if not _has_gap(x, y, fw, fh, d):
					continue
				var dist := Vector2(x + fw * 0.5, y + fh * 0.5).distance_to(cen)
				cands.append([dist, x, y, rot])
	if cands.is_empty():
		return false
	cands.sort_custom(func(a, b): return a[0] < b[0])
	var best: Array = cands[0]
	if d["kind"] != "deco":
		var best_s := -1.0e9
		for c in cands.slice(0, 10):
			var syn: Array = sim.synergy.preview(fid, c[1], c[2], c[3])
			var sc: float = syn.size() * 4.0 - float(c[0])
			if sc > best_s:
				best_s = sc
				best = c
	var f := sim.build.place(fid, best[1], best[2], best[3])
	if f != null:
		log.append("d%d build %s" % [sim.day(), fid])
		sim.staff.auto_assign_all()
		return true
	return false

func _has_gap(x: int, y: int, fw: int, fh: int, d: Dictionary) -> bool:
	var g := sim.grid
	for yy in range(y - 1, y + fh + 1):
		for xx in range(x - 1, x + fw + 1):
			if xx >= x and xx < x + fw and yy >= y and yy < y + fh:
				continue
			var u := g.occ_at(xx, yy)
			if u != 0:
				var o := sim.fac(u)
				if o != null and not o.is_walkable() and not (d["kind"] == "deco" and o.kind() == "deco"):
					return false
	return true
