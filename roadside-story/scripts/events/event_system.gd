class_name EventSystem
extends RefCounted
## 가끔 일어나는 짧은 이벤트. 대부분 자동으로 진행되고, 나쁜 일은 일어나지 않는다.

var sim: Sim
var active: Array = []           # [{id, until, traffic, attract}]
var last_day: Dictionary = {}    # 이벤트 ID -> 마지막 발생일
var done_once: Array = []
var next_event_day: int = 6
var perm_traffic: float = 0.0
var pending_choice: Dictionary = {}

func _init(s: Sim) -> void:
	sim = s

func apply_mods() -> void:
	sim.add_mod("traffic", perm_traffic)
	for a in active:
		sim.add_mod("traffic", float(a.get("traffic", 0.0)))
		for t in a.get("attract", {}):
			sim.add_attract(t, float(a["attract"][t]))

func on_new_day() -> void:
	var d := sim.day()
	var before := active.size()
	active = active.filter(func(a): return int(a["until"]) > d)
	if active.size() != before:
		sim.mark_dirty()
	if d < next_event_day or not pending_choice.is_empty():
		return
	next_event_day = d + sim.rng.randi_range(4, 8)
	var ids: Array = []
	var ws: Array = []
	var total := 0.0
	for id in Data.event_order:
		var e: Dictionary = Data.events[id]
		if not _eligible(e, d):
			continue
		ids.append(id)
		ws.append(float(e["weight"]))
		total += float(e["weight"])
	if ids.is_empty():
		return
	var r := sim.rng.randf() * total
	var pick: String = ids[-1]
	for i in ids.size():
		r -= ws[i]
		if r <= 0.0:
			pick = ids[i]
			break
	trigger(pick)

func _eligible(e: Dictionary, d: int) -> bool:
	if sim.prog.rank < int(e.get("min_rank", 1)):
		return false
	if e.get("once", false) and done_once.has(e["id"]):
		return false
	if last_day.has(e["id"]) and d - int(last_day[e["id"]]) < int(e.get("cooldown", 10)):
		return false
	if e.has("need_cat"):
		var ok := false
		for f in sim.fac_list:
			if f.cat() == e["need_cat"]:
				ok = true
				break
		if not ok:
			return false
	if e.has("need_fame_stage") and sim.products.best_stage() < int(e["need_fame_stage"]):
		return false
	return true

func trigger(id: String) -> void:
	var e: Dictionary = Data.events[id]
	last_day[id] = sim.day()
	if e.get("once", false):
		done_once.append(id)
	if e.get("choice", false):
		pending_choice = {"id": id}
		sim.emit("event_choice", {"id": id})
		return
	var text := _apply(e["fx"], String(e["text"]))
	sim.emit("event_fired", {"id": id, "text": text})

func choose(option: int) -> void:
	if pending_choice.is_empty():
		return
	var e: Dictionary = Data.events[pending_choice["id"]]
	pending_choice = {}
	var opt: Dictionary = e["options"][option]
	var cost: float = float(opt.get("cost", 0))
	if cost > 0.0 and not sim.spend(cost, "event"):
		sim.emit("toast", {"text": "자금이 모자라 이번엔 참가하지 못했습니다.", "kind": "info"})
		return
	_apply(opt["fx"], "")

func _top_product_name() -> String:
	var pid := sim.products.top_pid
	return Data.products[pid]["name"] if pid != "" else "대표 상품"

func _apply(fx: Dictionary, text: String) -> String:
	var d := sim.day()
	if fx.has("bus"):
		var t: String = fx["bus"]["type"]
		if not sim.cust.type_weights.has(t):
			t = fx["bus"].get("fallback", "traveler")
		sim.cust.queue_special(t, int(fx["bus"]["n"]), "bus")
	if fx.has("burst"):
		for i in int(fx["burst"]["n"]):
			sim.cust.queue_special(fx["burst"]["type"], 1, "")
	if fx.has("traffic") or fx.has("attract"):
		active.append({"until": d + int(fx.get("days", 1)), "traffic": float(fx.get("traffic", 0.0)), "attract": fx.get("attract", {})})
		sim.mark_dirty()
	if fx.has("traffic_perm"):
		perm_traffic += float(fx["traffic_perm"])
		sim.mark_dirty()
	if fx.has("fame_top") and sim.products.top_pid != "":
		sim.products.add_fame(sim.products.top_pid, float(fx["fame_top"]))
	if fx.has("rep"):
		sim.prog.add_reputation(float(fx["rep"]))
	if fx.has("money"):
		sim.earn(float(fx["money"]))
	if fx.has("candidate"):
		sim.staff.add_special_candidate(fx["candidate"]["job"], float(fx["candidate"]["bonus"]))
	if fx.has("contest"):
		_contest()
	return text.replace("{product}", _top_product_name())

func _contest() -> void:
	var q := 0.0
	var n := 0
	for f in sim.fac_list:
		if f.cat() == "food":
			q += f.quality
			n += 1
	var avg := q / maxi(n, 1)
	var chance := clampf((avg - 40.0) / 40.0, 0.1, 0.95)
	if sim.rng.randf() < chance:
		sim.prog.add_reputation(350.0)
		if sim.products.top_pid != "":
			sim.products.add_fame(sim.products.top_pid, 250.0)
		sim.earn(400000.0)
		sim.emit("toast", {"text": "전국 먹거리 대회에서 입상했습니다! 상금 400,000원과 큰 명성을 얻었습니다.", "kind": "star"})
	else:
		sim.prog.add_reputation(60.0)
		sim.emit("toast", {"text": "대회에서 입상은 못 했지만, 참가만으로도 이름이 조금 알려졌습니다.", "kind": "info"})

func to_dict() -> Dictionary:
	return {"active": active, "last_day": last_day, "done_once": done_once, "next": next_event_day, "perm": perm_traffic, "pending": pending_choice}

func load_dict(d: Dictionary) -> void:
	active = d.get("active", [])
	last_day = d.get("last_day", {})
	done_once = d.get("done_once", [])
	next_event_day = int(d.get("next", 6))
	perm_traffic = float(d.get("perm", 0.0))
	pending_choice = d.get("pending", {})
