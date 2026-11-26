class_name SynergySystem
extends RefCounted
## 시설 궁합. 필요한 시설들이 서로 가까이(기준 시설에서 3칸 이내) 있으면 발동한다.
## 같은 궁합은 시설 하나에 한 번만, 전역 효과는 휴게소 전체에 한 번만 적용된다.

var sim: Sim
var active: Dictionary = {}     # 궁합 ID -> 참여 시설 uid 배열
var discovered: Array = []

func _init(s: Sim) -> void:
	sim = s

static func _entries_from(facs: Array) -> Array:
	var out: Array = []
	for f in facs:
		out.append({"uid": f.uid, "id": f.id, "rect": f.rect()})
	return out

## entries: [{uid, id, rect}] -> {궁합 ID: [uid...]}
func compute(entries: Array) -> Dictionary:
	var res: Dictionary = {}
	var radius: int = int(Data.balance["synergy_radius"])
	var by_id: Dictionary = {}
	for e in entries:
		if not by_id.has(e["id"]):
			by_id[e["id"]] = []
		(by_id[e["id"]] as Array).append(e)
	for sid in Data.synergy_order:
		var req: Array = Data.synergies[sid]["req"]
		var possible := true
		for group in req:
			var any := false
			for fid in group:
				if by_id.has(fid):
					any = true
					break
			if not any:
				possible = false
				break
		if not possible:
			continue
		var members: Dictionary = {}
		for gi in req.size():
			for fid in req[gi]:
				for anchor in by_id.get(fid, []):
					var found: Array = [anchor["uid"]]
					var ok := true
					for gj in req.size():
						if gj == gi:
							continue
						var hit := false
						for fid2 in req[gj]:
							for other in by_id.get(fid2, []):
								if other["uid"] != anchor["uid"] and Construction.rect_gap(anchor["rect"], other["rect"]) <= radius:
									found.append(other["uid"])
									hit = true
						if not hit:
							ok = false
							break
					if ok:
						for u in found:
							members[u] = true
		if not members.is_empty():
			res[sid] = members.keys()
	return res

func recalc() -> void:
	active = compute(_entries_from(sim.fac_list))
	for f in sim.fac_list:
		f.syn = []
	var mult: float = sim.perks.architect_mult()
	for sid in active:
		for u in active[sid]:
			var f: Facility = sim.fac(u)
			if f != null:
				f.syn.append(sid)
		var fx: Dictionary = Data.synergies[sid]["fx"]
		if fx.has("traffic"):
			sim.add_mod("traffic", float(fx["traffic"]) * mult)
		if fx.has("fuel"):
			sim.add_mod("fuel", float(fx["fuel"]) * mult)
		if fx.has("night"):
			sim.add_mod("night", float(fx["night"]) * mult)
		for t in fx.get("attract", {}):
			sim.add_attract(t, float(fx["attract"][t]) * mult)

## 새로 발동한 궁합을 발견 처리한다 (건설·이동 직후 호출)
func check_new_discoveries() -> void:
	for sid in active:
		if not discovered.has(sid):
			discovered.append(sid)
			sim.prog.discover("synergy", sid)
			sim.prog.on_synergy(sid)
			sim.emit("synergy_found", {"id": sid, "members": active[sid]})

func _sum(f: Facility, key: String) -> float:
	var t := 0.0
	for sid in f.syn:
		t += float(Data.synergies[sid]["fx"].get(key, 0.0))
	return t * sim.perks.architect_mult()

func appeal_bonus(f: Facility) -> float:
	return _sum(f, "appeal")

func sat_bonus(f: Facility) -> float:
	return _sum(f, "sat")

func price_bonus(f: Facility) -> float:
	return _sum(f, "price")

## 손님이 궁합 시설을 이용했을 때의 행동 변화
func on_use(c: Customer, f: Facility) -> void:
	for sid in f.syn:
		var key = "s_" + sid
		if c.flags.has(key):
			continue
		c.flags[key] = true
		var fx: Dictionary = Data.synergies[sid]["fx"]
		if fx.has("chain"):
			var n: String = fx["chain"]["need"]
			c.needs[n] = maxf(float(c.needs.get(n, 0.0)), float(fx["chain"]["add"]) * minf(sim.perks.architect_mult(), 1.3))
		if fx.has("stay"):
			c.max_visits += int(fx["stay"])
		if fx.has("rep"):
			c.flags["rep_bonus"] = float(c.flags.get("rep_bonus", 0.0)) + float(fx["rep"]) * sim.perks.architect_mult()

## 이 자리에 지으면 새로 생길 궁합 ID 목록 (배치 미리보기용)
func preview(def_id: String, x: int, y: int, rot: int, ignore_uid: int = 0) -> Array:
	var d: Dictionary = Data.facilities[def_id]
	var s: Array = d["size"]
	var fw := int(s[1]) if rot == 1 else int(s[0])
	var fh := int(s[0]) if rot == 1 else int(s[1])
	var entries: Array = []
	for f in sim.fac_list:
		if f.uid != ignore_uid:
			entries.append({"uid": f.uid, "id": f.id, "rect": f.rect()})
	var before := compute(entries) if ignore_uid != 0 else active
	entries.append({"uid": -1, "id": def_id, "rect": Rect2i(x, y, fw, fh)})
	var after := compute(entries)
	var out: Array = []
	for sid in after:
		if (after[sid] as Array).has(-1) and (ignore_uid != 0 or not before.has(sid) or true):
			if not before.has(sid) or ignore_uid != 0:
				out.append(sid)
	return out

func to_dict() -> Dictionary:
	return {"discovered": discovered}

func load_dict(d: Dictionary) -> void:
	discovered = d.get("discovered", [])
