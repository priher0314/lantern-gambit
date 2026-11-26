class_name StaffSystem
extends RefCounted
## 직원 채용·배치·자동 성장. 급여는 매일 자동 정산된다.

var sim: Sim
var staff: Dictionary = {}      # id -> Dictionary (직원)
var candidates: Array = []
var next_refresh_day: int = 0
var next_id: int = 1

func _init(s: Sim) -> void:
	sim = s

# ---------------------------------------------------------------- 생성

func _gen(job: String = "", bonus: float = 0.0) -> Dictionary:
	var r := sim.rng
	if job == "":
		job = Data.job_order[r.randi() % Data.job_order.size()]
	var jd: Dictionary = Data.jobs[job]
	var names: Dictionary = Data.staff_names
	var nm: String = String(names["surnames"][r.randi() % names["surnames"].size()]) + String(names["given"][r.randi() % names["given"].size()])
	var potential := r.randi_range(1, 5)
	# 잠재력이 높을수록 초기 능력은 낮게 나오는 경향 → 뽑는 재미와 다양한 조합
	var base := 34.0 - potential * 2.5 + bonus
	var e := {
		"id": 0, "name": nm, "job": job, "look": r.randi() % 6,
		"service": clampf(base + r.randf_range(-8, 12) + float(jd["bias"]["service"]), 8, 95),
		"skill": clampf(base + r.randf_range(-8, 12) + float(jd["bias"]["skill"]), 8, 95),
		"stamina": clampf(base + r.randf_range(-8, 12) + float(jd["bias"]["stamina"]), 8, 95),
		"potential": potential, "level": 1, "xp": 0.0, "fac": 0, "served": 0, "hired_day": 0,
		"traits": [],
	}
	var n_traits := 1 if r.randf() < 0.65 else 2
	while (e["traits"] as Array).size() < n_traits:
		var tr: String = Data.trait_order[r.randi() % Data.trait_order.size()]
		if not (e["traits"] as Array).has(tr):
			(e["traits"] as Array).append(tr)
	if (e["traits"] as Array).has("late_bloomer"):
		for k in ["service", "skill", "stamina"]:
			e[k] = maxf(8.0, float(e[k]) - 6.0)
		e["potential"] = maxi(int(e["potential"]), 4)
	return e

func refresh_candidates() -> void:
	candidates.clear()
	var n: int = int(Data.balance["staff_candidates"])
	for i in n:
		candidates.append(_gen())
	next_refresh_day = sim.day() + int(Data.balance["staff_refresh_days"])

func add_special_candidate(job: String, bonus: float) -> void:
	var e := _gen(job, bonus)
	e["special"] = true
	candidates.push_front(e)
	if candidates.size() > 4:
		candidates.pop_back()

func on_new_day() -> void:
	if sim.day() >= next_refresh_day:
		refresh_candidates()
		sim.emit("toast", {"text": "새 지원자들이 찾아왔습니다.", "kind": "staff"})

# ---------------------------------------------------------------- 채용 / 배치

func wage(e: Dictionary) -> float:
	return float(Data.jobs[e["job"]]["wage"]) * (1.0 + 0.05 * (int(e["level"]) - 1))

func hire_cost(e: Dictionary) -> float:
	return wage(e) * float(Data.balance["staff_hire_cost_days"])

func hire(index: int) -> int:
	if index < 0 or index >= candidates.size():
		return 0
	var e: Dictionary = candidates[index]
	if not sim.spend(hire_cost(e), "hire"):
		return 0
	candidates.remove_at(index)
	e["id"] = next_id
	next_id += 1
	e["hired_day"] = sim.day()
	staff[int(e["id"])] = e
	sim.prog.on_hired(e)
	for tr in e["traits"]:
		sim.prog.discover("trait", tr)
	sim.last_action = "%s 채용" % e["name"]
	auto_assign_one(int(e["id"]))
	sim.mark_dirty()
	sim.emit("staff_changed", {})
	return int(e["id"])

func fire(id: int) -> void:
	if not staff.has(id):
		return
	unassign(id)
	staff.erase(id)
	sim.mark_dirty()
	sim.emit("staff_changed", {})

func unassign(id: int) -> void:
	var e: Dictionary = staff.get(id, {})
	if e.is_empty():
		return
	var f := sim.fac(int(e["fac"]))
	if f != null:
		f.staff_ids.erase(id)
	e["fac"] = 0
	sim.mark_dirty()

func unassign_all(fac_uid: int) -> void:
	for e in staff.values():
		if int(e["fac"]) == fac_uid:
			e["fac"] = 0

func assign(id: int, fac_uid: int) -> bool:
	var e: Dictionary = staff.get(id, {})
	var f := sim.fac(fac_uid)
	if e.is_empty() or f == null:
		return false
	if f.staff_ids.size() >= int(f.def().get("staff", 0)):
		return false
	unassign(id)
	f.staff_ids.append(id)
	e["fac"] = fac_uid
	sim.mark_dirty()
	sim.emit("staff_changed", {})
	return true

func job_match(e: Dictionary, f: Facility) -> float:
	if (e["traits"] as Array).has("all_rounder"):
		return 1.0
	var jobs: Array = f.def().get("jobs", [])
	if jobs.has(e["job"]):
		return 1.0
	var cats: Array = Data.jobs[e["job"]].get("cats", [])
	if cats.has(f.cat()):
		return 0.85
	if e["job"] == "general":
		return 0.7
	return 0.5

func _fit(e: Dictionary, f: Facility) -> float:
	return job_match(e, f) * (float(e["skill"]) + float(e["service"]) + float(e["stamina"])) * (1.0 + 0.1 * f.level) * float(f.def().get("draw", 5) + 5)

func auto_assign_one(id: int) -> void:
	var e: Dictionary = staff[id]
	var best: Facility = null
	var best_s := 0.0
	for f in sim.facilities.values():
		if f.staff_ids.size() >= int(f.def().get("staff", 0)):
			continue
		var s = _fit(e, f) / (1.0 + f.staff_ids.size())
		if s > best_s:
			best_s = s
			best = f
	if best != null:
		assign(id, best.uid)

## 모든 직원을 가장 잘 맞는 자리에 다시 배치한다.
func auto_assign_all() -> void:
	for f in sim.facilities.values():
		f.staff_ids.clear()
	var pool: Array = staff.values()
	for e in pool:
		e["fac"] = 0
	var pairs: Array = []
	for e in pool:
		for f in sim.facilities.values():
			if int(f.def().get("staff", 0)) > 0:
				pairs.append([_fit(e, f), int(e["id"]), f.uid])
	pairs.sort_custom(func(a, b): return a[0] > b[0])
	for p in pairs:
		var e2: Dictionary = staff[p[1]]
		var f2 := sim.fac(p[2])
		if int(e2["fac"]) != 0:
			continue
		if f2.staff_ids.size() >= int(f2.def().get("staff", 0)):
			continue
		# 빈 시설을 먼저 채우도록 두 번째 자리는 점수를 깎는다
		if f2.staff_ids.size() >= 1 and _has_empty_staffable(e2):
			continue
		f2.staff_ids.append(p[1])
		e2["fac"] = p[2]
	for e in pool:
		if int(e["fac"]) == 0:
			auto_assign_one(int(e["id"]))
	sim.mark_dirty()
	sim.emit("staff_changed", {})

func _has_empty_staffable(_e: Dictionary) -> bool:
	for f in sim.facilities.values():
		if int(f.def().get("staff", 0)) > 0 and f.staff_ids.is_empty():
			return true
	return false

func total_wages() -> float:
	var t := 0.0
	for e in staff.values():
		t += wage(e)
	return t

# ---------------------------------------------------------------- 능력치와 효과

func stat(e: Dictionary, key: String) -> float:
	var v: float = float(e[key])
	v *= 1.0 + sim.perks.staff_mult(staff.size())
	if (e["traits"] as Array).has("night_owl") and sim.is_night():
		v *= 1.35
	return v

## 시설에 배치된 직원이 주는 효과: {time(배율), quality(+), appeal(+비율), sat(+), upkeep(배율)}
func facility_effect(f: Facility) -> Dictionary:
	var out := {"time": 1.0, "quality": 0.0, "appeal": 0.0, "sat": 0.0, "upkeep": 1.0}
	var slots: int = int(f.def().get("staff", 0))
	if slots <= 0:
		return out
	if f.staff_ids.is_empty():
		out["time"] = float(Data.balance["no_staff_time_mult"])
		out["quality"] = float(Data.balance["no_staff_quality"])
		return out
	var speed := 0.0
	for id in f.staff_ids:
		var e: Dictionary = staff.get(int(id), {})
		if e.is_empty():
			continue
		var m := job_match(e, f)
		var traits: Array = e["traits"]
		var q: float = stat(e, "skill") * 0.24 * m
		if traits.has("artisan"):
			q *= 1.35
		q *= sim.perks.artisan_mult(e["job"])
		out["quality"] += q
		speed += stat(e, "stamina") * 0.0026 * m
		if traits.has("quick"):
			speed += 0.1
		out["sat"] += stat(e, "service") * 0.055 * m + (2.5 if traits.has("kind") else 0.0)
		if traits.has("popular"):
			out["appeal"] += 0.1
		if traits.has("thrifty"):
			out["upkeep"] *= 0.75
	out["time"] = 1.0 - minf(speed, 0.4)
	return out

func on_serve(f: Facility) -> void:
	if f.staff_ids.is_empty():
		return
	var xp: float = float(Data.balance["staff_xp_per_serve"]) / f.staff_ids.size()
	xp *= 1.0 + _leader_bonus(f)
	for id in f.staff_ids:
		var e: Dictionary = staff.get(int(id), {})
		if e.is_empty():
			continue
		e["served"] = int(e["served"]) + 1
		_add_xp(e, xp)

func _leader_bonus(f: Facility) -> float:
	var bonus := 0.0
	for e in staff.values():
		if int(e["fac"]) == 0:
			continue
		var is_leader: bool = (e["traits"] as Array).has("leader")
		var is_mgr: bool = e["job"] == "manager"
		if not is_leader and not is_mgr:
			continue
		var lf := sim.fac(int(e["fac"]))
		if lf == null:
			continue
		if lf.uid == f.uid or Construction.rect_gap(lf.rect(), f.rect()) <= 3:
			bonus += (0.3 if is_leader else 0.0) + (0.25 if is_mgr else 0.0)
	return minf(bonus, 0.8)

func xp_needed(level: int) -> float:
	return float(Data.balance["staff_level_xp"]) * pow(float(Data.balance["staff_level_xp_growth"]), level - 1)

func _add_xp(e: Dictionary, xp: float) -> void:
	if int(e["level"]) >= int(Data.balance["staff_max_level"]):
		return
	e["xp"] = float(e["xp"]) + xp
	while float(e["xp"]) >= xp_needed(int(e["level"])) and int(e["level"]) < int(Data.balance["staff_max_level"]):
		e["xp"] = float(e["xp"]) - xp_needed(int(e["level"]))
		e["level"] = int(e["level"]) + 1
		var g := 0.9 + 0.45 * int(e["potential"])
		if (e["traits"] as Array).has("late_bloomer"):
			g *= 0.5 if int(e["level"]) <= 5 else 1.9
		for k in ["service", "skill", "stamina"]:
			e[k] = minf(100.0, float(e[k]) + g * sim.rng.randf_range(0.7, 1.3))
		sim.mark_dirty()
		sim.prog.on_staff_level(e)
		sim.emit("staff_level", {"id": int(e["id"]), "name": e["name"], "level": int(e["level"]), "fac": int(e["fac"])})

func research_speed() -> float:
	var n := 0
	for e in staff.values():
		if (e["traits"] as Array).has("researcher"):
			n += 1
	return 1.0 + minf(0.25 * n, 0.75)

func to_dict() -> Dictionary:
	return {"staff": staff.values(), "candidates": candidates, "next_refresh_day": next_refresh_day, "next_id": next_id}

func load_dict(d: Dictionary) -> void:
	staff.clear()
	for e in d["staff"]:
		for k in ["id", "level", "potential", "fac", "served", "look", "hired_day"]:
			e[k] = int(e[k])
		staff[int(e["id"])] = e
	candidates = d["candidates"]
	for e in candidates:
		for k in ["id", "level", "potential", "fac", "served", "look", "hired_day"]:
			e[k] = int(e[k])
	next_refresh_day = int(d["next_refresh_day"])
	next_id = int(d["next_id"])
