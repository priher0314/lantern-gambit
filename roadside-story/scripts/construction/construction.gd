class_name Construction
extends RefCounted
## 건설·이동·철거·업그레이드·부지 확장과, 시설의 파생 수치 계산.

var sim: Sim

func _init(s: Sim) -> void:
	sim = s

# ---------------------------------------------------------------- 배치 검사

## 돌려주는 값: {ok, reason, entrance}
func can_place(def_id: String, x: int, y: int, rot: int, ignore_uid: int = 0) -> Dictionary:
	var d: Dictionary = Data.facilities[def_id]
	var g := sim.grid
	var s: Array = d["size"]
	var fw := int(s[1]) if rot == 1 else int(s[0])
	var fh := int(s[0]) if rot == 1 else int(s[1])
	var res := {"ok": false, "reason": "", "entrance": Vector2i(-1, -1)}
	if d["kind"] == "path":
		if g.land_at(x, y) != WorldGrid.OWNED:
			res["reason"] = "내 부지 안에만 깔 수 있어요"
		elif g.occ_at(x, y) != 0:
			res["reason"] = "시설이 있는 자리예요"
		elif g.has_path(x, y):
			res["reason"] = "이미 보행로가 있어요"
		else:
			res["ok"] = true
		return res
	for yy in range(y, y + fh):
		for xx in range(x, x + fw):
			var l := g.land_at(xx, yy)
			if l == WorldGrid.PLOT:
				res["reason"] = "아직 사지 않은 땅이에요 (부지 확장 필요)"
				return res
			if l != WorldGrid.OWNED:
				res["reason"] = "내 부지 밖이에요"
				return res
			var o := g.occ_at(xx, yy)
			if o != 0 and o != ignore_uid:
				res["reason"] = "다른 시설과 겹쳐요"
				return res
			if _is_entrance_of_other(xx, yy, ignore_uid):
				res["reason"] = "다른 시설의 입구를 막아요"
				return res
	if d.get("road", false):
		if rot != 0 or y + fh - 1 != g.front_row():
			res["reason"] = "도로와 맞닿은 맨 앞줄에 지어야 해요"
			return res
	if Facility.needs_entrance_def(d):
		var e := Facility.entrance_for(d, x, y, rot)
		res["entrance"] = e
		if g.land_at(e.x, e.y) == WorldGrid.ROAD:
			res["reason"] = "입구 앞이 도로예요. R 키로 돌려 보세요"
			return res
		if g.land_at(e.x, e.y) != WorldGrid.OWNED:
			res["reason"] = "입구 앞이 부지 밖이에요. R 키로 돌려 보세요"
			return res
		var eo := g.occ_at(e.x, e.y)
		if eo != 0 and eo != ignore_uid:
			var ef: Facility = sim.fac(eo)
			if ef == null or not ef.is_walkable():
				res["reason"] = "입구 앞이 막혀 있어요. R 키로 돌려 보세요"
				return res
	res["ok"] = true
	return res

func _is_entrance_of_other(x: int, y: int, ignore_uid: int) -> bool:
	for f in sim.facilities.values():
		if f.uid == ignore_uid or not f.needs_entrance():
			continue
		var e: Vector2i = f.entrance()
		if e.x == x and e.y == y:
			return true
	return false

# ---------------------------------------------------------------- 건설

func place(def_id: String, x: int, y: int, rot: int, free: bool = false) -> Facility:
	var d: Dictionary = Data.facilities[def_id]
	var chk := can_place(def_id, x, y, rot)
	if not chk["ok"]:
		return null
	var cost := 0.0 if free else sim.build_cost(def_id)
	if d["kind"] == "path":
		if not free and not sim.spend(cost, "build"):
			return null
		sim.grid.set_path(x, y, true)
		sim.emit("path_changed", {"x": x, "y": y})
		return null
	if not free and not sim.spend(cost, "build"):
		return null
	var f := Facility.new()
	f.uid = sim.new_uid()
	f.id = def_id
	f.x = x
	f.y = y
	f.rot = rot
	f.built_day = sim.time / sim.day_len()
	f.invested = cost
	sim.facilities[f.uid] = f
	sim.grid.set_occ(f.rect(), f.uid)
	sim.products.assign_auto(f)
	sim.recalc()
	sim.prog.on_built(f)
	if not free:
		sim.last_action = "%s 건설" % d["name"]
	sim.emit("fac_added", {"uid": f.uid, "free": free})
	sim.synergy.check_new_discoveries()
	return f

func can_place_path(x: int, y: int) -> bool:
	return can_place("path", x, y, 0)["ok"]

func remove_path(x: int, y: int) -> bool:
	if not sim.grid.has_path(x, y):
		return false
	sim.grid.set_path(x, y, false)
	sim.earn(sim.build_cost("path") * float(Data.balance["refund_build"]))
	sim.emit("path_changed", {"x": x, "y": y})
	return true

func move(uid: int, x: int, y: int, rot: int) -> bool:
	var f := sim.fac(uid)
	if f == null:
		return false
	var chk := can_place(f.id, x, y, rot, uid)
	if not chk["ok"]:
		return false
	var old := f.rect()
	sim.grid.set_occ(old, 0)
	f.x = x
	f.y = y
	f.rot = rot
	sim.grid.set_occ(f.rect(), uid)
	sim.cust.on_facility_moved(f)
	sim.recalc()
	sim.last_action = "%s 이동" % f.def()["name"]
	sim.emit("fac_moved", {"uid": uid})
	sim.synergy.check_new_discoveries()
	return true

func refund_value(f: Facility) -> float:
	var age: float = sim.time / sim.day_len() - f.built_day
	if age <= float(Data.balance["undo_window_days"]):
		return f.invested + f.upgrade_spent
	return f.invested * float(Data.balance["refund_build"]) + f.upgrade_spent * float(Data.balance["refund_upgrade"])

func demolish(uid: int) -> bool:
	var f := sim.fac(uid)
	if f == null:
		return false
	var refund := refund_value(f)
	sim.cust.on_facility_removed(f)
	sim.staff.unassign_all(uid)
	sim.grid.set_occ(f.rect(), 0)
	sim.facilities.erase(uid)
	sim.earn(refund)
	sim.recalc()
	sim.last_action = "%s 철거" % f.def()["name"]
	sim.emit("fac_removed", {"uid": uid, "refund": refund})
	return true

# ---------------------------------------------------------------- 업그레이드

func upgrade_cost(f: Facility) -> float:
	var b: Dictionary = Data.balance
	var c: float = float(f.def()["cost"]) * float(sim.region.get("cost_mult", 1.0)) * float(b["upgrade_cost_base"]) * pow(float(b["upgrade_cost_growth"]), f.level - 1)
	if f.max_level() < 10:
		c *= 1.5
	return roundf(c / 1000.0) * 1000.0

func can_upgrade(f: Facility) -> bool:
	var k := f.kind()
	return k != "deco" and k != "path" and f.level < f.max_level()

func upgrade(uid: int) -> bool:
	var f := sim.fac(uid)
	if f == null or not can_upgrade(f):
		return false
	var cost := upgrade_cost(f)
	if not sim.spend(cost, "upgrade"):
		return false
	var old_tier := f.tier()
	f.level += 1
	f.upgrade_spent += cost
	sim.products.assign_auto(f)
	sim.recalc()
	sim.prog.on_upgraded(f)
	sim.last_action = "%s 레벨 %d 업그레이드" % [f.def()["name"], f.level]
	sim.emit("fac_upgraded", {"uid": uid, "tier_up": f.tier() != old_tier})
	return true

## 업그레이드 화면의 현재/다음 비교용
func preview_stats(f: Facility, level: int) -> Dictionary:
	var keep := f.level
	f.level = level
	recalc_facility(f)
	var out := {"cap": f.cap, "time": f.time, "quality": f.quality, "appeal": f.appeal, "stars": f.stars, "tier": f.tier()}
	f.level = keep
	recalc_facility(f)
	return out

# ---------------------------------------------------------------- 부지

func plot_cost(i: int) -> float:
	return float(sim.region["plots"][i]["cost"]) * float(sim.region.get("plot_cost_mult", 1.0))

func can_buy_plot(i: int) -> bool:
	if sim.challenge.get("mods", {}).get("no_expand", false):
		return false
	return not sim.grid.owned_plots.has(i)

func buy_plot(i: int) -> bool:
	if not can_buy_plot(i):
		return false
	if not sim.spend(plot_cost(i), "plot"):
		return false
	sim.grid.own_plot(i, sim.region)
	sim.last_action = "부지 확장"
	sim.emit("plot_bought", {"plot": i})
	return true

# ---------------------------------------------------------------- 파생 수치

func recalc_facility(f: Facility) -> void:
	var d: Dictionary = f.def()
	var b: Dictionary = Data.balance
	var k: String = d["kind"]
	var lv := f.level - 1
	f.upkeep = float(d.get("upkeep", 0)) * (1.0 + float(b["level_upkeep"]) * lv)
	f.deco_bonus = 0.0
	f.sat_bonus = 0.0
	f.price_mult = 1.0
	if k == "deco" or k == "path":
		f.cap = 0
		f.appeal = 1.0
		f.quality = 0.0
		f.stars = 0
		return
	var growth: float = float(d.get("cap_growth", b["level_cap_growth_default"]))
	f.cap = int(d.get("cap", 1)) + int(floor(lv * growth + 0.001)) + int(sim.perks.cap_bonus(f))
	var st: Dictionary = sim.staff.facility_effect(f)
	var time_mult: float = (1.0 - float(b["level_time_reduce"]) * lv) * float(st["time"])
	time_mult /= (1.0 + sim.perks.speed_bonus(f))
	f.time = maxf(float(d.get("time", 3.0)) * maxf(time_mult, 0.35), 0.6)
	f.quality = clampf(float(d.get("q", 40)) + float(b["level_quality"]) * lv + float(st["quality"]) + sim.perks.quality_bonus(f), 0.0, 100.0)
	f.stars = clampi(1 + int(f.quality / 20.0), 1, 5)
	f.deco_bonus = _deco_bonus(f)
	var ap: float = 1.0 + float(b["level_appeal"]) * lv
	var add: float = f.deco_bonus + float(st["appeal"]) + sim.synergy.appeal_bonus(f) + sim.perks.appeal_bonus(f)
	add += _region_tag_bonus(f)
	f.appeal = float(d.get("appeal", 1.0)) * ap * (1.0 + add)
	f.sat_bonus = float(st["sat"]) + sim.synergy.sat_bonus(f) + f.deco_bonus * 12.0
	f.price_mult = 1.0 + float(b["level_price"]) * lv + sim.synergy.price_bonus(f) + sim.perks.price_bonus(f)
	f.upkeep *= float(st["upkeep"])
	if f.slots.size() > f.cap and (k == "parking" or k == "fuel"):
		pass  # 줄어든 칸의 차는 떠날 때까지 그대로 둔다

func _region_tag_bonus(f: Facility) -> float:
	var tags: Dictionary = sim.region.get("tags", {})
	var best := 0.0
	for t in f.def().get("tags", []):
		if tags.has(t):
			var v: float = float(tags[t]) - 1.0
			if absf(v) > absf(best):
				best = v
	return best

## 주변 장식(나무·꽃밭·가로등·분수·정원)이 주는 분위기 보너스
func _deco_bonus(f: Facility) -> float:
	var total := 0.0
	var night := 0.0
	var mult: float = sim.perks.green_mult()
	var extra_r: int = sim.perks.green_radius()
	var r0 := f.rect()
	for o in sim.fac_list:
		if o.uid == f.uid:
			continue
		var od: Dictionary = o.def()
		var dv: float = float(od.get("deco", 0.0))
		var nv: float = float(od.get("night_deco", 0.0))
		if dv <= 0.0 and nv <= 0.0:
			continue
		var rad: int = int(od.get("deco_radius", Data.balance["deco_radius"]))
		var green: bool = (od.get("tags", []) as Array).has("green")
		if green:
			rad += extra_r
		if rect_gap(r0, o.rect()) <= rad:
			total += dv * (mult if green else 1.0)
			night += nv
	var cap: float = float(Data.balance["deco_cap"]) + sim.perks.green_cap()
	var out := minf(total, cap)
	if sim.is_night():
		out += minf(night, 0.25)
	return out

## 두 시설 사이에 낀 타일 수 (맞닿아 있으면 0)
static func rect_gap(a: Rect2i, b: Rect2i) -> int:
	var dx := maxi(0, maxi(a.position.x - b.end.x, b.position.x - a.end.x))
	var dy := maxi(0, maxi(a.position.y - b.end.y, b.position.y - a.end.y))
	return maxi(dx, dy)
