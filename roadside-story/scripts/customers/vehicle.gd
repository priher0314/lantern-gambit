class_name Vehicle
extends RefCounted
## 차량 한 대. 도로를 -x 방향(화면 왼쪽 위)으로 달린다.

enum {ARRIVE, FUEL_IN, FUELING, FUEL_OUT, PARK_IN, PARKED, PARK_OUT, DEPART, GONE}

var uid: int = 0
var kind: String = "car"       # car, van, truck, bike, bus, ev, sedan
var color: int = 0
var type: String = "traveler"
var state: int = ARRIVE
var pos: Vector2 = Vector2.ZERO
var lot: int = 0               # 주차 시설 uid
var slot: int = -1
var fuel_fac: int = 0
var fuel_slot: int = -1
var timer: float = 0.0
var party: int = 0             # 태우고 온 인원
var party_left: int = 0        # 아직 돌아오지 않은 인원
var spawned: bool = false
var facing: Vector2 = Vector2(-1, 0)

const SAVE_FIELDS := ["uid", "kind", "color", "type", "state", "lot", "slot", "fuel_fac", "fuel_slot", "timer", "party", "party_left", "spawned"]

func to_dict() -> Dictionary:
	var d := {"px": pos.x, "py": pos.y}
	for k in SAVE_FIELDS:
		d[k] = get(k)
	return d

static func from_dict(d: Dictionary) -> Vehicle:
	var v := Vehicle.new()
	for k in SAVE_FIELDS:
		if d.has(k):
			var x: Variant = d[k]
			if typeof(v.get(k)) == TYPE_INT:
				x = int(x)
			v.set(k, x)
	v.pos = Vector2(float(d["px"]), float(d["py"]))
	return v
