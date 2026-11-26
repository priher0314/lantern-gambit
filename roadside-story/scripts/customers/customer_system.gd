class_name CustomerSystem
extends RefCounted
## 차량 도착, 손님의 시설 선택·이동·대기·이용·퇴장.
## 매출은 반드시 여기서 손님이 실제로 시설을 이용했을 때만 생긴다.

var sim: Sim
var customers: Dictionary = {}   # uid -> Customer
var vehicles: Dictionary = {}    # uid -> Vehicle
var type_weights: Dictionary = {}
var _arr_acc: float = 0.6        # 첫 손님이 빨리 오도록 조금 채워 둔다
var _fuel_acc: float = 0.0
var special_queue: Array = []    # 이벤트로 예약된 특별 차량 [{type,n,kind}]

func _init(s: Sim) -> void:
	sim = s

# ---------------------------------------------------------------- 도착

func hour_factor() -> float:
	var curve: Array = Data.balance["hour_curve"]
	var hc: float = float(curve[int(sim.hour()) % 24])
	var nf := sim.night_factor()
	if nf > 0.0:
		var floor_v: float = sim.perks.night_floor()
		if floor_v > 0.0:
			hc = maxf(hc, floor_v)
		hc += float(sim.mods.get("night", 0.0)) * nf
	return hc

func stop_fraction() -> float:
	var b: Dictionary = Data.balance
	var d: float = sim.draw_total + sim.perks.queue_draw() * 100.0
	return float(b["stop_base"]) + float(b["stop_gain"]) * (1.0 - exp(-d / float(b["draw_k"])))

func arrival_rate() -> float:
	var b: Dictionary = Data.balance
	var base: float = float(sim.region["traffic"]) * hour_factor() * float(sim.region["season"][sim.season()])
	# 등급이 오를수록 일부러 찾아오는 차가 늘어난다
	base *= 1.0 + float(b.get("rank_traffic", 0.0)) * (sim.prog.rank - 1)
	var rep_part: float = minf(float(b["rep_arrival_cap"]), float(b["rep_arrival_k"]) * sqrt(sim.prog.reputation))
	return base * (stop_fraction() + rep_part) * (1.0 + float(sim.mods.get("traffic", 0.0)))

func fuel_rate() -> float:
	var total := 0.0
	for f in sim.fac_list:
		if f.kind() == "fuel":
			total += f.appeal * (1.0 + 0.1 * (f.level - 1))
	if total <= 0.0:
		return 0.0
	return float(sim.region["traffic"]) * hour_factor() * float(Data.balance["fuel_only_rate"]) * total * (1.0 + float(sim.mods.get("fuel", 0.0)))

func recalc_types() -> void:
	type_weights.clear()
	var total_appeal := 0.0
	for f in sim.fac_list:
		if f.cap > 0 and f.kind() != "parking":
			total_appeal += f.appeal
	for tid in Data.customer_order:
		var t: Dictionary = Data.customer_types[tid]
		if not _req_ok(t):
			continue
		var w: float = float(t["w"])
		if not t.get("rare", false):
			w *= float(sim.region["types"].get(tid, 0.5))
			# 좋아하는 시설이 많을수록 그 유형이 더 많이 온다
			var aff := 1.0
			if total_appeal > 0.0:
				var acc := 0.0
				for f in sim.fac_list:
					if f.cap > 0 and f.kind() != "parking":
						acc += f.appeal * pref(t, f)
				aff = clampf(acc / total_appeal, 0.4, 2.2)
			w *= 0.5 + 0.7 * aff
		w *= 1.0 + float(sim.mods["attract"].get(tid, 0.0))
		type_weights[tid] = w

func _req_ok(t: Dictionary) -> bool:
	var req: Dictionary = t.get("req", {})
	if req.has("rank") and sim.prog.rank < int(req["rank"]):
		return false
	if req.has("fac") and not sim.has_fac(req["fac"]):
		return false
	if req.has("cat"):
		var ok := false
		for f in sim.fac_list:
			if f.cat() == req["cat"]:
				ok = true
				break
		if not ok:
			return false
	if req.has("tag"):
		var ok2 := false
		for f in sim.fac_list:
			if f.has_tag(req["tag"]) or f.stars >= 4:
				ok2 = true
				break
		if not ok2:
			return false
	if req.has("food_star"):
		var ok3 := false
		for f in sim.fac_list:
			if f.cat() == "food" and f.stars >= int(req["food_star"]):
				ok3 = true
				break
		if not ok3:
			return false
	return true

func pref(t: Dictionary, f: Facility) -> float:
	var p: float = float(t.get("prefs", {}).get(f.cat(), 1.0))
	var tp: Dictionary = t.get("tagprefs", {})
	if not tp.is_empty():
		for tag in f.def().get("tags", []):
			if tp.has(tag):
				p *= float(tp[tag])
	return p

func _pick_type() -> String:
	var total := 0.0
	for k in type_weights:
		total += type_weights[k]
	if total <= 0.0:
		return "traveler"
	var r := sim.rng.randf() * total
	for k in type_weights:
		r -= type_weights[k]
		if r <= 0.0:
			return k
	return "traveler"

func _find_parking(want_ev: bool) -> Array:
	# [Facility, slot] — 전기차는 충전소를 먼저, 일반 차는 일반 주차장만
	var best: Facility = null
	for pass_ev in ([true, false] if want_ev else [false]):
		for f in sim.fac_list:
			if f.kind() != "parking":
				continue
			if bool(f.def().get("ev", false)) != pass_ev:
				continue
			if f.free_slot() >= 0:
				if best == null or f.x > best.x:
					best = f
		if best != null:
			break
	if best == null:
		return []
	return [best, best.free_slot()]

func parking_capacity() -> int:
	var n := 0
	for f in sim.fac_list:
		if f.kind() == "parking" and not f.def().get("ev", false):
			n += f.cap
	return n

func parked_count() -> int:
	var n := 0
	for f in sim.fac_list:
		if f.kind() == "parking":
			n += f.used_slots()
	return n

func _spawn_arrival(force_type: String = "", force_n: int = 0, force_kind: String = "") -> bool:
	var tid := force_type if force_type != "" else _pick_type()
	var t: Dictionary = Data.customer_types[tid]
	var kind: String = force_kind if force_kind != "" else String(t["vehicle"])
	var found := _find_parking(kind == "ev")
	if found.is_empty():
		sim.econ.note_missed()
		return false
	var lot: Facility = found[0]
	var v := Vehicle.new()
	v.uid = sim.new_uid()
	v.kind = kind
	v.color = sim.rng.randi() % 6
	v.type = tid
	v.lot = lot.uid
	v.slot = int(found[1])
	lot.set_slot(v.slot, v.uid)
	v.pos = Vector2(sim.grid.w + 1.5, sim.grid.lane_y())
	var pr: Array = t["party"]
	v.party = force_n if force_n > 0 else sim.rng.randi_range(int(pr[0]), int(pr[1]))
	v.state = Vehicle.ARRIVE
	# 주유 먼저 (주유기가 주차 칸보다 앞쪽에 있을 때만)
	if kind != "ev" and kind != "bus":
		var chance := 0.3 if kind == "truck" else 0.14
		if sim.rng.randf() < chance:
			var slot_x := lot.slot_pos(v.slot).x
			for f in sim.fac_list:
				if f.kind() == "fuel" and f.free_slot() >= 0 and f.slot_pos(f.free_slot()).x > slot_x + 0.5:
					v.fuel_fac = f.uid
					v.fuel_slot = f.free_slot()
					f.set_slot(v.fuel_slot, v.uid)
					break
	vehicles[v.uid] = v
	sim.emit("veh_added", {"uid": v.uid})
	return true

func _spawn_fuel_only() -> void:
	for f in sim.fac_list:
		if f.kind() == "fuel" and f.free_slot() >= 0:
			var v := Vehicle.new()
			v.uid = sim.new_uid()
			v.kind = "truck" if sim.rng.randf() < 0.25 else "car"
			v.color = sim.rng.randi() % 6
			v.fuel_fac = f.uid
			v.fuel_slot = f.free_slot()
			f.set_slot(v.fuel_slot, v.uid)
			v.pos = Vector2(sim.grid.w + 1.5, sim.grid.lane_y())
			v.state = Vehicle.ARRIVE
			vehicles[v.uid] = v
			sim.emit("veh_added", {"uid": v.uid})
			return

func queue_special(type_id: String, n: int, kind: String) -> void:
	special_queue.append({"type": type_id, "n": n, "kind": kind})

# ---------------------------------------------------------------- 틱

func tick(dt: float) -> void:
	_arr_acc += arrival_rate() * dt
	while _arr_acc >= 1.0:
		_arr_acc -= 1.0
		_spawn_arrival()
	var fr := fuel_rate()
	if fr > 0.0:
		_fuel_acc += fr * dt
		while _fuel_acc >= 1.0:
			_fuel_acc -= 1.0
			_spawn_fuel_only()
	if not special_queue.is_empty():
		var sp: Dictionary = special_queue[0]
		if _spawn_arrival(sp["type"], int(sp["n"]), sp["kind"]):
			special_queue.pop_front()
		else:
			sp["tries"] = int(sp.get("tries", 0)) + 1
			if int(sp["tries"]) > 200:
				special_queue.pop_front()
	for v in vehicles.values():
		_tick_vehicle(v, dt)
	for f in sim.fac_list:
		if not f.queue.is_empty():
			_serve_queue(f)
	for c in customers.values():
		_tick_customer(c, dt)

func _serve_queue(f: Facility) -> void:
	while f.users.size() < f.cap and not f.queue.is_empty():
		var cu: int = f.queue.pop_front()
		var c: Customer = customers.get(cu)
		if c == null:
			continue
		_start_use(c, f)

# ---------------------------------------------------------------- 차량

func _tick_vehicle(v: Vehicle, dt: float) -> void:
	var lane := sim.grid.lane_y()
	var sp: float = float(Data.balance["car_speed"])
	var lsp: float = float(Data.balance["car_lot_speed"])
	match v.state:
		Vehicle.ARRIVE:
			var tx := -99.0
			var ff := sim.fac(v.fuel_fac) if v.fuel_fac != 0 else null
			var lot := sim.fac(v.lot) if v.lot != 0 else null
			if ff != null:
				tx = ff.slot_pos(v.fuel_slot).x
			elif lot != null:
				tx = lot.slot_pos(v.slot).x
			else:
				v.fuel_fac = 0
				v.state = Vehicle.DEPART
				return
			v.facing = Vector2(-1, 0)
			v.pos.x -= sp * dt
			if v.pos.x <= tx:
				v.pos.x = tx
				v.state = Vehicle.FUEL_IN if ff != null else Vehicle.PARK_IN
		Vehicle.FUEL_IN:
			var ff2 := sim.fac(v.fuel_fac)
			if ff2 == null:
				v.fuel_fac = 0
				v.state = Vehicle.FUEL_OUT
				return
			var p := ff2.slot_pos(v.fuel_slot)
			v.pos.x = p.x
			v.facing = Vector2(0, -1)
			v.pos.y = move_toward(v.pos.y, p.y, lsp * dt)
			if is_equal_approx(v.pos.y, p.y):
				v.state = Vehicle.FUELING
				v.timer = ff2.time
		Vehicle.FUELING:
			v.timer -= dt
			if v.timer <= 0.0:
				var ff3 := sim.fac(v.fuel_fac)
				if ff3 != null:
					_sell_simple(ff3, "fuel", v.pos)
					ff3.set_slot(v.fuel_slot, 0)
					sim.staff.on_serve(ff3)
				v.fuel_fac = 0
				v.state = Vehicle.FUEL_OUT
		Vehicle.FUEL_OUT:
			v.facing = Vector2(0, 1)
			v.pos.y = move_toward(v.pos.y, lane, lsp * dt)
			if is_equal_approx(v.pos.y, lane):
				v.state = Vehicle.ARRIVE if (v.lot != 0 and sim.fac(v.lot) != null) else Vehicle.DEPART
		Vehicle.PARK_IN:
			var lot2 := sim.fac(v.lot)
			if lot2 == null:
				v.lot = 0
				v.state = Vehicle.PARK_OUT
				return
			var p2 := lot2.slot_pos(v.slot)
			v.pos.x = p2.x
			v.facing = Vector2(0, -1)
			v.pos.y = move_toward(v.pos.y, p2.y, lsp * dt)
			if is_equal_approx(v.pos.y, p2.y):
				v.state = Vehicle.PARKED
				_spawn_party(v)
		Vehicle.PARKED:
			var lot3 := sim.fac(v.lot) if v.lot != 0 else null
			if lot3 != null:
				v.pos = lot3.slot_pos(v.slot)
			if v.spawned and v.party_left <= 0:
				if lot3 != null and lot3.def().get("ev", false):
					_sell_simple(lot3, "ev_charge", v.pos)
				v.state = Vehicle.PARK_OUT
		Vehicle.PARK_OUT:
			v.facing = Vector2(0, 1)
			v.pos.y = move_toward(v.pos.y, lane, lsp * dt)
			if is_equal_approx(v.pos.y, lane):
				_free_lot(v)
				v.state = Vehicle.DEPART
		Vehicle.DEPART:
			v.facing = Vector2(-1, 0)
			v.pos.x -= sp * dt
			if v.pos.x < -2.5:
				v.state = Vehicle.GONE
				_free_lot(v)
				vehicles.erase(v.uid)
				sim.emit("veh_removed", {"uid": v.uid})

func _free_lot(v: Vehicle) -> void:
	if v.lot != 0:
		var lot := sim.fac(v.lot)
		if lot != null and v.slot >= 0 and v.slot < lot.slots.size() and int(lot.slots[v.slot]) == v.uid:
			lot.set_slot(v.slot, 0)
		v.lot = 0

func _sell_simple(f: Facility, pid: String, at: Vector2) -> void:
	var price: float = sim.products.price(pid, f)
	var cost: float = float(Data.products[pid]["cost"])
	sim.econ.record_sale(f, pid, price, cost, 1, "")
	sim.products.on_sold(pid, f, 1, 60.0)
	sim.emit("sale", {"uid": f.uid, "amount": price, "x": at.x, "y": at.y})

func _spawn_party(v: Vehicle) -> void:
	v.spawned = true
	v.party_left = 0
	if v.type == "" or v.party <= 0:
		return
	var t: Dictionary = Data.customer_types[v.type]
	for i in v.party:
		var c := Customer.new()
		c.uid = sim.new_uid()
		c.type = v.type
		c.veh = v.uid
		c.pos = v.pos + Vector2(sim.rng.randf_range(-0.2, 0.2), sim.rng.randf_range(-0.2, 0.2))
		c.kid = t.get("kids", false) and i >= 2
		c.look = sim.rng.randi() % 4
		c.sat = float(Data.balance["sat_start"])
		c.max_visits = int(t["visits"]) + int(sim.mods.get("visits", 0)) + sim.perks.type_visits(v.type)
		var br: Array = t["budget"]
		c.budget = sim.rng.randf_range(float(br[0]), float(br[1])) * sim.perks.budget_mult(v.type)
		if c.kid:
			c.budget *= 0.45
		_roll_needs(c, t)
		c.state = Customer.DECIDE
		c.timer = 0.3 + i * 0.45
		customers[c.uid] = c
		v.party_left += 1
		sim.prog.on_visitor(c)
		sim.emit("cust_added", {"uid": c.uid})

func _roll_needs(c: Customer, t: Dictionary) -> void:
	var meal: bool = (Data.balance["meal_hours"] as Array).has(float(int(sim.hour())))
	for n in t["needs"]:
		var spec: Array = t["needs"][n]
		var prob: float = float(spec[0])
		if n == "food" and meal:
			prob = minf(1.0, prob * 1.5)
		if c.kid:
			if n == "fun" or n == "snack":
				prob = minf(1.0, prob * 1.4)
			elif n == "shop" or n == "rest":
				prob *= 0.3
		if sim.rng.randf() < prob:
			c.needs[n] = sim.rng.randf_range(float(spec[1]), float(spec[2]))

# ---------------------------------------------------------------- 손님

func _tick_customer(c: Customer, dt: float) -> void:
	match c.state:
		Customer.DECIDE:
			c.moving = false
			c.timer -= dt
			if c.timer <= 0.0:
				_decide(c)
		Customer.WALK:
			if _move(c, dt):
				_arrive(c)
		Customer.QUEUE:
			c.moving = false
			c.wait += dt
			var f := sim.fac(c.target)
			if f == null:
				c.state = Customer.DECIDE
			elif c.wait > float(c.tdef()["patience"]):
				f.queue.erase(c.uid)
				c.sat -= float(Data.balance["sat_wait_penalty"])
				c.visited.append(f.uid)
				sim.econ.note_gave_up(f)
				sim.emit("emote", {"uid": c.uid, "kind": "angry"})
				c.state = Customer.DECIDE
				c.timer = 0.2
		Customer.USE:
			c.moving = false
			c.timer -= dt
			if c.timer <= 0.0:
				var f2 := sim.fac(c.target)
				if f2 != null:
					f2.users.erase(c.uid)
					_finish_use(c, f2)
				c.state = Customer.DECIDE
				c.timer = 0.15
		Customer.LEAVE:
			if c.path.is_empty() and not c.flags.has("leave_path"):
				_path_to_car(c)
			if c.state == Customer.LEAVE and _move(c, dt):
				_finalize(c)

func _move(c: Customer, dt: float) -> bool:
	if c.path_i >= c.path.size():
		c.moving = false
		return true
	c.moving = true
	var sp: float = float(Data.balance["walk_speed"]) * float(c.tdef().get("slow", 1.0))
	if sim.grid.has_path(floori(c.pos.x), floori(c.pos.y)):
		sp *= 1.3
	var left := sp * dt
	while left > 0.0 and c.path_i < c.path.size():
		var cell: Vector2i = c.path[c.path_i]
		var tgt := Vector2(cell.x + 0.5, cell.y + 0.5)
		var d := c.pos.distance_to(tgt)
		if d <= left:
			c.pos = tgt
			left -= d
			c.path_i += 1
		else:
			var dir := (tgt - c.pos) / d
			c.facing = dir
			c.pos += dir * left
			left = 0.0
	return c.path_i >= c.path.size()

func _set_path(c: Customer, to: Vector2i) -> bool:
	var from := c.tile()
	if not sim.grid.is_walkable(from.x, from.y):
		var nw := sim.grid.nearest_walkable(from)
		if nw.x < 0:
			return false
		from = nw
		c.pos = Vector2(nw.x + 0.5, nw.y + 0.5)
	if from == to:
		c.path = [to]
		c.path_i = 0
		return true
	var p := sim.grid.find_path(from, to)
	if p.is_empty():
		return false
	c.path = p
	c.path_i = 1 if p.size() > 1 else 0
	return true

func _decide(c: Customer) -> void:
	if c.visits >= c.max_visits:
		_go_leave(c)
		return
	var t: Dictionary = c.tdef()
	var night := sim.is_night()
	var cands: Array = []
	var weights: Array = []
	var total := 0.0
	var ct := c.tile()
	for f in sim.fac_list:
		var d: Dictionary = f.def()
		var k: String = d["kind"]
		if k != "shop" and k != "free":
			continue
		if not f.reachable:
			continue
		var sat_map: Dictionary = d.get("sat", {})
		var m := 0.0
		for n in sat_map:
			if c.needs.has(n):
				m += float(c.needs[n]) * float(sat_map[n])
		if m < 0.2:
			continue
		if f.is_walkable() and f.users.size() >= f.cap:
			continue
		var ql: int = f.queue.size()
		if ql >= f.cap * 3 + 4:
			continue
		if k == "shop" and sim.products.cheapest_price(f) > c.budget:
			continue
		var s: float = m * pref(t, f) * f.appeal * (0.55 + 0.11 * f.stars)
		if f.quality < float(t["std"]) * 60.0 - 12.0:
			s *= 0.35
		var e: Vector2i = f.entrance() if f.needs_entrance() else Vector2i(f.x, f.y)
		var dist: float = absf(e.x - ct.x) + absf(e.y - ct.y)
		s /= 1.0 + dist / 11.0
		s /= 1.0 + float(ql + maxi(f.users.size() - f.cap + 1, 0)) / (f.cap * 1.6)
		if c.visited.has(f.uid):
			s *= 0.12
		if night:
			s *= 1.2 if f.has_tag("night") else 0.9
		s *= sim.rng.randf_range(0.75, 1.25)
		if s <= 0.01:
			continue
		s = s * s
		cands.append(f)
		weights.append(s)
		total += s
	if cands.is_empty():
		_go_leave(c)
		return
	var r := sim.rng.randf() * total
	var pick: Facility = cands[0]
	for i in cands.size():
		r -= weights[i]
		if r <= 0.0:
			pick = cands[i]
			break
	var dest: Vector2i
	if pick.is_walkable():
		dest = Vector2i(pick.x + sim.rng.randi() % pick.w(), pick.y + sim.rng.randi() % pick.h())
	else:
		dest = pick.entrance()
	if not _set_path(c, dest):
		pick.reachable = false
		sim.emit("fac_blocked", {"uid": pick.uid})
		c.timer = 0.3
		return
	c.target = pick.uid
	c.state = Customer.WALK

func _arrive(c: Customer) -> void:
	var f := sim.fac(c.target)
	if f == null:
		c.state = Customer.DECIDE
		c.timer = 0.2
		return
	c.wait = 0.0
	if f.is_walkable():
		if f.users.size() >= f.cap:
			c.visited.append(f.uid)
			c.state = Customer.DECIDE
			c.timer = 0.2
			return
		_start_use(c, f)
		return
	c.facing = -f.front_dir()
	if f.users.size() < f.cap and f.queue.is_empty():
		_start_use(c, f)
	else:
		f.queue.append(c.uid)
		c.state = Customer.QUEUE

func _start_use(c: Customer, f: Facility) -> void:
	f.users.append(c.uid)
	c.state = Customer.USE
	c.timer = f.time * sim.rng.randf_range(0.85, 1.15)
	if c.wait > 0.5:
		c.sat -= minf(c.wait * 0.35, 5.0)

func _finish_use(c: Customer, f: Facility) -> void:
	var d: Dictionary = f.def()
	var b: Dictionary = Data.balance
	var t: Dictionary = c.tdef()
	var bought := true
	if d["kind"] == "shop":
		var pid: String = sim.products.pick_for(c, f)
		if pid == "":
			bought = false
			c.sat -= 3.0
		else:
			var price: float = sim.products.price(pid, f)
			var qty := 1
			if sim.perks.thin_margin_hit(price) and c.budget >= price * 2.0:
				qty = 2
			var pd: Dictionary = Data.products[pid]
			sim.econ.record_sale(f, pid, price * qty, float(pd["cost"]) * qty, qty, c.type)
			sim.products.on_sold(pid, f, qty, c.sat)
			c.budget -= price * qty
			c.spent += price * qty
			sim.emit("sale", {"uid": f.uid, "amount": price * qty, "x": c.pos.x, "y": c.pos.y, "cust": c.uid})
	if bought:
		f.served_today += 1
		f.served_total += 1
		var sat_map: Dictionary = d.get("sat", {})
		for n in sat_map:
			if c.needs.has(n):
				c.needs[n] = maxf(0.0, float(c.needs[n]) - float(sat_map[n]) * (0.8 + f.quality / 200.0))
		var gain: float = float(b["sat_use_base"]) + (f.quality - 30.0 - float(t["std"]) * 40.0) * float(b["sat_quality_gain"]) + f.sat_bonus
		c.sat = clampf(c.sat + clampf(gain, -6.0, 15.0), 0.0, 100.0)
		sim.staff.on_serve(f)
		sim.synergy.on_use(c, f)
		sim.perks.on_use(c, f)
		sim.prog.on_use(c, f)
	c.visits += 1
	c.visited.append(f.uid)

func _go_leave(c: Customer) -> void:
	# 채우지 못한 욕구는 실망으로 남는다
	var b: Dictionary = Data.balance
	for n in c.needs:
		var v: float = float(c.needs[n])
		if v > 0.55:
			var pen: float = float(b["sat_unmet_penalty"]) * v * (1.5 if n == "toilet" else 0.6)
			c.sat -= pen
			sim.econ.note_unmet(n)
	c.sat = clampf(c.sat, 0.0, 100.0)
	c.state = Customer.LEAVE
	c.path = []
	c.path_i = 0
	_path_to_car(c)

func _path_to_car(c: Customer) -> void:
	c.flags["leave_path"] = true
	var v: Vehicle = vehicles.get(c.veh)
	if v == null:
		_finalize(c)
		return
	var dest := Vector2i(floori(v.pos.x), floori(v.pos.y))
	if not _set_path(c, dest):
		_finalize(c)

func _finalize(c: Customer) -> void:
	var v: Vehicle = vehicles.get(c.veh)
	if v != null:
		v.party_left -= 1
	sim.prog.on_customer_left(c)
	if c.sat >= 80.0:
		sim.emit("emote", {"uid": c.uid, "kind": "happy"})
	c.state = Customer.DONE
	customers.erase(c.uid)
	sim.emit("cust_removed", {"uid": c.uid})

# ---------------------------------------------------------------- 시설 변화 대응

func on_facility_removed(f: Facility) -> void:
	for c in customers.values():
		if c.target == f.uid and (c.state == Customer.WALK or c.state == Customer.QUEUE or c.state == Customer.USE):
			c.state = Customer.DECIDE
			c.timer = 0.2
			c.target = 0
	f.queue.clear()
	f.users.clear()
	for v in vehicles.values():
		if v.fuel_fac == f.uid:
			v.fuel_fac = 0
			if v.state == Vehicle.FUEL_IN or v.state == Vehicle.FUELING:
				v.state = Vehicle.FUEL_OUT
		if v.lot == f.uid:
			v.lot = 0
			if v.state == Vehicle.ARRIVE and v.fuel_fac == 0:
				v.state = Vehicle.DEPART
			elif v.state == Vehicle.PARK_IN:
				v.state = Vehicle.PARK_OUT

func on_facility_moved(f: Facility) -> void:
	for c in customers.values():
		if c.target == f.uid and (c.state == Customer.WALK or c.state == Customer.QUEUE):
			f.queue.erase(c.uid)
			c.state = Customer.DECIDE
			c.timer = 0.2
		elif c.state == Customer.LEAVE:
			c.flags.erase("leave_path")
			c.path = []
			c.path_i = 0
	for o in sim.fac_list:
		o.reachable = true

func count() -> int:
	return customers.size()

# ---------------------------------------------------------------- 저장

func to_dict() -> Dictionary:
	var cs: Array = []
	for c in customers.values():
		cs.append(c.to_dict())
	var vs: Array = []
	for v in vehicles.values():
		vs.append(v.to_dict())
	return {"customers": cs, "vehicles": vs, "arr": _arr_acc, "fuel": _fuel_acc, "special": special_queue.duplicate(true)}

func load_dict(d: Dictionary) -> void:
	customers.clear()
	vehicles.clear()
	_arr_acc = float(d.get("arr", 0.0))
	_fuel_acc = float(d.get("fuel", 0.0))
	special_queue = (d.get("special", []) as Array).duplicate(true)
	for vd in d.get("vehicles", []):
		var v := Vehicle.from_dict(vd)
		vehicles[v.uid] = v
	var waiting: Array = []
	for cd in d.get("customers", []):
		var c := Customer.from_dict(cd)
		customers[c.uid] = c
		c.flags.erase("leave_path")
		var f: Facility = sim.fac(c.target)
		match c.state:
			Customer.WALK:
				c.state = Customer.DECIDE
				c.timer = 0.1
			Customer.USE:
				if f != null:
					f.users.append(c.uid)
				else:
					c.state = Customer.DECIDE
			Customer.QUEUE:
				if f != null:
					waiting.append(c)
				else:
					c.state = Customer.DECIDE
	waiting.sort_custom(func(a, b): return a.wait > b.wait)
	for c in waiting:
		sim.fac(c.target).queue.append(c.uid)
