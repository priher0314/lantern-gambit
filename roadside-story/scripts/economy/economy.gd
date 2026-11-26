class_name Economy
extends RefCounted
## 매출·비용 장부와 일일 정산. 돈은 실제 판매가 있을 때만 들어온다.

var sim: Sim
var today: Dictionary = {}
var history: Array = []          # 최근 일별 기록
var total_rev: float = 0.0
var total_cost: float = 0.0
var total_sales: int = 0
var unmet_today: Dictionary = {}
var unmet_last: Dictionary = {}
var gave_up_last: Dictionary = {}   # 시설 uid -> 포기한 손님 수 (어제)
var gave_up_today: Dictionary = {}
var missed_last: int = 0
var period: Dictionary = {}      # 전국 평가 기간 누적
var type_counts: Dictionary = {}
var cat_rev: Dictionary = {}     # 분야별 누적 매출

func _init(s: Sim) -> void:
	sim = s
	_reset_today()
	_reset_period()

func _reset_today() -> void:
	today = {"rev": 0.0, "cogs": 0.0, "upkeep": 0.0, "wages": 0.0, "spend": 0.0, "visitors": 0, "sales": 0, "missed": 0}
	unmet_today = {}
	gave_up_today = {}

func _reset_period() -> void:
	period = {"rev": 0.0, "food_rev": 0.0, "tour_uses": 0, "cheap_sales": 0, "sales": 0, "visitors": 0, "sat_sum": 0.0, "sat_n": 0, "profit": 0.0}

func record_sale(f: Facility, pid: String, price: float, cost: float, qty: int, _ctype: String) -> void:
	sim.earn(price - cost)
	today["rev"] += price
	today["cogs"] += cost
	today["sales"] += qty
	total_rev += price
	total_cost += cost
	total_sales += qty
	f.rev_today += price
	f.rev_total += price
	var cat := f.cat()
	cat_rev[cat] = float(cat_rev.get(cat, 0.0)) + price
	period["rev"] += price
	period["sales"] += qty
	period["profit"] += price - cost
	if cat == "food":
		period["food_rev"] += price
	# 실속 분야: 기본 가격이 3,000원 이하인 상품의 판매량
	if float(Data.products[pid]["price"]) <= 3000.0:
		period["cheap_sales"] += qty

func note_spend(amount: float, _why: String) -> void:
	today["spend"] += amount

func note_missed() -> void:
	today["missed"] += 1

func note_unmet(need: String) -> void:
	unmet_today[need] = int(unmet_today.get(need, 0)) + 1

func note_gave_up(f: Facility) -> void:
	gave_up_today[f.uid] = int(gave_up_today.get(f.uid, 0)) + 1

func note_visitor(type_id: String) -> void:
	today["visitors"] += 1
	period["visitors"] += 1
	type_counts[type_id] = int(type_counts.get(type_id, 0)) + 1

func daily_upkeep() -> float:
	var u := 0.0
	for f in sim.fac_list:
		u += f.upkeep
	return u

func close_day() -> void:
	var upkeep := daily_upkeep()
	var wages: float = sim.staff.total_wages()
	today["upkeep"] = upkeep
	today["wages"] = wages
	var due := upkeep + wages
	total_cost += due
	period["profit"] -= due
	# 일반 모드에는 파산이 없다. 모자란 운영비는 탕감하고, 바닥나면 지원금을 준다.
	sim.money = maxf(0.0, sim.money - due)
	var net: float = float(today["rev"]) - float(today["cogs"]) - due
	today["net"] = net
	today["day"] = sim.day() - 1
	history.append(today.duplicate())
	if history.size() > 120:
		history.pop_front()
	if sim.money < float(Data.balance["support_threshold"]) and net < 0.0:
		var amt: float = float(Data.balance["support_amount"])
		sim.earn(amt)
		sim.emit("toast", {"text": "지역 상생 지원금 %s을 받았습니다." % Fmt.won(amt), "kind": "money"})
	unmet_last = unmet_today
	gave_up_last = gave_up_today
	missed_last = int(today["missed"])
	for f in sim.fac_list:
		f.rev_yesterday = f.rev_today
		f.rev_today = 0.0
		f.served_today = 0
	var dpm: int = int(Data.balance["days_per_month"])
	if sim.day() % dpm == 0 and history.size() >= dpm:
		var msum := 0.0
		for i in range(history.size() - dpm, history.size()):
			msum += float(history[i]["net"])
		var prev_month := (sim.month() + 10) % 12 + 1
		sim.emit("toast", {"text": "%d월 결산: 순이익 %s" % [prev_month, Fmt.won(msum)], "kind": "money"})
	_reset_today()

func last_net() -> float:
	if history.is_empty():
		return 0.0
	return float(history[-1]["net"])

func recent_avg(key: String, days: int = 5) -> float:
	if history.is_empty():
		return 0.0
	var n := mini(days, history.size())
	var s := 0.0
	for i in range(history.size() - n, history.size()):
		s += float(history[i].get(key, 0.0))
	return s / n

func to_dict() -> Dictionary:
	return {"today": today, "history": history, "total_rev": total_rev, "total_cost": total_cost, "total_sales": total_sales,
		"unmet_today": unmet_today, "unmet_last": unmet_last, "missed_last": missed_last, "period": period,
		"type_counts": type_counts, "cat_rev": cat_rev}

func load_dict(d: Dictionary) -> void:
	today = d["today"]
	history = d["history"]
	total_rev = float(d["total_rev"])
	total_cost = float(d["total_cost"])
	total_sales = int(d["total_sales"])
	unmet_today = d.get("unmet_today", {})
	unmet_last = d.get("unmet_last", {})
	missed_last = int(d.get("missed_last", 0))
	period = d["period"]
	type_counts = d.get("type_counts", {})
	cat_rev = d.get("cat_rev", {})
	gave_up_today = {}
	gave_up_last = {}
