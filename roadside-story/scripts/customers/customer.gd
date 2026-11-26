class_name Customer
extends RefCounted
## 손님 한 명.

enum {DECIDE, WALK, QUEUE, USE, LEAVE, DONE}

var uid: int = 0
var type: String = "traveler"
var veh: int = 0
var pos: Vector2 = Vector2.ZERO     # 격자 좌표(타일 중심 = x+0.5)
var state: int = DECIDE
var target: int = 0                 # 목적지 시설 uid
var timer: float = 0.0
var wait: float = 0.0
var needs: Dictionary = {}
var budget: float = 0.0
var visits: int = 0
var max_visits: int = 3
var sat: float = 50.0
var visited: Array = []
var flags: Dictionary = {}
var look: int = 0
var kid: bool = false
var spent: float = 0.0

# 저장하지 않는 값
var path: Array = []
var path_i: int = 0
var facing: Vector2 = Vector2(0, 1)
var moving: bool = false

const SAVE_FIELDS := ["uid", "type", "veh", "state", "target", "timer", "wait", "needs", "budget", "visits", "max_visits", "sat", "visited", "flags", "look", "kid", "spent"]

func tdef() -> Dictionary:
	return Data.customer_types[type]

func tile() -> Vector2i:
	return Vector2i(floori(pos.x), floori(pos.y))

func to_dict() -> Dictionary:
	var d := {"px": pos.x, "py": pos.y}
	for k in SAVE_FIELDS:
		d[k] = get(k)
	return d

static func from_dict(d: Dictionary) -> Customer:
	var c := Customer.new()
	for k in SAVE_FIELDS:
		if d.has(k):
			var v: Variant = d[k]
			if typeof(c.get(k)) == TYPE_INT:
				v = int(v)
			c.set(k, v)
	c.pos = Vector2(float(d["px"]), float(d["py"]))
	for i in c.visited.size():
		c.visited[i] = int(c.visited[i])
	return c
