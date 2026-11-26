class_name ProductSystem
extends RefCounted
## 상품: 개발(연구), 판매 시설 자동 등록, 가격, 입소문(명성 단계).

var sim: Sim
var developed: Array = []           # 개발 완료 상품 ID
var state: Dictionary = {}          # pid -> {sold, fame}
var current: Dictionary = {}        # 진행 중 연구 {pid, left, total}
var researched_count: int = 0
var top_pid: String = ""

func _init(s: Sim) -> void:
	sim = s

func init_defaults() -> void:
	developed.clear()
	state.clear()
	for pid in Data.product_order:
		if not Data.products[pid].has("recipe"):
			developed.append(pid)

func st(pid: String) -> Dictionary:
	if not state.has(pid):
		state[pid] = {"sold": 0, "fame": 0.0}
	return state[pid]

func stage(pid: String) -> int:
	var fame: float = float(st(pid)["fame"])
	var th: Array = Data.balance["fame_stages"]
	var s := 0
	for i in th.size():
		if fame >= float(th[i]):
			s = i
	return s

func stage_progress(pid: String) -> float:
	var s := stage(pid)
	var th: Array = Data.balance["fame_stages"]
	if s >= th.size() - 1:
		return 1.0
	return (float(st(pid)["fame"]) - float(th[s])) / (float(th[s + 1]) - float(th[s]))

# ---------------------------------------------------------------- 가격 / 선택

func price(pid: String, f: Facility) -> float:
	var pd: Dictionary = Data.products[pid]
	var p: float = float(pd["price"]) * f.price_mult * (1.0 + float(Data.balance["fame_price"][stage(pid)]))
	if pid == top_pid:
		p *= 1.0 + sim.perks.signature_price()
	return maxf(100.0, roundf(p / 100.0) * 100.0)

func cheapest_price(f: Facility) -> float:
	var best := 1.0e12
	for pid in f.products:
		best = minf(best, price(pid, f))
	return best if best < 1.0e11 else 0.0

func pick_for(c: Customer, f: Facility) -> String:
	var total := 0.0
	var ws: Array = []
	var ids: Array = []
	var season := sim.season()
	var tol: float = float(c.tdef().get("price_tol", 1.0))
	for pid in f.products:
		var pr := price(pid, f)
		if pr > c.budget:
			continue
		var pd: Dictionary = Data.products[pid]
		var w: float = float(Data.balance["fame_pop"][stage(pid)])
		w *= float(pd.get("likes", {}).get(c.type, 1.0))
		if pd.has("season"):
			w *= 1.45 if pd["season"] == season else 0.85
		w *= 0.5 + float(pd["q"]) / 100.0
		# 씀씀이가 큰 손님은 비싼 상품을 더 고른다
		w *= pow(pr / 3000.0, 0.35 * tol)
		ws.append(w)
		ids.append(pid)
		total += w
	if ids.is_empty():
		return ""
	var r := sim.rng.randf() * total
	for i in ids.size():
		r -= ws[i]
		if r <= 0.0:
			return ids[i]
	return ids[-1]

func on_sold(pid: String, f: Facility, qty: int, sat: float) -> void:
	var s := st(pid)
	s["sold"] = int(s["sold"]) + qty
	var before := stage(pid)
	var pd: Dictionary = Data.products[pid]
	var q: float = (float(pd["q"]) + f.quality) * 0.5
	var gain: float = qty * (0.35 + q / 80.0) * (0.5 + sat / 100.0)
	gain *= sim.perks.fame_mult(pid, f, pid == top_pid)
	if pd.get("need", "") == "fuel":
		gain = 0.0
	s["fame"] = float(s["fame"]) + gain
	if top_pid == "" or int(s["sold"]) > int(st(top_pid)["sold"]):
		if pd.get("need", "") != "fuel":
			top_pid = pid
	var after := stage(pid)
	if after > before:
		sim.mark_dirty()
		sim.prog.on_product_stage(pid, after)
		sim.emit("product_fame", {"pid": pid, "stage": after})

func add_fame(pid: String, amount: float) -> void:
	var before := stage(pid)
	st(pid)["fame"] = float(st(pid)["fame"]) + amount
	var after := stage(pid)
	if after > before:
		sim.mark_dirty()
		sim.prog.on_product_stage(pid, after)
		sim.emit("product_fame", {"pid": pid, "stage": after})

## 방문객을 끌어오는 힘: 가장 유명한 상품 3개까지만 센다 (무한 누적 방지)
func fame_draw() -> float:
	var vals: Array = []
	for pid in developed:
		var sg := stage(pid)
		if sg > 0 and _is_sold_somewhere(pid):
			vals.append(float(Data.balance["fame_draw"][sg]))
	vals.sort()
	vals.reverse()
	var t := 0.0
	for i in mini(3, vals.size()):
		t += vals[i]
	return t

func _is_sold_somewhere(pid: String) -> bool:
	for f in sim.fac_list:
		if f.products.has(pid):
			return true
	return false

func best_stage() -> int:
	var b := 0
	for pid in developed:
		b = maxi(b, stage(pid))
	return b

# ---------------------------------------------------------------- 판매 시설 등록

func candidates_for(f: Facility) -> Array:
	var out: Array = []
	for pid in developed:
		if (Data.products[pid]["at"] as Array).has(f.id):
			out.append(pid)
	return out

func _score(pid: String) -> float:
	var pd: Dictionary = Data.products[pid]
	return (float(pd["price"]) - float(pd["cost"])) * float(Data.balance["fame_pop"][stage(pid)]) * (0.5 + float(pd["q"]) / 100.0)

func slots_of(f: Facility) -> int:
	return int(f.def().get("slots", 0)) + (1 if f.tier() >= 2 and int(f.def().get("slots", 0)) > 1 else 0)

func assign_auto(f: Facility) -> void:
	var n := slots_of(f)
	if n <= 0:
		f.products = (f.def().get("products", []) as Array).duplicate()
		return
	var cands := candidates_for(f)
	if f.manual_products:
		var keep: Array = []
		for pid in f.products:
			if cands.has(pid) and keep.size() < n:
				keep.append(pid)
		if not keep.is_empty():
			f.products = keep
			return
		f.manual_products = false
	cands.sort_custom(func(a, b): return _score(a) > _score(b))
	# 싼 상품 하나는 꼭 남겨서 주머니 가벼운 손님도 살 수 있게 한다
	var pick: Array = cands.slice(0, n)
	if cands.size() > n:
		var cheapest: String = cands[0]
		for pid in cands:
			if float(Data.products[pid]["price"]) < float(Data.products[cheapest]["price"]):
				cheapest = pid
		if not pick.has(cheapest):
			pick[n - 1] = cheapest
	f.products = pick

func toggle_product(f: Facility, pid: String) -> bool:
	if f.products.has(pid):
		if f.products.size() <= 1:
			return false
		f.products.erase(pid)
	else:
		if f.products.size() >= slots_of(f):
			return false
		if not candidates_for(f).has(pid):
			return false
		f.products.append(pid)
	f.manual_products = true
	return true

func reassign_all() -> void:
	for f in sim.facilities.values():
		assign_auto(f)

# ---------------------------------------------------------------- 연구

func ingredient_unlocked(ing: String) -> bool:
	return int(Data.ingredients[ing].get("rank", 1)) <= sim.prog.rank

## 두 재료 조합의 상태: none(만들 게 없음) / done(개발 완료) / new(개발 가능)
func combo_info(a: String, b: String) -> Dictionary:
	if a == b:
		return {"state": "none"}
	var key := Data.recipe_key(a, b)
	if not Data.recipes.has(key):
		return {"state": "none"}
	var pid: String = Data.recipes[key]
	if developed.has(pid):
		return {"state": "done", "pid": pid}
	return {"state": "new", "pid": pid, "cost": research_cost(pid), "days": research_days(pid)}

func research_cost(pid: String) -> float:
	return roundf(float(Data.products[pid].get("rc", 30000)) * sim.perks.research_cost_mult() / 1000.0) * 1000.0

func research_days(pid: String) -> float:
	return float(Data.products[pid].get("rt", 1.0)) * sim.perks.research_time_mult() / sim.staff.research_speed()

func start_research(a: String, b: String) -> Dictionary:
	if not current.is_empty():
		return {"ok": false, "reason": "이미 연구 중인 상품이 있어요"}
	if not ingredient_unlocked(a) or not ingredient_unlocked(b):
		return {"ok": false, "reason": "아직 쓸 수 없는 재료예요"}
	var info := combo_info(a, b)
	if info["state"] != "new":
		return {"ok": false, "reason": "이 조합으로는 새로 만들 게 없어요"}
	if not sim.spend(float(info["cost"]), "research"):
		return {"ok": false, "reason": "자금이 부족해요"}
	var total: float = float(info["days"]) * sim.day_len()
	current = {"pid": info["pid"], "left": total, "total": total}
	sim.last_action = "신상품 연구 시작"
	sim.emit("research_started", {"pid": info["pid"]})
	return {"ok": true}

func progress() -> float:
	if current.is_empty():
		return 0.0
	return 1.0 - float(current["left"]) / float(current["total"])

func tick(dt: float) -> void:
	if current.is_empty():
		return
	current["left"] = float(current["left"]) - dt
	if float(current["left"]) <= 0.0:
		complete_research()

func complete_research() -> void:
	if current.is_empty():
		return
	var pid: String = current["pid"]
	current = {}
	developed.append(pid)
	researched_count += 1
	var bonus: float = sim.perks.fame_start()
	if bonus > 0.0:
		st(pid)["fame"] = bonus
	reassign_all()
	var where: Array = []
	for f in sim.facilities.values():
		if f.products.has(pid) and not where.has(f.def()["name"]):
			where.append(f.def()["name"])
	sim.mark_dirty()
	sim.prog.discover("product", pid)
	sim.last_action = "%s 개발 완료" % Data.products[pid]["name"]
	sim.emit("research_done", {"pid": pid, "where": where})

## 아직 개발하지 않은, 지금 재료로 만들 수 있는 조합 수
func open_recipes() -> int:
	var n := 0
	for key in Data.recipes:
		var pid: String = Data.recipes[key]
		if developed.has(pid):
			continue
		var r: Array = Data.products[pid]["recipe"]
		if ingredient_unlocked(r[0]) and ingredient_unlocked(r[1]):
			n += 1
	return n

func to_dict() -> Dictionary:
	return {"developed": developed, "state": state, "current": current, "researched": researched_count, "top": top_pid}

func load_dict(d: Dictionary) -> void:
	developed = d["developed"]
	state = d["state"]
	for pid in state:
		state[pid]["sold"] = int(state[pid]["sold"])
	current = d.get("current", {})
	researched_count = int(d.get("researched", 0))
	top_pid = d.get("top", "")
