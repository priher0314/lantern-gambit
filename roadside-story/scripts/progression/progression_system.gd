class_name ProgressionSystem
extends RefCounted
## 경영 등급, 명성, 목표, 조언, 전국 평가, 회차 완료, 도감 발견 알림.

var sim: Sim
var rank: int = 1
var reputation: float = 0.0
var visitors: int = 0
var upgrades: int = 0
var sat_avg: float = 60.0
var tut_index: int = 0
var seen: Dictionary = {}          # 도감 분류 -> [id]  (이번 휴게소에서 본 것)
var awards: Array = []             # 지급한 명성 보상 ID
var trophies: Array = []
var eval_history: Array = []
var best_eval: Dictionary = {}     # 분야 -> 최고 순위
var run_complete: bool = false
var complete_reason: String = ""
var challenge_done: bool = false
var rare_happy: int = 0
var max_staff_level: int = 1
var advice: Array = []
var _advice_seen: Dictionary = {}
var _check_acc: float = 0.0
var next_eval_day: int = 0
var rank_days: Dictionary = {}     # 등급 -> 달성 일차 (기록용)

const EVAL_CATS := ["overall", "food", "tour", "service", "value"]
const EVAL_NAMES := {"overall": "종합", "food": "음식", "tour": "관광", "service": "서비스", "value": "실속"}

func _init(s: Sim) -> void:
	sim = s

func init_new() -> void:
	next_eval_day = int(Data.balance["eval_period_days"])
	for f in sim.facilities.values():
		discover("facility", f.id)
	for pid in sim.products.developed:
		pass
	discover("region", sim.region_id)

# ---------------------------------------------------------------- 도감

func discover(cat: String, id: String) -> void:
	if not seen.has(cat):
		seen[cat] = []
	if (seen[cat] as Array).has(id):
		return
	(seen[cat] as Array).append(id)
	sim.emit("discover", {"cat": cat, "id": id})

func has_seen(cat: String, id: String) -> bool:
	return seen.has(cat) and (seen[cat] as Array).has(id)

# ---------------------------------------------------------------- 훅

func on_built(f: Facility) -> void:
	discover("facility", f.id)
	for pid in f.products:
		discover("product", pid)

func on_upgraded(_f: Facility) -> void:
	upgrades += 1

func on_visitor(c: Customer) -> void:
	visitors += 1
	sim.econ.note_visitor(c.type)
	if not has_seen("customer", c.type):
		discover("customer", c.type)
		var t: Dictionary = Data.customer_types[c.type]
		if visitors > 3:
			sim.emit("toast", {"text": "새로운 손님: %s" % t["name"], "kind": "star"})

func on_use(_c: Customer, f: Facility) -> void:
	if f.cat() == "tour":
		sim.econ.period["tour_uses"] = int(sim.econ.period["tour_uses"]) + 1

func on_customer_left(c: Customer) -> void:
	sat_avg = lerpf(sat_avg, c.sat, 0.02)
	sim.econ.period["sat_sum"] = float(sim.econ.period["sat_sum"]) + c.sat
	sim.econ.period["sat_n"] = int(sim.econ.period["sat_n"]) + 1
	var g: float = pow(clampf((c.sat - 40.0) / 45.0, 0.0, 1.2), 1.3) * float(Data.balance["rep_per_customer"])
	g *= sim.perks.rep_mult(c)
	g *= 1.0 + float(sim.mods.get("rep", 0.0))
	var t: Dictionary = c.tdef()
	if t.get("rare", false) and c.sat >= 60.0:
		g += float(t.get("rep_burst", 0))
		rare_happy += 1
		if t.has("fame_burst") and sim.products.top_pid != "":
			sim.products.add_fame(sim.products.top_pid, float(t["fame_burst"]))
		sim.emit("toast", {"text": "%s이(가) 만족하고 돌아갔습니다! 소문이 크게 퍼집니다." % t["name"], "kind": "star"})
	reputation += g

func add_reputation(v: float) -> void:
	reputation += v

func on_hired(_e: Dictionary) -> void:
	pass

func on_staff_level(e: Dictionary) -> void:
	max_staff_level = maxi(max_staff_level, int(e["level"]))

func on_product_stage(pid: String, stage: int) -> void:
	if stage >= 1:
		sim.emit("toast", {"text": "「%s」이(가) %s이(가) 되었습니다!" % [Data.products[pid]["name"], Data.FAME_STAGE_NAMES[stage]], "kind": "star"})

func on_synergy(_sid: String) -> void:
	pass

func on_combo(_cid: String) -> void:
	pass

# ---------------------------------------------------------------- 등급

func next_rank_def() -> Dictionary:
	if rank >= Data.max_rank():
		return {}
	return Data.rank_def(rank + 1)

func rank_progress() -> float:
	var n := next_rank_def()
	if n.is_empty():
		return 1.0
	var a := minf(1.0, float(visitors) / maxf(1.0, float(n["visitors"])))
	var b := minf(1.0, reputation / maxf(1.0, float(n["rep"])))
	return (a + b) * 0.5

func tick(dt: float) -> void:
	_check_acc += dt
	if _check_acc < 1.0:
		return
	_check_acc = 0.0
	_check_rank()
	_check_tutorial()
	_check_awards()

func _check_rank() -> void:
	var n := next_rank_def()
	if n.is_empty():
		return
	if visitors >= int(n["visitors"]) and reputation >= float(n["rep"]):
		set_rank(rank + 1)

func set_rank(r: int) -> void:
	var old := rank
	rank = clampi(r, 1, Data.max_rank())
	if rank <= old:
		return
	for rr in range(old + 1, rank + 1):
		rank_days[str(rr)] = sim.day()
		var bonus: float = float(Data.balance["rank_bonus_money"][rr - 1])
		if sim.challenge.get("mods", {}).get("no_rank_bonus", false):
			bonus = 0.0
		sim.earn(bonus)
		var unlocked: Array = []
		for fid in Data.facility_order:
			if int(Data.facilities[fid].get("rank", 1)) == rr and sim.facility_unlocked(fid):
				unlocked.append(fid)
		var ings: Array = []
		for ing in Data.ingredient_order:
			if int(Data.ingredients[ing].get("rank", 1)) == rr:
				ings.append(ing)
		sim.emit("rank_up", {"rank": rr, "bonus": bonus, "facilities": unlocked, "ingredients": ings})
		if (Data.balance["perk_ranks"] as Array).has(float(rr)):
			sim.perks.grant_offer(rr)
	sim.mark_dirty()
	if rank >= Data.max_rank():
		_complete("랜드마크 휴게소 달성")
	if not sim.challenge.is_empty() and not challenge_done and rank >= int(sim.challenge.get("goal_rank", 99)):
		challenge_done = true
		sim.emit("challenge_done", {"id": sim.challenge_id, "day": sim.day()})
		_complete("도전 「%s」 성공" % sim.challenge["name"])

func _complete(reason: String) -> void:
	if run_complete:
		return
	run_complete = true
	complete_reason = reason
	sim.emit("run_complete", {"reason": reason, "day": sim.day()})

# ---------------------------------------------------------------- 목표

func _cond_ok(cond: Dictionary) -> bool:
	if cond.has("sales") and sim.econ.total_sales < int(cond["sales"]):
		return false
	if cond.has("fac") and not sim.has_fac(cond["fac"]):
		return false
	if cond.has("upgrades") and upgrades < int(cond["upgrades"]):
		return false
	if cond.has("researched") and sim.products.researched_count < int(cond["researched"]):
		return false
	if cond.has("staff") and sim.staff.staff.size() < int(cond["staff"]):
		return false
	if cond.has("parking_cap") and sim.cust.parking_capacity() < int(cond["parking_cap"]):
		return false
	if cond.has("rank") and rank < int(cond["rank"]):
		return false
	if cond.has("fame_stage") and sim.products.best_stage() < int(cond["fame_stage"]):
		return false
	if cond.has("synergies") and sim.synergy.discovered.size() < int(cond["synergies"]):
		return false
	if cond.has("staff_level") and max_staff_level < int(cond["staff_level"]):
		return false
	if cond.has("combos") and sim.perks.combos.size() < int(cond["combos"]):
		return false
	if cond.has("visitors") and visitors < int(cond["visitors"]):
		return false
	if cond.has("rare") and rare_happy < int(cond["rare"]):
		return false
	if cond.has("eval_rank") and int(best_eval.get("overall", 99)) > int(cond["eval_rank"]):
		return false
	if cond.has("cat_first"):
		var any := false
		for c in ["food", "tour", "service", "value"]:
			if int(best_eval.get(c, 99)) == 1:
				any = true
		if not any:
			return false
	if cond.has("challenge") and not challenge_done:
		return false
	return true

func _check_tutorial() -> void:
	var goals: Array = Data.progression["tutorial_goals"]
	if tut_index >= goals.size():
		return
	var g: Dictionary = goals[tut_index]
	if _cond_ok(g["cond"]):
		tut_index += 1
		sim.earn(float(g["reward"]))
		sim.emit("goal_done", {"text": g["text"], "reward": g["reward"]})

func _check_awards() -> void:
	for a in Data.progression["fame_awards"]:
		if awards.has(a["id"]):
			continue
		if _cond_ok(a["cond"]):
			awards.append(a["id"])
			sim.emit("fame_award", {"id": a["id"], "fame": a["fame"], "text": a["text"]})
	for t in Data.progression["trophies"]:
		if trophies.has(t["id"]):
			continue
		if _cond_ok(t["cond"]):
			trophies.append(t["id"])
			sim.emit("trophy", {"id": t["id"], "name": t["name"]})

## 화면에 보여줄 목표 (최대 3개): [{text, hint, progress, kind}]
func goals() -> Array:
	var out: Array = []
	var tg: Array = Data.progression["tutorial_goals"]
	if tut_index < tg.size():
		var g: Dictionary = tg[tut_index]
		out.append({"text": g["text"], "hint": g["hint"], "progress": -1.0, "kind": "guide", "reward": g["reward"]})
	var n := next_rank_def()
	if not n.is_empty():
		out.append({"text": "「%s」 되기" % n["name"], "hint": "손님 %s/%s명 · 명성 %s/%s" % [Fmt.comma(visitors), Fmt.comma(int(n["visitors"])), Fmt.comma(int(reputation)), Fmt.comma(int(n["rep"]))], "progress": rank_progress(), "kind": "rank"})
	else:
		var days_left := next_eval_day - sim.day()
		out.append({"text": "전국 평가에서 더 높은 순위 노리기", "hint": "다음 평가까지 %d일" % days_left, "progress": -1.0, "kind": "rank"})
	if not sim.challenge.is_empty() and not challenge_done:
		out.append({"text": "도전: %s" % sim.challenge["name"], "hint": sim.challenge["desc"], "progress": float(rank) / float(sim.challenge["goal_rank"]), "kind": "challenge"})
	elif not advice.is_empty() and out.size() < 3:
		out.append({"text": advice[0], "hint": "", "progress": -1.0, "kind": "advice"})
	return out

# ---------------------------------------------------------------- 조언 / 일일 처리

func on_new_day() -> void:
	_make_advice()
	if sim.day() >= next_eval_day:
		next_eval_day += int(Data.balance["eval_period_days"])
		run_eval()

func _make_advice() -> void:
	advice.clear()
	var e := sim.econ
	var vis: int = maxi(1, int(e.history[-1]["visitors"]) if not e.history.is_empty() else 1)
	if e.missed_last >= 3 and e.missed_last > vis / 6:
		advice.append("주차 자리가 모자라 차들이 그냥 지나가고 있어요")
	var worst := ""
	var worst_n := 0
	for n in e.unmet_last:
		if int(e.unmet_last[n]) > worst_n:
			worst_n = int(e.unmet_last[n])
			worst = n
	if worst != "" and worst_n >= 3 and worst_n > vis / 6:
		if worst == "toilet":
			advice.append("화장실을 찾다 그냥 떠나는 손님이 많아요")
		else:
			advice.append("「%s」을(를) 찾는 손님이 많아요" % Data.NEED_NAMES.get(worst, worst))
	var gu_f := 0
	var gu_n := 0
	for u in e.gave_up_last:
		if int(e.gave_up_last[u]) > gu_n:
			gu_n = int(e.gave_up_last[u])
			gu_f = int(u)
	if gu_n >= 3 and sim.fac(gu_f) != null:
		advice.append("%s 줄이 길어 손님이 돌아서요. 업그레이드해 보세요" % sim.fac(gu_f).def()["name"])
	if advice.is_empty() and sim.products.open_recipes() > 0 and sim.products.current.is_empty() and sim.money > 150000.0 and tut_index >= 5:
		advice.append("연구할 수 있는 새 상품이 있어요")
	if not advice.is_empty():
		var a: String = advice[0]
		if int(_advice_seen.get(a, -99)) + 4 <= sim.day():
			_advice_seen[a] = sim.day()
			sim.emit("toast", {"text": a, "kind": "advice"})

# ---------------------------------------------------------------- 전국 평가

func _sat(x: float, k: float) -> float:
	return 100.0 * (1.0 - exp(-x / k))

func my_scores() -> Dictionary:
	var pr: Dictionary = sim.econ.period
	var k: Dictionary = Data.balance.get("eval_k", {})
	var sat_mean: float = float(pr["sat_sum"]) / maxf(1.0, float(pr["sat_n"]))
	var food := _sat(float(pr["food_rev"]), float(k.get("food", 3.0e7)))
	var tour := _sat(float(pr["tour_uses"]), float(k.get("tour", 4500)))
	var value := _sat(float(pr["cheap_sales"]), float(k.get("value", 9000)))
	var vis_s := _sat(float(pr["visitors"]), float(k.get("visitors", 5000)))
	# 서비스는 만족도가 높아도 손님이 적으면 높은 점수를 받지 못한다
	var service := clampf((sat_mean - 50.0) / 40.0, 0.0, 1.0) * 100.0 * (0.25 + 0.75 * vis_s / 100.0)
	var overall := 0.3 * (float(rank) / Data.max_rank() * 100.0) + 0.4 * vis_s + 0.3 * maxf(maxf(food, tour), maxf(service, value))
	return {"overall": overall, "food": food, "tour": tour, "service": service, "value": value}

func rival_score(r: Dictionary, cat: String, yr: int) -> float:
	var g0: float = float(Data.balance.get("rival_start", 0.8))
	var g := g0 + (1.0 - g0) * (1.0 - exp(-float(yr) / 4.0))
	var s: float = float(r["base"]) * g
	if cat == r["focus"]:
		s += 12.0
	elif cat != "overall":
		s -= 6.0
	# 해마다 조금씩 오르내린다 (결정적)
	s += float((hash(String(r["name"]) + cat + str(yr)) % 9)) - 4.0
	return clampf(s, 1.0, 99.0)

func run_eval() -> void:
	var yr := eval_history.size() + 1
	var mine := my_scores()
	var result := {"year": yr, "cats": {}}
	var prize := 0.0
	var first_any := false
	for cat in EVAL_CATS:
		var table: Array = [{"name": sim.stop_name, "score": float(mine[cat]), "me": true}]
		for r in Data.balance["rivals"]:
			table.append({"name": r["name"], "score": rival_score(r, cat, yr), "me": false})
		table.sort_custom(func(a, b): return a["score"] > b["score"])
		var pos := 1
		for i in table.size():
			if table[i]["me"]:
				pos = i + 1
		result["cats"][cat] = {"pos": pos, "score": float(mine[cat]), "table": table.slice(0, 5)}
		best_eval[cat] = mini(int(best_eval.get(cat, 99)), pos)
		if pos == 1:
			first_any = true
		if cat == "overall":
			prize += maxf(0.0, 11.0 - pos) * 40000.0 * rank
		elif pos <= 3:
			prize += (4.0 - pos) * 60000.0 * rank
	result["prize"] = prize
	sim.earn(prize)
	eval_history.append({"year": yr, "pos": {"overall": result["cats"]["overall"]["pos"], "food": result["cats"]["food"]["pos"], "tour": result["cats"]["tour"]["pos"], "service": result["cats"]["service"]["pos"], "value": result["cats"]["value"]["pos"]}})
	sim.econ._reset_period()
	sim.emit("eval", result)
	if first_any:
		var which := ""
		for cat in EVAL_CATS:
			if int(result["cats"][cat]["pos"]) == 1:
				which = EVAL_NAMES[cat]
				break
		_complete("전국 평가 %s 분야 1위" % which)

# ---------------------------------------------------------------- 기타

func style_name() -> String:
	var counts: Dictionary = {}
	var total := 0
	for f in sim.fac_list:
		var k = f.kind()
		if k == "deco" or k == "path" or k == "parking":
			continue
		counts[f.cat()] = float(counts.get(f.cat(), 0.0)) + f.level
		total += 1
	if total < 5:
		return "새내기"
	var names := {"food": "맛집 특화", "tour": "관광 특화", "family": "가족 특화", "relax": "휴양 특화", "shop": "쇼핑 특화"}
	var best := ""
	var best_v := 0.0
	var sum := 0.0
	for c in counts:
		sum += float(counts[c])
		if names.has(c) and float(counts[c]) > best_v:
			best_v = float(counts[c])
			best = c
	if best != "" and best_v / maxf(sum, 1.0) >= 0.38:
		return names[best]
	return "종합형"

func to_dict() -> Dictionary:
	return {"rank": rank, "rep": reputation, "visitors": visitors, "upgrades": upgrades, "sat_avg": sat_avg, "tut": tut_index,
		"seen": seen, "awards": awards, "trophies": trophies, "eval_history": eval_history, "best_eval": best_eval,
		"complete": run_complete, "reason": complete_reason, "challenge_done": challenge_done, "rare": rare_happy,
		"max_staff_level": max_staff_level, "next_eval": next_eval_day, "rank_days": rank_days}

func load_dict(d: Dictionary) -> void:
	rank = int(d["rank"])
	reputation = float(d["rep"])
	visitors = int(d["visitors"])
	upgrades = int(d["upgrades"])
	sat_avg = float(d["sat_avg"])
	tut_index = int(d["tut"])
	seen = d.get("seen", {})
	awards = d.get("awards", [])
	trophies = d.get("trophies", [])
	eval_history = d.get("eval_history", [])
	best_eval = d.get("best_eval", {})
	run_complete = d.get("complete", false)
	complete_reason = d.get("reason", "")
	challenge_done = d.get("challenge_done", false)
	rare_happy = int(d.get("rare", 0))
	max_staff_level = int(d.get("max_staff_level", 1))
	next_eval_day = int(d.get("next_eval", Data.balance["eval_period_days"]))
	rank_days = d.get("rank_days", {})
